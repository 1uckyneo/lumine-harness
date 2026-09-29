import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolveProjectPath } from "./project-config.ts";
import type { HarnessHookInput } from "./contracts.ts";

export const HARNESS_ROOT_MARKER = path.join(".lumine", "root.json");
export interface RootManifest { kind: "lumine-root"; schemaVersion: 2; skills: string; instructions: string; runtime?: string; [key: string]: unknown; }
export function readRootManifest(root: string): RootManifest {
  const value = JSON.parse(readFileSync(resolveProjectPath(root, HARNESS_ROOT_MARKER, "root marker"), "utf8"));
  if (value?.kind !== "lumine-root" || value.schemaVersion !== 2) throw new Error("Invalid Lumine root manifest; use the migration tool before running the new workflow.");
  if (["creating", "applying"].includes(value.migrationStatus)) throw new Error("Lumine migration is still applying; resume the migration tool before normal work.");
  const result = { ...value, skills: value.skills ?? ".agents/skills", instructions: value.instructions ?? "AGENTS.md" } as RootManifest;
  for (const key of ["skills", "instructions"] as const) {
    if (typeof result[key] !== "string") throw new Error(`root.${key} must be a relative path`);
    resolveProjectPath(root, result[key], `root.${key}`);
  }
  if (result.runtime !== undefined) resolveProjectPath(root, result.runtime, "root.runtime");
  return result;
}
export function findHarnessRoot(start: string = process.cwd()): string | null {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, HARNESS_ROOT_MARKER))) { readRootManifest(current); return current; }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
export function resolveHarnessRoot(input: Partial<Pick<HarnessHookInput, "cwd" | "workspaceRoots">> & { root?: string } = {}): string | null {
  if (input.root) { const root = path.resolve(input.root); readRootManifest(root); return root; }
  for (const start of [input.cwd, ...(input.workspaceRoots ?? []), process.cwd()].filter((item): item is string => Boolean(item))) {
    const root = findHarnessRoot(start);
    if (root) return root;
  }
  return null;
}
export function requireHarnessRoot(input: Partial<Pick<HarnessHookInput, "cwd" | "workspaceRoots">> & { root?: string } = {}): string {
  const root = resolveHarnessRoot(input);
  if (root) return root;
  throw Object.assign(new Error("Lumine root not found. Start from the project containing .lumine/root.json."), { code: "HARNESS_ROOT_NOT_FOUND" });
}
export function canonicalSkillsRoot(root: string): string { return resolveProjectPath(root, readRootManifest(root).skills, "root.skills"); }
export function projectRuntimeRoot(root: string): string { return resolveProjectPath(root, readRootManifest(root).runtime ?? ".lumine", "root.runtime"); }
export function isStartedAtHarnessRoot(root: string, cwd = process.cwd()): boolean { return path.resolve(root) === path.resolve(cwd); }
