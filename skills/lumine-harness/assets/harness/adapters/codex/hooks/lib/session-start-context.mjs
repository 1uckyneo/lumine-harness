import { buildSessionStartContext } from "../../../../core/session-context.mjs";
import { requireHarnessRoot } from "../../../../core/root-resolver.mjs";

export { buildSessionStartContext };

export function buildSessionStartOutput(input = {}) {
  const root = requireHarnessRoot(input);
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildSessionStartContext({ ...input, root })
    }
  };
}
