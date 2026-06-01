const SESSION_START_LINES = [
  "Harness context map:",
  "- AGENTS.md is the entry map: choose README, ARCHITECTURE, workflow docs, generated indexes, target repo rules, or skills according to the current task.",
  "- Drafts start at docs/drafts/<slug>.md. Optimize draft first; do not jump to design/spec/plan before the user confirms the draft.",
  "- Page design direction may be discussed during draft, but formal design artifacts are generated only after draft approval and before product spec / active exec plan.",
  "- Implementation that needs design confirmation requires approved DESIGN.md plus html or hybrid handoff.",
  "- generated indexes are navigation aids, not fact sources. Refresh and review them before planning/run when repository facts matter.",
  "- Run closeout writes validation commands, logs, screenshots/DOM/console/network summaries, generated review, and remaining risk back to the active plan.",
  "- Use subagents only when the task is worth splitting and write sets are clear.",
  "- User-visible UI text must not contain code-comment, placeholder, development-note, or uncleared TODO-style copy.",
  "- Finish or pause with exactly one WORK_STATUS line."
];

export function buildSessionStartContext() {
  return SESSION_START_LINES.join("\n");
}

export function buildSessionStartOutput() {
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildSessionStartContext()
    }
  };
}
