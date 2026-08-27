import { readdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsdown";

const outDir = process.env.LUMINE_RUNTIME_STAGE;
const sourceRoot = "skills/lumine-harness/src";

function collectTypeScriptEntries(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) return collectTypeScriptEntries(absolute);
      return entry.isFile() && entry.name.endsWith(".ts") ? [absolute] : [];
    })
    .filter((entry) => !entry.endsWith(path.join("core", "contracts.ts")))
    .sort();
}

if (!outDir) {
  throw new Error("LUMINE_RUNTIME_STAGE must point to an isolated staging directory");
}

export default defineConfig({
  entry: [
    ...collectTypeScriptEntries(path.join(sourceRoot, "harness")),
    path.join(sourceRoot, "opencode/plugins/harness.ts"),
    path.join(sourceRoot, "scripts/harness-manager.ts")
  ],
  root: sourceRoot,
  outDir,
  format: ["esm"],
  platform: "node",
  target: "node18",
  unbundle: true,
  clean: true,
  dts: false,
  minify: false,
  sourcemap: false,
  treeshake: false,
  outExtensions: () => ({ js: ".mjs" })
});
