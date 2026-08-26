import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { isMutatingTool, pendingExpectedSkills } from "../../../core/phase-router.mjs";
import { observeHarnessEvent, readSessionState } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "tool_before", raw);
  const root = requireHarnessRoot(input);
  observeHarnessEvent(root, input, { eventId: input.eventId });
  appendVerificationEvent(root, input, { raw });
  const state = readSessionState(root, input.product, input.sessionId);
  const pending = pendingExpectedSkills(state);
  if (isMutatingTool(raw) && pending.length) {
    appendVerificationEvent(root, input, { raw, observations: ["pre_mutation_gate"] });
    writeHookOutput({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Read the required canonical shared Skills before mutation: ${pending.map((skill) => skill.path).join(", ")}.`
      }
    });
  }
} catch (error) {
  process.stderr.write(`qoder pre-tool hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
