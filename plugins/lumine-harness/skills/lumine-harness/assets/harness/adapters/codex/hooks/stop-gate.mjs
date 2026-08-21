import { stdin, stdout, stderr } from "node:process";
import { decideStopHookResponse } from "./lib/stop-gate.mjs";

async function readInput() {
  let raw = "";
  for await (const chunk of stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : {};
}

try {
  const input = await readInput();
  const response = decideStopHookResponse(input);
  if (response) stdout.write(JSON.stringify(response));
} catch (error) {
  stderr.write(`stop-gate hook failed: ${error.message}\n`);
  process.exit(1);
}
