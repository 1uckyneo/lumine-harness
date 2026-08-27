import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { buildSessionStartContext } from "../../../core/session-context.ts";
import { initializeSessionState, observeHarnessEvent, readSessionState } from "../../../core/work-status.ts";
import { recordPromptRoute, pendingExpectedSkills } from "../../../core/phase-router.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "prompt_submit", raw);
  const root = requireHarnessRoot(input);
  if (!readSessionState(root, input.product, input.sessionId)) initializeSessionState(root, input);
  observeHarnessEvent(root, input, { userInitiated: input.userInitiated, eventId: input.eventId });
  appendVerificationEvent(root, input, { raw });
  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
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
  process.stderr.write(`qoder prompt hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
