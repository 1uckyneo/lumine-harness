import { readHookInput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { markExpectedSkillRead, pendingExpectedSkills, requireExpectedSkillRead, toolReadsExpectedSkill } from "../../../core/phase-router.mjs";
import { sharedSkillLoadedFromTool, sharedSkillReadFromTool } from "../../../core/skill-catalog.mjs";
import { observeHarnessEvent, readSessionState, recordUsedSkill } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("qoder", "tool_after", raw);
  const root = requireHarnessRoot(input);
  observeHarnessEvent(root, input, { eventId: input.eventId });
  appendVerificationEvent(root, input, { raw });
  let state = readSessionState(root, input.product, input.sessionId);
  const loadedSkill = sharedSkillLoadedFromTool(root, raw);
  if (loadedSkill) {
    state = requireExpectedSkillRead(root, input, state, loadedSkill);
    recordUsedSkill(root, input, loadedSkill);
    appendVerificationEvent(root, input, { raw, skill: loadedSkill });
    state = markExpectedSkillRead(root, input, state, loadedSkill.file);
  }
  const sharedSkill = sharedSkillReadFromTool(root, raw);
  if (sharedSkill) {
    recordUsedSkill(root, input, sharedSkill);
    appendVerificationEvent(root, input, { raw, skill: sharedSkill });
    state = readSessionState(root, input.product, input.sessionId);
  }
  for (const skill of pendingExpectedSkills(state)) {
    if (toolReadsExpectedSkill(raw, skill.path)) {
      state = markExpectedSkillRead(root, input, state, skill.path);
    }
  }
} catch (error) {
  process.stderr.write(`qoder post-tool hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
