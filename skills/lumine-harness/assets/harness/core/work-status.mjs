import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const WORK_STATUSES = new Set(["done", "continue_autonomously", "needs_user_decision", "needs_credentials", "needs_manual_app_step", "blocked_external"]);

export function countWorkStatus(message = "") {
  return [...String(message).matchAll(/WORK_STATUS:\s*([a-z_]+)/gi)].length;
}

export function extractWorkStatus(message = "") {
  const matches = [...String(message).matchAll(/WORK_STATUS:\s*([a-z_]+)/gi)];
  if (matches.length !== 1) return null;
  const status = matches[0][1].toLowerCase();
  return WORK_STATUSES.has(status) ? status : null;
}

function requireIdentity(product, sessionId) {
  if (!product || !sessionId || sessionId === "unknown") throw new Error("Harness session identity requires explicit product and sessionId.");
}

function safe(value) {
  return String(value).replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 120);
}

export function hashRuntimeIdentifier(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function eventIdentity(input, explicit, kind) {
  if (explicit) return hashRuntimeIdentifier(explicit);
  const raw = input?.raw ?? {};
  const hostId = raw.hook_run_id ?? raw.hookRunId ?? raw.event_id ?? raw.eventId ?? raw.request_id ?? raw.requestId ?? raw.response_id ?? raw.responseId ?? raw.message_id ?? raw.messageId ?? raw.generation_id ?? raw.generationId;
  if (hostId) return hashRuntimeIdentifier(`${kind}:${hostId}`);
  return null;
}

export function deriveStatusEmissionId(input, state = {}) {
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
  const explicit = responseId ? hashRuntimeIdentifier(`status:${responseId}`) : null;
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

export function getSessionStatePath(root, product, sessionId) {
  requireIdentity(product, sessionId);
  return path.join(root, ".harness", "runtime", "sessions", `${safe(product)}--${safe(sessionId)}.json`);
}

export function getCurrentSessionPointerPath(root, product) {
  if (!product) throw new Error("Harness product is required.");
  return path.join(root, ".harness", "runtime", "current", `${safe(product)}.json`);
}

export function writeCurrentSessionPointer(root, product, sessionId) {
  requireIdentity(product, sessionId);
  const file = getCurrentSessionPointerPath(root, product);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ product, sessionId, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

export function readCurrentSessionPointer(root, product) {
  const file = getCurrentSessionPointerPath(root, product);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function listCurrentSessionPointers(root) {
  const dir = path.join(root, ".harness", "runtime", "current");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      try { return JSON.parse(readFileSync(path.join(dir, entry.name), "utf8")); } catch { return null; }
    }).filter((item) => item?.product && item?.sessionId);
}

export function readSessionState(root, product, sessionId) {
  const file = getSessionStatePath(root, product, sessionId);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function writeSessionState(root, product, sessionId, patch = {}) {
  requireIdentity(product, sessionId);
  const file = getSessionStatePath(root, product, sessionId);
  mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...(readSessionState(root, product, sessionId) ?? {}), ...patch, product, sessionId, updatedAt: new Date().toISOString() };
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temp, file);
  return next;
}

export function initializeSessionState(root, input) {
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

export function recordUserTurn(root, input, options = {}) {
  requireIdentity(input.product, input.sessionId);
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const turnId = eventIdentity(input, options.userTurnId ?? input.userTurnId ?? input.eventId, "user-turn") ?? hashRuntimeIdentifier(`user-turn:${randomUUID()}`);
  if (state.userTurnId === turnId) return state;
  return writeSessionState(root, input.product, input.sessionId, {
    userTurnId: turnId,
    userTurnRevision: Number(state.userTurnRevision ?? 0) + 1,
    hostTurnRevision: 0,
    workStatus: null,
    workStatusEmissionId: null,
    workStatusUpdatedAt: null,
    autonomousChainCount: 0,
    continuationCount: 0,
    continuationConsumedRevision: null,
    pendingContinuationRequestId: null,
    pendingContinuationRevision: null,
    continuationRequestedAt: null,
    continuationDeliveredAt: state.pendingContinuationRequestId ? new Date().toISOString() : state.continuationDeliveredAt ?? null,
    lastEvaluatedContinuationRevision: null,
    lastContinuationDisposition: null,
    lastContinuationMessage: null,
    lastContinuationRequestRevision: null,
    lastContinuationRequestId: null,
    lastContinuationProgressRevision: Number(state.progressRevision ?? 0),
    noProgressCount: 0
  });
}

export function markContinuationDelivered(root, input, options = {}) {
  const state = readSessionState(root, input.product, input.sessionId);
  if (!state?.pendingContinuationRequestId || input.event === "stop") return state;
  const deliveryEventId = eventIdentity(input, options.eventId ?? input.eventId, "delivery");
  if (deliveryEventId && state.lastContinuationDeliveryEventId === deliveryEventId) return state;
  return writeSessionState(root, input.product, input.sessionId, {
    hostTurnRevision: Number(state.hostTurnRevision ?? 0) + 1,
    lastContinuationRequestId: state.pendingContinuationRequestId,
    pendingContinuationRequestId: null,
    pendingContinuationRevision: null,
    continuationDeliveredAt: new Date().toISOString(),
    lastContinuationDeliveryEventId: deliveryEventId
  });
}

export function recordProgressObservation(root, input, options = {}) {
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

export function setProgressObservability(root, input, observable = true) {
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  if (Boolean(state.progressObservable) === Boolean(observable)) return state;
  return writeSessionState(root, input.product, input.sessionId, { progressObservable: Boolean(observable) });
}

export function observeHarnessEvent(root, input, options = {}) {
  let state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const explicitUserInitiated = options.userInitiated ?? input.userInitiated;
  const userInitiated = explicitUserInitiated ?? (
    input.event === "prompt_submit" && !state.pendingContinuationRequestId
  );
  if (input.event !== "stop") state = markContinuationDelivered(root, input, options) ?? state;
  if (userInitiated) state = recordUserTurn(root, input, options);
  if (options.progressObservable ?? input.progressObservable) state = setProgressObservability(root, input, true);
  if (options.progressObserved ?? input.progressObserved) state = recordProgressObservation(root, input, options);
  return state;
}

export function recordWorkStatus(root, input, status, options = {}) {
  if (!WORK_STATUSES.has(status)) throw new Error(`Invalid WORK_STATUS: ${status}`);
  requireIdentity(input.product, input.sessionId);
  const state = readSessionState(root, input.product, input.sessionId) ?? initializeSessionState(root, input);
  const candidateEmissionId = options.emissionId ?? deriveStatusEmissionId(input, state) ?? hashRuntimeIdentifier(`status:${randomUUID()}`);
  const emissionId = /^[a-f0-9]{64}$/i.test(String(candidateEmissionId))
    ? String(candidateEmissionId).toLowerCase()
    : hashRuntimeIdentifier(`status:${candidateEmissionId}`);
  if (state.workStatusEmissionId === emissionId) {
    if (state.workStatus !== status) throw new Error("One WORK_STATUS emission cannot declare multiple states.");
    return state;
  }
  return writeSessionState(root, input.product, input.sessionId, {
    cwd: input.cwd,
    workStatus: status,
    workStatusEmissionId: emissionId,
    workStatusRevision: Number(state.workStatusRevision ?? 0) + 1,
    workStatusUserTurnRevision: Number(state.userTurnRevision ?? 0),
    workStatusUpdatedAt: new Date().toISOString()
  });
}

export function recordUsedSkill(root, input, skill) {
  const state = readSessionState(root, input.product, input.sessionId) ?? {};
  const usedSkills = Array.isArray(state.usedSkills) ? state.usedSkills : [];
  const next = usedSkills.some((item) => item.name === skill.name && item.source === skill.relativeSource)
    ? usedSkills
    : [...usedSkills, { name: skill.name, source: skill.relativeSource, readAt: new Date().toISOString() }];
  return writeSessionState(root, input.product, input.sessionId, { usedSkills: next });
}

export function readFreshStateStatus(state) {
  if (!state?.workStatus || !WORK_STATUSES.has(state.workStatus)) return null;
  if (!state.startedAt || !state.workStatusUpdatedAt) return null;
  if (state.workStatusUserTurnRevision !== undefined && Number(state.workStatusUserTurnRevision) !== Number(state.userTurnRevision ?? 0)) return null;
  return Date.parse(state.workStatusUpdatedAt) >= Date.parse(state.startedAt) ? state.workStatus : null;
}
