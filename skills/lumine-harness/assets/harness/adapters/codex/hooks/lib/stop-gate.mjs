import { normalizeHookInput } from "../../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../../core/root-resolver.mjs";
import { evaluateStopPolicy } from "../../../../core/stop-policy.mjs";
import { WORK_STATUSES, countWorkStatus, extractWorkStatus } from "../../../../core/work-status.mjs";

export { WORK_STATUSES, countWorkStatus, extractWorkStatus };

export function decideStopHookResponse(raw = {}) {
  const input = normalizeHookInput("codex", "stop", raw);
  const root = requireHarnessRoot(input);
  const decision = evaluateStopPolicy(input, { root });
  if (decision.action === "allow") return null;
  if (decision.action === "continue") return { decision: "block", reason: decision.message };
  return { continue: false, stopReason: decision.message, systemMessage: decision.message };
}
