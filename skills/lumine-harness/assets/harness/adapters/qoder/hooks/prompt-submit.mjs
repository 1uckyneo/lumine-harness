import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { initializeSessionState } from "../../../core/work-status.mjs";
import { recordPromptRoute, routeHarnessPhase, expectedSkillPath } from "../../../core/phase-router.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "prompt_submit", raw);
  const root = requireHarnessRoot(input);
  initializeSessionState(root, input);
  const prompt = raw.prompt ?? "";
  recordPromptRoute(root, input, prompt);
  const phase = routeHarnessPhase(prompt);
  const phaseContext = phase
    ? `\n- This prompt entered the ${phase.id} phase. Before Write, Edit, or Bash, read ${expectedSkillPath(root, phase.skill)}.`
    : "";
  writeHookOutput({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `${buildSessionStartContext({ ...input, root })}${phaseContext}`
    }
  });
} catch (error) {
  process.stderr.write(`qoder prompt hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
