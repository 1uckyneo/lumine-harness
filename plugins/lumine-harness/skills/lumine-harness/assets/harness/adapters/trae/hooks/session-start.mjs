import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { initializeSessionState } from "../../../core/work-status.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("trae", "session_start", raw);
  const root = requireHarnessRoot(input);
  initializeSessionState(root, input);
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
