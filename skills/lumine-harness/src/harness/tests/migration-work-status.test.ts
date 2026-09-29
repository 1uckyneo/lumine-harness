import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { convertWorkStatusSession, planWorkStatusMigration } from "../../migration/work-status.ts";
import { getSessionStatePath } from "../core/work-status.ts";

const base = { product: "codex", sessionId: "active/session", userTurnId: "user-7", userTurnRevision: 7, taskId: "implementation", taskUserTurnRevision: 7, requestedActivity: "implement", progressRevision: 12, autonomousChainCount: 8, continuationCount: 6, authorization: { reference: "user-turn-7", scope: "existing work" }, usedSkills: [{ name: "lumine-run", contentHash: "current" }] };
test("six status migration preserves scope, task mode, user turn, progress and consumed budget", () => {
  for (const old of ["done", "continue_autonomously", "needs_user_decision", "needs_credentials", "needs_manual_app_step", "blocked_external"]) {
    const next = convertWorkStatusSession({ ...base, workStatus: old, pendingContinuationRequestId: "possibly-sent", pendingContinuationRevision: 4 });
    for (const key of ["userTurnId", "userTurnRevision", "taskId", "taskUserTurnRevision", "requestedActivity", "progressRevision", "authorization", "usedSkills"] as const) assert.deepEqual(next[key], base[key]);
    assert.equal(next.workStatus, old === "done" ? "done" : old === "continue_autonomously" ? "continue" : "blocked");
    assert.equal(next.autonomousChainCount, 8); assert.equal(next.continuationCount, 8);
    assert.equal(next.pendingContinuationRequestId, null); assert.equal(next.migrationRequiresFreshReport, true);
    assert.deepEqual(convertWorkStatusSession(next), next, "a repeated conversion does not reset new state");
  }
});
test("unknown or malformed status cannot be inferred as complete", () => {
  assert.throws(() => convertWorkStatusSession({ ...base, workStatus: "probably_done" }), /Unknown/);
  assert.throws(() => convertWorkStatusSession({ ...base, statusProtocolVersion: 99 }), /Unsupported/);
});
test("migration planning is read-only, preserves originals and returns hashes for manager CAS", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-status-migrate-"));
  try {
    const file = getSessionStatePath(root, "codex", base.sessionId);
    mkdirSync(path.dirname(file), { recursive: true });
    const original = JSON.stringify({ ...base, workStatus: "needs_credentials" }); writeFileSync(file, original);
    const plan = planWorkStatusMigration(root);
    assert.equal(plan.changes.length, 1); assert.equal(plan.issues.length, 0);
    assert.match(plan.changes[0].beforeHash, /^[a-f0-9]{64}$/); assert.notEqual(plan.changes[0].afterHash, plan.changes[0].beforeHash);
    assert.equal(readFileSync(file, "utf8"), original);
    writeFileSync(file, plan.changes[0].content);
    assert.equal(planWorkStatusMigration(root).changes.length, 0);
    writeFileSync(path.join(path.dirname(file), "broken.json"), "{broken");
    symlinkSync(file, path.join(path.dirname(file), "link.json"));
    assert.deepEqual(planWorkStatusMigration(root).issues.map((issue) => issue.code), ["SESSION_RECOVERY_REQUIRED", "SESSION_PROTECTED"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
