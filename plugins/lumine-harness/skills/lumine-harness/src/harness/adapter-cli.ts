#!/usr/bin/env node
import { isMainModule, loadNodeMain } from "./core/node-bootstrap.ts";
const implementation = await loadNodeMain(() => import("./adapter-cli-main.ts"), { entryUrl: import.meta.url });
if (implementation && isMainModule(import.meta.url)) implementation.runAdapterCli();
