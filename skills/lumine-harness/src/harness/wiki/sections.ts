import type { Section } from './types.ts';

/** The Markdown source owns section identity. Generated heading slugs remain readable but are not stable references. */
export function parseSections(body: string): Section[] {
  const lines = body.replaceAll('\r\n', '\n').split('\n');
  const headings: { id: string; title: string; level: number; line: number; stable: boolean }[] = [];
  let fence: { char: string; size: number } | null = null, pendingAnchor: string | null = null;
  const used = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], delimiter = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (delimiter) {
      if (!fence) fence = { char: delimiter[1][0], size: delimiter[1].length };
      else if (delimiter[1][0] === fence.char && delimiter[1].length >= fence.size) fence = null;
      continue;
    }
    if (fence) continue;
    const anchor = /^\s*<a\s+id=["']([\p{L}\p{N}_.:-]+)["']\s*>\s*<\/a>\s*$/u.exec(line);
    if (anchor) { pendingAnchor = anchor[1]; continue; }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) { if (line.trim()) pendingAnchor = null; continue; }
    const title = heading[2], base = pendingAnchor ?? (title.toLocaleLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-') || `section-${headings.length + 1}`);
    let id = base, suffix = 2;
    if (pendingAnchor && used.has(id)) throw new Error(`SECTION_ID_DUPLICATE:${id}`);
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id); headings.push({ id, title, level: heading[1].length, line: index, stable: Boolean(pendingAnchor) }); pendingAnchor = null;
  }
  return headings.map((heading, index) => {
    const end = headings.slice(index + 1).find((next) => next.level <= heading.level)?.line ?? lines.length;
    const parent = headings.slice(0, index).reverse().find((previous) => previous.level < heading.level);
    return { id: heading.id, title: heading.title, level: heading.level, ...(parent ? { parentId: parent.id } : {}), startLine: heading.line + 1, endLine: end, body: lines.slice(heading.line, end).join('\n').trim(), stable: heading.stable, sources: [] };
  });
}
