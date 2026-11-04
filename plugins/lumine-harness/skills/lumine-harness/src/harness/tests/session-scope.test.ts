import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { contentHash } from "../core/documents.ts";
import { beginSessionRequest, showSessionRequest } from "../core/session-scope.ts";
import { bindTask, checkSessionCompletion, readTaskRecord, saveTaskRecord, taskRecordPath } from "../core/task-contract.ts";
import { evaluateStopPolicy } from "../core/stop-policy.ts";
import { currentRequestScope, getSessionStatePath, initializeSessionState, observeHarnessEvent, readSessionState, recordUserTurn, recordWorkReport, RETIRED_REQUEST_HISTORY_LIMIT, writeSessionState } from "../core/work-status.ts";
import { normalizeHookInput } from "../core/hook-io.ts";

function write(root: string, file: string, text: string): void { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); }
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-request-scope-"));
  write(root, ".lumine/root.json", JSON.stringify({ schemaVersion: 2, kind: "lumine-root" }));
  write(root, ".lumine/project.json", JSON.stringify({ schemaVersion: 2, workflowVersion: 2, locale: "zh-CN", repositories: [{ id: "project", path: "." }] }));
  write(root, "source.ts", "export const result = 1;\n"); write(root, "validation.txt", "Actual fixture validation passed\n");
  write(root, "docs/product-specs/原方案.md", "---\nid: stable-spec\ntype: product-spec\nstatus: active\n---\n# 同一功能\n用户已确认的既有范围。\n");
  write(root, "docs/exec-plans/active/原计划.md", "---\nid: stable-plan\ntype: exec-plan\nspecId: stable-spec\nstatus: active\n---\n# 实施计划\n- [x] 已验证步骤\n- [ ] 后续步骤\n");
  saveTaskRecord(root, { schemaVersion: 3, taskId: "stable-task", mode: "implement", goal: "Continue an existing feature", scope: "source.ts", specRef: "stable-spec", planRef: "stable-plan", acceptanceRefs: [], evidence: [{ artifact: "validation.txt", sha256: contentHash(readFileSync(path.join(root, "validation.txt"))), outcome: "passed", observedAt: new Date().toISOString(), command: "fixture validation", environment: "isolated test", codeRefs: [{ repoId: "project", path: "source.ts", sha256: contentHash(readFileSync(path.join(root, "source.ts"))) }] }], knowledge: { required: false, status: "not_applicable", refs: [] }, summary: "Existing approved scope and verified progress remain applicable." });
  return { root, options: { root, product: "codex", sessionId: "conversation" }, clean: () => rmSync(root, { recursive: true, force: true }) };
}
function stop(root: string, response: string, extra: Record<string, unknown> = {}) { return normalizeHookInput("codex", "stop", { cwd: root, session_id: "conversation", response_id: response, last_assistant_message: "WORK_STATUS: done", ...extra }); }

test("a completed implementation followed by an independent read-only request never checks or rewrites old evidence", () => {
  const f = fixture(); try {
    beginSessionRequest({ ...f.options, requestId: "implement-feature", mode: "implement", taskId: "stable-task" });
    assert.equal(evaluateStopPolicy(stop(f.root, "implementation-done"), { root: f.root }).disposition, "finish");
    const originalTask = readFileSync(taskRecordPath(f.root, "stable-task"), "utf8");
    write(f.root, "source.ts", "export const result = 2;\n");
    const before = beginSessionRequest({ ...f.options, requestId: "independent-read-only-question", mode: "diagnose" });
    assert.equal(before.requestScope?.taskId, null); assert.equal(before.taskId, "stable-task", "history is preserved but not rebound");
    assert.equal(evaluateStopPolicy(stop(f.root, "question-done"), { root: f.root }).disposition, "finish");
    assert.equal(readFileSync(taskRecordPath(f.root, "stable-task"), "utf8"), originalTask);
    const file = getSessionStatePath(f.root, "codex", "conversation"); const bytes = readFileSync(file, "utf8");
    for (let i = 0; i < 100; i++) beginSessionRequest({ ...f.options, requestId: "independent-read-only-question", mode: "diagnose" });
    assert.equal(readFileSync(file, "utf8"), bytes, "repeating the same declaration is byte-for-byte idempotent");
  } finally { f.clean(); }
});

test("unknown scope, unbound implementation, missing verification and genuine evidence drift remain blocked", () => {
  const f = fixture(); try {
    initializeSessionState(f.root, stop(f.root, "legacy"));
    const legacy = writeSessionState(f.root, "codex", "conversation", { taskId: "stable-task", taskUserTurnRevision: 0, requestedActivity: "implement" });
    assert.equal(checkSessionCompletion(f.root, legacy).issues[0].code, "REQUEST_SCOPE_REQUIRED");
    assert.equal(evaluateStopPolicy(stop(f.root, "unknown-scope"), { root: f.root, runCheck: () => ({ ok: true }) }).disposition, "reject_completion");
    const unbound = beginSessionRequest({ ...f.options, requestId: "new-implementation", mode: "implement" });
    assert.equal(checkSessionCompletion(f.root, unbound).issues[0].code, "TASK_NOT_BOUND");
    const bound = bindTask(f.root, "codex", "conversation", "stable-task");
    assert.equal(checkSessionCompletion(f.root, bound).ok, true);
    const task = readTaskRecord(f.root, "stable-task"); const taskHash = contentHash(readFileSync(taskRecordPath(f.root, "stable-task")));
    saveTaskRecord(f.root, { ...task, evidence: [] }, taskHash);
    assert.ok(checkSessionCompletion(f.root, bound).issues.some(item => item.code === "MISSING_IMPLEMENTATION_EVIDENCE"));
    assert.equal(evaluateStopPolicy(stop(f.root, "no-evidence"), { root: f.root, runCheck: () => ({ ok: true }) }).disposition, "reject_completion");
    saveTaskRecord(f.root, task, contentHash(readFileSync(taskRecordPath(f.root, "stable-task"))));
    write(f.root, "source.ts", "export const result = 3;\n");
    assert.ok(checkSessionCompletion(f.root, bound).issues.some(item => item.code === "CODE_BASELINE_CHANGED"));
  } finally { f.clean(); }
});

test("same request cannot downgrade implementation or switch tasks, and two sessions remain independent", () => {
  const f = fixture(); try {
    const first = beginSessionRequest({ ...f.options, requestId: "work", mode: "implement", taskId: "stable-task" });
    const original = readFileSync(getSessionStatePath(f.root, "codex", "conversation"), "utf8");
    assert.throws(() => beginSessionRequest({ ...f.options, requestId: "work", mode: "diagnose" }), /REQUEST_MODE_CONFLICT/);
    assert.throws(() => bindTask(f.root, "codex", "conversation", "stable-task", "diagnose"), /REQUEST_MODE_CONFLICT/);
    assert.throws(() => beginSessionRequest({ ...f.options, resume: true, mode: "verify" }), /REQUEST_MODE_CONFLICT/);
    assert.throws(() => beginSessionRequest({ ...f.options, requestId: "next", mode: "diagnose", expectedRequestId: "wrong" }), /STALE_REQUEST/);
    beginSessionRequest({ ...f.options, sessionId: "other-conversation", requestId: "work", mode: "diagnose" });
    assert.equal(readFileSync(getSessionStatePath(f.root, "codex", "conversation"), "utf8"), original);
    assert.equal(showSessionRequest(f.options).request?.id, first.requestScope?.id);
  } finally { f.clean(); }
});

test("real host turn identifiers, retry transport identities and continuation receipts have separate meanings", () => {
  const f = fixture(); try {
    const firstInput = stop(f.root, "host-response", { user_turn_id: "host-user-turn", hook_run_id: "attempt-one" });
    const undeclared = recordUserTurn(f.root, firstInput);
    assert.equal(undeclared.requestScope?.origin, "host"); assert.equal(undeclared.requestScope?.mode, null);
    const declared = beginSessionRequest({ ...f.options, mode: "implement", taskId: "stable-task", requestId: "optional-agent-key" });
    assert.equal(declared.requestScope?.id, undeclared.requestScope?.id, "reliable host identity takes priority");
    assert.deepEqual(beginSessionRequest({ ...f.options, mode: "implement", taskId: "stable-task", requestId: "optional-agent-key" }), declared);
    const next = evaluateStopPolicy({ ...firstInput, lastAssistantMessage: "WORK_STATUS: continue" }, { root: f.root });
    assert.equal(next.shouldDeliver, true);
    const retry = evaluateStopPolicy({ ...firstInput, lastAssistantMessage: "WORK_STATUS: continue", eventId: "attempt-two", stopHookActive: true }, { root: f.root });
    assert.equal(retry.shouldDeliver, false); assert.equal(retry.continuationRequestId, next.continuationRequestId);
    observeHarnessEvent(f.root, { ...firstInput, event: "assistant_response", lastAssistantMessage: null, userTurnId: null, continuationRequestId: next.continuationRequestId, eventId: "delivered" });
    const resumed = beginSessionRequest({ ...f.options, resume: true });
    assert.equal(resumed.requestScope?.id, declared.requestScope?.id); assert.equal(resumed.requestScope?.taskId, "stable-task");
    assert.equal(resumed.continuationDeliveryConfirmed, true);
    recordUserTurn(f.root, { ...firstInput, userTurnId: "next-host-user-turn" });
    assert.equal(showSessionRequest(f.options).requiresDeclaration, true);
    beginSessionRequest({ ...f.options, mode: "diagnose" });
    assert.equal(evaluateStopPolicy(stop(f.root, "new-question-answer", { user_turn_id: "next-host-user-turn" }), { root: f.root }).disposition, "finish");
  } finally { f.clean(); }
});

test("late Stop and event retries from retired requests cannot reset or write the current read-only scope", () => {
  const f = fixture(); try {
    const a = stop(f.root, "response-a", { user_turn_id: "turn-a", last_assistant_message: "WORK_STATUS: continue" });
    recordUserTurn(f.root, a);
    beginSessionRequest({ ...f.options, mode: "implement", taskId: "stable-task" });
    const first = evaluateStopPolicy(a, { root: f.root });
    assert.equal(first.shouldDeliver, true);
    const currentBytes = readFileSync(getSessionStatePath(f.root, "codex", "conversation"), "utf8");
    assert.equal(evaluateStopPolicy(a, { root: f.root }).continuationRequestId, first.continuationRequestId);
    assert.equal(readFileSync(getSessionStatePath(f.root, "codex", "conversation"), "utf8"), currentBytes, "current A retry is idempotent");
    const b = stop(f.root, "response-b", { user_turn_id: "turn-b" });
    recordUserTurn(f.root, b);
    beginSessionRequest({ ...f.options, mode: "diagnose" });
    assert.equal(evaluateStopPolicy(b, { root: f.root }).disposition, "finish");
    const file = getSessionStatePath(f.root, "codex", "conversation"); const before = readFileSync(file, "utf8");
    const taskFile = taskRecordPath(f.root, "stable-task"); const beforeTask = readFileSync(taskFile, "utf8");
    for (let i = 0; i < 100; i++) {
      let checked = false;
      const late = evaluateStopPolicy({ ...a, eventId: "late-transport-" + i }, { root: f.root, runCheck: () => { checked = true; return { ok: true }; } });
      assert.equal(late.disposition, "pause_for_human"); assert.equal(late.shouldDeliver, false); assert.match(late.message!, /STALE_(REQUEST|RESPONSE)_EVENT/); assert.equal(checked, false);
    }
    assert.throws(() => observeHarnessEvent(f.root, { ...a, event: "assistant_response", continuationRequestId: first.continuationRequestId, progressObserved: true, progressObservable: true }), /STALE_(REQUEST|RESPONSE)_EVENT/);
    assert.throws(() => observeHarnessEvent(f.root, { ...a, event: "prompt_submit", userInitiated: true }), /STALE_(REQUEST|RESPONSE)_EVENT/);
    assert.throws(() => recordWorkReport(f.root, a, { protocolVersion: 2, status: "blocked" }), /STALE_(REQUEST|RESPONSE)_EVENT/);
    assert.equal(readFileSync(file, "utf8"), before); assert.equal(readFileSync(taskFile, "utf8"), beforeTask);
    assert.equal(showSessionRequest(f.options).request?.mode, "diagnose");
    assert.equal(evaluateStopPolicy(b, { root: f.root }).disposition, "finish");
    assert.equal(readFileSync(file, "utf8"), before, "B's existing report and decision remain idempotent");
  } finally { f.clean(); }
});

test("stable response identities reject cross-request late Stops even without host user-turn IDs", () => {
  const f = fixture(); try {
    beginSessionRequest({ ...f.options, requestId: "request-a", mode: "implement", taskId: "stable-task" });
    const a1 = { ...stop(f.root, "response-a1"), lastAssistantMessage: "WORK_STATUS: continue" };
    const a2 = { ...stop(f.root, "response-a2"), lastAssistantMessage: "WORK_STATUS: continue" };
    evaluateStopPolicy(a1, { root: f.root });
    const next = evaluateStopPolicy(a2, { root: f.root });
    assert.equal(next.shouldDeliver, true);
    const file = getSessionStatePath(f.root, "codex", "conversation"); const beforeRetry = readFileSync(file, "utf8");
    const retry = evaluateStopPolicy({ ...a2, eventId: "retry-current" }, { root: f.root });
    assert.equal(retry.shouldDeliver, false); assert.equal(retry.continuationRequestId, next.continuationRequestId);
    assert.equal(evaluateStopPolicy(a1, { root: f.root }).shouldDeliver, false, "older response in the current scope cannot deliver again");
    assert.equal(readFileSync(file, "utf8"), beforeRetry);
    beginSessionRequest({ ...f.options, requestId: "request-b", mode: "diagnose" });
    assert.equal(evaluateStopPolicy(stop(f.root, "response-b"), { root: f.root }).disposition, "finish");
    const before = readFileSync(file, "utf8");
    for (const old of [a1, a2]) {
      const late = evaluateStopPolicy({ ...old, eventId: "new-transport" }, { root: f.root });
      assert.equal(late.disposition, "pause_for_human"); assert.equal(late.shouldDeliver, false); assert.match(late.message!, /STALE_RESPONSE_EVENT/);
      assert.throws(() => recordWorkReport(f.root, old, { protocolVersion: 2, status: "blocked" }), /STALE_RESPONSE_EVENT/);
      assert.throws(() => observeHarnessEvent(f.root, { ...old, event: "assistant_response", progressObserved: true, progressObservable: true, continuationRequestId: next.continuationRequestId }), /STALE_RESPONSE_EVENT/);
    }
    assert.equal(readFileSync(file, "utf8"), before); assert.equal(showSessionRequest(f.options).request?.mode, "diagnose");
  } finally { f.clean(); }
});

test("new prompts and current progress events may reference an older response without replaying its report", () => {
  const f = fixture(); try {
    const a = { ...stop(f.root, "response-a", { user_turn_id: "turn-a" }), lastAssistantMessage: "WORK_STATUS: continue" };
    recordUserTurn(f.root, a); beginSessionRequest({ ...f.options, mode: "implement", taskId: "stable-task" });
    evaluateStopPolicy(a, { root: f.root });
    const bPrompt = { ...a, event: "prompt_submit" as const, userTurnId: "turn-b", userInitiated: true, eventId: "real-new-prompt" };
    const b = observeHarnessEvent(f.root, bPrompt);
    assert.equal(b.requestScope?.mode, null); assert.equal(b.workReport, null);
    beginSessionRequest({ ...f.options, mode: "implement", taskId: "stable-task" });
    const bStop = { ...stop(f.root, "response-b", { user_turn_id: "turn-b" }), lastAssistantMessage: "WORK_STATUS: continue" };
    const next = evaluateStopPolicy(bStop, { root: f.root }); assert.equal(next.shouldDeliver, true);
    // Both a tool progress event and a reportless assistant event may carry an
    // older response association; current turn and receipt remain authoritative.
    const observed = observeHarnessEvent(f.root, { ...a, event: "tool_after", userTurnId: "turn-b", eventId: "progress-b", progressObserved: true, continuationRequestId: next.continuationRequestId });
    assert.equal(observed.progressRevision, 1); assert.equal(observed.continuationDeliveryConfirmed, true); assert.equal(observed.requestScope?.id, b.requestScope?.id);
    const again = evaluateStopPolicy({ ...bStop, statusEmissionId: "response-b2" }, { root: f.root });
    const delivered = observeHarnessEvent(f.root, { ...a, event: "assistant_response", userTurnId: "turn-b", lastAssistantMessage: null, eventId: "receipt-b2", continuationRequestId: again.continuationRequestId });
    assert.equal(delivered.continuationDeliveryConfirmed, true); assert.equal(delivered.requestScope?.id, b.requestScope?.id);
    assert.equal(delivered.workReport?.status, "continue");
    const protectedBytes = readFileSync(getSessionStatePath(f.root, "codex", "conversation"), "utf8");
    assert.equal(evaluateStopPolicy(a, { root: f.root }).shouldDeliver, false);
    assert.equal(readFileSync(getSessionStatePath(f.root, "codex", "conversation"), "utf8"), protectedBytes, "actual A report replay still cannot alter B");
  } finally { f.clean(); }
});

test("reportless Stop with an old response association still requires a fresh current report", () => {
  const f = fixture(); try {
    const a = stop(f.root, "response-a");
    beginSessionRequest({ ...f.options, requestId: "a", mode: "diagnose" });
    assert.equal(evaluateStopPolicy(a, { root: f.root }).disposition, "finish");
    beginSessionRequest({ ...f.options, requestId: "b", mode: "diagnose" });
    const current = showSessionRequest(f.options).request?.id;
    const missing = evaluateStopPolicy({ ...a, lastAssistantMessage: null }, { root: f.root });
    assert.equal(missing.disposition, "reject_completion"); assert.equal(missing.cause, "report_invalid"); assert.match(missing.message!, /fresh structured report/);
    assert.equal(showSessionRequest(f.options).request?.id, current); assert.equal(readSessionState(f.root, "codex", "conversation")?.workReport, null);
  } finally { f.clean(); }
});

test("reportless Stop consumes a fresh current structured report rather than its historical response association", () => {
  const f = fixture(); try {
    const a = stop(f.root, "response-a");
    beginSessionRequest({ ...f.options, requestId: "a", mode: "diagnose" });
    evaluateStopPolicy(a, { root: f.root });
    beginSessionRequest({ ...f.options, requestId: "b", mode: "diagnose" });
    recordWorkReport(f.root, stop(f.root, "response-b"), { protocolVersion: 2, status: "done" });
    const current = showSessionRequest(f.options).request?.id;
    const result = evaluateStopPolicy({ ...a, lastAssistantMessage: null }, { root: f.root });
    assert.equal(result.disposition, "finish"); assert.equal(result.workStatus, "done");
    assert.equal(showSessionRequest(f.options).request?.id, current);
  } finally { f.clean(); }
});

test("response replay history remains bounded without storing response text", () => {
  const f = fixture(); try {
    beginSessionRequest({ ...f.options, requestId: "many-responses", mode: "diagnose" });
    for (let i = 0; i <= RETIRED_REQUEST_HISTORY_LIMIT; i++) evaluateStopPolicy(stop(f.root, "response-" + i), { root: f.root });
    const active = readSessionState(f.root, "codex", "conversation")!;
    assert.equal(active.handledStopEmissionIds?.length, RETIRED_REQUEST_HISTORY_LIMIT);
    beginSessionRequest({ ...f.options, requestId: "next-request", mode: "diagnose" });
    const retired = readSessionState(f.root, "codex", "conversation")!;
    assert.equal(retired.handledStopEmissionIds?.length, 0); assert.equal(retired.retiredStopEmissionIds?.length, RETIRED_REQUEST_HISTORY_LIMIT);
    assert.ok(retired.retiredStopEmissionIds?.every(id => /^[a-f0-9]{64}$/.test(id)));
    assert.match(evaluateStopPolicy(stop(f.root, "response-" + RETIRED_REQUEST_HISTORY_LIMIT), { root: f.root }).message!, /STALE_RESPONSE_EVENT/);
  } finally { f.clean(); }
});

test("bounded request history fails closed for unknown Stop identities after eviction", () => {
  const f = fixture(); try {
    for (let i = 0; i <= RETIRED_REQUEST_HISTORY_LIMIT + 1; i++) recordUserTurn(f.root, stop(f.root, "response-" + i, { user_turn_id: "turn-" + i }));
    beginSessionRequest({ ...f.options, mode: "diagnose" });
    const state = readSessionState(f.root, "codex", "conversation")!;
    assert.equal(state.retiredUserTurnIds?.length, RETIRED_REQUEST_HISTORY_LIMIT); assert.equal(state.userTurnHistoryTruncated, true);
    const file = getSessionStatePath(f.root, "codex", "conversation"); const before = readFileSync(file, "utf8");
    for (const user_turn_id of ["turn-0", "genuinely-new-turn"]) {
      const result = evaluateStopPolicy(stop(f.root, "unknown-response", { user_turn_id }), { root: f.root });
      assert.equal(result.disposition, "pause_for_human"); assert.equal(result.shouldDeliver, false); assert.match(result.message!, /REQUEST_HISTORY_BOUNDARY/);
    }
    assert.equal(readFileSync(file, "utf8"), before);
    // An actual user event remains authoritative after the bounded Stop window.
    observeHarnessEvent(f.root, { ...stop(f.root, "new-response", { user_turn_id: "genuinely-new-turn" }), event: "prompt_submit", userInitiated: true });
    beginSessionRequest({ ...f.options, mode: "diagnose" });
    assert.equal(evaluateStopPolicy(stop(f.root, "new-response", { user_turn_id: "genuinely-new-turn" }), { root: f.root }).disposition, "finish");
    assert.equal(readSessionState(f.root, "codex", "conversation")?.retiredUserTurnIds?.length, RETIRED_REQUEST_HISTORY_LIMIT);
  } finally { f.clean(); }
});

test("continued feature work keeps one Spec, Plan, task, progress and applicable approval across request scopes", () => {
  const f = fixture(); try {
    const taskFile = taskRecordPath(f.root, "stable-task"); const beforeTask = readFileSync(taskFile, "utf8");
    const specFile = path.join(f.root, "docs/product-specs/原方案.md"); const planFile = path.join(f.root, "docs/exec-plans/active/原计划.md");
    const beforeSpec = readFileSync(specFile, "utf8"); const beforePlan = readFileSync(planFile, "utf8");
    for (const requestId of ["initial-work", "refine-direction", "continue-same-feature"]) {
      const state = beginSessionRequest({ ...f.options, requestId, mode: "implement", taskId: "stable-task" });
      assert.equal(state.taskId, "stable-task"); assert.equal(checkSessionCompletion(f.root, state).ok, true);
    }
    assert.equal(readFileSync(taskFile, "utf8"), beforeTask); assert.equal(readFileSync(specFile, "utf8"), beforeSpec); assert.equal(readFileSync(planFile, "utf8"), beforePlan);
    // Subsequent authorized edits happen in the existing files, not in documents minted by session begin.
    writeFileSync(specFile, beforeSpec + "\n新调整仅影响本段，原确认的范围继续有效。\n");
    writeFileSync(planFile, beforePlan + "\n在同一计划继续执行调整后的步骤。\n");
    assert.deepEqual(readdirSync(path.dirname(specFile)), ["原方案.md"]); assert.deepEqual(readdirSync(path.dirname(planFile)), ["原计划.md"]);
    assert.match(readFileSync(planFile, "utf8"), /\[x\] 已验证步骤/); assert.equal(readTaskRecord(f.root, "stable-task").planRef, "stable-plan");
  } finally { f.clean(); }
});

test("session CLI supports JSON and Chinese guidance; identity and a fallback request key are explicit", () => {
  const f = fixture(); try {
    const sourceMode = import.meta.url.endsWith(".ts");
    const cli = fileURLToPath(new URL(sourceMode ? "../adapter-cli.ts" : "../adapter-cli.mjs", import.meta.url));
    const repo = path.resolve(path.dirname(cli), "../../../..");
    const run = (...args: string[]) => spawnSync(process.execPath, [...(sourceMode ? ["--import", "tsx"] : []), cli, "session", ...args, "--root", f.root, "--product", "codex", "--session-id", "cli-conversation"], { cwd: repo, encoding: "utf8" });
    assert.equal(run("begin", "--mode", "diagnose").status, 2);
    const result = run("begin", "--mode", "diagnose", "--request-id", "first-question", "--json"); assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).request.mode, "diagnose");
    const shown = run("show", "--json"); assert.equal(shown.status, 0, shown.stderr); assert.deepEqual(JSON.parse(shown.stdout), JSON.parse(result.stdout));
    const resumed = run("begin", "--resume", "--locale", "zh-CN"); assert.equal(resumed.status, 0, resumed.stderr); assert.match(resumed.stdout, /当前请求/);
    assert.equal(currentRequestScope(readSessionState(f.root, "codex", "cli-conversation")!)?.mode, "diagnose");
  } finally { f.clean(); }
});

test("Trae protocol subprocess rejects unbound work and accepts the explicitly declared independent diagnosis", () => {
  const f = fixture(); try {
    const sourceMode = import.meta.url.endsWith(".ts"); const extension = sourceMode ? ".ts" : ".mjs";
    const hook = fileURLToPath(new URL(`../adapters/trae/hooks/stop${extension}`, import.meta.url));
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
    const run = (response: string) => spawnSync(process.execPath, [...(sourceMode ? ["--import", "tsx"] : []), hook], { cwd: repo, input: JSON.stringify({ cwd: f.root, session_id: "trae-protocol", response_id: response, last_assistant_message: "WORK_STATUS: done" }), encoding: "utf8" });
    beginSessionRequest({ root: f.root, product: "trae", sessionId: "trae-protocol", requestId: "implementation", mode: "implement" });
    const failed = run("missing-task"); assert.equal(failed.status, 0, failed.stderr); assert.equal(JSON.parse(failed.stdout).decision, "block"); assert.match(failed.stdout, /TASK_NOT_BOUND/);
    beginSessionRequest({ root: f.root, product: "trae", sessionId: "trae-protocol", requestId: "read-only-question", mode: "diagnose" });
    const passed = run("question-answered"); assert.equal(passed.status, 0, passed.stderr); assert.equal(passed.stdout, "");
  } finally { f.clean(); }
});
