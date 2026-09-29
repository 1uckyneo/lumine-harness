import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSessionStartOutput } from "../adapters/codex/hooks/lib/session-start-context.ts";

function tempHarness() {
  const root = mkdtempSync(path.join(os.tmpdir(), "harness-session-test-"));
  mkdirSync(path.join(root, ".lumine"), { recursive: true });
  writeFileSync(path.join(root, ".lumine", "root.json"), '{"schemaVersion":2,"kind":"lumine-root"}\n');
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
