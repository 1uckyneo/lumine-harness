import { buildSessionStartContext } from "../../../../core/session-context.ts";
import { requireHarnessRoot } from "../../../../core/root-resolver.ts";

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
