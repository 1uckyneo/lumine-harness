import { normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { buildSessionStartContext } from "../../../core/session-context.ts";
import { evaluateStopPolicy } from "../../../core/stop-policy.ts";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.ts";
import { initializeSessionState, observeHarnessEvent } from "../../../core/work-status.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";
import type { UnknownRecord } from "../../../core/contracts.ts";

interface HookResult { exitCode: number; stdout?: string; stderr?: string }

export async function handleKimiHook(raw: UnknownRecord = {}): Promise<HookResult> {
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
    process.stderr.write(`kimi hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
