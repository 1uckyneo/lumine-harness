import { readdirSync } from "node:fs";
import path from "node:path";

export interface RuntimeArtifact {
  source: string;
  stage: string | null;
  destination: string;
  executable?: boolean;
  // These small entry points must be parseable before rejecting an old Node.
  bootstrap?: boolean;
  bundle?: boolean;
  transform?: (content: string) => string;
}

function bootstrapSource(source: string): boolean {
  return ["harness/check.ts", "harness/wiki.ts", "harness/adapter-cli.ts", "harness/core/task-cli.ts", "scripts/harness-manager.ts",
    "harness/core/node-runtime.ts", "harness/core/node-bootstrap.ts", "harness/core/runtime-environment.ts", "harness/adapters/hook-bootstrap.ts", "opencode/plugins/harness.ts"].includes(source)
    || (/^harness\/adapters\/.+\/(?:hooks\/[^/]+|installed-dispatcher)\.ts$/.test(source) && !source.endsWith(".main.ts"))
    || source.endsWith("/hooks/installed-dispatcher.ts");
}

function collectTypeScriptFiles(root: string, relative = ""): string[] {
  const current = path.join(root, relative);
  return readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(root, next);
      return entry.isFile() && entry.name.endsWith(".ts") ? [next] : [];
    })
    .sort();
}

export function runtimeArtifacts(repoRoot: string): RuntimeArtifact[] {
  const sourceRoot = path.join(repoRoot, "skills/lumine-harness/src");
  const harnessSources = collectTypeScriptFiles(path.join(sourceRoot, "harness"));
  const artifacts = harnessSources
    .filter((relative) => relative !== path.join("core", "contracts.ts"))
    .map<RuntimeArtifact>((relative) => ({
      source: path.join("harness", relative),
      stage: path.join("harness", relative.replace(/\.ts$/, ".mjs")),
      destination: path.join("skills/lumine-harness/assets/harness", relative.replace(/\.ts$/, ".mjs")),
      transform: relative.startsWith("tests/")
        ? (content: string) => content.replaceAll("../../scripts/harness-manager.mjs", "../../../scripts/harness-manager.mjs").replaceAll("../../migration/", "../../../migration/")
        : undefined
    }));

  artifacts.push(
    {
      source: "harness/core/contracts.ts",
      stage: null,
      destination: "skills/lumine-harness/assets/harness/core/contracts.d.ts"
    }
  );

  for (const relative of collectTypeScriptFiles(path.join(sourceRoot, "opencode/plugins"))) {
    artifacts.push({ source: path.join("opencode/plugins", relative), stage: path.join("opencode/plugins", relative.replace(/\.ts$/, ".mjs")),
      destination: path.join("skills/lumine-harness/assets/opencode/plugins", relative.replace(/\.ts$/, ".mjs")),
      transform: (content) => content.replaceAll("../../harness/", "../../.lumine/") });
  }

  for (const relative of collectTypeScriptFiles(path.join(sourceRoot, "scripts"))) {
    artifacts.push({ source: path.join("scripts", relative), stage: path.join("scripts", relative.replace(/\.ts$/, ".mjs")),
      destination: path.join("skills/lumine-harness/scripts", relative.replace(/\.ts$/, ".mjs")),
      transform: (content) => content.replaceAll("../harness/", "../assets/harness/"), executable: relative === "harness-manager.ts" });
  }

  for (const relative of collectTypeScriptFiles(path.join(sourceRoot, "migration"))) {
    artifacts.push({source: path.join("migration", relative), stage: path.join("migration", relative.replace(/\.ts$/, ".mjs")), destination: path.join("skills/lumine-harness/migration", relative.replace(/\.ts$/, ".mjs")), transform: (content) => content.replaceAll("../harness/", "../assets/harness/")});
  }

  return artifacts.map((artifact) => ({ ...artifact, bootstrap: bootstrapSource(artifact.source),
    bundle: artifact.source.endsWith("installed-dispatcher.ts") })).sort((left, right) => left.destination.localeCompare(right.destination));
}
