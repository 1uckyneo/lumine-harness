import { build } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const hookConfigTemplates = [
  { template: "codex-hooks.json", destination: "codex/hooks.json" },
  { template: "qoder-hooks.json", destination: "qoder/settings.json" },
  { template: "trae-hooks.json", destination: "trae/hooks.json" },
  { template: "cursor-hooks.json", destination: "cursor/hooks.json" }
] as const;

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'"'"'`)}'`; }

function renderCommands(value: unknown, dispatcher: string): unknown {
  if (Array.isArray(value)) return value.map((item) => renderCommands(item, dispatcher));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key !== "command") return [key, renderCommands(item, dispatcher)];
    if (typeof item !== "string" || !item.startsWith("@lumine-hook:")) throw new Error("Hook command must reference the shared dispatcher.");
    const entry = item.slice("@lumine-hook:".length);
    if (!/^adapters\/[a-z-]+\/hooks\/[a-z-]+\.mjs$/.test(entry)) throw new Error(`Invalid Hook entry: ${entry}`);
    return [key, `node -e ${shellQuote(dispatcher)} ${shellQuote(entry)}`];
  }));
}

/** Generated host configs share the exact preflight implementation, including localized diagnostics. */
export async function buildHookConfigContents(repoRoot: string): Promise<Map<string, string>> {
  const source = path.join(repoRoot, "skills/lumine-harness/src/adapter-launchers");
  const result = await build({
    entryPoints: [path.join(source, "root-dispatcher.ts")],
    bundle: true, platform: "node", format: "iife", target: "node18",
    minify: true, treeShaking: true, legalComments: "none", write: false,
    banner: { js: "/* Generated from src/adapter-launchers/root-dispatcher.ts and the shared Node policy. */" }
  });
  const dispatcher = result.outputFiles[0].text.trim();
  return new Map(hookConfigTemplates.map(({ template, destination }) => {
    const payload = JSON.parse(readFileSync(path.join(source, template), "utf8"));
    return [destination, `${JSON.stringify(renderCommands(payload, dispatcher), null, 2)}\n`];
  }));
}

export async function synchronizeHookConfigs(repoRoot: string, mode: "write" | "check"): Promise<void> {
  const contents = await buildHookConfigContents(repoRoot);
  const stale: string[] = [];
  for (const [relative, expected] of contents) {
    const destination = path.join(repoRoot, "skills/lumine-harness/assets", relative);
    const actual = existsSync(destination) ? readFileSync(destination, "utf8") : null;
    if (actual === expected) continue;
    if (mode === "write") writeFileSync(destination, expected);
    else stale.push(relative);
  }
  if (stale.length) throw new Error(`Generated Hook configs are stale: ${stale.join(", ")}. Run pnpm runtime:build.`);
}
