import test from "node:test";
import assert from "node:assert/strict";

import {
  decideStopHookResponse,
  extractWorkStatus,
  inferPauseStatus
} from "../hooks/lib/stop-gate.mjs";

test("extractWorkStatus reads explicit work status markers", () => {
  assert.equal(extractWorkStatus("WORK_STATUS: continue_autonomously"), "continue_autonomously");
  assert.equal(extractWorkStatus("WORK_STATUS: done"), "done");
  assert.equal(extractWorkStatus("no marker here"), null);
});

test("continue_autonomously blocks one extra turn", () => {
  const response = decideStopHookResponse({
    stop_hook_active: false,
    last_assistant_message: "Next step is obvious.\nWORK_STATUS: continue_autonomously"
  });

  assert.equal(response.decision, "block");
  assert.match(response.reason, /continue_autonomously/);
});

test("pause statuses remain distinct", () => {
  assert.equal(extractWorkStatus("WORK_STATUS: needs_credentials"), "needs_credentials");
  assert.equal(extractWorkStatus("WORK_STATUS: needs_manual_app_step"), "needs_manual_app_step");
  assert.equal(extractWorkStatus("WORK_STATUS: blocked_external"), "blocked_external");
});

test("needs_user_decision pauses instead of continuing", () => {
  const response = decideStopHookResponse({
    stop_hook_active: false,
    last_assistant_message: "I need your choice.\nWORK_STATUS: needs_user_decision"
  });

  assert.equal(response.continue, false);
  assert.match(response.stopReason, /decision/i);
});

test("heuristics infer credential blockers", () => {
  assert.equal(inferPauseStatus("I need your password before I can continue."), "needs_credentials");
});
