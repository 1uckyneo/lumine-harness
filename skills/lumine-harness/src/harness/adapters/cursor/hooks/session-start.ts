import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { buildSessionStartContext } from "../../../core/session-context.ts";
import { initializeSessionState, observeHarnessEvent } from "../../../core/work-status.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("cursor", "session_start", raw);
  const root = requireHarnessRoot(input);
  initializeSessionState(root, input);
  observeHarnessEvent(root, input, { eventId: input.eventId });
  appendVerificationEvent(root, input, { raw });
  writeHookOutput({ additional_context: buildSessionStartContext({ ...input, root }) });
} catch (error) {
  process.stderr.write(`cursor session hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
