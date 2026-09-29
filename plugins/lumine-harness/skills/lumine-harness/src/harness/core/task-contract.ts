import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { contentHash, resolveDocument, acceptanceSections, type ContractIssue } from "./documents.ts";
import { loadProjectConfig, resolveProjectPath } from "./project-config.ts";
import { resolveCurrentDocument } from "./document-operations.ts";
import { discoverSharedSkills } from "./skill-catalog.ts";
import { readSessionState, skillReadObservability, writeSessionState } from "./work-status.ts";
import type { HarnessProduct, SessionState } from "./contracts.ts";

export type TaskMode = "plan" | "implement" | "verify" | "diagnose";
export interface AcceptanceReference { specId: string; acId: string; baselineHash: string; }
export interface CodeReference { repoId: string; path: string; sha256: string; }
export interface TaskEvidence {
  specId?: string; acId?: string; artifact: string; sha256: string;
  outcome: "passed" | "failed" | "not_verified";
  observedAt: string; command: string; environment: string; codeRefs: CodeReference[];
}
export interface TaskRecord {
  schemaVersion: 2; taskId: string; mode: TaskMode; goal: string; scope: string;
  specRef?: string; planRef?: string; selectedSkills?: string[]; acceptanceRefs: AcceptanceReference[]; evidence: TaskEvidence[];
  knowledge?: { required: boolean; status: "synchronized" | "pending" | "not_applicable"; refs: string[] };
  summary?: string;
}
export interface TaskCheckResult { ok: boolean; issues: ContractIssue[]; taskId?: string; mode?: TaskMode; output: string; }
const MODES = new Set<TaskMode>(["plan", "implement", "verify", "diagnose"]);
export function taskRecordPath(root: string, taskId: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(taskId) || taskId === "." || taskId === "..") throw new Error("taskId must be a stable filename-safe identifier");
  return resolveProjectPath(root, `.lumine/tasks/${taskId}.json`, "task record");
}
export function validateTaskShape(value: unknown): TaskRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Task must be an object");
  const task = value as TaskRecord;
  if (task.schemaVersion !== 2 || !MODES.has(task.mode)) throw new Error("Task schemaVersion or mode is invalid");
  if (typeof task.taskId !== "string" || typeof task.goal !== "string" || !task.goal.trim() || typeof task.scope !== "string" || !task.scope.trim()) throw new Error("Task requires taskId, goal and scope");
  if (task.selectedSkills !== undefined && (!Array.isArray(task.selectedSkills) || task.selectedSkills.some((name) => typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)))) throw new Error("selectedSkills must contain actual selected canonical Skill names");
  if (!Array.isArray(task.acceptanceRefs) || !Array.isArray(task.evidence)) throw new Error("Task requires acceptanceRefs and evidence arrays");
  return task;
}
export function readTaskRecord(root: string, taskId: string): TaskRecord {
  const task = validateTaskShape(JSON.parse(readFileSync(taskRecordPath(root, taskId), "utf8")));
  if (task.taskId !== taskId) throw new Error("Task filename and identity disagree");
  return task;
}
export function saveTaskRecord(root: string, value: unknown, expectedHash?: string): TaskRecord {
  const task = validateTaskShape(value);
  const file = taskRecordPath(root, task.taskId);
  const lock = resolveProjectPath(root, `.lumine/local/runtime/task-locks/${task.taskId}.lock`, "task lock");
  mkdirSync(path.dirname(lock), { recursive: true });
  let descriptor: number;
  try { descriptor = openSync(lock, "wx"); }
  catch { throw new Error("Task update is already in progress; if interrupted, inspect the local task lock before retrying"); }
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const current = existsSync(file) ? contentHash(readFileSync(file)) : null;
    if (current && current !== expectedHash) throw new Error("Task record changed or exists; supply --expect with its current sha256 before updating");
    if (!current && expectedHash) throw new Error("Task record was deleted after reading");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(temp, `${JSON.stringify(task, null, 2)}\n`, "utf8");
    renameSync(temp, file);
  } finally {
    closeSync(descriptor);
    if (existsSync(temp)) unlinkSync(temp);
    unlinkSync(lock);
  }
  return task;
}
export function bindTask(root: string, product: HarnessProduct, sessionId: string, taskId: string, mode?: TaskMode): SessionState {
  const task = readTaskRecord(root, taskId);
  const selected = mode ?? task.mode;
  if (!MODES.has(selected)) throw new Error("Unknown task mode");
  const state = readSessionState(root, product, sessionId);
  const catalog = discoverSharedSkills(root);
  const selectedSkills = [...new Set([...(state?.selectedSkills ?? []), ...(task.selectedSkills ?? [])])];
  const expectedSkills = selectedSkills.map((name) => {
    const skill = catalog.find((item) => item.name === name);
    if (!skill) throw new Error(`Selected Skill is missing: ${name}`);
    const used = state?.usedSkills?.find((item) => item.name === name && item.contentHash === skill.hash);
    return { name, path: skill.file, reason: "task-selected", read: Boolean(used), readObservability: skillReadObservability(product), contentHash: skill.hash, readAt: used?.readAt };
  });
  return writeSessionState(root, product, sessionId, {
    taskId, taskUserTurnRevision: Number(state?.userTurnRevision ?? 0), requestedActivity: selected,
    selectedSkills, expectedSkills, expectedSkill: expectedSkills[0]?.name ?? null,
    expectedSkillPath: expectedSkills[0]?.path ?? null, expectedSkillRead: expectedSkills.every((item) => item.read)
  });
}
export function checkTask(root: string, taskId: string, modeOverride?: TaskMode): TaskCheckResult {
  const issues: ContractIssue[] = [];
  let mode: TaskMode | undefined;
  const add = (code: string, message: string, file?: string) => issues.push({ code, message, path: file, remediation: "Review the relevant requirement and evidence; a diagnostic finding does not authorize a repair." });
  try {
    const task = readTaskRecord(root, taskId);
    mode = modeOverride ?? task.mode;
    if (task.specRef && resolveDocument(root, task.specRef).type !== "product-spec") add("INVALID_SPEC_REF", "specRef must identify a product spec");
    if (task.planRef && resolveDocument(root, task.planRef).type !== "exec-plan") add("INVALID_PLAN_REF", "planRef must identify an execution plan");
    const required = new Set<string>();
    for (const ref of task.acceptanceRefs) {
      const key = `${ref.specId}/${ref.acId}`;
      if (required.has(key)) { add("DUPLICATE_AC_REF", `Duplicate acceptance reference: ${key}`); continue; }
      required.add(key);
      const doc = resolveDocument(root, ref.specId);
      if (doc.docId !== ref.specId) add("UNSTABLE_AC_REF", "acceptanceRefs.specId must use the stable document id, not its title or filename");
      if (doc.type !== "product-spec") { add("INVALID_AC_SPEC", `Not a product spec: ${ref.specId}`); continue; }
      const acceptance = acceptanceSections(doc).find((item) => item.acId === ref.acId);
      if (!acceptance) add("MISSING_AC", `Acceptance missing: ${key}`);
      else if (acceptance.baselineHash !== ref.baselineHash) add("AC_BASELINE_CHANGED", `Acceptance changed: ${key}. Determine semantic impact before rebasing.`);
    }
    const passed = new Set<string>();
    const latestEvidence = new Map<string, TaskEvidence>();
    let validEvidence = 0;
    const config = loadProjectConfig(root);
    for (const evidence of task.evidence) {
      const before = issues.length;
      if (!evidence || !["passed", "failed", "not_verified"].includes(evidence.outcome)) { add("INVALID_EVIDENCE", "Evidence outcome is invalid"); continue; }
      if (typeof evidence.artifact !== "string" || !evidence.artifact || !evidence.sha256) { add("MISSING_ARTIFACT", "Evidence must identify an artifact and its sha256"); continue; }
      try {
        const artifact = resolveProjectPath(root, evidence.artifact, "evidence artifact");
        const bytes = readFileSync(artifact);
        if (!bytes.length || contentHash(bytes) !== evidence.sha256) add("EVIDENCE_CHANGED", "Evidence artifact is empty or its content differs from the recorded hash", evidence.artifact);
      } catch (error) { add("MISSING_ARTIFACT", error instanceof Error ? error.message : String(error), evidence.artifact); }
      if (!evidence.command?.trim() || !evidence.environment?.trim() || !Number.isFinite(Date.parse(evidence.observedAt))) add("INCOMPLETE_EVIDENCE_CONTEXT", "Evidence requires operation, environment and observedAt", evidence.artifact);
      if (Date.parse(evidence.observedAt) > Date.now() + 60000) add("FUTURE_EVIDENCE", "Evidence timestamp is in the future", evidence.artifact);
      if (!Array.isArray(evidence.codeRefs) || evidence.codeRefs.length === 0) add("MISSING_CODE_BASELINE", "Evidence requires at least one applicable source baseline", evidence.artifact);
      for (const source of evidence.codeRefs ?? []) {
        const repo = config.repositories.find((item) => item.id === source.repoId);
        if (!repo) { add("UNREGISTERED_REPOSITORY", `Unknown repository: ${source.repoId}`); continue; }
        try {
          const file = resolveProjectPath(resolveProjectPath(root, repo.path), source.path, "evidence code reference");
          if (contentHash(readFileSync(file)) !== source.sha256) add("CODE_BASELINE_CHANGED", `Evidence no longer matches ${source.repoId}/${source.path}`, evidence.artifact);
        } catch (error) { add("CODE_BASELINE_MISSING", error instanceof Error ? error.message : String(error), evidence.artifact); }
      }
      const key = evidence.specId && evidence.acId ? `${evidence.specId}/${evidence.acId}` : null;
      if (key && !required.has(key)) add("UNSCOPED_EVIDENCE", `Evidence does not belong to this task: ${key}`, evidence.artifact);
      if (Boolean(evidence.specId) !== Boolean(evidence.acId)) add("INCOMPLETE_AC_REF", "Evidence needs both specId and acId", evidence.artifact);
      if (issues.length === before) {
        validEvidence++;
        const validationKey = `${key ?? "scoped-repair"}\0${evidence.command}\0${evidence.environment}`;
        const previous = latestEvidence.get(validationKey);
        if (!previous || Date.parse(evidence.observedAt) >= Date.parse(previous.observedAt)) latestEvidence.set(validationKey, evidence);
      }
    }
    for (const evidence of latestEvidence.values()) {
      if (evidence.specId && evidence.acId && evidence.outcome === "passed") passed.add(`${evidence.specId}/${evidence.acId}`);
      if (mode === "implement" && evidence.outcome !== "passed") add("CURRENT_VALIDATION_NOT_PASSED", `Current validation is ${evidence.outcome}: ${evidence.command}`, evidence.artifact);
    }
    if (mode === "implement") {
      if (!validEvidence) add("MISSING_IMPLEMENTATION_EVIDENCE", "Implementation completion requires actual validation evidence");
      for (const key of required) if (!passed.has(key)) add("AC_NOT_VERIFIED", `No current passed evidence for ${key}`);
      if (!required.size && !task.evidence.some((item) => item.outcome === "passed")) add("NO_PASSED_VALIDATION", "A scoped repair requires at least one passed validation result");
      if (task.knowledge?.required && task.knowledge.status !== "synchronized") add("KNOWLEDGE_PENDING", "Task-related knowledge synchronization is incomplete");
      if (task.knowledge?.required && !task.knowledge.refs?.length) add("KNOWLEDGE_REFS_MISSING", "Knowledge synchronization needs its document or disposition references");
      for (const reference of task.knowledge?.refs ?? []) {
        // Stable document IDs and rename aliases survive readable path changes.
        try { resolveCurrentDocument(root, reference); continue; } catch { /* A disposition or validation file need not be a structured document. */ }
        try { if (statSync(resolveProjectPath(root, reference, "knowledge reference")).isFile()) continue; } catch { /* Report absent or unsafe references with the task's knowledge finding. */ }
        add("KNOWLEDGE_REF_MISSING", `Knowledge reference is missing or inaccessible: ${reference}`);
      }
    }
  } catch (error) { add("TASK_CONTRACT_ERROR", error instanceof Error ? error.message : String(error)); }
  return { ok: issues.length === 0, issues, taskId, mode, output: issues.map((item) => `${item.code}: ${item.message}`).join("\n") };
}
export function checkSessionCompletion(root: string, state: Partial<SessionState>): TaskCheckResult {
  // selectedSkills declares intent; observed reads belong to Adapter telemetry.
  // Missing telemetry cannot prove a missing read or replace task evidence.
  const diagnostic = state.requestedActivity === "diagnose" || state.requestedActivity === "verify" || state.requestedActivity === "check" || state.requestedActivity === "plan";
  // A diagnostic request may finish with findings. It is not an instruction to fix them.
  if (diagnostic) return { ok: true, issues: [], mode: state.requestedActivity === "check" ? "diagnose" : state.requestedActivity as TaskMode, output: "" };
  if (state.taskId && (state.taskUserTurnRevision === undefined || state.taskUserTurnRevision === Number(state.userTurnRevision ?? 0))) return checkTask(root, state.taskId, "implement");
  if (state.requestedActivity === "implement") return { ok: false, issues: [{ code: "TASK_NOT_BOUND", message: "Bind the current implementation task before claiming completion", remediation: "Use task record and task bind for the current request." }], output: "TASK_NOT_BOUND: Bind the current implementation task and its evidence before claiming completion." };
  return { ok: true, issues: [], output: "" };
}
