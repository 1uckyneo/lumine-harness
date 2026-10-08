import { isMainModule, loadNodeMain, unavailableNodeRuntime } from "./core/node-bootstrap.ts";
const implementation = await loadNodeMain(() => import("./wiki-main.ts"), { entryUrl: import.meta.url });
export const runWikiCli: typeof import("./wiki-main.ts").runWikiCli = implementation ? implementation.runWikiCli : unavailableNodeRuntime;
if (implementation && isMainModule(import.meta.url)) await implementation.runWikiCli();
