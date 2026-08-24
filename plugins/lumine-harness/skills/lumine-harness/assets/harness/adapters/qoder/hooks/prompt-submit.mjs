import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { initializeSessionState, readSessionState } from "../../../core/work-status.mjs";
import { recordPromptRoute, pendingExpectedSkills } from "../../../core/phase-router.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "prompt_submit", raw);
  const root = requireHarnessRoot(input);
  if (!readSessionState(root, input.product, input.sessionId)) initializeSessionState(root, input);
  appendVerificationEvent(root, input, { raw });
  const prompt = raw.prompt ?? "";
  const state = recordPromptRoute(root, input, prompt);
  const expected = pendingExpectedSkills(state);
  const phaseContext = expected.length
    ? `\n- Before Write, Edit, or Bash, read these canonical shared Skills completely:\n${expected.map((skill) => `  - ${skill.path} (${skill.reason})`).join("\n")}`
    : "";
  writeHookOutput({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `${buildSessionStartContext({ ...input, root, prompt })}${phaseContext}`
    }
  });
} catch (error) {
  process.stderr.write(`qoder prompt hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
