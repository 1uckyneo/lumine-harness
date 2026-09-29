import { readFileSync } from "node:fs";
import { loadProjectConfig, resolveProjectPath } from "./project-config.ts";
import type { ContractIssue } from "./documents.ts";

interface ProjectChecks {
  schemaVersion: 1;
  expectedRepositories?: Array<{ id: string; path: string }>;
  selectedAdapters?: string[];
  documents?: Array<{ path: string; requiredText?: string[]; forbiddenText?: string[]; requiredPatterns?: Array<{ pattern: string; flags?: string }> }>;
}
/** Declarative project-owned checks remain outside the replaceable runtime. */
export function checkProjectContracts(root: string): ContractIssue[] {
  const config = loadProjectConfig(root);
  const reference = config.extensions.projectChecks;
  if (reference === undefined) return [];
  const issues: ContractIssue[] = [];
  const add = (message: string, file?: string) => issues.push({ code: "PROJECT_CONTRACT", message, path: file, remediation: "Review this project-owned invariant; do not silently change business boundaries to satisfy a check." });
  try {
    if (typeof reference !== "string" || !reference.startsWith(".lumine/project-checks/")) throw new Error("extensions.projectChecks must name a JSON file under .lumine/project-checks/");
    const rules = JSON.parse(readFileSync(resolveProjectPath(root, reference), "utf8")) as ProjectChecks;
    if (rules.schemaVersion !== 1) throw new Error("Unsupported project check schemaVersion");
    if (rules.expectedRepositories) {
      const normalized = (items: Array<{id: string; path: string}>) => JSON.stringify(items.map(({id, path}) => ({id, path})).sort((a, b) => a.id.localeCompare(b.id)));
      if (normalized(rules.expectedRepositories) !== normalized(config.repositories)) add("Registered repositories differ from the project-owned boundary contract", reference);
    }
    if (rules.selectedAdapters && JSON.stringify([...rules.selectedAdapters].sort()) !== JSON.stringify([...config.selectedAdapters].sort())) add("Selected Adapters differ from the project contract", reference);
    for (const rule of rules.documents ?? []) {
      const source = readFileSync(resolveProjectPath(root, rule.path, "project check document"), "utf8");
      for (const text of rule.requiredText ?? []) if (!source.includes(text)) add(`Required project statement missing: ${text}`, rule.path);
      for (const text of rule.forbiddenText ?? []) if (source.includes(text)) add(`Forbidden project statement present: ${text}`, rule.path);
      for (const item of rule.requiredPatterns ?? []) if (!new RegExp(item.pattern, item.flags ?? "u").test(source)) add(`Required project pattern missing: ${item.pattern}`, rule.path);
    }
  } catch (error) { add(error instanceof Error ? error.message : String(error), typeof reference === "string" ? reference : undefined); }
  return issues;
}
