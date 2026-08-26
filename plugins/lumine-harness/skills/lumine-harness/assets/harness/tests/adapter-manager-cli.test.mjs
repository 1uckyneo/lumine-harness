import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adapterStatus, doctorAdapter, formatAdapterResult } from "../adapter-manager.mjs";
import { initializeSessionState } from "../core/work-status.mjs";
import { appendVerificationEvent, beginVerificationRun } from "../core/verification.mjs";

const HARNESS_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ADAPTER_CLI = path.join(HARNESS_DIR, "adapter-cli.mjs");
const CAPABILITIES = JSON.parse(readFileSync(path.join(HARNESS_DIR, "adapter-capabilities.json"), "utf8"));

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeSkill(root, name, description) {
  const file = path.join(root, ".agents", "skills", name, "SKILL.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
}

function fixture(selected = ["qoder"]) {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-adapter-status-"));
  writeJson(path.join(root, ".harness", "root.json"), { schemaVersion: 1, kind: "harness-root" });
  writeJson(path.join(root, ".harness", "project.json"), { schemaVersion: 1, selectedAdapters: selected });
  writeJson(path.join(root, ".harness", "adapter-capabilities.json"), CAPABILITIES);
  for (const product of selected) {
    const file = {
      qoder: path.join(root, ".qoder", "settings.json"),
      cursor: path.join(root, ".cursor", "hooks.json"),
      opencode: path.join(root, ".opencode", "plugins", "harness.mjs"),
      zcode: path.join(root, ".harness", "adapters", "zcode", "marketplace", "marketplace.json")
    }[product];
    if (file) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, file.endsWith(".json") ? "{}\n" : "export default {};\n", "utf8");
    }
  }
  writeSkill(root, "security-audit", "Audit project security boundaries");
  return root;
}

test("adapter status current does not guess when no runtime identity exists", () => {
  const root = fixture();
  try {
    const status = adapterStatus("current", { cwd: root, env: {} });
    assert.equal(status.schemaVersion, 1);
    assert.equal(status.kind, "adapter_status");
    assert.equal(status.conclusion, "unverified");
    assert.equal(status.product, null);
    assert.match(status.summary, /没有找到/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter status current uses one live pointer and reports ambiguity instead of guessing", () => {
  const root = fixture(["qoder", "cursor"]);
  try {
    initializeSessionState(root, { product: "qoder", sessionId: "qoder-session", cwd: root });
    const identified = adapterStatus("current", { cwd: root, env: {} });
    assert.equal(identified.product, "qoder");
    assert.equal(identified.source, "runtime_pointer");
    assert.equal(identified.conclusion, "unverified");

    initializeSessionState(root, { product: "cursor", sessionId: "cursor-session", cwd: root });
    const ambiguous = adapterStatus("current", { cwd: root, env: {} });
    assert.equal(ambiguous.product, null);
    assert.equal(ambiguous.conclusion, "unverified");
    assert.match(ambiguous.summary, /无法确定当前 Agent/);

    const explicit = adapterStatus("current", {
      cwd: root,
      env: { HARNESS_PRODUCT: "cursor", HARNESS_SESSION_ID: "cursor-session" }
    });
    assert.equal(explicit.product, "cursor");
    assert.equal(explicit.source, "environment");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter status current ignores stale runtime pointers", () => {
  const root = fixture();
  try {
    writeJson(path.join(root, ".harness", "runtime", "current", "qoder.json"), {
      product: "qoder",
      sessionId: "old-session",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const status = adapterStatus("current", {
      cwd: root,
      env: {},
      now: Date.parse("2026-08-26T00:00:00.000Z")
    });
    assert.equal(status.product, null);
    assert.equal(status.conclusion, "unverified");
    assert.match(status.summary, /没有找到/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor isolates malformed routed Skills without hiding valid Skills", () => {
  const root = fixture();
  const broken = path.join(root, ".agents", "skills", "broken", "SKILL.md");
  mkdirSync(path.dirname(broken), { recursive: true });
  writeFileSync(broken, "---\nname: Broken Skill\n---\n\nMissing description.\n", "utf8");
  try {
    const result = doctorAdapter("qoder", { cwd: root });
    assert.equal(result.status, "repository_ready");
    assert.equal(result.skillCatalog.valid, 1);
    assert.equal(result.skillCatalog.invalid, 1);
    assert.match(result.messages.join("\n"), /已隔离 1 个无效 Skill/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Cursor only requests trust when the host explicitly reports a restricted workspace", () => {
  const root = fixture(["cursor"]);
  try {
    assert.equal(doctorAdapter("cursor", { cwd: root, env: {} }).status, "repository_ready");
    assert.equal(doctorAdapter("cursor", { cwd: root, cursorRestricted: true }).status, "needs_manual_app_step");
    assert.equal(doctorAdapter("cursor", { cwd: root, env: { CURSOR_WORKSPACE_TRUST: "restricted" } }).status, "needs_manual_app_step");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor remains a static setup check even when runtime evidence exists", () => {
  const root = fixture(["zcode"]);
  try {
    beginVerificationRun(root, "zcode", { hostVersion: "test-host" });
    appendVerificationEvent(root, {
      product: "zcode",
      sessionId: "zcode-session",
      cwd: root,
      event: "session_start"
    }, { observations: ["project_instructions", "session_context"] });
    const result = doctorAdapter("zcode", { cwd: root });
    assert.equal(result.status, "needs_manual_app_step");
    assert.doesNotMatch(result.messages.join("\n"), /运行证据|真实验证通过/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("status exposes ready, setup, manual automation, and connection error as separate conclusions", () => {
  const readyRoot = fixture(["qoder"]);
  const setupRoot = fixture(["zcode"]);
  const manualRoot = fixture(["opencode"]);
  const brokenRoot = fixture(["qoder"]);
  try {
    beginVerificationRun(readyRoot, "qoder", { hostVersion: "test-host" });
    appendVerificationEvent(readyRoot, {
      product: "qoder",
      sessionId: "ready-session",
      cwd: readyRoot,
      event: "session_start"
    });
    appendVerificationEvent(readyRoot, {
      product: "qoder",
      sessionId: "ready-session",
      cwd: readyRoot,
      event: "tool_after"
    }, { skill: { name: "security-audit", relativeSource: ".agents/skills/security-audit/SKILL.md", hash: "a".repeat(64) } });
    assert.equal(adapterStatus("selected", { cwd: readyRoot }).conclusion, "ready");

    assert.equal(adapterStatus("selected", { cwd: setupRoot }).conclusion, "needs_setup");

    beginVerificationRun(manualRoot, "opencode", { hostVersion: "test-host" });
    appendVerificationEvent(manualRoot, {
      product: "opencode",
      sessionId: "manual-session",
      cwd: manualRoot,
      event: "session_start"
    }, { observations: ["project_instructions", "session_context", "skill_discovery"] });
    assert.equal(adapterStatus("selected", { cwd: manualRoot }).conclusion, "manual_automation");

    rmSync(path.join(brokenRoot, ".qoder", "settings.json"), { force: true });
    assert.equal(adapterStatus("selected", { cwd: brokenRoot }).conclusion, "connection_error");
  } finally {
    rmSync(readyRoot, { recursive: true, force: true });
    rmSync(setupRoot, { recursive: true, force: true });
    rmSync(manualRoot, { recursive: true, force: true });
    rmSync(brokenRoot, { recursive: true, force: true });
  }
});

test("adapter list reports repository metadata without claiming runtime compatibility", () => {
  const output = formatAdapterResult({
    kind: "adapter_list",
    results: [{ product: "codex", selected: true, implementation: "available", maturity: "full" }]
  });
  assert.match(output, /codex：已选择/);
  assert.match(output, /仓库实现：available/);
  assert.match(output, /成熟度：full/);
  assert.match(output, /不代表真实 Agent 已验证通过/);
  assert.doesNotMatch(output, /完成|可以正常使用/);
});

test("adapter status selected has a stable JSON contract", () => {
  const root = fixture();
  try {
    const result = spawnSync(process.execPath, [ADAPTER_CLI, "adapter", "status", "selected", "--json"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.kind, "adapter_status");
    assert.equal(output.scope, "selected");
    assert.equal(output.conclusion, "unverified");
    assert.deepEqual(output.products.map((item) => item.product), ["qoder"]);
    assert.equal(output.products[0].skillCatalog.valid, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter status current prints capability evidence without claiming full certification", () => {
  const root = fixture(["qoder"]);
  try {
    initializeSessionState(root, { product: "qoder", sessionId: "current-session", cwd: root, event: "session_start" });
    const output = formatAdapterResult(adapterStatus("current", { cwd: root }));
    assert.match(output, /能力证据/);
    assert.match(output, /项目指令：尚未验证/);
    assert.match(output, /会话入口：仓库侧实现已经检查/);
    assert.doesNotMatch(output, /完整兼容|全部能力已经验证/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unverified status points to an explicit Probe instead of looping the same read-only check", () => {
  const root = fixture(["qoder"]);
  try {
    initializeSessionState(root, { product: "qoder", sessionId: "current-session", cwd: root, event: "session_start" });
    const result = adapterStatus("current", { cwd: root });
    assert.match(result.nextSteps.join("\n"), /主动 Probe/);
    assert.doesNotMatch(result.nextSteps.join("\n"), /重新运行连接检查|再次检查/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
