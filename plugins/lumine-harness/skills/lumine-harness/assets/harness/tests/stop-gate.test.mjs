import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { decideStopHookResponse, extractWorkStatus } from "../adapters/codex/hooks/lib/stop-gate.mjs";

function tempHarness() {
  const root = mkdtempSync(path.join(os.tmpdir(), "harness-stop-test-"));
  mkdirSync(path.join(root, ".harness"), { recursive: true });
  writeFileSync(path.join(root, ".harness", "root.json"), '{"schemaVersion":1,"kind":"harness-root"}\n');
  return root;
}

test("explicit WORK_STATUS drives Codex continuation and pause", () => {
  const root = tempHarness();
  try {
    assert.equal(extractWorkStatus("WORK_STATUS: continue_autonomously"), "continue_autonomously");
    const next = decideStopHookResponse({ cwd: root, session_id: "next", stop_hook_active: false, last_assistant_message: "WORK_STATUS: continue_autonomously" });
    assert.equal(next.decision, "block");
    const pause = decideStopHookResponse({ cwd: root, session_id: "pause", last_assistant_message: "WORK_STATUS: needs_user_decision" });
    assert.equal(pause.continue, false);
    assert.match(pause.stopReason, /decision/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
