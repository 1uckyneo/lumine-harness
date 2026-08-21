import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("trae", "stop", raw);
  const root = requireHarnessRoot(input);
  const decision = evaluateStopPolicy(input, { root });
  if (decision.action === "continue" || decision.action === "block") {
    writeHookOutput({ decision: "block", reason: decision.message });
  }
} catch (error) {
  process.stderr.write(`trae stop hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
