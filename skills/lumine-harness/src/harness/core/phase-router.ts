import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { writeSessionState } from "./work-status.ts";
import { discoverSharedSkills } from "./skill-catalog.ts";
import type {
  ExpectedSkill,
  NormalizedHarnessHookInput,
  SessionState,
  SharedSkill,
  UnknownRecord
} from "./contracts.ts";

export type HarnessPhaseId = "generated" | "check" | "design" | "draft" | "run" | "plan";

export interface HarnessPhase {
  id: HarnessPhaseId;
  skill: string;
  pattern: RegExp;
}

export const HARNESS_PHASES: readonly HarnessPhase[] = [
  { id: "generated", skill: "lumine-harness-generated", pattern: /\bgenerated\b|生成导航|刷新索引/i },
  { id: "check", skill: "lumine-harness-check", pattern: /\bharness[- ]?check\b|全量检查|硬检查/i },
  { id: "design", skill: "lumine-harness-design", pattern: /\bdesign\b|设计方向|设计稿|原型设计/i },
  { id: "draft", skill: "lumine-harness-draft", pattern: /\bdraft\b|需求草案|需求初稿/i },
  { id: "run", skill: "lumine-harness-run", pattern: /\bharness[- ]?run\b|授权\s*run|执行实现|进入实施/i },
  { id: "plan", skill: "lumine-harness-plan", pattern: /\bproduct spec\b|\bexec(?:ution)? plan\b|产品规格|执行计划/i }
];

export function routeHarnessPhase(prompt: unknown = ""): HarnessPhase | null {
  return HARNESS_PHASES.find((phase) => phase.pattern.test(String(prompt))) ?? null;
}

export function expectedSkillPath(root: string, skill: string): string {
  return path.join(root, ".agents", "skills", skill, "SKILL.md");
}

export function recordPromptRoute(root: string, input: NormalizedHarnessHookInput, prompt: unknown): SessionState {
  const phase = routeHarnessPhase(prompt);
  const sharedSkills = discoverSharedSkills(root);
  const explicitNames = [...String(prompt).matchAll(/\$([a-z0-9]+(?:-[a-z0-9]+)*)/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((name) => sharedSkills.some((skill) => skill.name === name));
  const expectedSkills: ExpectedSkill[] = [];
  if (phase) {
    expectedSkills.push({
      name: phase.skill,
      path: expectedSkillPath(root, phase.skill),
      reason: `harness-phase:${phase.id}`,
      read: false
    });
  }
  for (const name of explicitNames) {
    if (expectedSkills.some((skill) => skill.name === name)) continue;
    const sharedSkill = sharedSkills.find((skill) => skill.name === name);
    if (!sharedSkill) continue;
    expectedSkills.push({
      name,
      path: sharedSkill.file,
      reason: "explicit-user-request",
      read: false
    });
  }
  return writeSessionState(root, input.product, input.sessionId, {
    expectedPhase: phase?.id ?? null,
    expectedSkill: expectedSkills[0]?.name ?? null,
    expectedSkillPath: expectedSkills[0]?.path ?? null,
    expectedSkillRead: expectedSkills.length === 0,
    expectedSkills
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
  const expectedSkills = Array.isArray(state?.expectedSkills)
    ? state.expectedSkills.map((skill) => path.resolve(skill.path) === target ? { ...skill, read: true, readAt: new Date().toISOString() } : skill)
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
  const required = { name: skill.name, path: skill.file, reason, read: false };
  if (index === -1) expectedSkills.push(required);
  else expectedSkills[index] = { ...expectedSkills[index], ...required, readAt: null };
  return writeSessionState(root, input.product, input.sessionId, {
    expectedSkill: expectedSkills[0]?.name ?? skill.name,
    expectedSkillPath: expectedSkills[0]?.path ?? skill.file,
    expectedSkillRead: false,
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
