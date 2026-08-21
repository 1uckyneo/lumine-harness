import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const HARNESS_ROOT_MARKER = path.join(".harness", "root.json");

function isHarnessMarker(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value?.kind === "harness-root" && Number(value?.schemaVersion) >= 1;
  } catch {
    return false;
  }
}

export function findHarnessRoot(start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    const marker = path.join(current, HARNESS_ROOT_MARKER);
    if (existsSync(marker) && isHarnessMarker(marker)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveHarnessRoot(input = {}) {
  const starts = [input.cwd, ...(input.workspaceRoots ?? []), process.cwd()].filter(Boolean);
  for (const start of starts) {
    const root = findHarnessRoot(start);
    if (root) return root;
  }
  return null;
}

export function requireHarnessRoot(input = {}) {
  const root = resolveHarnessRoot(input);
  if (root) return root;
  const error = new Error("Harness root not found. Start from the workspace containing .harness/root.json.");
  error.code = "HARNESS_ROOT_NOT_FOUND";
  throw error;
}

export function isStartedAtHarnessRoot(root, cwd = process.cwd()) {
  return path.resolve(root) === path.resolve(cwd);
}
