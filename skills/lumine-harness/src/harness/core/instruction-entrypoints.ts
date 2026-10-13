import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { ContractIssue } from "./documents.ts";
import { resolveProjectPath } from "./project-config.ts";
import { parseSections } from "../wiki/sections.ts";

function proseOnly(markdown: string): string {
  let fence: { char: string; size: number } | undefined;
  return markdown.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).map((line) => {
    const delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (delimiter) {
      if (!fence) fence = { char: delimiter[1][0], size: delimiter[1].length };
      else if (fence.char === delimiter[1][0] && delimiter[1].length >= fence.size) fence = undefined;
      return "";
    }
    return fence ? "" : line;
  }).join("\n");
}

function inlineCodeSpans(markdown: string): Array<{ start: number; end: number }> {
  const runs = [...markdown.matchAll(/`+/g)].filter((match) => {
    const preceding = markdown.slice(0, match.index).match(/\\+$/)?.[0].length ?? 0;
    return preceding % 2 === 0;
  });
  const spans: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < runs.length; index++) {
    const end = runs.findIndex((run, candidate) => candidate > index && run[0].length === runs[index][0].length);
    if (end < 0) continue;
    spans.push({ start: runs[index].index, end: runs[end].index + runs[end][0].length });
    index = end;
  }
  return spans;
}

function linkDestinations(section: string, source: string): { links: string[]; unresolved: string[] } {
  const sourceCode = inlineCodeSpans(source);
  const sectionCode = inlineCodeSpans(section);
  const inCode = (index: number, spans: typeof sourceCode) => spans.some((span) => index >= span.start && index < span.end);
  const definitions = new Map<string, string>();
  for (const match of source.matchAll(/^\s{0,3}\[([^\]\n]+)\]:\s*(<[^>\n]*>|\S+)/gm)) {
    if (!inCode(match.index, sourceCode)) definitions.set(match[1].trim().toLocaleLowerCase(), match[2].replace(/^<|>$/g, ""));
  }
  const links: string[] = [];
  const unresolved: string[] = [];
  const inline = /(?<!!)\[[^\]\n]+\]\(\s*(<[^>\n]*>|(?:[^\s()]|\([^()]*\))*)(?:\s+["'][^\n]*?["'])?\s*\)/g;
  for (const match of section.matchAll(inline)) {
    if (!inCode(match.index, sectionCode)) links.push(match[1].replace(/^<|>$/g, ""));
  }
  for (const match of section.matchAll(/(?<!!)\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?!\(|:)/g)) {
    if (inCode(match.index, sectionCode)) continue;
    const destination = definitions.get((match[2] || match[1]).trim().toLocaleLowerCase());
    if (destination !== undefined) links.push(destination);
    else if (match[2] !== undefined) unresolved.push(match[0]);
  }
  return { links: [...new Set(links)], unresolved: [...new Set(unresolved)] };
}

function markdownHeadingAnchors(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title) => {
    // Ordinary Markdown viewers retain visible inline-code/link labels and use -1 for duplicates.
    const visible = title.replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1").replace(/<[^>]*>/g, "");
    const base = visible.toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}_ -]/gu, "").trim().replace(/\s+/g, "-");
    let slug = base, suffix = 1;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    return slug;
  });
}

/** Validate declared standards routes, not the semantic quality or completeness of project rules. */
export function checkInstructionEntrypoints(root: string, instructions: string): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const fail = (code: string, message: string) => issues.push({
    code, message, path: instructions,
    remediation: "Repair the declared standards route while preserving its scope and authority; adoption content review assesses missing standards and rule responsibilities.",
  });
  const file = resolveProjectPath(root, instructions, "project instructions");
  if (!existsSync(file)) return issues;
  try {
    const source = proseOnly(readFileSync(file, "utf8"));
    const sections = parseSections(source).filter((section) => /^(?:规范入口|Required standards)$/i.test(section.title));
    const declarations = sections.map((section) => linkDestinations(section.body, source));
    for (const reference of new Set(declarations.flatMap((declaration) => declaration.unresolved)))
      fail("INSTRUCTIONS_LINK_INVALID", `Declared standards reference has no Markdown definition: ${reference}`);
    for (const destination of new Set(declarations.flatMap((declaration) => declaration.links))) {
      if (/^(?:https?:|mailto:|[a-z][a-z\d+.-]*:\/\/)/i.test(destination) && !/^file:/i.test(destination)) continue;
      try {
        const hash = destination.indexOf("#");
        const relative = decodeURIComponent((hash < 0 ? destination : destination.slice(0, hash)).split("?")[0]);
        const fragment = hash < 0 ? "" : decodeURIComponent(destination.slice(hash + 1));
        if (relative && (path.isAbsolute(relative) || /^[a-z][a-z\d+.-]*:/i.test(relative))) throw new Error("Standards routes must use project-relative paths");
        const reference = relative ? path.join(path.dirname(instructions), relative) : instructions;
        const target = resolveProjectPath(root, reference, "standards route");
        if (target === file || (existsSync(target) && realpathSync(target) === realpathSync(file))) {
          fail("INSTRUCTIONS_SELF_LINK", `Standards route points back to the project instructions: ${destination}`);
          continue;
        }
        if (!existsSync(target)) {
          fail("INSTRUCTIONS_LINK_MISSING", `Declared standards route is missing: ${destination}`);
          continue;
        }
        if (!statSync(target).isFile()) {
          if (fragment) fail("INSTRUCTIONS_ANCHOR_MISSING", `A directory cannot resolve a standards section: ${destination}`);
          continue;
        }
        const body = readFileSync(target, "utf8");
        if (!body.trim()) {
          fail("INSTRUCTIONS_LINK_EMPTY", `Declared standards route is empty: ${destination}`);
          continue;
        }
        if (fragment) {
          const text = proseOnly(body);
          const sections = parseSections(text);
          const headings = [...sections.map((section) => section.id), ...markdownHeadingAnchors(sections.map((section) => section.title))];
          const code = inlineCodeSpans(text);
          const anchors = [...text.matchAll(/<(?:a|span)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)]
            .filter((match) => !code.some((span) => match.index >= span.start && match.index < span.end)).map((match) => match[1]);
          if (![...headings, ...anchors].includes(fragment)) fail("INSTRUCTIONS_ANCHOR_MISSING", `Declared standards section is missing: ${destination}`);
        }
      } catch (error) {
        fail("INSTRUCTIONS_LINK_INVALID", `Invalid standards route ${destination}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    fail("INSTRUCTIONS_CHECK_ERROR", error instanceof Error ? error.message : String(error));
  }
  return issues;
}
