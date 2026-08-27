import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { evaluateStopPolicy } from "../../../core/stop-policy.ts";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "stop", raw);
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
  process.stderr.write(`qoder stop hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
