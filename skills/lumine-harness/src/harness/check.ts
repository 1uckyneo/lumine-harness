import { isMainModule, loadNodeMain, unavailableNodeRuntime } from "./core/node-bootstrap.ts";
export type { CheckResult } from "./check-main.ts";
const implementation = await loadNodeMain(() => import("./check-main.ts"), { entryUrl: import.meta.url });
export const runChecks: typeof import("./check-main.ts").runChecks = implementation ? implementation.runChecks : unavailableNodeRuntime;
export const runCheckCommand: typeof import("./check-main.ts").runCheckCommand = implementation ? implementation.runCheckCommand : unavailableNodeRuntime;
if (implementation && isMainModule(import.meta.url)) implementation.runCheckCli();
