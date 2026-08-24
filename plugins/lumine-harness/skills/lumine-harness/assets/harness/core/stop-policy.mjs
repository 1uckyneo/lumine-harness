import { spawnSync } from "node:child_process";
import path from "node:path";
import { countWorkStatus, extractWorkStatus, readFreshStateStatus, readSessionState, recordWorkStatus, writeSessionState } from "./work-status.mjs";

const PAUSE_MESSAGES = {
  needs_user_decision: "Pause and ask the user for the decision that changes direction, scope, or trade-offs.",
  needs_credentials: "Pause because credentials or authenticated access are required.",
  needs_manual_app_step: "Pause because a manual action in an external application is required.",
  blocked_external: "Pause because an external dependency is unavailable and no safe autonomous workaround remains."
};

function defaultRunCheck(root) {
  const result = spawnSync(process.execPath, [path.join(root, ".harness", "check.mjs"), "all"], { cwd: root, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

function resolveStatus(input, root) {
  const message = input.lastAssistantMessage ?? "";
  if (message) {
    if (countWorkStatus(message) !== 1) return { status: null, reason: "message" };
    const status = extractWorkStatus(message);
    const state = status ? recordWorkStatus(root, input, status) : null;
    return { status, reason: "message", state };
  }
  const state = readSessionState(root, input.product, input.sessionId);
  return { status: readFreshStateStatus(state), reason: "state", state };
}

export function evaluateStopPolicy(input, options = {}) {
  const root = options.root;
  const resolved = resolveStatus(input, root);
  if (!resolved.status) return { action: "block", message: "Record exactly one fresh WORK_STATUS before stopping." };
  const status = resolved.status;
  const state = resolved.state ?? readSessionState(root, input.product, input.sessionId) ?? {};
  const workStatusRevision = Number(state.workStatusRevision ?? 0);
  if (status === "continue_autonomously") {
    const revision = workStatusRevision;
    const used = input.stopHookActive || input.loopCount > 0 || Number(state.continuationConsumedRevision ?? -1) === revision;
    if (used) return { action: "pause", workStatus: status, workStatusRevision, message: "Automatic continuation was already used once." };
    writeSessionState(root, input.product, input.sessionId, {
      continuationCount: Number(state.continuationCount ?? 0) + 1,
      continuationConsumedRevision: revision
    });
    return { action: "continue", workStatus: status, workStatusRevision, message: "Continue with the next concrete autonomous step only, then stop with a fresh WORK_STATUS." };
  }
  if (status !== "done") return { action: "pause", workStatus: status, workStatusRevision, message: PAUSE_MESSAGES[status] };
  const check = (options.runCheck ?? defaultRunCheck)(root);
  if (!check.ok) return { action: "block", workStatus: status, workStatusRevision, message: check.output || "Harness checks failed." };
  return { action: "allow", workStatus: status, workStatusRevision };
}
