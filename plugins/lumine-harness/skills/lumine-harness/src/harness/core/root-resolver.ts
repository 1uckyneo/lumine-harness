import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { HarnessHookInput } from "./contracts.ts";

export const HARNESS_ROOT_MARKER = path.join(".harness", "root.json");

function isHarnessMarker(file: string): boolean {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as { kind?: unknown; schemaVersion?: unknown } | null;
    return value?.kind === "harness-root" && Number(value?.schemaVersion) >= 1;
  } catch {
    return false;
  }
}

export function findHarnessRoot(start: string = process.cwd()): string | null {
  let current = path.resolve(start);
  while (true) {
    const marker = path.join(current, HARNESS_ROOT_MARKER);
    if (existsSync(marker) && isHarnessMarker(marker)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveHarnessRoot(
  input: Pick<HarnessHookInput, "cwd" | "workspaceRoots"> | Partial<Pick<HarnessHookInput, "cwd" | "workspaceRoots">> = {}
): string | null {
  const starts = [input.cwd, ...(input.workspaceRoots ?? []), process.cwd()].filter(Boolean);
  for (const start of starts) {
    const root = findHarnessRoot(start);
    if (root) return root;
  }
  return null;
}

export function requireHarnessRoot(
  input: Pick<HarnessHookInput, "cwd" | "workspaceRoots"> | Partial<Pick<HarnessHookInput, "cwd" | "workspaceRoots">> = {}
): string {
  const root = resolveHarnessRoot(input);
  if (root) return root;
  const error = Object.assign(
    new Error("Harness root not found. Start from the workspace containing .harness/root.json."),
    { code: "HARNESS_ROOT_NOT_FOUND" as const }
  );
  throw error;
}

export function isStartedAtHarnessRoot(root: string, cwd: string = process.cwd()): boolean {
  return path.resolve(root) === path.resolve(cwd);
}
