import { readHookInput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { toolReadsExpectedSkill } from "../../../core/phase-router.mjs";
import { readSessionState, writeSessionState } from "../../../core/work-status.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "tool_after", raw);
  const root = requireHarnessRoot(input);
  const state = readSessionState(root, input.product, input.sessionId);
  if (state?.expectedSkillPath && toolReadsExpectedSkill(raw, state.expectedSkillPath)) {
    writeSessionState(root, input.product, input.sessionId, {
      expectedSkillRead: true,
      expectedSkillReadAt: new Date().toISOString()
    });
  }
} catch (error) {
  process.stderr.write(`qoder post-tool hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
