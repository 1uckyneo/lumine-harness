#!/usr/bin/env node
import { isMainModule, loadNodeMain, unavailableNodeRuntime } from "./node-bootstrap.ts";
const implementation = await loadNodeMain(() => import("./task-cli-main.ts"), { entryUrl: import.meta.url });
export const runTaskCommand: typeof import("./task-cli-main.ts").runTaskCommand = implementation ? implementation.runTaskCommand : unavailableNodeRuntime;
if (implementation && isMainModule(import.meta.url)) implementation.runTaskCli();
