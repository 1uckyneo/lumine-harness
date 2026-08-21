#!/usr/bin/env node
import { formatAdapterResult, runAdapterCommand, setCliWorkStatus } from "./adapter-manager.mjs";

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === "adapter") {
    const result = runAdapterCommand(args);
    process.stdout.write(`${formatAdapterResult(result)}\n`);
  } else if (command === "work-status") {
    const productIndex = args.indexOf("--product");
    const product = productIndex >= 0 ? args[productIndex + 1] : undefined;
    const state = setCliWorkStatus(args[0], { product });
    process.stdout.write(`WORK_STATUS recorded: ${state.workStatus}\n`);
  } else {
    throw new Error("Usage: adapter ... | work-status <status> [--product <product>]");
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
