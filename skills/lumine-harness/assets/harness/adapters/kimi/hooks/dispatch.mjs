import { normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.mjs";
import { initializeSessionState, observeHarnessEvent } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

export async function handleKimiHook(raw = {}) {
  const event = raw.hook_event_name === "SessionStart" ? "session_start" : "stop";
  const input = normalizeHookInput("kimi", event, raw);
  const root = requireHarnessRoot(input);
  if (event === "session_start") {
    initializeSessionState(root, input);
    observeHarnessEvent(root, input, { eventId: input.eventId });
    appendVerificationEvent(root, input, { raw });
    return { exitCode: 0, stdout: buildSessionStartContext({ ...input, root }) };
  }
  const decision = evaluateStopPolicy(input, { root });
  appendVerificationEvent(root, input, { raw, decision });
  const delivery = continuationDeliveryFor(input.product, decision);
  if (decision.disposition === "reject_completion" && delivery === "automatic") {
    return { exitCode: 2, stderr: decision.message };
  }
  if (decision.disposition === "request_continuation" && decision.shouldDeliver === true && delivery === "automatic") {
    return { exitCode: 2, stderr: decision.message };
  }
  return { exitCode: 0 };
}

async function main() {
  let source = "";
  for await (const chunk of process.stdin) source += chunk;
  const result = await handleKimiHook(source.trim() ? JSON.parse(source) : {});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`kimi hook failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
