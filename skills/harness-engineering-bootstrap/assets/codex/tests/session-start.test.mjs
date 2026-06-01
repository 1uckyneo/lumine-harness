import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionStartContext,
  buildSessionStartOutput
} from "../hooks/lib/session-start-context.mjs";

test("session start context advertises current harness workflow", () => {
  const context = buildSessionStartContext();

  assert.match(context, /AGENTS\.md is the entry map/);
  assert.match(context, /docs\/drafts\/<slug>\.md/);
  assert.match(context, /formal design artifacts are generated only after draft approval/);
  assert.match(context, /generated indexes are navigation aids/);
  assert.match(context, /Run closeout writes validation/);
  assert.match(context, /WORK_STATUS/);
});

test("session start output uses SessionStart shape", () => {
  const output = buildSessionStartOutput();

  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(output.hookSpecificOutput.additionalContext, /AGENTS\.md/);
});
