import { stdin, stdout, stderr } from "node:process";
import { buildSessionStartOutput } from "./lib/session-start-context.mjs";

async function readInput() {
  let raw = "";

  for await (const chunk of stdin) {
    raw += chunk;
  }

  if (!raw.trim()) {
    return {};
  }

  return JSON.parse(raw);
}

try {
  await readInput();
  stdout.write(JSON.stringify(buildSessionStartOutput()));
} catch (error) {
  stderr.write(`session-start hook failed: ${error.message}\n`);
  process.exit(1);
}
