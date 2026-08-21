import { stdin, stdout, stderr } from "node:process";
import { buildSessionStartOutput } from "./lib/session-start-context.mjs";
import { normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { initializeSessionState } from "../../../core/work-status.mjs";

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
  stdout.write(JSON.stringify(buildSessionStartOutput({ ...raw, cwd: input.cwd })));
} catch (error) {
  stderr.write(`session-start hook failed: ${error.message}\n`);
  process.exit(1);
}
