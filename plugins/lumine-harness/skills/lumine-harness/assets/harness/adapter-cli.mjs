#!/usr/bin/env node
import { formatAdapterResult, formatSkillResult, runAdapterCommand, runSkillCommand, setCliWorkStatus } from "./adapter-manager.mjs";

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "adapter") {
    const result = runAdapterCommand(args);
    process.stdout.write(`${formatAdapterResult(result)}\n`);
  } else if (command === "skills") {
    const result = runSkillCommand(args);
    process.stdout.write(`${formatSkillResult(result)}\n`);
  } else if (command === "work-status") {
    const productIndex = args.indexOf("--product");
    const product = productIndex >= 0 ? args[productIndex + 1] : undefined;
    const sessionIndex = args.indexOf("--session-id");
    const sessionId = sessionIndex >= 0 ? args[sessionIndex + 1] : undefined;
    const state = setCliWorkStatus(args[0], { product, sessionId });
    process.stdout.write(`WORK_STATUS recorded: ${state.workStatus} (revision ${state.workStatusRevision})\n`);
  } else {
    throw new Error("Usage: adapter ... | skills <list|search|inspect> ... | work-status <status> --product <product> --session-id <id>");
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
