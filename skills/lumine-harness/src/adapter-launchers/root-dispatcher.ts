import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { reportUnsupportedNodeRuntime } from "../harness/core/node-bootstrap.ts";

// Bundled into host node -e commands. No project lookup or stdin read precedes this check.
const hookEntry = process.argv[1];
const args = process.argv.slice(2);
if (!reportUnsupportedNodeRuntime(args)) {
  let root = process.cwd();
  while (!existsSync(path.join(root, ".lumine/root.json")) && path.dirname(root) !== root) root = path.dirname(root);
  if (!existsSync(path.join(root, ".lumine/root.json"))) {
    console.error("Lumine root not found");
    process.exitCode = 2;
  } else {
    const manifest = JSON.parse(readFileSync(path.join(root, ".lumine/root.json"), "utf8")) as { runtime?: string };
    const runtime = manifest.runtime || ".lumine";
    if (path.isAbsolute(runtime) || runtime.split(/[\\/]/).includes("..")) {
      console.error("Invalid runtime path");
      process.exitCode = 2;
    } else {
      const result = spawnSync(process.execPath, [path.join(root, runtime, hookEntry), ...args], { stdio: "inherit" });
      if (result.error) {
        console.error(result.error.message);
        process.exitCode = 1;
      } else process.exitCode = result.status ?? 1;
    }
  }
}
