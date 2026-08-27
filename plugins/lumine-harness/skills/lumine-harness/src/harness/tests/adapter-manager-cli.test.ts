import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { adapterCheck, adapterStatus, doctorAdapter, formatAdapterResult, runAdapterCommand } from "../adapter-manager.ts";
import { initializeSessionState } from "../core/work-status.ts";
import { appendVerificationEvent, beginVerificationRun } from "../core/verification.ts";
import { resolveHarnessRuntimeRoot } from "../core/runtime-layout.ts";
import type { HarnessProduct, SharedSkill } from "../core/contracts.ts";

const HARNESS_DIR = resolveHarnessRuntimeRoot(import.meta.url);
const CAPABILITIES: unknown = JSON.parse(readFileSync(path.join(HARNESS_DIR, "adapter-capabilities.json"), "utf8"));

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeSkill(root: string, name: string, description: string): void {
  const file = path.join(root, ".agents", "skills", name, "SKILL.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, "utf8");
}

function fixture(selected: HarnessProduct[] = ["qoder"]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-adapter-status-"));
  writeJson(path.join(root, ".harness", "root.json"), { schemaVersion: 1, kind: "harness-root" });
  writeJson(path.join(root, ".harness", "project.json"), { schemaVersion: 1, selectedAdapters: selected });
  writeJson(path.join(root, ".harness", "adapter-capabilities.json"), CAPABILITIES);
  const productFiles: Partial<Record<HarnessProduct, string>> = {
    qoder: path.join(root, ".qoder", "settings.json"),
    cursor: path.join(root, ".cursor", "hooks.json"),
    opencode: path.join(root, ".opencode", "plugins", "harness.mjs"),
    zcode: path.join(root, ".harness", "adapters", "zcode", "marketplace", "marketplace.json"),
    "deepseek-harness": path.join(root, ".harness", "adapters", "deepseek-harness", "bundle", "package.json")
  };
  for (const product of selected) {
    const file = productFiles[product];
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
    assert.equal(status.schemaVersion, 2);
    assert.equal(status.kind, "adapter_status");
    assert.equal(status.readiness, null);
    assert.equal(status.product, null);
    assert.ok(status.summary);
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
    assert.equal(identified.readiness, "ready");

    initializeSessionState(root, { product: "cursor", sessionId: "cursor-session", cwd: root });
    const ambiguous = adapterStatus("current", { cwd: root, env: {} });
    assert.equal(ambiguous.product, null);
    assert.equal(ambiguous.readiness, null);
    assert.ok(ambiguous.summary);
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
    assert.equal(status.readiness, null);
    assert.ok(status.summary);
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
    assert.ok(result.skillCatalog);
    assert.equal(result.skillCatalog.valid, 1);
    assert.equal(result.skillCatalog.invalid, 1);
    assert.match(result.messages.join("\n"), /已隔离 1 个无效 Skill/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Cursor only requests a concrete trust action when the host explicitly reports a restricted workspace", () => {
  const root = fixture(["cursor"]);
  try {
    assert.equal(doctorAdapter("cursor", { cwd: root, env: {} }).status, "repository_ready");
    const restricted = doctorAdapter("cursor", { cwd: root, cursorRestricted: true });
    assert.equal(restricted.status, "needs_manual_app_step");
    assert.equal(restricted.setupActions?.[0]?.id, "trust-cursor-workspace");
    assert.match(restricted.setupActions?.[0]?.successSignal ?? "", /检查结果/);
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

test("doctor output includes concrete setup steps and completion signals", () => {
  const root = fixture(["zcode"]);
  try {
    const output = formatAdapterResult(runAdapterCommand(["doctor", "zcode"], { cwd: root }));
    assert.match(output, /要做：/);
    assert.match(output, /完成标志：/);
    assert.match(output, /安装/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readiness is independent from runtime evidence and product limitations", () => {
  const readyRoot = fixture(["qoder"]);
  const setupRoot = fixture(["zcode"]);
  const openCodeRoot = fixture(["opencode"]);
  const brokenRoot = fixture(["qoder"]);
  try {
    const ready = adapterStatus("qoder", { cwd: readyRoot }).products[0];
    assert.equal(ready?.readiness, "ready");
    assert.equal(ready?.evidence.summary, "repository_checked");

    assert.equal(adapterStatus("zcode", { cwd: setupRoot }).products[0]?.readiness, "setup_required");

    const openCode = adapterStatus("opencode", { cwd: openCodeRoot }).products[0];
    assert.equal(openCode?.readiness, "ready");
    assert.match(openCode?.limitations.join("\n") ?? "", /手动|人发起下一轮/);

    rmSync(path.join(brokenRoot, ".qoder", "settings.json"), { force: true });
    assert.equal(adapterStatus("qoder", { cwd: brokenRoot }).products[0]?.readiness, "connection_error");
  } finally {
    rmSync(readyRoot, { recursive: true, force: true });
    rmSync(setupRoot, { recursive: true, force: true });
    rmSync(openCodeRoot, { recursive: true, force: true });
    rmSync(brokenRoot, { recursive: true, force: true });
  }
});

test("DeepSeek Harness becomes trial-only after setup evidence is observed", () => {
  const root = fixture(["deepseek-harness"]);
  try {
    assert.equal(adapterStatus("deepseek-harness", { cwd: root }).products[0]?.readiness, "setup_required");
    beginVerificationRun(root, "deepseek-harness", { hostVersion: "test-host" });
    appendVerificationEvent(root, {
      product: "deepseek-harness",
      sessionId: "deepseek-session",
      cwd: root,
      event: "session_start"
    }, { observations: ["session_context"] });
    const status = adapterStatus("deepseek-harness", { cwd: root }).products[0];
    assert.equal(status?.readiness, "trial_only");
    assert.equal(status?.setup.actions.length, 0);
    assert.equal(status?.evidence.summary, "runtime_observed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale runtime evidence does not turn repository readiness into connection_error", () => {
  const root = fixture(["qoder"]);
  try {
    beginVerificationRun(root, "qoder", { hostVersion: "old-host", maxAgeMs: -1 });
    const status = adapterStatus("qoder", { cwd: root }).products[0];
    assert.equal(status?.readiness, "ready");
    assert.equal(status?.evidence.summary, "failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
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

test("adapter status selected groups products without a worst-state conclusion", () => {
  const root = fixture();
  try {
    const output = adapterStatus("selected", { cwd: root });
    assert.equal(output.schemaVersion, 2);
    assert.equal(output.kind, "adapter_status");
    assert.equal(output.scope, "selected");
    assert.equal(output.readiness, null);
    assert.deepEqual(output.groups?.ready, ["qoder"]);
    assert.deepEqual(output.nextSteps, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter status supports an explicit product and a stable machine contract", () => {
  const root = fixture(["qoder"]);
  try {
    const output = runAdapterCommand(["status", "qoder", "--json"], { cwd: root });
    assert.equal(output.schemaVersion, 2);
    assert.equal(output.kind, "adapter_status");
    assert.ok("scope" in output && "readiness" in output && "products" in output);
    if (!("scope" in output && "readiness" in output && "products" in output)) return;
    assert.equal(output.scope, "qoder");
    assert.equal(output.readiness, "ready");
    assert.equal(output.products?.[0]?.skillCatalog?.valid, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter check is read-only and leaves probes to explicit verification", () => {
  const root = fixture(["qoder"]);
  try {
    const output = adapterCheck("qoder", { cwd: root });
    assert.equal(output.kind, "adapter_check");
    assert.equal(output.probe, undefined);
    assert.equal(existsSync(path.join(root, ".harness", "runtime", "probes")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adapter-routed Doctor messages require the Agent to read the canonical Skill", () => {
  const root = fixture(["qoder"]);
  try {
    const output = doctorAdapter("qoder", { cwd: root });
    const messages = output.messages.join(" ");
    assert.match(messages, /路由到 \.agents\/skills[\s\S]*要求 Agent 读取/);
    assert.doesNotMatch(messages, /Adapter (?:会|直接|按真实路径)读取/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default Chinese output stays concise and details separates evidence", () => {
  const root = fixture(["qoder"]);
  try {
    initializeSessionState(root, { product: "qoder", sessionId: "current-session", cwd: root });
    const output = formatAdapterResult(adapterStatus("current", { cwd: root }));
    for (const label of ["当前 Agent：", "结论：", "开始前：", "主要限制：", "下一步："]) {
      assert.match(output, new RegExp(label));
    }
    assert.doesNotMatch(output, /仓库中已配置：|当前会话已确认：|当前产品不提供：|尚待确认：/);
    assert.doesNotMatch(output, /完整兼容|全部能力已经验证/);

    const explicit = formatAdapterResult(adapterStatus("qoder", { cwd: root }));
    assert.match(explicit, /^检查对象：qoder/m);
    assert.doesNotMatch(explicit, /^当前 Agent：/m);

    const openCodeRoot = fixture(["opencode"]);
    try {
      const openCode = formatAdapterResult(adapterStatus("opencode", { cwd: openCodeRoot }));
      assert.match(openCode, /主要限制：[^\n]*(?:结束|停止)前/);
      assert.doesNotMatch(openCode, /当前产品不提供：|尚待确认：|仓库中已配置：/);

      const openCodeDetails = formatAdapterResult(adapterStatus("opencode", { cwd: openCodeRoot, details: true }));
      assert.match(openCodeDetails, /当前产品不提供：[^\n]*结束前门禁/);
      assert.match(openCodeDetails, /尚待确认：[^\n]*状态转换/);
      assert.doesNotMatch(openCodeDetails, /仓库中已配置：[^\n]*状态转换/);
    } finally {
      rmSync(openCodeRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime observations are not presented as repository checks", () => {
  const root = fixture(["qoder"]);
  try {
    beginVerificationRun(root, "qoder", { hostVersion: "test-host" });
    appendVerificationEvent(root, {
      product: "qoder",
      sessionId: "observed-session",
      cwd: root,
      event: "session_start"
    }, { observations: ["session_context"] });

    const output = formatAdapterResult(adapterStatus("qoder", { cwd: root, details: true }));
    assert.match(output, /当前会话已确认：[^\n]*会话入口/);
    assert.doesNotMatch(output, /仓库中已配置：[^\n]*会话入口/);
    assert.match(output, /仓库中已配置：[^\n]*Skill 发现/);
    assert.match(output, /尚待确认：[^\n]*项目指令/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("details expands the four equally weighted capability groups", () => {
  const root = fixture(["qoder"]);
  try {
    const output = formatAdapterResult(adapterStatus("qoder", { cwd: root, details: true }));
    assert.match(output, /工程上下文：/);
    assert.match(output, /Skill 使用：/);
    assert.match(output, /流程约束：/);
    assert.match(output, /长任务可靠性：/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime skill evidence remains independent from readiness", () => {
  const root = fixture(["qoder"]);
  try {
    beginVerificationRun(root, "qoder", { hostVersion: "test-host" });
    appendVerificationEvent(root, {
      product: "qoder",
      sessionId: "ready-session",
      cwd: root,
      event: "session_start"
    });
    appendVerificationEvent(root, {
      product: "qoder",
      sessionId: "ready-session",
      cwd: root,
      event: "tool_after"
    }, {
      skill: {
        name: "security-audit",
        description: "Audit project security boundaries",
        file: path.join(root, ".agents", "skills", "security-audit", "SKILL.md"),
        relativeSource: ".agents/skills/security-audit/SKILL.md",
        hash: "a".repeat(64)
      } satisfies SharedSkill
    });
    const status = adapterStatus("qoder", { cwd: root }).products[0];
    assert.equal(status?.readiness, "ready");
    assert.equal(status?.capabilities.skill_read?.evidenceLevel, "runtime_observed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
