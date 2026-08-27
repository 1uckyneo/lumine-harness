import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findAncestor(start: string, predicate: (directory: string) => boolean): string | null {
  let current = path.resolve(start);
  while (true) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveSkillPackageRoot(moduleUrl: string): string | null {
  const start = path.dirname(fileURLToPath(moduleUrl));
  return findAncestor(start, (directory) => (
    existsSync(path.join(directory, "SKILL.md"))
    && existsSync(path.join(directory, "assets"))
  ));
}

export function resolveSkillAssetsRoot(moduleUrl: string): string {
  const skillRoot = resolveSkillPackageRoot(moduleUrl);
  if (!skillRoot) throw new Error("Cannot locate the Lumine Harness Skill package root.");
  return path.join(skillRoot, "assets");
}

export function resolveHarnessRuntimeRoot(moduleUrl: string): string {
  const start = path.dirname(fileURLToPath(moduleUrl));
  const harnessDirectory = findAncestor(start, (directory) => {
    const name = path.basename(directory);
    return name === "harness" || name === ".harness";
  });
  if (!harnessDirectory) throw new Error("Cannot locate the Harness runtime root.");

  if (path.basename(harnessDirectory) === "harness" && path.basename(path.dirname(harnessDirectory)) === "src") {
    return path.join(resolveSkillAssetsRoot(moduleUrl), "harness");
  }
  return harnessDirectory;
}
