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
    workStatus: null,
    workStatusUpdatedAt: null,
    continuationCount: 0,
    continuationConsumedRevision: null,
    workStatusRevision: 0,
    expectedSkill: null,
    expectedSkillRead: false,
    expectedSkills: [],
    usedSkills: []
  });
}

export function recordWorkStatus(root, input, status) {
  if (!WORK_STATUSES.has(status)) throw new Error(`Invalid WORK_STATUS: ${status}`);
  requireIdentity(input.product, input.sessionId);
  const state = readSessionState(root, input.product, input.sessionId) ?? {};
  return writeSessionState(root, input.product, input.sessionId, {
    cwd: input.cwd,
    workStatus: status,
    workStatusRevision: Number(state.workStatusRevision ?? 0) + 1,
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
  return Date.parse(state.workStatusUpdatedAt) >= Date.parse(state.startedAt) ? state.workStatus : null;
}
