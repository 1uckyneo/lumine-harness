import { stdin, stdout, stderr } from "node:process";
import { buildSessionStartOutput } from "./lib/session-start-context.ts";
import { normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { initializeSessionState, observeHarnessEvent } from "../../../core/work-status.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";

async function readInput() {
  let raw = "";
  for await (const chunk of stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : {};
}

try {
  const raw = await readInput();
  const input = normalizeHookInput("codex", "session_start", raw);
  const root = requireHarnessRoot(input);
  initializeSessionState(root, input);
  observeHarnessEvent(root, input, { eventId: input.eventId });
  appendVerificationEvent(root, input, { raw });
  stdout.write(JSON.stringify(buildSessionStartOutput({ ...raw, cwd: input.cwd })));
} catch (error) {
  stderr.write(`session-start hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
