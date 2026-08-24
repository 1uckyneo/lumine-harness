import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { initializeSessionState } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("cursor", "session_start", raw);
  const root = requireHarnessRoot(input);
  initializeSessionState(root, input);
  appendVerificationEvent(root, input, { raw });
  writeHookOutput({ additional_context: buildSessionStartContext({ ...input, root }) });
} catch (error) {
  process.stderr.write(`cursor session hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
