import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { initializeSessionState, observeHarnessEvent } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("trae", "session_start", raw);
  const root = requireHarnessRoot(input);
  initializeSessionState(root, input);
  observeHarnessEvent(root, input, { eventId: input.eventId });
  appendVerificationEvent(root, input, { raw });
  writeHookOutput({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildSessionStartContext({ ...input, root })
    }
  });
} catch (error) {
  process.stderr.write(`trae session hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
