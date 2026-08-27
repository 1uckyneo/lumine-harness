import { readdirSync } from "node:fs";
import path from "node:path";

export interface RuntimeArtifact {
  source: string;
  stage: string | null;
  destination: string;
  executable?: boolean;
  transform?: (content: string) => string;
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
      transform: relative === path.join("tests", "adoption-manager.test.ts")
        ? (content: string) => content.replaceAll("../../scripts/harness-manager.mjs", "../../../scripts/harness-manager.mjs")
        : undefined
    }));

  artifacts.push(
    {
      source: "opencode/plugins/harness.ts",
      stage: "opencode/plugins/harness.mjs",
      destination: "skills/lumine-harness/assets/opencode/plugins/harness.mjs",
      transform: (content) => content.replaceAll("../../harness/", "../../.harness/")
    },
    {
      source: "scripts/harness-manager.ts",
      stage: "scripts/harness-manager.mjs",
      destination: "skills/lumine-harness/scripts/harness-manager.mjs",
      executable: true
    },
    {
      source: "harness/core/contracts.ts",
      stage: null,
      destination: "skills/lumine-harness/assets/harness/core/contracts.d.ts"
    }
  );

  return artifacts.sort((left, right) => left.destination.localeCompare(right.destination));
}
