import { readHookInput, normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { observeHarnessEvent, writeSessionState } from "../../../core/work-status.ts";

try {
  const raw = await readHookInput();
  const input = normalizeHookInput("cursor", "assistant_response", raw);
  const root = requireHarnessRoot(input);
  observeHarnessEvent(root, input, { eventId: input.eventId });
  writeSessionState(root, input.product, input.sessionId, {
    lastAssistantMessage: typeof raw.text === "string" ? raw.text : "",
    lastAssistantMessageAt: new Date().toISOString()
  });
} catch (error) {
  process.stderr.write(`cursor response hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
