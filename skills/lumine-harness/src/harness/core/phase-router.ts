import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalSkillsRoot } from "./root-resolver.ts";
import { readSessionState, writeSessionState } from "./work-status.ts";
import { discoverSharedSkills } from "./skill-catalog.ts";
import type {
  ExpectedSkill,
  NormalizedHarnessHookInput,
  SessionState,
  SharedSkill,
  UnknownRecord
} from "./contracts.ts";

export type HarnessPhaseId = "plan" | "run" | "knowledge" | "design";
export interface HarnessPhase { id: HarnessPhaseId; skill: string; pattern: RegExp; }
export const HARNESS_PHASES: readonly HarnessPhase[] = [
  { id: "design", skill: "lumine-design", pattern: /视觉|交互|页面设计|原型|\b(?:visual design|ui design|prototype)\b/i },
  { id: "knowledge", skill: "lumine-knowledge", pattern: /repo[ -]?wiki|知识库|知识卡片|仓库定位|\b(?:wiki|knowledge)\b/i },
  { id: "plan", skill: "lumine-plan", pattern: /需求澄清|产品方案|技术方案|制定计划|只.*(?:讨论|方案)|\b(?:product spec|exec(?:ution)? plan|planning|plan only)\b/i },
  { id: "run", skill: "lumine-run", pattern: /开始实施|继续实现|实施|诊断|验收|排查|\b(?:implement|resume|diagnos|verif)/i }
];

/** Keywords suggest candidates only; they never select a Skill or change the task mode. */
export function suggestHarnessPhases(prompt: unknown = ""): HarnessPhase[] {
  return HARNESS_PHASES.filter((phase) => phase.pattern.test(String(prompt)));
}
export function explicitlySelectedSkillNames(prompt: unknown = ""): string[] {
  const text = String(prompt);
  const names = [...text.matchAll(/\$([a-z0-9]+(?:-[a-z0-9]+)*)/gi)].map((match) => match[1].toLowerCase());
  // A bare name, quoted comparison, or a description of responsibilities is not an invocation.
  const command = /(?:^|[。！？!?；;\n，,]|\b(?:and|then)\s+|并|然后)\s*(?:请|please\s+)?(?:use|invoke|load|使用|调用|启用|授权|选择)\s*`?([a-z0-9]+(?:-[a-z0-9]+)+)`?(?=$|[^a-z0-9-])/gi;
  for (const match of text.matchAll(command)) names.push(match[1].toLowerCase());
  return [...new Set(names)];
}
/** Return only an actual, unambiguous selection. */
export function routeHarnessPhase(prompt: unknown = ""): HarnessPhase | null {
  const names = explicitlySelectedSkillNames(prompt);
  const selected = HARNESS_PHASES.filter((phase) => names.includes(phase.skill));
  return selected.length === 1 ? selected[0] : null;
}
export function expectedSkillPath(root: string, skill: string): string { return path.join(canonicalSkillsRoot(root), skill, "SKILL.md"); }
export function recordPromptRoute(root: string, input: NormalizedHarnessHookInput, prompt: unknown): SessionState {
  const sharedSkills = discoverSharedSkills(root);
  const state = readSessionState(root, input.product, input.sessionId);
  const requestedNames = [...new Set([...(state?.selectedSkills ?? []), ...explicitlySelectedSkillNames(prompt)])];
  const names = requestedNames.filter((name) => sharedSkills.some((skill) => skill.name === name));
  const skillSelectionDiagnostics = requestedNames.filter((name) => !names.includes(name)).map((name) => ({ name, code: "unknown-skill" as const }));
  const expectedSkills: ExpectedSkill[] = names.flatMap((name) => {
    const skill = sharedSkills.find((item) => item.name === name);
    if (!skill) return [];
    const used = state?.usedSkills?.find((item) => item.name === name && item.contentHash === skill.hash);
    const previous = state?.expectedSkills?.find((item) => item.name === name && item.contentHash === skill.hash && item.read);
    return [{ name, path: skill.file, reason: "selected-skill", read: Boolean(used || previous), contentHash: skill.hash, readAt: used?.readAt ?? previous?.readAt }];
  });
  const phases = HARNESS_PHASES.filter((phase) => names.includes(phase.skill));
  const skillCandidates = suggestHarnessPhases(prompt).flatMap((phase) => {
    const skill = sharedSkills.find((entry) => entry.name === phase.skill);
    return skill ? [{ name: skill.name, path: skill.file, reason: "keyword-candidate-only" }] : [];
  });
  return writeSessionState(root, input.product, input.sessionId, {
    // requestedActivity belongs to an explicitly bound task; prompt mentions cannot override it.
    selectedSkills: names, skillCandidates, skillSelectionDiagnostics, expectedPhase: phases.length === 1 ? phases[0].id : null,
    expectedSkill: expectedSkills[0]?.name ?? null, expectedSkillPath: expectedSkills[0]?.path ?? null,
    expectedSkillRead: expectedSkills.every((skill) => skill.read), expectedSkills
  });
}

export function pendingExpectedSkills(state: Partial<SessionState> | null | undefined = {}): ExpectedSkill[] {
  if (Array.isArray(state?.expectedSkills)) return state.expectedSkills.filter((skill) => !skill.read);
  if (state?.expectedSkill && !state.expectedSkillRead) {
    return [{ name: state.expectedSkill, path: state.expectedSkillPath ?? "", reason: state.expectedPhase ?? null, read: false }];
  }
  return [];
}

export function markExpectedSkillRead(
  root: string,
  input: NormalizedHarnessHookInput,
  state: Partial<SessionState> | null | undefined,
  file: string
): SessionState {
  const target = path.resolve(file);
  const contentHash = existsSync(target) ? createHash("sha256").update(readFileSync(target)).digest("hex") : null;
  const expectedSkills = Array.isArray(state?.expectedSkills)
    ? state.expectedSkills.map((skill) => path.resolve(skill.path) === target && contentHash && (!skill.contentHash || skill.contentHash === contentHash) ? { ...skill, read: true, contentHash, readAt: new Date().toISOString() } : skill)
    : [];
  const allRead = expectedSkills.length ? expectedSkills.every((skill) => skill.read) : path.resolve(state?.expectedSkillPath ?? "") === target;
  return writeSessionState(root, input.product, input.sessionId, {
    expectedSkills,
    expectedSkillRead: allRead,
    expectedSkillReadAt: allRead ? new Date().toISOString() : state?.expectedSkillReadAt ?? null
  });
}

export function requireExpectedSkillRead(
  root: string,
  input: NormalizedHarnessHookInput,
  state: Partial<SessionState> | null | undefined,
  skill: SharedSkill,
  reason: string = "adapter-routed"
): SessionState {
  const target = path.resolve(skill.file);
  const expectedSkills = Array.isArray(state?.expectedSkills) ? [...state.expectedSkills] : [];
  const index = expectedSkills.findIndex((item) => path.resolve(item.path) === target);
  const alreadyRead = state?.usedSkills?.some((item) => item.name === skill.name && item.contentHash === skill.hash) ?? false;
  const required = { name: skill.name, path: skill.file, reason, read: alreadyRead, contentHash: skill.hash };
  if (index === -1) expectedSkills.push(required);
  else expectedSkills[index] = { ...expectedSkills[index], ...required, readAt: null };
  return writeSessionState(root, input.product, input.sessionId, {
    expectedSkill: expectedSkills[0]?.name ?? skill.name,
    expectedSkillPath: expectedSkills[0]?.path ?? skill.file,
    expectedSkillRead: expectedSkills.every((item) => item.read),
    expectedSkills
  });
}

export function extractToolName(raw: UnknownRecord = {}): string {
  return String(raw.tool_name ?? raw.toolName ?? raw.name ?? "");
}

export function extractToolInput(raw: UnknownRecord = {}): UnknownRecord {
  const value = raw.tool_input ?? raw.toolInput ?? raw.input;
  return value !== null && typeof value === "object" ? value as UnknownRecord : {};
}

export function toolReadsExpectedSkill(raw: UnknownRecord, expectedPath: string): boolean {
  const tool = extractToolName(raw);
  if (!/read|open|view/i.test(tool)) return false;
  const input = extractToolInput(raw);
  const candidate = input.file_path ?? input.filePath ?? input.path ?? input.target ?? "";
  if (!candidate) return false;
  const cwd = raw.cwd ?? raw.working_directory ?? raw.workingDirectory ?? process.cwd();
  const resolvedCandidate = path.resolve(String(cwd), String(candidate));
  const resolvedExpected = path.resolve(expectedPath);
  if (!existsSync(resolvedCandidate) || !existsSync(resolvedExpected)) return false;
  return realpathSync.native(resolvedCandidate) === realpathSync.native(resolvedExpected);
}

export function toolLoadsExpectedSkill(raw: UnknownRecord, expectedSkill: string | null | undefined): boolean {
  if (!expectedSkill || !/^skill$/i.test(extractToolName(raw))) return false;
  const response = raw.tool_response ?? raw.toolResponse ?? raw.output ?? "";
  const text = typeof response === "string" ? response : JSON.stringify(response);
  return text.includes(expectedSkill);
}

export function isMutatingTool(raw: UnknownRecord = {}): boolean {
  return /^(write|edit|multiedit|notebookedit|bash|shell|terminal|exec|applypatch|apply_patch|write_to_file|search_replace|run_in_terminal|str_replace_editor|run_code)$/i.test(
    extractToolName(raw).replace(/\s+/g, "")
  );
}
