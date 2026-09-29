/** Maintenance-only protocol conversion. This module is not imported by the daily Runtime. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getSessionStatePath } from "../harness/core/work-status.ts";
import type { HarnessProduct } from "../harness/core/contracts.ts";

const products = new Set<HarnessProduct>(["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"]);
const statusMap: Record<string, { status: "done" | "continue" | "blocked"; reason?: string }> = {
  done: { status: "done" }, continue_autonomously: { status: "continue" },
  needs_user_decision: { status: "blocked", reason: "A user decision is required; preserve the existing decision context." },
  needs_credentials: { status: "blocked", reason: "Authenticated access is required; do not copy credentials into the report." },
  needs_manual_app_step: { status: "blocked", reason: "A manual application step is required; preserve the existing instructions." },
  blocked_external: { status: "blocked", reason: "An external dependency is unavailable; preserve its recovery conditions." }
};
const hash = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
export interface WorkStatusMigrationChange { path: string; beforeHash: string; afterHash: string; content: string; }
export interface WorkStatusMigrationIssue { path: string; code: string; message: string; }
export interface WorkStatusMigrationPlan { changes: WorkStatusMigrationChange[]; issues: WorkStatusMigrationIssue[]; }

export function convertWorkStatusSession(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid session object; preserve it for recovery.");
  const current = value as Record<string, any>;
  if (!products.has(current.product) || typeof current.sessionId !== "string" || !current.sessionId || current.sessionId === "unknown") throw new Error("Session identity is missing or unsupported.");
  if (current.statusProtocolVersion === 2) return current;
  if (current.statusProtocolVersion !== undefined && current.statusProtocolVersion !== 1) throw new Error("Unsupported status protocol version; preserve it for recovery.");
  const old = current.workStatus;
  if (old !== undefined && old !== null && !Object.hasOwn(statusMap, old)) throw new Error("Unknown work status; preserve the original instead of inferring completion.");
  const converted = old ? statusMap[old] : null;
  const reason = typeof current.workReport?.reason === "string" && current.workReport.reason.trim() ? current.workReport.reason : converted?.reason;
  const nextStep = typeof current.workReport?.nextStep === "string" && current.workReport.nextStep.trim() ? current.workReport.nextStep : undefined;
  const budget = Math.max(Number.isFinite(current.autonomousChainCount) ? current.autonomousChainCount : 0, Number.isFinite(current.continuationCount) ? current.continuationCount : 0, 0);
  return {
    ...current,
    statusProtocolVersion: 2,
    workStatus: converted?.status ?? null,
    workReport: converted ? { protocolVersion: 2, status: converted.status, ...(reason ? { reason } : {}), ...(nextStep ? { nextStep } : {}) } : null,
    workReportSource: null, workReportHostTurnRevision: Number(current.hostTurnRevision ?? 0),
    migrationRequiresFreshReport: true,
    autonomousChainCount: budget, continuationCount: budget,
    lastStopEmissionId: null, lastStopInputHash: null, lastStopDecision: null, consumedWorkReportEmissionId: null,
    pendingContinuationRequestId: null, pendingContinuationRevision: null, pendingContinuationUserTurnRevision: null,
    continuationRequestedAt: null, continuationDeliveredAt: null, continuationDeliveryConfirmed: false,
    lastAssistantMessage: null,
    statusMigration: {
      fromProtocolVersion: current.statusProtocolVersion ?? 1,
      previousStatus: old ?? null,
      pendingRequest: current.pendingContinuationRequestId ? {
        requestId: current.pendingContinuationRequestId,
        revision: current.pendingContinuationRevision ?? null,
        requestedAt: current.continuationRequestedAt ?? null,
        disposition: "delivery_unknown_do_not_replay"
      } : null
    }
  };
}

/** Produces ordinary CAS/backup operations for the manager; never writes or overwrites a session. */
export function planWorkStatusMigration(root: string): WorkStatusMigrationPlan {
  root = path.resolve(root);
  const result: WorkStatusMigrationPlan = { changes: [], issues: [] };
  const directory = path.join(root, ".lumine", "local", "runtime", "sessions");
  if (!existsSync(directory)) return result;
  for (let current = directory; current !== path.resolve(root); current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("Session migration refuses symlinked runtime paths.");
  }
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name), relative = path.relative(root, file).split(path.sep).join("/");
    if (entry.isSymbolicLink() || !entry.isFile()) { result.issues.push({ path: relative, code: "SESSION_PROTECTED", message: "Preserve unexpected runtime content for review." }); continue; }
    if (!entry.name.endsWith(".json")) continue;
    try {
      const bytes = readFileSync(file), text = bytes.toString("utf8");
      if (!Buffer.from(text).equals(bytes)) throw new Error("Session is not lossless UTF-8.");
      const original = JSON.parse(text);
      if (original.statusProtocolVersion === 2) continue;
      const converted = convertWorkStatusSession(original);
      const expected = getSessionStatePath(root, original.product, original.sessionId);
      if (path.resolve(expected) !== path.resolve(file)) throw new Error("Session filename and identity disagree; preserve it for recovery.");
      const content = JSON.stringify(converted, null, 2) + "\n";
      result.changes.push({ path: relative, beforeHash: hash(bytes), afterHash: hash(content), content });
    } catch (error) { result.issues.push({ path: relative, code: "SESSION_RECOVERY_REQUIRED", message: error instanceof Error ? error.message : String(error) }); }
  }
  return result;
}
