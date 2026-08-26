import { normalizeHookInput } from "../../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../../core/root-resolver.mjs";
import { evaluateStopPolicy } from "../../../../core/stop-policy.mjs";
import { continuationDeliveryFor } from "../../../../core/continuation-delivery.mjs";
import { WORK_STATUSES, countWorkStatus, extractWorkStatus } from "../../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../../core/verification.mjs";

export { WORK_STATUSES, countWorkStatus, extractWorkStatus };

export function decideStopHookResponse(raw = {}) {
  const input = normalizeHookInput("codex", "stop", raw);
  const root = requireHarnessRoot(input);
  const decision = evaluateStopPolicy(input, { root });
  appendVerificationEvent(root, input, { raw, decision });
  const delivery = continuationDeliveryFor(input.product, decision);
  if (decision.disposition === "request_continuation") {
    return decision.shouldDeliver === true && delivery === "automatic"
      ? { decision: "block", reason: decision.message }
      : null;
  }
  if (decision.disposition === "reject_completion" && delivery === "automatic") {
    return { continue: false, stopReason: decision.message, systemMessage: decision.message };
  }
  return null;
}
