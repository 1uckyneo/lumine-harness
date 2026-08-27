import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  HarnessAdapterCapability,
  HarnessHookInput,
  HarnessProduct,
  HarnessSessionInput,
  SharedSkill
} from "../core/contracts.ts";
import { resolveHarnessRuntimeRoot, resolveSkillPackageRoot } from "../core/runtime-layout.ts";

interface CapabilityManifestFixture {
  schemaVersion: number;
  skillSource: string;
  products: Record<HarnessProduct, HarnessAdapterCapability>;
}

interface VerificationEventFixture {
  event?: string;
  decision?: { workStatusRevision?: number };
  sessionIdHash?: string;
  cwd?: string;
}

const HARNESS_DIR = resolveHarnessRuntimeRoot(import.meta.url);
const SKILL_ROOT = resolveSkillPackageRoot(import.meta.url) ?? path.dirname(path.dirname(HARNESS_DIR));
const REPOSITORY_ROOT = path.dirname(path.dirname(SKILL_ROOT));

function tempHarness() {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-contract-test-"));
  mkdirSync(path.join(root, ".harness"), { recursive: true });
  writeFileSync(path.join(root, ".harness", "root.json"), '{"schemaVersion":1,"kind":"harness-root"}\n');
  return root;
}

function writeSkill(root: string, name: string, description: string, body = "Follow the canonical workflow."): string {
  const file = path.join(root, ".agents", "skills", name, "SKILL.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`, "utf8");
  return file;
}

test("public project template stays host-neutral and portable", () => {
  const template = readFileSync(path.join(SKILL_ROOT, "assets", "root", "AGENTS.md"), "utf8");
  assert.doesNotMatch(template, /\b(?:Codex|Qoder|Trae|Kimi|Cursor|OpenCode|ZCode|CodeBuddy|DeepSeek Harness)\b/i);
  assert.doesNotMatch(template, /\.(?:codex|qoder|trae|kimi-code|cursor|opencode|codebuddy)\//i);
  assert.doesNotMatch(template, /--product\b/);
  assert.doesNotMatch(template, /\/Users\/|file:\/\/\/Users\//);
  assert.doesNotMatch(template, /\{\{target_root\}\}/);
  assert.match(template, /\.agents\/skills/);
  for (const status of ["done", "continue_autonomously", "needs_user_decision", "needs_credentials", "needs_manual_app_step", "blocked_external"]) {
    assert.match(template, new RegExp(`\\b${status}\\b`));
  }
});

test("public README files avoid fixed model subjects and local absolute paths", () => {
  for (const name of ["README.md", "README.zh-CN.md"]) {
    const source = readFileSync(path.join(REPOSITORY_ROOT, name), "utf8");
    assert.doesNotMatch(source, /GPT-?IMAGE(?:-[0-9.]+)?|GPT-[A-Z0-9.-]+|Claude-[A-Z0-9.-]+|Gemini-[A-Z0-9.-]+/i, name);
    assert.doesNotMatch(source, /由\s*(?:Codex|Claude|Gemini)\s*(?:判断|执行|生成)/i, name);
    assert.doesNotMatch(source, /\/Users\/|file:\/\/\/Users\//, name);
  }
});

test("README keeps the safe first-use path ahead of optional Plugin distribution", () => {
  const english = readFileSync(path.join(REPOSITORY_ROOT, "README.md"), "utf8");
  const chinese = readFileSync(path.join(REPOSITORY_ROOT, "README.zh-CN.md"), "utf8");
  for (const source of [english, chinese]) {
    assert.match(source, /npx skills add 1uckyneo\/lumine-harness -g/);
    assert.match(source, /Migration Proposal/);
  }
  assert.match(english, /does not (?:immediately )?modify the target project/i);
  assert.match(chinese, /不会(?:立即)?修改(?:你的)?目标工程/);
  assert.ok(english.indexOf("## Everyday development") < english.indexOf("Codex users may also use"));
  assert.ok(chinese.indexOf("## 日常开发怎么使用") < chinese.indexOf("Codex 用户也可以"));
});

test("product adapters never contain physical Skill projections", () => {
  const forbidden = [
    path.join(SKILL_ROOT, "assets", "qoder", "skills"),
    path.join(SKILL_ROOT, "assets", "codebuddy", "skills"),
    path.join(HARNESS_DIR, "adapters", "zcode", "marketplace", "plugins", "lumine-harness-adapter", "skills")
  ];
  for (const target of forbidden) assert.equal(existsSync(target), false, target);
  assert.equal(existsSync(path.join(HARNESS_DIR, "core", "skill-projections.mjs")), false);
});

test("capability manifest separates implementation, setup, runtime evidence, and maturity", () => {
  const manifest = JSON.parse(readFileSync(path.join(HARNESS_DIR, "adapter-capabilities.json"), "utf8")) as CapabilityManifestFixture;
  assert.equal(manifest.schemaVersion, 4);
  assert.equal(manifest.skillSource, ".agents/skills");
  for (const [product, capability] of Object.entries(manifest.products)) {
    for (const field of ["implementation", "setup", "setupActions", "limitations", "skills", "capabilities", "continuation", "maturity", "failMode"]) {
      assert.equal(Object.hasOwn(capability, field), true, `${product}.${field}`);
    }
    assert.ok(Array.isArray(capability.setupActions), `${product}.setupActions`);
    assert.ok(Array.isArray(capability.limitations), `${product}.limitations`);
    for (const action of capability.setupActions ?? []) {
      assert.ok(action.id);
      assert.ok(action.title);
      assert.ok(Array.isArray(action.steps) && action.steps.length > 0);
      assert.ok(action.successSignal);
      assert.equal(typeof action.reloadRequired, "boolean");
      assert.ok(Array.isArray(action.satisfiedBy));
    }
    for (const removed of ["runtimeVerification", "hostVerified", "hostVersion", "verifiedAt", "evidence"]) {
      assert.equal(Object.hasOwn(capability, removed), false, `${product}.${removed}`);
    }
    assert.match(capability.skills?.mode ?? "", /^(?:native|native-with-toggle|adapter-routed)$/);
    assert.match(capability.continuation?.delivery ?? "", /^(?:automatic|manual_required|unsupported)$/);
    for (const result of Object.values(capability.capabilities ?? {})) {
      assert.match(result.result, /^(?:passed|needs_setup|not_tested|not_observable|not_applicable|failed)$/);
      assert.match(result.evidenceLevel, /^(?:official_declared|repository_checked|runtime_observed|behavior_verified)$/);
    }
  }
  for (const product of ["qoder", "zcode", "codebuddy"] as const) {
    assert.equal(manifest.products[product].skills.mode, "adapter-routed");
    assert.equal(manifest.products[product].skills.implicitDiscovery, "best-effort");
    const limitations = (manifest.products[product].limitations ?? []).join(" ");
    assert.match(limitations, /Adapter.*定位.*要求 Agent 读取/);
    assert.doesNotMatch(limitations, /Adapter (?:会|直接|按真实路径)读取/);
  }
});

test("public compatibility summaries separate repository implementation from current-session proof", () => {
  const english = readFileSync(path.join(REPOSITORY_ROOT, "README.md"), "utf8");
  const chinese = readFileSync(path.join(REPOSITORY_ROOT, "README.zh-CN.md"), "utf8");
  assert.match(english, /published product protocols[\s\S]*does not mean that the current session/i);
  assert.match(chinese, /公开协议[\s\S]*不等于你本机的当前会话已经验证通过/);
});

test("public compatibility docs expose the OpenCode Stop Gate gap", () => {
  const english = readFileSync(path.join(REPOSITORY_ROOT, "docs", "adapter-compatibility.md"), "utf8");
  const chinese = readFileSync(path.join(REPOSITORY_ROOT, "docs", "adapter-compatibility.zh-CN.md"), "utf8");
  assert.match(english, /OpenCode[\s\S]*no equivalent (?:pre-stop gate|Stop Gate)/i);
  assert.match(english, /session\.idle[\s\S]*after the Agent has already become idle/i);
  assert.match(chinese, /OpenCode[\s\S]*没有对等的停止前门禁/);
  assert.match(chinese, /session\.idle[\s\S]*已经进入空闲状态以后/);
});

test("dynamic Skill catalog discovers arbitrary project Skills and limits prompt output", async () => {
  const { discoverSharedSkills, getSharedSkill, searchSharedSkills, buildSharedSkillCatalog } = await import("../core/skill-catalog.ts");
  const root = tempHarness();
  try {
    writeSkill(root, "security-audit", "Audit authentication, authorization, and permission boundaries");
    writeSkill(root, "lumine-harness-run", "Run an approved Exec Plan and capture validation evidence");
    writeSkill(root, "database-migration", "Plan and verify safe database migrations");

    assert.deepEqual(discoverSharedSkills(root).map((skill) => skill.name), ["database-migration", "lumine-harness-run", "security-audit"]);
    assert.equal(getSharedSkill(root, "$security-audit")?.relativeSource, ".agents/skills/security-audit/SKILL.md");
    assert.equal(searchSharedSkills(root, "authorization", { limit: 2 })[0]?.name, "security-audit");
    assert.equal(searchSharedSkills(root, "approved Exec Plan", { limit: 1 })[0]?.name, "lumine-harness-run");
    const catalog = buildSharedSkillCatalog(root, { query: "audit run database", limit: 2 });
    assert.equal((catalog.match(/^-/gm) ?? []).length, 2);
    assert.ok(catalog.length <= 1200, `catalog exceeded prompt budget: ${catalog.length}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical Skill reads accept relative and symlinked paths without accepting unrelated files", async () => {
  const { sharedSkillReadFromTool } = await import("../core/skill-catalog.ts");
  const root = tempHarness();
  try {
    const canonical = writeSkill(root, "security-audit", "Audit authentication and authorization");
    const link = path.join(root, "security-audit-skill.md");
    symlinkSync(canonical, link);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(sharedSkillReadFromTool(root, { tool_name: "Read", tool_input: { file_path: ".agents/skills/security-audit/SKILL.md" }, cwd: root })?.name, "security-audit");
    assert.equal(sharedSkillReadFromTool(root, { tool_name: "Read", tool_input: { file_path: link }, cwd: root })?.name, "security-audit");
    assert.equal(sharedSkillReadFromTool(root, { tool_name: "Read", tool_input: { file_path: path.join(root, "README.md") }, cwd: root }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel sessions keep independent state and continuation is consumed per status revision", async () => {
  const {
    initializeSessionState,
    readSessionState,
    recordWorkStatus,
    writeSessionState
  } = await import("../core/work-status.ts");
  const { evaluateStopPolicy } = await import("../core/stop-policy.ts");
  const root = tempHarness();
  try {
    const alpha: HarnessSessionInput = { product: "codebuddy", sessionId: "alpha", cwd: root };
    const beta: HarnessSessionInput = { product: "codebuddy", sessionId: "beta", cwd: root };
    initializeSessionState(root, alpha);
    initializeSessionState(root, beta);
    writeSessionState(root, alpha.product, alpha.sessionId, {
      expectedSkills: [{ name: "security-audit", path: ".agents/skills/security-audit/SKILL.md", reason: null, read: false }]
    });

    const first = recordWorkStatus(root, alpha, "continue_autonomously");
    recordWorkStatus(root, beta, "needs_user_decision");
    assert.equal(first.workStatusRevision, 1);
    assert.equal(evaluateStopPolicy(alpha, { root }).action, "continue");
    const repeated = evaluateStopPolicy(alpha, { root });
    assert.equal(repeated.action, "continue");
    assert.equal(repeated.shouldDeliver, false);
    assert.equal(evaluateStopPolicy(beta, { root }).action, "pause");
    const betaState = readSessionState(root, beta.product, beta.sessionId);
    assert.ok(betaState);
    assert.equal(betaState.continuationConsumedRevision, null);

    const second = recordWorkStatus(root, alpha, "continue_autonomously");
    assert.equal(second.workStatusRevision, 2);
    assert.equal(evaluateStopPolicy(alpha, { root }).action, "continue");

    initializeSessionState(root, { ...alpha, sessionMode: "resume" });
    const resumedState = readSessionState(root, alpha.product, alpha.sessionId);
    assert.ok(resumedState?.expectedSkills?.[0]);
    assert.equal(resumedState.expectedSkills[0].read, false);
    initializeSessionState(root, { ...alpha, sessionMode: "compact" });
    const compactedState = readSessionState(root, alpha.product, alpha.sessionId);
    assert.ok(compactedState?.expectedSkills?.[0]);
    assert.equal(compactedState.expectedSkills[0].read, false);
    assert.throws(() => initializeSessionState(root, { product: "codebuddy", sessionId: "unknown", cwd: root }), /explicit product and sessionId/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("work-status CLI never guesses the active host", async () => {
  const { setCliWorkStatus } = await import("../adapter-manager.ts");
  const root = tempHarness();
  try {
    assert.throws(() => setCliWorkStatus("done", { root, cwd: root }), /product/i);
    assert.throws(() => setCliWorkStatus("done", { root, cwd: root, product: "codebuddy" }), /session-id/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime probes are opt-in, redact local identity, and report evidence per capability", async () => {
  const { appendVerificationEvent, beginVerificationRun, verifyRuntimeEvidence } = await import("../core/verification.ts");
  const root = tempHarness();
  const skill: SharedSkill = {
    name: "security-audit",
    description: "Audit authentication and authorization",
    file: path.join(root, ".agents", "skills", "security-audit", "SKILL.md"),
    relativeSource: ".agents/skills/security-audit/SKILL.md",
    hash: "a".repeat(64)
  };
  try {
    const incomplete: HarnessSessionInput = { product: "codebuddy", sessionId: "incomplete", cwd: root };
    assert.equal(appendVerificationEvent(root, { ...incomplete, event: "session_start" }), null);
    assert.equal(existsSync(path.join(root, ".harness", "runtime", "probes")), false);
    assert.equal(verifyRuntimeEvidence(root, "codebuddy").status, "not_tested");

    beginVerificationRun(root, "codebuddy", { verificationRunId: "verified", hostVersion: "test-host-1" });
    const verified: HarnessSessionInput = { product: "codebuddy", sessionId: "verified", cwd: root };
    appendVerificationEvent(root, { ...verified, event: "session_start" }, { observations: ["project_instructions"] });
    appendVerificationEvent(root, { ...verified, event: "prompt_submit" });
    appendVerificationEvent(root, { ...verified, event: "tool_before" }, { observations: ["pre_mutation_gate"] });
    appendVerificationEvent(root, { ...verified, event: "tool_after" }, { skill });
    appendVerificationEvent(root, { ...verified, event: "stop" }, {
      decision: { action: "continue", disposition: "request_continuation", workStatus: "continue_autonomously", workStatusRevision: 1, continuationRequestId: "request-1", shouldDeliver: true }
    });
    appendVerificationEvent(root, { ...verified, event: "assistant_response" });
    const result = verifyRuntimeEvidence(root, "codebuddy", { verificationRunId: "verified" });
    assert.equal(result.status, "runtime_observed");
    assert.equal(result.hostVersion, "test-host-1");
    assert.equal(result.hostVersionSource, "user_reported");
    assert.ok(result.capabilities);
    assert.equal(result.capabilities.project_instructions.result, "passed");
    assert.equal(result.capabilities.skill_read.evidenceLevel, "runtime_observed");
    assert.equal(result.capabilities.automatic_continuation.result, "passed");
    assert.equal(result.capabilities.work_status_matrix.result, "not_tested");
    assert.equal(JSON.stringify(result).includes("host_verified"), false);
    assert.equal(JSON.stringify(result).includes("behavior_verified"), false);
    const eventsFile = path.join(root, ".harness", "runtime", "probes", "verified", "events.jsonl");
    const eventsSource = readFileSync(eventsFile, "utf8");
    assert.equal(eventsSource.includes(path.resolve(root)), false);
    const events = eventsSource.trim().split(/\r?\n/).map((line): VerificationEventFixture => JSON.parse(line) as VerificationEventFixture);
    assert.ok(events.every((event) => !("sessionId" in event)));
    const stopEvent = events.find((event) => event.event === "stop");
    assert.ok(stopEvent?.decision);
    assert.equal(stopEvent.decision.workStatusRevision, 1);
    assert.ok(stopEvent.sessionIdHash);
    assert.match(stopEvent.sessionIdHash, /^[a-f0-9]{64}$/);
    assert.equal(stopEvent.cwd, ".");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime verification rejects evidence outside the Harness root", async () => {
  const { appendVerificationEvent, beginVerificationRun, verifyRuntimeEvidence } = await import("../core/verification.ts");
  const root = tempHarness();
  const outside = mkdtempSync(path.join(os.tmpdir(), "lumine-evidence-outside-"));
  try {
    beginVerificationRun(root, "codebuddy", { verificationRunId: "outside-root", hostVersion: "test-host-1" });
    appendVerificationEvent(root, { product: "codebuddy", sessionId: "outside-root", cwd: outside, event: "session_start" });
    assert.equal(verifyRuntimeEvidence(root, "codebuddy", { verificationRunId: "outside-root" }).status, "failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("runtime verification can observe two isolated session streams in one explicit probe", async () => {
  const { appendVerificationEvent, beginVerificationRun, verifyRuntimeEvidence } = await import("../core/verification.ts");
  const root = tempHarness();
  try {
    beginVerificationRun(root, "codebuddy", { verificationRunId: "two-sessions", hostVersion: "test-host" });
    for (const [sessionId, requestId] of [["session-a", "request-a"], ["session-b", "request-b"]] as const) {
      const input: HarnessSessionInput = { product: "codebuddy", sessionId, cwd: root };
      appendVerificationEvent(root, { ...input, event: "session_start" });
      appendVerificationEvent(root, { ...input, event: "stop" }, {
        decision: {
          action: "continue",
          disposition: "request_continuation",
          workStatus: "continue_autonomously",
          workStatusRevision: 1,
          continuationRequestId: requestId,
          shouldDeliver: true
        }
      });
    }
    const result = verifyRuntimeEvidence(root, "codebuddy", { verificationRunId: "two-sessions" });
    assert.equal(result.status, "runtime_observed");
    assert.ok(result.capabilities);
    assert.equal(result.capabilities.session_isolation.result, "passed");
    assert.equal(result.capabilities.session_isolation.evidenceLevel, "runtime_observed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
