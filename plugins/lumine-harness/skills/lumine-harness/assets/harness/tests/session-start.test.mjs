import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSessionStartOutput } from "../adapters/codex/hooks/lib/session-start-context.mjs";

function tempHarness() {
  const root = mkdtempSync(path.join(os.tmpdir(), "harness-session-test-"));
  mkdirSync(path.join(root, ".harness"), { recursive: true });
  writeFileSync(path.join(root, ".harness", "root.json"), '{"schemaVersion":1,"kind":"harness-root"}\n');
  return root;
}

test("SessionStart uses the public AGENTS and Skill sources", () => {
  const root = tempHarness();
  try {
    const output = buildSessionStartOutput({ cwd: root });
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(output.hookSpecificOutput.additionalContext, /root AGENTS\.md/);
    assert.match(output.hookSpecificOutput.additionalContext, /\.agents\/skills/);
    assert.match(output.hookSpecificOutput.additionalContext, /WORK_STATUS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
