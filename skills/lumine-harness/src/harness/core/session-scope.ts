import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findHarnessRoot } from "./root-resolver.ts";
import { bindTask, readTaskRecord } from "./task-contract.ts";
import { currentRequestScope, getSessionStatePath, hashRuntimeIdentifier, initializeSessionState, readSessionState, recordUserTurn, requestScopeForBinding, writeSessionState } from "./work-status.ts";
import type { HarnessProduct, RequestMode, SessionState } from "./contracts.ts";

const PRODUCTS: readonly string[] = ["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"];
const MODES: readonly string[] = ["plan", "implement", "verify", "diagnose", "check"];
export interface RequestOptions {
  root?: string; cwd?: string; product?: string; sessionId?: string;
  mode?: string; taskId?: string; requestId?: string; resume?: boolean; expectedRequestId?: string;
}
function identity(options: RequestOptions): { root: string; product: HarnessProduct; sessionId: string; cwd: string } {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("HARNESS_ROOT_REQUIRED: Harness root not found.");
  const product = options.product ?? process.env.HARNESS_PRODUCT;
  const sessionId = options.sessionId ?? process.env.HARNESS_SESSION_ID;
  if (!product || !PRODUCTS.includes(product) || !sessionId || sessionId === "unknown") throw new Error("SESSION_IDENTITY_REQUIRED: pass --product and --session-id; no shared current-session pointer is used.");
  return { root, product: product as HarnessProduct, sessionId, cwd: options.cwd ?? root };
}
export function showSessionRequest(options: RequestOptions = {}) {
  const input = identity(options);
  const state = readSessionState(input.root, input.product, input.sessionId);
  return { product: input.product, sessionId: input.sessionId, request: state ? currentRequestScope(state) : null, userTurnRevision: state?.userTurnRevision ?? 0,
    previousTaskId: state?.taskId ?? null, requiresDeclaration: !state || !currentRequestScope(state)?.mode };
}

/** Called by the Agent for a real user request. Retries use the same key; continuations use resume. */
export function beginSessionRequest(options: RequestOptions): SessionState {
  const input = identity(options);
  if ((!options.mode && !options.resume) || (options.mode && !MODES.includes(options.mode))) throw new Error("REQUEST_MODE_REQUIRED: --mode must be plan, implement, verify, diagnose or check; --resume may reuse the existing mode.");
  if (options.requestId !== undefined && (!options.requestId.trim() || options.requestId.length > 512)) throw new Error("REQUEST_ID_INVALID: use a non-empty stable request key of at most 512 characters.");
  if (options.resume && options.requestId) throw new Error("REQUEST_ARGUMENT_CONFLICT: use --resume or --request-id, not both.");
  // Validate associations before changing local scope. The task document itself is never written here.
  if (options.taskId) readTaskRecord(input.root, options.taskId);
  const lock = `${getSessionStatePath(input.root, input.product, input.sessionId)}.stop-lock`;
  mkdirSync(path.dirname(lock), { recursive: true });
  let descriptor: number;
  try { descriptor = openSync(lock, "wx", 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; throw new Error("SESSION_REQUEST_IN_PROGRESS: a concurrent request or Stop evaluation is active; inspect an interrupted lock before retrying."); }
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, operation: "session-begin", startedAt: new Date().toISOString() }));
    let state = readSessionState(input.root, input.product, input.sessionId) ?? initializeSessionState(input.root, input);
    let scope = currentRequestScope(state);
    if (options.expectedRequestId !== undefined && scope?.id !== options.expectedRequestId) throw new Error("STALE_REQUEST: the current request differs from --expect-request.");
    if (options.resume && !scope) throw new Error("REQUEST_SCOPE_REQUIRED: no request exists to resume; declare the actual request first.");
    if (options.requestId) {
      const key = `agent-request:${options.requestId}`;
      // Explicit host identity wins. Do not replace a current undeclared host request with an Agent key.
      if (!(scope?.origin === "host" && (scope.mode === null || scope.declarationKey === hashRuntimeIdentifier(key)))) {
        state = recordUserTurn(input.root, { ...input, userTurnId: key }, { userTurnId: key, requestOrigin: "agent" });
        scope = currentRequestScope(state);
      }
    } else if (!options.resume && scope?.origin !== "host") {
      throw new Error("REQUEST_ID_REQUIRED: without a host user-turn identity, use --request-id <stable-current-request-key>; automatic continuation uses --resume.");
    }
    const mode = (options.mode ?? (options.resume ? scope?.mode : null)) as RequestMode | null;
    if (!mode) throw new Error("REQUEST_MODE_REQUIRED: the current request has no declared mode to resume.");
    const taskId = options.taskId ?? scope?.taskId ?? null;
    const requestScope = requestScopeForBinding(state, mode, taskId);
    if (scope?.origin === "host" && options.requestId) requestScope.declarationKey = requestKeyFingerprint(options.requestId);
    // Idempotent declaration leaves timestamps, reports, budgets and task files untouched.
    if (JSON.stringify(requestScope) === JSON.stringify(scope) && state.requestedActivity === mode && (!taskId || (state.taskId === taskId && state.taskUserTurnRevision === state.userTurnRevision))) return state;
    if (taskId) {
      if (mode === "check") {
        state = bindTask(input.root, input.product, input.sessionId, taskId, "diagnose");
        return writeSessionState(input.root, input.product, input.sessionId, { requestScope, requestedActivity: mode });
      }
      state = bindTask(input.root, input.product, input.sessionId, taskId, mode);
      return JSON.stringify(state.requestScope) === JSON.stringify(requestScope) ? state : writeSessionState(input.root, input.product, input.sessionId, { requestScope });
    }
    return writeSessionState(input.root, input.product, input.sessionId, { requestScope, requestedActivity: mode });
  } finally { closeSync(descriptor); unlinkSync(lock); }
}

export function requestKeyFingerprint(key: string): string { return hashRuntimeIdentifier(`agent-request:${key}`); }
