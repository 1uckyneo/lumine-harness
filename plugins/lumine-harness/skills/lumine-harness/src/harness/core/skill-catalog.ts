import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import type { SharedSkill, SkillCatalogDiagnostic, UnknownRecord } from "./contracts.ts";

export interface SkillCatalogInspection {
  skills: SharedSkill[];
  diagnostics: SkillCatalogDiagnostic[];
}

export interface SkillSearchOptions {
  limit?: number;
  query?: string;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" ? value as UnknownRecord : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function walkSkillFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSkillFiles(target, out);
    else if (entry.isFile() && entry.name === "SKILL.md") out.push(target);
  }
  return out;
}

function cleanScalar(value: string = ""): string {
  const text = String(value).trim();
  if (!text) return "";
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return String(JSON.parse(text)); } catch {}
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  return text;
}

function frontmatterField(source: string, field: string): string {
  const yaml = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const lines = yaml.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^${field}:\\s*(.*)$`));
    if (!match) continue;
    const scalar = match[1].trim();
    if (!["|", "|-", ">", ">-"].includes(scalar)) return cleanScalar(scalar);
    const values: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (!/^\s+/.test(lines[cursor])) break;
      values.push(lines[cursor].trim());
    }
    return scalar.startsWith(">") ? values.join(" ").trim() : values.join("\n").trim();
  }
  return "";
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function inspectSharedSkillCatalog(root: string): SkillCatalogInspection {
  const base = path.join(root, ".agents", "skills");
  const candidates: SharedSkill[] = [];
  const diagnostics: SkillCatalogDiagnostic[] = [];
  for (const file of walkSkillFiles(base).sort()) {
    const relativeSource = path.relative(root, file).replaceAll(path.sep, "/");
    try {
      const source = readFileSync(file, "utf8");
      const fallbackName = path.basename(path.dirname(file));
      const name = frontmatterField(source, "name") || fallbackName;
      const description = frontmatterField(source, "description");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`invalid name: ${name}`);
      if (!description) throw new Error("missing frontmatter description");
      candidates.push({ name, description, file, relativeSource, hash: sha256(source) });
    } catch (error) {
      diagnostics.push({ file: relativeSource, code: "invalid-skill", message: errorMessage(error) });
    }
  }
  const counts = new Map<string, number>();
  for (const skill of candidates) counts.set(skill.name, Number(counts.get(skill.name) ?? 0) + 1);
  const duplicateNames = [...counts].filter(([, count]) => count > 1).map(([name]) => name);
  for (const name of duplicateNames) {
    diagnostics.push({
      file: candidates.filter((skill) => skill.name === name).map((skill) => skill.relativeSource).join(", "),
      code: "duplicate-skill-name",
      message: `duplicate shared Skill name: ${name}`
    });
  }
  const skills = candidates.filter((skill) => !duplicateNames.includes(skill.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { skills, diagnostics };
}

export function discoverSharedSkills(root: string): SharedSkill[] {
  return inspectSharedSkillCatalog(root).skills;
}

export function getSharedSkill(root: string, name: unknown): SharedSkill | null {
  const normalized = String(name ?? "").replace(/^\$/, "").toLowerCase();
  return discoverSharedSkills(root).find((skill) => skill.name === normalized) ?? null;
}

function scoreSkill(skill: SharedSkill, terms: readonly string[]): number {
  const name = skill.name.toLowerCase();
  const description = skill.description.toLowerCase();
  return terms.reduce((score, term) => score + (name === term ? 100 : name.includes(term) ? 20 : description.includes(term) ? 4 : 0), 0);
}

export function searchSharedSkills(root: string, query: string = "", options: SkillSearchOptions = {}): SharedSkill[] {
  const limit = Math.max(1, Math.min(Number(options.limit ?? 3), 20));
  const terms = String(query).toLowerCase().match(/[a-z0-9-]+|[\u3400-\u9fff]{2,}/g) ?? [];
  if (!terms.length) return discoverSharedSkills(root).slice(0, limit);
  return discoverSharedSkills(root)
    .map((skill) => ({ skill, score: scoreSkill(skill, terms) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, limit)
    .map((item) => item.skill);
}

export function buildSharedSkillCatalog(root: string, options: SkillSearchOptions = {}): string {
  const skills = options.query ? searchSharedSkills(root, options.query, options) : discoverSharedSkills(root).slice(0, Number(options.limit ?? 3));
  if (!skills.length) return "No matching project Skills were discovered under .agents/skills.";
  return [
    "Relevant project Skills (canonical content is only under .agents/skills):",
    ...skills.map((skill) => `- ${skill.name}: ${skill.description} [${skill.relativeSource}]`),
    "Read the canonical SKILL.md completely before using a Skill."
  ].join("\n");
}

export function sharedSkillReadFromTool(root: string, raw: UnknownRecord = {}): SharedSkill | null {
  const tool = String(raw.tool_name ?? raw.toolName ?? raw.name ?? "");
  if (!/read|open|view/i.test(tool)) return null;
  const input = asRecord(raw.tool_input ?? raw.toolInput ?? raw.input);
  const candidate = input.file_path ?? input.filePath ?? input.path ?? input.target ?? "";
  if (!candidate) return null;
  const cwd = raw.cwd ?? raw.working_directory ?? raw.workingDirectory ?? root;
  const resolved = path.resolve(String(cwd), String(candidate));
  if (!existsSync(resolved)) return null;
  const canonicalCandidate = realpathSync.native(resolved);
  return discoverSharedSkills(root).find((skill) => realpathSync.native(skill.file) === canonicalCandidate) ?? null;
}

export function sharedSkillLoadedFromTool(root: string, raw: UnknownRecord = {}): SharedSkill | null {
  const tool = String(raw.tool_name ?? raw.toolName ?? raw.name ?? "");
  if (!/^skill$/i.test(tool)) return null;
  const input = asRecord(raw.tool_input ?? raw.toolInput ?? raw.input);
  const explicit = input.skill ?? input.skill_name ?? input.skillName ?? input.name ?? "";
  if (explicit) return getSharedSkill(root, explicit);
  const response = raw.tool_response ?? raw.toolResponse ?? raw.output ?? "";
  const text = typeof response === "string" ? response : JSON.stringify(response);
  return discoverSharedSkills(root).slice().sort((left, right) => right.name.length - left.name.length)
    .find((skill) => new RegExp(`(?:^|[^a-z0-9-])${skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9-])`, "i").test(text)) ?? null;
}
