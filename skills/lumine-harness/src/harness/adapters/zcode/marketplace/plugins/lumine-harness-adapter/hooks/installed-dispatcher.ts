import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function findRoot(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    const marker = path.join(current, ".harness", "root.json");
    if (existsSync(marker)) {
      try {
        if (JSON.parse(readFileSync(marker, "utf8"))?.kind === "harness-root") return current;
      } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

let source = "";
for await (const chunk of process.stdin) source += chunk;
const raw = source.trim() ? JSON.parse(source) as { cwd?: string } : {};
const root = findRoot(raw.cwd ?? process.cwd());
if (root) {
  const module = await import(pathToFileURL(path.join(root, ".harness", "adapters", "zcode", "hooks", "dispatch.mjs")).href) as {
    handleZCodeHook: (raw: unknown) => Promise<{ stdout?: string; stderr?: string; exitCode: number }>;
  };
  const result = await module.handleZCodeHook(raw);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.exitCode;
}
