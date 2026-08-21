import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { isMutatingTool } from "../../../core/phase-router.mjs";
import { readSessionState } from "../../../core/work-status.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "tool_before", raw);
  const root = requireHarnessRoot(input);
  const state = readSessionState(root, input.product, input.sessionId);
  if (isMutatingTool(raw) && state?.expectedSkill && !state.expectedSkillRead) {
    writeHookOutput({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Read ${state.expectedSkillPath} before executing the ${state.expectedPhase} phase.`
      }
    });
  }
} catch (error) {
  process.stderr.write(`qoder pre-tool hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
