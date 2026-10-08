#!/usr/bin/env node
import { isMainModule, loadNodeMain, unavailableNodeRuntime } from "../harness/core/node-bootstrap.ts";
export type { Locale, Operation, Proposal, ProposalOptions } from "./harness-manager-main.ts";
const implementation = await loadNodeMain(() => import("./harness-manager-main.ts"), { entryUrl: import.meta.url });
export const inspectTarget: typeof import("./harness-manager-main.ts").inspectTarget = implementation ? implementation.inspectTarget : unavailableNodeRuntime;
export const createProposal: typeof import("./harness-manager-main.ts").createProposal = implementation ? implementation.createProposal : unavailableNodeRuntime;
export const applyProposal: typeof import("./harness-manager-main.ts").applyProposal = implementation ? implementation.applyProposal : unavailableNodeRuntime;
export const rollbackProposal: typeof import("./harness-manager-main.ts").rollbackProposal = implementation ? implementation.rollbackProposal : unavailableNodeRuntime;
export const finalizeProposal: typeof import("./harness-manager-main.ts").finalizeProposal = implementation ? implementation.finalizeProposal : unavailableNodeRuntime;
if (implementation && isMainModule(import.meta.url)) await implementation.runManagerCli();
