import path from "node:path";
import { writeSessionState } from "./work-status.mjs";

export const HARNESS_PHASES = [
  { id: "generated", skill: "lumine-harness-generated", pattern: /\bgenerated\b|生成导航|刷新索引/i },
  { id: "check", skill: "lumine-harness-check", pattern: /\bharness[- ]?check\b|全量检查|硬检查/i },
  { id: "design", skill: "lumine-harness-design", pattern: /\bdesign\b|设计方向|设计稿|原型设计/i },
  { id: "draft", skill: "lumine-harness-draft", pattern: /\bdraft\b|需求草案|需求初稿/i },
  { id: "run", skill: "lumine-harness-run", pattern: /\bharness[- ]?run\b|授权\s*run|执行实现|进入实施/i },
  { id: "plan", skill: "lumine-harness-plan", pattern: /\bproduct spec\b|\bexec(?:ution)? plan\b|产品规格|执行计划/i }
];

export function routeHarnessPhase(prompt = "") {
  return HARNESS_PHASES.find((phase) => phase.pattern.test(String(prompt))) ?? null;
}

export function expectedSkillPath(root, skill) {
  return path.join(root, ".agents", "skills", skill, "SKILL.md");
}

export function recordPromptRoute(root, input, prompt) {
  const phase = routeHarnessPhase(prompt);
  return writeSessionState(root, input.product, input.sessionId, {
    expectedPhase: phase?.id ?? null,
    expectedSkill: phase?.skill ?? null,
    expectedSkillPath: phase ? expectedSkillPath(root, phase.skill) : null,
    expectedSkillRead: false
  });
}

export function extractToolName(raw = {}) {
  return String(raw.tool_name ?? raw.toolName ?? raw.name ?? "");
}

export function extractToolInput(raw = {}) {
  return raw.tool_input ?? raw.toolInput ?? raw.input ?? {};
}

export function toolReadsExpectedSkill(raw, expectedPath) {
  const tool = extractToolName(raw);
  if (!/read|open|view/i.test(tool)) return false;
  const input = extractToolInput(raw);
  const candidate = input.file_path ?? input.filePath ?? input.path ?? input.target ?? "";
  if (!candidate) return false;
  return path.resolve(String(candidate)) === path.resolve(expectedPath);
}

export function toolLoadsExpectedSkill(raw, expectedSkill) {
  if (!expectedSkill || !/^skill$/i.test(extractToolName(raw))) return false;
  const response = raw.tool_response ?? raw.toolResponse ?? raw.output ?? "";
  const text = typeof response === "string" ? response : JSON.stringify(response);
  return text.includes(expectedSkill);
}

export function isMutatingTool(raw = {}) {
  return /^(write|edit|multiedit|bash|shell|terminal|exec|applypatch|apply_patch|write_to_file|search_replace|run_in_terminal|str_replace_editor|run_code)$/i.test(
    extractToolName(raw).replace(/\s+/g, "")
  );
}
