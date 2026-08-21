import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

function safe(value) {
  return String(value || "unknown").replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 120) || "unknown";
}

export function getSessionStatePath(root, product, sessionId) {
  return path.join(root, ".harness", "runtime", "sessions", `${safe(product)}--${safe(sessionId)}.json`);
}

export function getCurrentSessionPointerPath(root, product) {
  return path.join(root, ".harness", "runtime", "current", `${safe(product)}.json`);
}

export function writeCurrentSessionPointer(root, product, sessionId) {
  const file = getCurrentSessionPointerPath(root, product);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ product, sessionId, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

export function readCurrentSessionPointer(root, product) {
  const file = getCurrentSessionPointerPath(root, product);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function readSessionState(root, product, sessionId) {
  const file = getSessionStatePath(root, product, sessionId);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function writeSessionState(root, product, sessionId, patch = {}) {
  const file = getSessionStatePath(root, product, sessionId);
  mkdirSync(path.dirname(file), { recursive: true });
  const next = { ...(readSessionState(root, product, sessionId) ?? {}), ...patch, product, sessionId, updatedAt: new Date().toISOString() };
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temp, file);
  return next;
}

export function initializeSessionState(root, input) {
  const now = new Date().toISOString();
  writeCurrentSessionPointer(root, input.product, input.sessionId);
  return writeSessionState(root, input.product, input.sessionId, {
    cwd: input.cwd,
    startedAt: now,
    workStatus: null,
    workStatusUpdatedAt: null,
    continuationCount: 0,
    expectedSkill: null,
    expectedSkillRead: false
  });
}

export function recordWorkStatus(root, input, status) {
  if (!WORK_STATUSES.has(status)) throw new Error(`Invalid WORK_STATUS: ${status}`);
  return writeSessionState(root, input.product, input.sessionId, { cwd: input.cwd, workStatus: status, workStatusUpdatedAt: new Date().toISOString() });
}

export function readFreshStateStatus(state) {
  if (!state?.workStatus || !WORK_STATUSES.has(state.workStatus)) return null;
  if (!state.startedAt || !state.workStatusUpdatedAt) return null;
  return Date.parse(state.workStatusUpdatedAt) >= Date.parse(state.startedAt) ? state.workStatus : null;
}
