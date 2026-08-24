import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { doctorAdapter, formatSkillResult, installKimiAdapter, setCliWorkStatus, uninstallKimiAdapter } from "../adapter-manager.mjs";
import { findHarnessRoot } from "../core/root-resolver.mjs";
import { evaluateStopPolicy } from "../core/stop-policy.mjs";
import { initializeSessionState, recordWorkStatus } from "../core/work-status.mjs";

const HARNESS_DIR = path.resolve(new URL("..", import.meta.url).pathname);
const SOURCE_ASSET_MODE = path.basename(path.dirname(HARNESS_DIR)) === "assets";
const ROOT = SOURCE_ASSET_MODE ? path.dirname(HARNESS_DIR) : path.dirname(HARNESS_DIR);

function sourcePath(relative) {
  if (!SOURCE_ASSET_MODE) return path.join(ROOT, relative);
  if (relative.startsWith(".harness/")) return path.join(HARNESS_DIR, relative.slice(".harness/".length));
  if (relative.startsWith(".agents/skills/")) return path.join(ROOT, "skills", relative.slice(".agents/skills/".length));
  return path.join(ROOT, relative.replace(/^\./, ""));
}

function tempHarness() {
  const root = mkdtempSync(path.join(os.tmpdir(), "harness-adapter-test-"));
  mkdirSync(path.join(root, ".harness"), { recursive: true });
  writeFileSync(path.join(root, ".harness", "root.json"), '{"schemaVersion":1,"kind":"harness-root"}\n');
  return root;
}

function runHook(relative, payload) {
  return spawnSync("node", [sourcePath(relative)], { cwd: payload.cwd ?? ROOT, input: JSON.stringify(payload), encoding: "utf8" });
}

function writeSharedSkill(root, name, description, body = "Follow the canonical workflow.") {
  const file = path.join(root, ".agents", "skills", name, "SKILL.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`, "utf8");
  return file;
}

test("root lookup crosses nested Git boundaries", () => {
  const root = tempHarness();
  const child = path.join(root, "child", "repo");
  mkdirSync(path.join(child, ".git"), { recursive: true });
  try { assert.equal(findHarnessRoot(child), root); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("public Stop Policy preserves all six states and limits continuation", () => {
  const root = tempHarness();
  try {
    for (const status of ["needs_user_decision", "needs_credentials", "needs_manual_app_step", "blocked_external"]) {
      const input = { product: "kimi", sessionId: status, cwd: root };
      initializeSessionState(root, input);
      recordWorkStatus(root, input, status);
      assert.equal(evaluateStopPolicy(input, { root }).action, "pause");
    }
    const done = { product: "kimi", sessionId: "done", cwd: root };
    initializeSessionState(root, done);
    recordWorkStatus(root, done, "done");
    assert.equal(evaluateStopPolicy(done, { root, runCheck: () => ({ ok: true }) }).action, "allow");
    const next = { product: "kimi", sessionId: "next", cwd: root };
    initializeSessionState(root, next);
    recordWorkStatus(root, next, "continue_autonomously");
    assert.equal(evaluateStopPolicy(next, { root }).action, "continue");
    assert.equal(evaluateStopPolicy(next, { root }).action, "pause");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Qoder blocks mutation until the routed public Skill was read", () => {
  const root = tempHarness();
  const skill = writeSharedSkill(root, "lumine-harness-run", "Run an approved Exec Plan");
  const common = { session_id: "qoder-route", cwd: root };
  try {
    const prompt = runHook(".harness/adapters/qoder/hooks/prompt-submit.mjs", { ...common, hook_event_name: "UserPromptSubmit", prompt: "授权 lumine-harness-run 进入实施" });
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.match(prompt.stdout, /lumine-harness-run\/SKILL\.md/);
    const blocked = runHook(".harness/adapters/qoder/hooks/tool-before.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.match(blocked.stdout, /permissionDecision":"deny/);
    runHook(".harness/adapters/qoder/hooks/tool-after.mjs", { ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: skill } });
    const allowed = runHook(".harness/adapters/qoder/hooks/tool-before.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.equal(allowed.stdout, "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CodeBuddy gates Harness and explicitly requested shared Skills through canonical reads", () => {
  const root = tempHarness();
  const runSkill = writeSharedSkill(root, "lumine-harness-run", "Run an approved Exec Plan");
  const securitySkill = writeSharedSkill(root, "security-audit", "Audit authentication and authorization");
  const common = { session_id: "codebuddy-route", cwd: root };
  try {
    const start = runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "SessionStart", source: "startup" });
    assert.equal(start.status, 0, start.stderr);
    assert.match(start.stdout, /\.\/\.harness\/cli skills search/);
    const prompt = runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", {
      ...common,
      hook_event_name: "UserPromptSubmit",
      prompt: "使用 $security-audit 并授权 lumine-harness-run 进入实施"
    });
    assert.match(prompt.stdout, /lumine-harness-run\/SKILL\.md/);
    assert.match(prompt.stdout, /security-audit\/SKILL\.md/);

    const firstBlock = runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.match(firstBlock.stdout, /permissionDecision":"deny/);
    runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: runSkill } });
    const secondBlock = runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.match(secondBlock.stdout, /security-audit/);
    runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: securitySkill } });
    const allowed = runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.equal(allowed.stdout, "");

    setCliWorkStatus("continue_autonomously", { root, cwd: root, product: "codebuddy", sessionId: common.session_id });
    const stop = runHook(".harness/adapters/codebuddy/hooks/dispatch.mjs", { ...common, hook_event_name: "Stop", stop_hook_active: false });
    assert.match(stop.stdout, /"continue":false/);
    assert.equal(existsSync(path.join(root, ".harness", "runtime", "verification", "codebuddy--codebuddy-route", "events.jsonl")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ZCode Hook-only Plugin routes the shared Skill and records runtime evidence", () => {
  const root = tempHarness();
  const skill = writeSharedSkill(root, "lumine-harness-run", "Run an approved Exec Plan");
  const common = { session_id: "zcode-route", cwd: root };
  try {
    const start = runHook(".harness/adapters/zcode/hooks/dispatch.mjs", { ...common, hook_event_name: "SessionStart", source: "startup" });
    assert.equal(start.status, 0, start.stderr);
    assert.match(start.stdout, /Workspace harness context/);
    const prompt = runHook(".harness/adapters/zcode/hooks/dispatch.mjs", { ...common, hook_event_name: "UserPromptSubmit", prompt: "授权 lumine-harness-run 进入实施" });
    assert.match(prompt.stdout, /lumine-harness-run\/SKILL\.md/);
    const blocked = runHook(".harness/adapters/zcode/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.match(blocked.stdout, /permissionDecision":"deny/);
    runHook(".harness/adapters/zcode/hooks/dispatch.mjs", { ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: skill } });
    const allowed = runHook(".harness/adapters/zcode/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
    assert.equal(allowed.stdout, "");
    assert.equal(existsSync(path.join(root, ".harness", "runtime", "verification", "zcode--zcode-route", "events.jsonl")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("DeepSeek Harness bridge verifies native Skill evidence before mutation", () => {
  const root = tempHarness();
  writeSharedSkill(root, "lumine-harness-run", "Run an approved Exec Plan");
  const common = { session_id: "dsh-route", cwd: root };
  try {
    runHook(".harness/adapters/deepseek-harness/hooks/dispatch.mjs", { ...common, hook_event_name: "SessionStart", source: "startup" });
    const prompt = runHook(".harness/adapters/deepseek-harness/hooks/dispatch.mjs", { ...common, hook_event_name: "UserPromptSubmit", prompt: "授权 lumine-harness-run 进入实施" });
    assert.match(prompt.stdout, /lumine-harness-run/);
    const blocked = runHook(".harness/adapters/deepseek-harness/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command: "npm test" } });
    assert.match(blocked.stdout, /permissionDecision":"deny/);
    runHook(".harness/adapters/deepseek-harness/hooks/dispatch.mjs", { ...common, hook_event_name: "PostToolUse", tool_name: "skill", tool_response: "Loaded skill metadata: name: lumine-harness-run" });
    const allowed = runHook(".harness/adapters/deepseek-harness/hooks/dispatch.mjs", { ...common, hook_event_name: "PreToolUse", tool_name: "bash", tool_input: { command: "npm test" } });
    assert.equal(allowed.stdout, "");
    setCliWorkStatus("continue_autonomously", { root, cwd: root, product: "deepseek-harness", sessionId: common.session_id });
    const stop = runHook(".harness/adapters/deepseek-harness/hooks/dispatch.mjs", { ...common, hook_event_name: "Stop", last_assistant_message: null, stop_hook_active: false });
    assert.match(stop.stdout, /decision":"block/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Kimi installer is idempotent and preserves unrelated TOML", () => {
  const root = tempHarness();
  const home = mkdtempSync(path.join(os.tmpdir(), "kimi-home-test-"));
  const config = path.join(home, "config.toml");
  writeFileSync(config, 'default_model = "keep-me"\n');
  try {
    const options = { root, kimiHome: home, validate: () => true };
    installKimiAdapter(options);
    installKimiAdapter(options);
    const installed = readFileSync(config, "utf8");
    assert.equal((installed.match(/BEGIN lumine-harness adapter/g) ?? []).length, 1);
    assert.match(installed, /default_model = "keep-me"/);
    uninstallKimiAdapter(options);
    assert.doesNotMatch(readFileSync(config, "utf8"), /lumine-harness adapter/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("Kimi validation failure leaves configuration and dispatcher untouched", () => {
  const root = tempHarness();
  const home = mkdtempSync(path.join(os.tmpdir(), "kimi-invalid-test-"));
  const config = path.join(home, "config.toml");
  const original = 'default_model = "keep-me"\n';
  writeFileSync(config, original);
  try {
    assert.throws(() => installKimiAdapter({ root, kimiHome: home, validate: () => false }), /validation failed/);
    assert.equal(readFileSync(config, "utf8"), original);
    assert.equal(existsSync(path.join(home, "lumine-harness-adapter")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("repository keeps one canonical Skill source and capability boundaries remain explicit", () => {
  for (const relative of [
    ".qoder/skills",
    ".codebuddy/skills",
    ".harness/adapters/zcode/marketplace/plugins/lumine-harness-adapter/skills",
    ".trae/skills",
    ".kimi-code/skills",
    ".qoder/rules",
    ".trae/rules",
    ".cursor/rules",
    ".zcode/skills",
    ".zcode/rules",
    ".codebuddy/rules",
    ".dsh/skills"
  ]) {
    assert.equal(existsSync(sourcePath(relative)), false, relative);
  }
  const manifest = JSON.parse(readFileSync(sourcePath(".harness/adapter-capabilities.json"), "utf8"));
  assert.equal(manifest.skillSource, ".agents/skills");
  assert.equal(manifest.products.opencode.stopGate, "unsupported");
  assert.equal(manifest.products.zcode.setup, "local-marketplace+manual");
  assert.equal(manifest.products.zcode.skills.mode, "adapter-routed");
  assert.equal(manifest.products.codebuddy.skills.mode, "adapter-routed");
  assert.equal(manifest.products.codebuddy.skills.implicitDiscovery, "best-effort");
  assert.equal(manifest.products.opencode.runtimeVerification, "runtime-pending");
  assert.equal(manifest.products["deepseek-harness"].verifiedBridgeVersion, "0.1.0-rc.7");
  if (existsSync(sourcePath(".opencode/plugins/harness.mjs"))) {
    const plugin = readFileSync(sourcePath(".opencode/plugins/harness.mjs"), "utf8");
    assert.match(plugin, /audit_only/);
    assert.doesNotMatch(plugin, /followup_message/);
  }
});

test("skills inspect CLI formats a single Skill descriptor", () => {
  const output = JSON.parse(formatSkillResult({ name: "lumine-harness-run", file: "/private/path/SKILL.md" }));
  assert.equal(output.name, "lumine-harness-run");
  assert.equal("file" in output, false);
});

test("Doctor keeps product-side setup and partial semantics visible", { skip: SOURCE_ASSET_MODE }, () => {
  assert.equal(doctorAdapter("opencode", { cwd: ROOT }).status, "partial");
  assert.equal(doctorAdapter("trae", { cwd: ROOT }).status, "needs_manual_app_step");
  assert.equal(doctorAdapter("zcode", { cwd: ROOT }).status, "needs_manual_app_step");
  assert.equal(doctorAdapter("deepseek-harness", { cwd: ROOT }).status, "needs_manual_app_step");
});
