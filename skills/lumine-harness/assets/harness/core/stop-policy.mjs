import { spawnSync } from "node:child_process";
import path from "node:path";
import { countWorkStatus, extractWorkStatus, readFreshStateStatus, readSessionState, writeSessionState } from "./work-status.mjs";

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
    return { status: extractWorkStatus(message), reason: "message" };
  }
  const state = readSessionState(root, input.product, input.sessionId);
  return { status: readFreshStateStatus(state), reason: "state", state };
}

export function evaluateStopPolicy(input, options = {}) {
  const root = options.root;
  const resolved = resolveStatus(input, root);
  if (!resolved.status) return { action: "block", message: "Record exactly one fresh WORK_STATUS before stopping." };
  const status = resolved.status;
  if (status === "continue_autonomously") {
    const state = resolved.state ?? readSessionState(root, input.product, input.sessionId) ?? {};
    const usesMessage = Boolean(input.lastAssistantMessage);
    const used = input.stopHookActive || input.loopCount > 0 || (!usesMessage && Number(state.continuationCount ?? 0) > 0);
    if (used) return { action: "pause", workStatus: status, message: "Automatic continuation was already used once." };
    writeSessionState(root, input.product, input.sessionId, { continuationCount: 1 });
    return { action: "continue", workStatus: status, message: "Continue with the next concrete autonomous step only, then stop with a fresh WORK_STATUS." };
  }
  if (status !== "done") return { action: "pause", workStatus: status, message: PAUSE_MESSAGES[status] };
  const check = (options.runCheck ?? defaultRunCheck)(root);
  if (!check.ok) return { action: "block", workStatus: status, message: check.output || "Harness checks failed." };
  return { action: "allow", workStatus: status };
}
