import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("trae", "stop", raw);
  const root = requireHarnessRoot(input);
  const decision = evaluateStopPolicy(input, { root });
  appendVerificationEvent(root, input, { raw, decision });
  const delivery = continuationDeliveryFor(input.product, decision);
  if (decision.disposition === "reject_completion" && delivery === "automatic") {
    writeHookOutput({ decision: "block", reason: decision.message });
  } else if (decision.disposition === "request_continuation" && decision.shouldDeliver === true && delivery === "automatic") {
    writeHookOutput({ decision: "block", reason: decision.message });
  }
} catch (error) {
  process.stderr.write(`trae stop hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
