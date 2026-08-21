import { readHookInput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { writeSessionState } from "../../../core/work-status.mjs";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("cursor", "assistant_response", raw);
  const root = requireHarnessRoot(input);
  writeSessionState(root, input.product, input.sessionId, {
    lastAssistantMessage: raw.text ?? "",
    lastAssistantMessageAt: new Date().toISOString()
  });
} catch (error) {
  process.stderr.write(`cursor response hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
