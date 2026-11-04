import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveProjectPath } from "./project-config.ts";
import type {
  HarnessHookInput,
  HarnessProduct,
  HarnessSessionInput,
  SessionState,
  SessionStatePatch,
  SharedSkill,
  UnknownRecord,
  WorkStatus,
  WorkReport,
  RequestMode,
  RequestScope
} from "./contracts.ts";

export const WORK_STATUSES = new Set<WorkStatus>(["done", "continue", "blocked"]);
export const WORK_STATUS_PROTOCOL_VERSION = 2;
// Exact hashes only, never user prompts. Once this bounded history overflows,
// an unknown Stop cannot establish a request; an explicit user event must do so.
export const RETIRED_REQUEST_HISTORY_LIMIT = 128;

type RuntimeSessionInput = HarnessSessionInput & { raw?: UnknownRecord };
type RuntimeHookInput = HarnessHookInput & { raw?: UnknownRecord };

interface EventOptions {
  requestOrigin?: "host" | "agent";
  userTurnId?: string | null;
  eventId?: string | null;
  userInitiated?: boolean;
  progressObservable?: boolean;
  progressObserved?: boolean;
}

export interface WorkStatusOptions {
  emissionId?: string | null;
  reason?: string;
  nextStep?: string;
  source?: "text" | "structured";
}

export interface CurrentSessionPointer {
  product: HarnessProduct;
  sessionId: string;
  updatedAt: string;
}

/** Only the terminal standalone protocol line controls the turn. Markdown examples do not. */
function terminalStatusLines(message: unknown): string[] {
  const text = String(message ?? "").replace(/\s*<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>\s*$/, "");
  const lines = text.split(/\r?\n/);
  const eligible: boolean[] = [];
  let fence: { char: string; size: number } | null = null;
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      eligible.push(false);
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.size && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = null;
    } else if (marker) {
      fence = { char: marker[1][0], size: marker[1].length };
      eligible.push(false);
    } else eligible.push(!/^(?: {4}|\t| {0,3}>)/.test(line));
  }
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  if (last < 0 || !eligible[last] || !/^ {0,3}WORK_STATUS:/i.test(lines[last])) return [];
  const result = [lines[last]];
  for (let index = last - 1; index >= 0; index--) {
    if (!lines[index].trim()) continue;
    if (!eligible[index] || !/^ {0,3}WORK_STATUS:/i.test(lines[index])) break;
    result.unshift(lines[index]);
  }
  return result;
}

export function countWorkStatus(message: unknown = ""): number {
  return terminalStatusLines(message).length;
}

export function parseWorkReport(message: unknown = ""): WorkReport | null {
  const lines = terminalStatusLines(message);
  if (lines.length !== 1) return null;
  const match = lines[0].match(/^ {0,3}WORK_STATUS:[ \t]*([a-z_]+)(?:[ \t]*\|[ \t]*(.+))?[ \t]*$/i);
  if (!match || !WORK_STATUSES.has(match[1].toLowerCase() as WorkStatus)) return null;
  const status = match[1].toLowerCase() as WorkStatus;
  return { protocolVersion: 2, status, ...(match[2]?.trim() ? { reason: match[2].trim() } : {}) };
}

export function validateWorkReport(value: unknown): WorkReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A structured work report is required.");
  const report = value as WorkReport;
  if (report.protocolVersion !== 2 || !WORK_STATUSES.has(report.status)) throw new Error("Unsupported work report protocol or status; use protocolVersion 2 and done, continue or blocked.");
  for (const key of ["reason", "nextStep"] as const) {
    if (report[key] !== undefined && (typeof report[key] !== "string" || !report[key]?.trim())) throw new Error(`${key} must be non-empty text.`);
  }

  return { protocolVersion: 2, status: report.status, ...(report.reason ? { reason: report.reason.trim() } : report.status === "blocked" ? { reason: "unknown" } : {}), ...(report.nextStep ? { nextStep: report.nextStep.trim() } : {}) };
}

export function extractWorkStatus(message: unknown = ""): WorkStatus | null {
  return parseWorkReport(message)?.status ?? null;
}

function requireIdentity(product: HarnessProduct, sessionId: string | null | undefined): asserts sessionId is string {
  if (!product || !sessionId || sessionId === "unknown") throw new Error("Harness session identity requires explicit product and sessionId.");
}

function safe(value: unknown): string {
  return String(value).replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 120);
}

export function hashRuntimeIdentifier(value: unknown): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

function eventIdentity(input: RuntimeSessionInput, explicit: unknown, kind: string): string | null {
  if (explicit) return hashRuntimeIdentifier(explicit);
  const raw = input?.raw ?? {};
  const hostId = raw.hook_run_id ?? raw.hookRunId ?? raw.event_id ?? raw.eventId ?? raw.request_id ?? raw.requestId ?? raw.response_id ?? raw.responseId ?? raw.message_id ?? raw.messageId ?? raw.generation_id ?? raw.generationId;
  if (hostId) return hashRuntimeIdentifier(`${kind}:${hostId}`);
  return null;
}

export function explicitStatusEmissionId(input: RuntimeSessionInput): string | null {
  // A Hook invocation ID identifies the transport attempt, not the assistant
  // response. Hosts may allocate a fresh Hook ID when retrying the same Stop.
  // Only response/message/generation IDs are stable enough to identify a
  // status emission; otherwise use the user/host turn revisions below.
  const raw = input?.raw ?? {};
  const responseId = input.statusEmissionId
    ?? raw.assistant_message_id
    ?? raw.assistantMessageId
    ?? raw.response_id
    ?? raw.responseId
    ?? raw.message_id
    ?? raw.messageId
    ?? raw.generation_id
    ?? raw.generationId;
  return responseId ? hashRuntimeIdentifier(`status:${responseId}`) : null;
}

export function deriveStatusEmissionId(input: RuntimeSessionInput, state: Partial<SessionState> = {}): string | null {
  const explicit = explicitStatusEmissionId(input);
  if (explicit) return explicit;
  if (!input.lastAssistantMessage) return null;
  return hashRuntimeIdentifier([
    "status",
    input.product,
    input.sessionId,
    Number(state.userTurnRevision ?? 0),
    Number(state.hostTurnRevision ?? 0),
    input.lastAssistantMessage
  ].join("\0"));
}

export function getSessionStatePath(root: string, product: HarnessProduct, sessionId: string | null): string {
  requireIdentity(product, sessionId);
  return resolveProjectPath(root, `.lumine/local/runtime/sessions/${safe(product)}--${safe(sessionId)}--${hashRuntimeIdentifier(sessionId)}.json`, "session state");
}

export function getCurrentSessionPointerPath(root: string, product: HarnessProduct): string {
  if (!product) throw new Error("Harness product is required.");
  return resolveProjectPath(root, `.lumine/local/runtime/current/${safe(product)}.json`, "session pointer");
}

export function writeCurrentSessionPointer(root: string, product: HarnessProduct, sessionId: string | null): void {
  requireIdentity(product, sessionId);
  const file = getCurrentSessionPointerPath(root, product);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ product, sessionId, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

export function readCurrentSessionPointer(root: string, product: HarnessProduct): CurrentSessionPointer | null {
  const file = getCurrentSessionPointerPath(root, product);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")) as CurrentSessionPointer; } catch { return null; }
}

export function listCurrentSessionPointers(root: string): CurrentSessionPointer[] {
  const dir = resolveProjectPath(root, ".lumine/local/runtime/current", "session pointers");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      try { return JSON.parse(readFileSync(path.join(dir, entry.name), "utf8")) as CurrentSessionPointer; } catch { return null; }
    }).filter((item): item is CurrentSessionPointer => Boolean(item?.product && item?.sessionId));
}

export function readSessionState(root: string, product: HarnessProduct, sessionId: string | null): SessionState | null {
  const file = getSessionStatePath(root, product, sessionId);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")) as SessionState; } catch { return null; }
}

export function writeSessionState(root: string, product: HarnessProduct, sessionId: string | null, patch: SessionStatePatch = {}): SessionState {
  requireIdentity(product, sessionId);
  const file = getSessionStatePath(root, product, sessionId);
  mkdirSync(path.dirname(file), { recursive: true });
  const current = readSessionState(root, product, sessionId);
  if (existsSync(file) && !current) throw new Error("SESSION_RECOVERY_REQUIRED: preserve the unreadable session file and recover it before writing.");
  if (current && current.statusProtocolVersion !== 2) throw new Error("STATUS_PROTOCOL_MIGRATION_REQUIRED: use the independent maintenance migration before resuming this session.");
  const next: SessionState = { ...current, ...patch, statusProtocolVersion: 2, product, sessionId, updatedAt: new Date().toISOString() };
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temp, file);
  return next;
}

export function initializeSessionState(root: string, input: HarnessSessionInput): SessionState {
  requireIdentity(input.product, input.sessionId);
  const now = new Date().toISOString();
  writeCurrentSessionPointer(root, input.product, input.sessionId);
  const current = readSessionState(root, input.product, input.sessionId);
  if (current) {
    return writeSessionState(root, input.product, input.sessionId, {
      cwd: input.cwd,
      resumedAt: now,
      sessionMode: input.sessionMode ?? current.sessionMode ?? null
    });
  }
  return writeSessionState(root, input.product, input.sessionId, {
    cwd: input.cwd,
    startedAt: now,
    userTurnId: null,
    userTurnRevision: 0,
    hostTurnRevision: 0,
    workStatus: null,
    workReport: null,
    workReportSource: null,
    workReportHostTurnRevision: 0,
    lastStopEmissionId: null,
    lastStopInputHash: null,
    lastStopDecision: null,
    repeatedFailureFingerprint: null,
    repeatedFailureCount: 0,
    workStatusEmissionId: null,
    workStatusUserTurnRevision: 0,
    workStatusUpdatedAt: null,
    lastEvaluatedContinuationRevision: null,
    lastContinuationDisposition: null,
    lastContinuationMessage: null,
    autonomousChainCount: 0,
    continuationCount: 0,
    continuationConsumedRevision: null,
    pendingContinuationRequestId: null,
    pendingContinuationRevision: null,
    continuationRequestedAt: null,
    continuationDeliveredAt: null,
    progressObservable: false,
    progressRevision: 0,
    lastProgressEventId: null,
    lastContinuationProgressRevision: null,
    noProgressCount: 0,
    workStatusRevision: 0,
    expectedSkill: null,
    expectedSkillRead: false,
    expectedSkills: [],
    usedSkills: []
  });
}

/** Reject before consuming an old event's report, progress or continuation receipt. */
export function requestEventIssue(state: Partial<SessionState>, input: RuntimeSessionInput, options: { requireCurrent?: boolean; implicitStop?: boolean; report?: boolean } = {}): string | null {
  const emissionId = options.report ? explicitStatusEmissionId(input) : null;
  if (emissionId && state.retiredStopEmissionIds?.includes(emissionId)) return "STALE_RESPONSE_EVENT: this response belongs to a retired request; the current request and report were preserved.";
  if (emissionId && state.handledStopEmissionIds?.includes(emissionId) && state.lastStopEmissionId !== emissionId) return "STALE_RESPONSE_EVENT: a newer response in this request was already evaluated; the current report and continuation were preserved.";
  if (!input.userTurnId) return null;
  const turnId = hashRuntimeIdentifier(input.userTurnId);
  if (state.userTurnId === turnId) return null;
  if (state.retiredUserTurnIds?.includes(turnId)) return "STALE_REQUEST_EVENT: this event belongs to a retired request; the current request and report were preserved.";
  if (options.implicitStop && state.userTurnHistoryTruncated) return "REQUEST_HISTORY_BOUNDARY: this Stop identity is outside the retained request history; preserve the current request and establish the actual new request through an explicit user event or a new host session.";
  if (options.requireCurrent && state.userTurnId) return "REQUEST_SCOPE_MISMATCH: an event for another request cannot write the current request's report, progress or continuation state.";
  return null;
}

export function recordUserTurn(root: string, input: RuntimeSessionInput, options: EventOptions = {}): SessionState {
  requireIdentity(input.product, input.sessionId);
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const turnId = eventIdentity(input, options.userTurnId ?? input.userTurnId ?? input.eventId, "user-turn") ?? hashRuntimeIdentifier(`user-turn:${randomUUID()}`);
  if (state.userTurnId === turnId) return state;
  if (state.retiredUserTurnIds?.includes(turnId)) throw new Error("STALE_REQUEST_EVENT: a retired request identity cannot reopen or replace the current request.");
  const retired = [...(state.retiredUserTurnIds ?? []), ...(state.userTurnId ? [state.userTurnId] : [])];
  return writeSessionState(root, input.product, input.sessionId, {
    userTurnId: turnId,
    retiredUserTurnIds: retired.slice(-RETIRED_REQUEST_HISTORY_LIMIT),
    userTurnHistoryTruncated: Boolean(state.userTurnHistoryTruncated || retired.length > RETIRED_REQUEST_HISTORY_LIMIT),
    retiredStopEmissionIds: [...new Set([...(state.retiredStopEmissionIds ?? []), ...(state.handledStopEmissionIds ?? []), ...(state.lastStopEmissionId ? [state.lastStopEmissionId] : [])])].slice(-RETIRED_REQUEST_HISTORY_LIMIT),
    handledStopEmissionIds: [],
    requestScope: { schemaVersion: 1, id: turnId, origin: options.requestOrigin ?? "host", userTurnRevision: Number(state.userTurnRevision ?? 0) + 1, startedAt: new Date().toISOString(), mode: null, taskId: null },
    requestedActivity: null,
    expectedPhase: null,
    expectedSkill: null,
    expectedSkillPath: null,
    expectedSkillRead: true,
    expectedSkills: [],
    selectedSkills: [],
    skillCandidates: [],
    skillSelectionDiagnostics: [],
    userTurnRevision: Number(state.userTurnRevision ?? 0) + 1,
    hostTurnRevision: 0,
    workStatus: null,
    workReport: null,
    workReportSource: null,
    workReportHostTurnRevision: 0,
    lastStopEmissionId: null,
    lastStopInputHash: null,
    lastStopDecision: null,
    repeatedFailureFingerprint: null,
    repeatedFailureCount: 0,
    workStatusEmissionId: null,
    workStatusUpdatedAt: null,
    autonomousChainCount: 0,
    continuationCount: 0,
    continuationConsumedRevision: null,
    pendingContinuationRequestId: null,
    pendingContinuationRevision: null,
    continuationRequestedAt: null,
    continuationDeliveredAt: state.continuationDeliveredAt ?? null,
    pendingContinuationUserTurnRevision: null,
    continuationDeliveryConfirmed: false,
    lastEvaluatedContinuationRevision: null,
    lastContinuationDisposition: null,
    lastContinuationMessage: null,
    lastContinuationRequestRevision: null,
    lastContinuationRequestId: null,
    lastContinuationProgressRevision: Number(state.progressRevision ?? 0),
    noProgressCount: 0
  });
}

export function currentRequestScope(state: Partial<SessionState>): RequestScope | null {
  const scope = state.requestScope;
  return scope?.schemaVersion === 1 && typeof scope.id === "string" && scope.id.length > 0 && ["host", "agent"].includes(scope.origin) && (scope.mode === null || ["plan", "implement", "verify", "diagnose", "check"].includes(scope.mode)) && scope.userTurnRevision === Number(state.userTurnRevision ?? 0) ? scope : null;
}

/** Explicit task binding is also a declaration of this request, never an inferred mode. */
export function requestScopeForBinding(state: Partial<SessionState>, mode: RequestMode, taskId: string | null): RequestScope {
  const current = currentRequestScope(state);
  if (current?.mode === "implement" && mode !== "implement") throw new Error("REQUEST_MODE_CONFLICT: an implementation request cannot become a diagnosis to bypass validation; declare a distinct actual user request with session begin.");
  if (current?.taskId && taskId && current.taskId !== taskId) throw new Error("REQUEST_TASK_CONFLICT: this request is already associated with another task; declare the actual new request first.");
  return { ...(current ?? { schemaVersion: 1, id: hashRuntimeIdentifier(`task-request:${randomUUID()}`), origin: "agent", userTurnRevision: Number(state.userTurnRevision ?? 0), startedAt: new Date().toISOString() }), mode, taskId };
}

export function markContinuationDelivered(root: string, input: RuntimeHookInput, options: EventOptions = {}): SessionState | null {
  const state = readSessionState(root, input.product, input.sessionId);
  if (!state?.pendingContinuationRequestId || input.event === "stop" || input.userInitiated === true || options.userInitiated === true) return state;
  // Non-report events may carry a previous response ID as context. The actual
  // user-turn identity and continuation receipt determine their attribution.
  const issue = requestEventIssue(state, input, { requireCurrent: true });
  if (issue) throw new Error(issue);
  const sameTurn = state.pendingContinuationUserTurnRevision === Number(state.userTurnRevision ?? 0);
  const confirmed = sameTurn && input.continuationRequestId === state.pendingContinuationRequestId;
  // Ordinary events can advance local deduplication, but only a matching receipt proves delivery.
  if (!sameTurn || (input.continuationRequestId && !confirmed)) return state;
  const deliveryEventId = eventIdentity(input, options.eventId ?? input.eventId, "delivery");
  if (deliveryEventId && state.lastContinuationDeliveryEventId === deliveryEventId) return state;
  return writeSessionState(root, input.product, input.sessionId, {
    hostTurnRevision: Number(state.hostTurnRevision ?? 0) + 1,
    lastContinuationRequestId: state.pendingContinuationRequestId,
    pendingContinuationRequestId: null,
    pendingContinuationRevision: null,
    continuationDeliveredAt: confirmed ? new Date().toISOString() : null,
    continuationDeliveryConfirmed: confirmed,
    continuationDeliveryUserTurnRevision: confirmed ? Number(state.userTurnRevision ?? 0) : null,
    lastContinuationDeliveryEventId: deliveryEventId
  });
}

export function recordProgressObservation(root: string, input: RuntimeSessionInput, options: EventOptions = {}): SessionState {
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const progressEventId = eventIdentity(input, options.eventId ?? input.eventId, "progress") ?? hashRuntimeIdentifier(`progress:${randomUUID()}`);
  if (state.lastProgressEventId === progressEventId) return state;
  return writeSessionState(root, input.product, input.sessionId, {
    progressObservable: true,
    progressRevision: Number(state.progressRevision ?? 0) + 1,
    lastProgressEventId: progressEventId,
    lastProgressAt: new Date().toISOString()
  });
}

export function setProgressObservability(root: string, input: RuntimeSessionInput, observable: boolean = true): SessionState {
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  if (Boolean(state.progressObservable) === Boolean(observable)) return state;
  return writeSessionState(root, input.product, input.sessionId, { progressObservable: Boolean(observable) });
}

export function observeHarnessEvent(root: string, input: RuntimeHookInput, options: EventOptions = {}): SessionState {
  let state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const explicitUserInitiated = options.userInitiated ?? input.userInitiated;
  const userInitiated = explicitUserInitiated ?? (
    input.event === "prompt_submit" && !state.pendingContinuationRequestId
  );
  const carriesReport = !userInitiated && input.event === "assistant_response" && Boolean(input.workReport || input.lastAssistantMessage?.trim());
  const issue = requestEventIssue(state, { ...input, userTurnId: options.userTurnId ?? input.userTurnId }, { requireCurrent: !userInitiated, report: carriesReport });
  if (issue) throw new Error(issue);
  if (input.event !== "stop") state = markContinuationDelivered(root, input, options) ?? state;
  if (userInitiated) state = recordUserTurn(root, input, options);
  if (options.progressObservable ?? input.progressObservable) state = setProgressObservability(root, input, true);
  if (options.progressObserved ?? input.progressObserved) state = recordProgressObservation(root, input, options);
  return state;
}

export function recordWorkStatus(root: string, input: RuntimeSessionInput, status: WorkStatus, options: WorkStatusOptions = {}): SessionState {
  return recordWorkReport(root, input, { protocolVersion: 2, status, ...(options.reason ? { reason: options.reason } : {}), ...(options.nextStep ? { nextStep: options.nextStep } : {}) }, options);
}

export function recordWorkReport(root: string, input: RuntimeSessionInput, value: WorkReport, options: WorkStatusOptions = {}): SessionState {
  const report = validateWorkReport(value);
  requireIdentity(input.product, input.sessionId);
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const issue = requestEventIssue(state, input, { requireCurrent: true, report: true });
  if (issue) throw new Error(issue);
  const candidateEmissionId = options.emissionId ?? deriveStatusEmissionId(input, state) ?? hashRuntimeIdentifier(`status:${randomUUID()}`);
  const emissionId = /^[a-f0-9]{64}$/i.test(String(candidateEmissionId)) ? String(candidateEmissionId).toLowerCase() : hashRuntimeIdentifier(`status:${candidateEmissionId}`);
  if (state.workStatusEmissionId === emissionId) {
    if (JSON.stringify(state.workReport) !== JSON.stringify(report)) throw new Error("One WORK_STATUS emission cannot declare conflicting reports.");
    return state;
  }
  return writeSessionState(root, input.product, input.sessionId, {
    cwd: input.cwd, workStatus: report.status, workReport: report,
    workReportSource: options.source ?? "structured",
    workReportHostTurnRevision: Number(state.hostTurnRevision ?? 0),
    workStatusEmissionId: emissionId,
    workStatusRevision: Number(state.workStatusRevision ?? 0) + 1,
    workStatusUserTurnRevision: Number(state.userTurnRevision ?? 0),
    workStatusUpdatedAt: new Date().toISOString(), migrationRequiresFreshReport: false
  });
}

/** Adapter event coverage, not a claim that a real host emitted a read event. */
export function skillReadObservability(product: HarnessProduct): "tool_events" | "not_observable" {
  return ["qoder", "zcode", "codebuddy", "deepseek-harness"].includes(product) ? "tool_events" : "not_observable";
}

export function recordUsedSkill(root: string, input: RuntimeSessionInput, skill: SharedSkill): SessionState {
  const state: Partial<SessionState> = readSessionState(root, input.product, input.sessionId) ?? {};
  const usedSkills = Array.isArray(state.usedSkills) ? state.usedSkills : [];
  const next = usedSkills.some((item) => item.name === skill.name && item.source === skill.relativeSource && item.contentHash === skill.hash)
    ? usedSkills
    : [...usedSkills.filter((item) => item.name !== skill.name), { name: skill.name, source: skill.relativeSource, readAt: new Date().toISOString(), contentHash: skill.hash }];
  return writeSessionState(root, input.product, input.sessionId, { usedSkills: next });
}

export function readFreshStateReport(state: Partial<SessionState> | null | undefined): WorkReport | null {
  if (!state || state.statusProtocolVersion !== 2 || state.migrationRequiresFreshReport) return null;
  if (!state.startedAt || !state.workStatusUpdatedAt) return null;
  if (Number(state.workStatusUserTurnRevision ?? -1) !== Number(state.userTurnRevision ?? 0)) return null;
  if (Number(state.workReportHostTurnRevision ?? -1) !== Number(state.hostTurnRevision ?? 0)) return null;
  if (Date.parse(state.workStatusUpdatedAt) < Date.parse(state.startedAt)) return null;
  try { return validateWorkReport(state.workReport); } catch { return null; }
}

export function readFreshStateStatus(state: Partial<SessionState> | null | undefined): WorkStatus | null {
  return readFreshStateReport(state)?.status ?? null;
}
