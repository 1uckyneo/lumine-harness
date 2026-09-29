import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadProjectConfig, resolveProjectPath } from "../core/project-config.ts";
import { canonicalSkillsRoot, findHarnessRoot } from "../core/root-resolver.ts";
import { acceptanceSections, checkDocumentContracts, contentHash, resolveDocument } from "../core/documents.ts";
import { bindTask, checkSessionCompletion, checkTask, saveTaskRecord, taskRecordPath, type TaskRecord } from "../core/task-contract.ts";
import { normalizeHookInput } from "../core/hook-io.ts";
import { recordPromptRoute, routeHarnessPhase, suggestHarnessPhases, markExpectedSkillRead } from "../core/phase-router.ts";
import { getSharedSkill, searchSharedSkills } from "../core/skill-catalog.ts";
import { initializeSessionState, readSessionState, recordUsedSkill, recordUserTurn } from "../core/work-status.ts";
import { evaluateStopPolicy } from "../core/stop-policy.ts";
import { buildSessionStartContext } from "../core/session-context.ts";
import { applyDocumentOperation, prepareDocumentRename, recoverDocumentOperation, renameDocument, resolveCurrentDocument } from "../core/document-operations.ts";
import { commandLocale, formatCommandError, formatHumanIssue } from "../core/messages.ts";
import { runChecks } from "../check.ts";

function write(root: string, file: string, text: string): void { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); }
function fixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-v2-test-"));
  write(root, ".lumine/root.json", JSON.stringify({ schemaVersion: 2, kind: "lumine-root", skills: ".agents/skills" }));
  write(root, ".lumine/project.json", JSON.stringify({ schemaVersion: 2, workflowVersion: 2, locale: "en", repositories: [{ id: "app", path: "app" }], wiki: { root: "docs/repo-wiki", watchScopes: [{ repoId: "app", path: "src" }] } }));
  write(root, "app/src/main.ts", "export const result = 1;\n");
  for (const name of ["lumine-plan", "lumine-run", "lumine-knowledge", "lumine-design"]) write(root, `.agents/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Project ${name} context\nkeywords: ["knowledge", "知识"]\n---\n# Instructions\nRead the current project.\n`);
  return root;
}
function spec(root: string): void {
  write(root, "docs/product-specs/产品方案.md", `---\nid: spec-search\ntype: product-spec\nstatus: active\nlocale: zh-CN\n---\n# 搜索\n\n### AC-001：可查询内容\n用户能够查询相关知识。\n\n### AC-002: Preserve context\nExisting context remains available.\n`);
  write(root, "docs/exec-plans/active/搜索计划.md", `---\nid: plan-search\ntype: exec-plan\nstatus: active\nspecId: spec-search\n---\n# 实施搜索\nSmall, verifiable changes.\n`);
}
function task(root: string): TaskRecord {
  spec(root);
  write(root, "docs/validation/search/output.txt", "node test: passed\n");
  const criterion = acceptanceSections(resolveDocument(root, "spec-search"))[0];
  return {
    schemaVersion: 2, taskId: "search", mode: "implement", goal: "Implement scoped search", scope: "app/src/main.ts",
    specRef: "spec-search", planRef: "plan-search",
    acceptanceRefs: [{ specId: "spec-search", acId: criterion.acId, baselineHash: criterion.baselineHash }],
    evidence: [{ specId: "spec-search", acId: criterion.acId, artifact: "docs/validation/search/output.txt", sha256: contentHash(readFileSync(path.join(root, "docs/validation/search/output.txt"))), outcome: "passed", observedAt: new Date().toISOString(), command: "node test", environment: "local fixture", codeRefs: [{ repoId: "app", path: "src/main.ts", sha256: contentHash(readFileSync(path.join(root, "app/src/main.ts"))) }] }],
    knowledge: { required: false, status: "not_applicable", refs: [] }
  };
}

test("v2 roots work across nested Git boundaries and canonical source assets", () => {
  const root = fixture();
  try {
    mkdirSync(path.join(root, "app/.git"));
    assert.equal(findHarnessRoot(path.join(root, "app/src")), root);
    write(root, ".lumine/root.json", JSON.stringify({ kind: "lumine-root", schemaVersion: 2, skills: "package/assets/skills" }));
    assert.equal(canonicalSkillsRoot(root), path.join(root, "package/assets/skills"));
    write(root, "app/.lumine/root.json", JSON.stringify({ kind: "lumine-root", schemaVersion: 1 }));
    assert.throws(() => findHarnessRoot(path.join(root, "app/src")), /Invalid Lumine/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("configuration supports non-Git missing source directories and rejects escapes", () => {
  const root = fixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), "lumine-outside-"));
  try {
    const config = loadProjectConfig(root);
    assert.equal(config.wiki.maxCards, 6);
    assert.throws(() => resolveProjectPath(root, "../outside"), /escapes/);
    symlinkSync(outside, path.join(root, "escape"));
    assert.throws(() => resolveProjectPath(root, "escape/new/file.md"), /symlink/);
    write(root, ".lumine/project.json", JSON.stringify({ repositories: [{ id: "future", path: "not-cloned-yet" }] }));
    assert.equal(loadProjectConfig(root).repositories[0].id, "future");
    assert.equal(loadProjectConfig(root).locale, "en");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("natural language and business knowledge terms only discover candidates without a gate or mode", () => {
  assert.equal(routeHarnessPhase("先做产品方案，不要实施"), null);
  assert.equal(routeHarnessPhase("开始实施技术方案"), null);
  assert.equal(routeHarnessPhase("run check health"), null);
  assert.equal(routeHarnessPhase("比较 lumine-plan、lumine-run、lumine-design 和 lumine-knowledge 的职责"), null);
  assert.equal(routeHarnessPhase("不要使用 lumine-run"), null);
  assert.equal(routeHarnessPhase("请使用 lumine-run")?.id, "run");
  assert.equal(routeHarnessPhase("$lumine-run")?.id, "run");
  assert.equal(routeHarnessPhase("$lumine-harness-check"), null);
  assert.ok(suggestHarnessPhases("修复产品知识库页面，并讨论交互和产品方案").length > 1);
  const root = fixture();
  try {
    const input = normalizeHookInput("qoder", "prompt_submit", { cwd: root, session_id: "routing" });
    initializeSessionState(root, input);
    for (const prompt of ["修复业务知识库的搜索结果", "诊断并修复失败", "只诊断失败，不要修复", "先讨论页面设计和技术方案，再决定是否实施", "lumine-plan 负责方案，lumine-run 负责实施", "比较 lumine-knowledge 与 lumine-run"]) {
      const state = recordPromptRoute(root, input, prompt);
      assert.deepEqual(state.expectedSkills, [], prompt);
      assert.equal(state.requestedActivity ?? null, null, prompt);
    }
    const direct = recordPromptRoute(root, input, "run check health");
    assert.deepEqual(direct.expectedSkills, []);
    assert.ok(searchSharedSkills(root, "知识").length);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("canonical Skill reads are reused only for the exact current content hash", () => {
  const root = fixture();
  try {
    const input = normalizeHookInput("qoder", "prompt_submit", { cwd: root, session_id: "reads" });
    initializeSessionState(root, input);
    const first = recordPromptRoute(root, input, "$lumine-run");
    assert.equal(first.expectedSkillRead, false);
    const skill = getSharedSkill(root, "lumine-run")!;
    const read = markExpectedSkillRead(root, input, first, skill.file);
    assert.equal(read.expectedSkillRead, true);
    recordUsedSkill(root, input, skill);
    assert.equal(recordPromptRoute(root, input, "继续实现").expectedSkillRead, true);
    writeFileSync(skill.file, `${readFileSync(skill.file, "utf8")}\nNew workflow instruction.\n`);
    const changed = recordPromptRoute(root, input, "继续实现");
    assert.equal(changed.expectedSkillRead, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("stable document and AC IDs support Chinese filenames without fixed headings", () => {
  const root = fixture();
  try {
    spec(root);
    assert.deepEqual(checkDocumentContracts(root), []);
    assert.equal(resolveDocument(root, "spec-search").file, "docs/product-specs/产品方案.md");
    assert.equal(acceptanceSections(resolveDocument(root, "spec-search")).length, 2);
    write(root, "docs/product-specs/重复.md", readFileSync(path.join(root, "docs/product-specs/产品方案.md"), "utf8"));
    assert.ok(checkDocumentContracts(root).some((item) => item.code === "DUPLICATE_DOC_ID"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("task evidence binds the exact artifact, source file and selected acceptance section", () => {
  const root = fixture();
  try {
    saveTaskRecord(root, task(root));
    assert.equal(checkTask(root, "search").ok, true);
    const specFile = path.join(root, "docs/product-specs/产品方案.md");
    writeFileSync(specFile, readFileSync(specFile, "utf8").replace("Existing context remains available.", "Existing unrelated context stays available."));
    assert.equal(checkTask(root, "search").ok, true, "unrelated AC changes do not invalidate this task");
    writeFileSync(specFile, readFileSync(specFile, "utf8").replace("用户能够查询相关知识。", "用户能够查询并导出相关知识。"));
    assert.ok(checkTask(root, "search").issues.some((item) => item.code === "AC_BASELINE_CHANGED"));
    write(root, "app/src/main.ts", "export const result = 2;\n");
    assert.ok(checkTask(root, "search").issues.some((item) => item.code === "CODE_BASELINE_CHANGED"));
    write(root, "docs/validation/search/output.txt", "replaced result\n");
    assert.ok(checkTask(root, "search").issues.some((item) => item.code === "EVIDENCE_CHANGED"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("another task's AC, absent proof and an unsynchronized knowledge obligation cannot close implementation", () => {
  const root = fixture();
  try {
    const record = task(root);
    record.evidence[0].acId = "AC-002";
    record.knowledge = { required: true, status: "pending", refs: [] };
    saveTaskRecord(root, record);
    const errors = checkTask(root, "search").issues.map((item) => item.code);
    assert.ok(errors.includes("UNSCOPED_EVIDENCE"));
    assert.ok(errors.includes("AC_NOT_VERIFIED"));
    assert.ok(errors.includes("KNOWLEDGE_PENDING"));
    assert.throws(() => saveTaskRecord(root, record), /--expect/);
    const hash = contentHash(readFileSync(taskRecordPath(root, record.taskId)));
    record.evidence = [];
    saveTaskRecord(root, record, hash);
    assert.ok(checkTask(root, "search").issues.some((item) => item.code === "MISSING_IMPLEMENTATION_EVIDENCE"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("task knowledge references accept Wiki IDs and preserve them across readable renames", () => {
  const root = fixture();
  try {
    const configFile = path.join(root, ".lumine/project.json");
    const config = JSON.parse(readFileSync(configFile, "utf8"));
    config.wiki.root = "docs/knowledge";
    writeFileSync(configFile, JSON.stringify(config));
    const oldPath = "docs/knowledge/搜索机制.md";
    const newPath = "docs/knowledge/中文 名称/查询原理.md";
    write(root, oldPath, "---\nid: knowledge-search\ntitle: 搜索机制\ntype: architecture\nstatus: current\nlocale: zh-CN\nrepositories: [app]\nsources:\n  - id: search-source\n    repoId: app\n    path: src/main.ts\n---\n# 搜索机制\n查询保留已有上下文。\n");
    const disposition = "docs/validation/search/knowledge-disposition.md";
    write(root, disposition, "# 知识同步记录\n已核对本次搜索机制，无其他受影响页面。\n");
    const record = task(root);
    record.knowledge = { required: true, status: "synchronized", refs: ["knowledge-search", oldPath, disposition] };
    saveTaskRecord(root, record);
    const originalTask = readFileSync(taskRecordPath(root, record.taskId), "utf8");
    assert.equal(checkTask(root, record.taskId).ok, true, "Wiki ID and plain disposition path are valid references");
    renameDocument(root, "knowledge-search", newPath, contentHash(readFileSync(path.join(root, oldPath))));
    assert.equal(existsSync(path.join(root, oldPath)), false);
    assert.equal(resolveCurrentDocument(root, "knowledge-search").file, newPath);
    assert.equal(readFileSync(taskRecordPath(root, record.taskId), "utf8"), originalTask, "rename does not rewrite the task's stable reference");
    assert.equal(checkTask(root, record.taskId).ok, true, "stable ID and saved old-path alias survive a readable rename");
    rmSync(path.join(root, newPath));
    assert.equal(checkTask(root, record.taskId).issues.filter((item) => item.code === "KNOWLEDGE_REF_MISSING").length, 2, "missing Wiki ID and alias are not accepted as synchronized knowledge");
    record.knowledge.refs = [disposition, "../outside.md", "docs/knowledge"];
    saveTaskRecord(root, record, contentHash(originalTask));
    assert.equal(checkTask(root, record.taskId).issues.filter((item) => item.code === "KNOWLEDGE_REF_MISSING").length, 2, "escaping paths and directories cannot substitute for knowledge evidence");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("diagnostics can finish with failures without authorizing repairs or requiring an implementation task", () => {
  const root = fixture();
  try {
    const input = normalizeHookInput("codex", "stop", { cwd: root, session_id: "diagnosis", last_assistant_message: "Found a failure. WORK_STATUS: done" });
    initializeSessionState(root, input);
    recordPromptRoute(root, input, "只诊断失败，不要修复");
    assert.equal(evaluateStopPolicy(input, { root }).action, "allow");
    const record = task(root); record.evidence = []; saveTaskRecord(root, record);
    bindTask(root, input.product, input.sessionId!, record.taskId, "diagnose");
    assert.equal(evaluateStopPolicy(input, { root, runCheck: () => ({ ok: false, output: "Diagnostic found a failure" }) }).action, "allow");
    const implementation = normalizeHookInput("codex", "stop", { cwd: root, session_id: "implementation", last_assistant_message: "WORK_STATUS: done" });
    initializeSessionState(root, implementation);
    bindTask(root, implementation.product, implementation.sessionId!, record.taskId);
    recordPromptRoute(root, implementation, "仅提及诊断相关能力");
    assert.equal(evaluateStopPolicy(implementation, { root }).disposition, "reject_completion");
    assert.equal(checkSessionCompletion(root, { requestedActivity: "check" }).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a new user turn cannot reuse another turn's task binding or diagnostic mode", () => {
  const root = fixture();
  try {
    saveTaskRecord(root, task(root));
    const input = normalizeHookInput("qoder", "prompt_submit", { cwd: root, session_id: "turns" });
    initializeSessionState(root, input);
    bindTask(root, input.product, input.sessionId!, "search");
    assert.equal(checkSessionCompletion(root, readSessionState(root, input.product, input.sessionId)!).ok, true);
    recordUserTurn(root, { ...input, userTurnId: "second" });
    assert.equal(readSessionState(root, input.product, input.sessionId)?.requestedActivity, null);
    const fresh = recordPromptRoute(root, input, "开始实施新范围");
    assert.equal(fresh.requestedActivity, null, "a new prompt alone cannot assign an implementation mode");
    assert.equal(checkSessionCompletion(root, { ...fresh, requestedActivity: "implement" }).issues[0]?.code, "TASK_NOT_BOUND");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("document check is read-only and session guidance is localized without workflow duplicates", () => {
  const root = fixture();
  try {
    spec(root);
    assert.equal(runChecks(root, "docs").ok, true);
    const english = buildSessionStartContext({ root });
    assert.match(english, /wiki query/);
    assert.doesNotMatch(english, /docs\/drafts|docs\/generated|lumine-harness-check/);
    const file = path.join(root, ".lumine/project.json");
    const config = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...config, locale: "zh-CN" }));
    assert.match(buildSessionStartContext({ root }), /仅诊断或验证可以报告失败后完成/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("a newer failed verification cannot be hidden by earlier passed evidence", () => {
  const root = fixture();
  try {
    const record = task(root);
    record.evidence[0].observedAt = new Date(Date.now() - 10000).toISOString();
    record.evidence.push({ ...record.evidence[0], outcome: "failed", observedAt: new Date().toISOString() });
    saveTaskRecord(root, record);
    assert.ok(checkTask(root, "search").issues.some((item) => item.code === "CURRENT_VALIDATION_NOT_PASSED"));
    assert.equal(checkTask(root, "search", "diagnose").ok, true, "validly recorded failures are a completed diagnostic, not permission to repair");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("AC sections include heading-like examples inside fenced blocks", () => {
  const root = fixture();
  try {
    spec(root);
    const file = path.join(root, "docs/product-specs/产品方案.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("用户能够查询相关知识。", "用户能够查询相关知识。\n```markdown\n## 示例标题\n### AC-999: only an example\n```\n补充条件。"));
    const sections = acceptanceSections(resolveDocument(root, "spec-search"));
    assert.equal(sections.length, 2);
    assert.match(sections[0].content, /补充条件/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("project-owned checks preserve repository and architecture boundaries without fixed global headings", () => {
  const root = fixture();
  try {
    const file = path.join(root, ".lumine/project.json");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), extensions: { projectChecks: ".lumine/project-checks/contracts.json" } }));
    write(root, "ARCHITECTURE.md", "# Architecture\nParent owns workflow; app owns its source.\n");
    write(root, ".lumine/project-checks/contracts.json", JSON.stringify({ schemaVersion: 1, expectedRepositories: [{ id: "app", path: "app" }], selectedAdapters: [], documents: [{ path: "ARCHITECTURE.md", requiredText: ["Parent owns workflow"], forbiddenText: ["merge all repositories"] }] }));
    assert.equal(runChecks(root, "architecture").ok, true);
    write(root, "ARCHITECTURE.md", "# Architecture\nmerge all repositories\n");
    assert.equal(runChecks(root, "project").issues.length, 2);
    write(root, "docs/design-docs/Choice.md", "# Design choice\nUse the existing approved external design.\n");
    assert.equal(runChecks(root, "design", "docs/design-docs/Choice.md").ok, true, "no fixed bundle is required");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("document rename preserves stable IDs, diagrams and AC hashes and updates current links", () => {
  const root = fixture();
  try {
    spec(root);
    const oldFile = "docs/product-specs/产品方案.md";
    const newFile = "docs/product-specs/中文 方案/搜索方案.md";
    const before = readFileSync(path.join(root, oldFile), "utf8").replace("用户能够查询相关知识。", "用户能够查询相关知识。[说明](../repo-wiki/机制.md#flow)");
    write(root, oldFile, before);
    write(root, "docs/repo-wiki/机制.md", "---\nid: knowledge-mechanism\ntype: architecture\nstatus: current\n---\n# 机制\n```mermaid diagramId=flow\ngraph TD\n A-->B\n```\n[产品](../product-specs/产品方案.md#AC-001)\n");
    write(root, "docs/validation/original.md", "[原始方案](../product-specs/产品方案.md)\n");
    write(root, "README.md", "[Spec](docs/product-specs/产品方案.md#AC-001)\n`[literal](docs/product-specs/产品方案.md)`\n");
    const originalAC = acceptanceSections(resolveDocument(root, "spec-search"))[0].baselineHash;
    const op = renameDocument(root, "搜索", newFile, contentHash(before));
    assert.equal(op.status, "complete");
    assert.equal(existsSync(path.join(root, oldFile)), false, "no compatibility stub is emitted");
    assert.equal(resolveDocument(root, oldFile).docId, "spec-search");
    assert.equal(resolveCurrentDocument(root, "spec-search").file, newFile);
    assert.equal(acceptanceSections(resolveDocument(root, "spec-search"))[0].baselineHash, originalAC);
    assert.match(readFileSync(path.join(root, "docs/repo-wiki/机制.md"), "utf8"), /diagramId=flow/);
    assert.match(readFileSync(path.join(root, "README.md"), "utf8"), /%E4%B8%AD%E6%96%87%20/);
    assert.match(readFileSync(path.join(root, "README.md"), "utf8"), /`\[literal\]\(docs\/product-specs\/产品方案.md\)`/);
    assert.equal(readFileSync(path.join(root, "docs/validation/original.md"), "utf8"), "[原始方案](../product-specs/产品方案.md)\n");
    const renamed = resolveDocument(root, "spec-search");
    write(root, newFile, renamed.source.replace("# 搜索\n", "# 更容易读的标题\n"));
    assert.equal(acceptanceSections(resolveDocument(root, "spec-search"))[0].baselineHash, originalAC);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rename rejects Unicode and case collisions and ambiguous human names", () => {
  const root = fixture();
  try {
    spec(root);
    const source = resolveDocument(root, "spec-search");
    write(root, "docs/product-specs/Café.md", "---\nid: spec-other\ntype: product-spec\nstatus: active\n---\n# 搜索\n");
    assert.throws(() => prepareDocumentRename(root, "spec-search", "docs/product-specs/CAFE\u0301.md", contentHash(source.source)), /collides/);
    assert.throws(() => resolveCurrentDocument(root, "搜索"), /ambiguous/);
    assert.throws(() => prepareDocumentRename(root, "spec-search", "docs/validation/new.md", contentHash(source.source)), /current document/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rename journals recover interrupted writes and preserve edits made after preparation", () => {
  const root = fixture();
  try {
    spec(root);
    write(root, "README.md", "[Spec](docs/product-specs/产品方案.md)\n");
    const before = resolveDocument(root, "spec-search");
    const op = prepareDocumentRename(root, "spec-search", "docs/product-specs/新方案.md", contentHash(before.source));
    const readme = op.mutations.find((item) => item.path === "README.md")!;
    write(root, "README.md", "A human has rewritten this page.\n");
    assert.throws(() => applyDocumentOperation(root, op), /conflict/);
    assert.equal(readFileSync(path.join(root, "README.md"), "utf8"), "A human has rewritten this page.\n");
    assert.equal(existsSync(path.join(root, op.to)), true, "the first atomic write was journaled before the conflict");
    write(root, "README.md", readme.before!);
    assert.equal(recoverDocumentOperation(root, op.operationId).status, "complete");
    assert.equal(resolveDocument(root, op.from).docId, "spec-search");
    assert.equal(recoverDocumentOperation(root, op.operationId, true).status, "rolled_back");
    assert.equal(existsSync(path.join(root, op.from)), true);
    assert.equal(existsSync(path.join(root, op.to)), false);
    assert.equal(readFileSync(path.join(root, "README.md"), "utf8"), readme.before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("migration awaiting host verification permits diagnostics with an explicit partial-state notice", () => {
  const root = fixture();
  try {
    write(root, ".lumine/root.json", JSON.stringify({ kind: "lumine-root", schemaVersion: 2, migrationStatus: "applied" }));
    assert.equal(findHarnessRoot(root), root);
    assert.match(buildSessionStartContext({ root }), /Migration is not fully complete/);
    write(root, ".lumine/root.json", JSON.stringify({ kind: "lumine-root", schemaVersion: 2, migrationStatus: "applying" }));
    assert.throws(() => findHarnessRoot(root), /still applying/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Chinese command diagnostics explain the finding and next action while keeping machine codes stable", () => {
  const root = fixture();
  try {
    const config = path.join(root, ".lumine/project.json");
    writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), locale: "zh-CN" }));
    assert.equal(commandLocale(["--root", root]), "zh-CN");
    const issue = { code: "AC_BASELINE_CHANGED", message: "Acceptance changed: spec/AC-001", remediation: "Review semantic impact." };
    const text = formatHumanIssue(issue, "zh-CN");
    assert.match(text, /AC_BASELINE_CHANGED/);
    assert.match(text, /验收条目发生变化/);
    assert.match(text, /不机械地重新申请批准/);
    assert.match(formatCommandError(new Error("Document changed; provide --expect"), "zh-CN"), /重新读取目标及其 sha256/);
    assert.match(formatHumanIssue(issue, "en"), /Review semantic impact/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("session identity cannot collide through punctuation normalization", () => {
  const root = fixture();
  try {
    const first = { product: "codex" as const, sessionId: "same/a", cwd: root };
    const second = { ...first, sessionId: "same?a" };
    initializeSessionState(root, first);
    initializeSessionState(root, second);
    assert.equal(readSessionState(root, first.product, first.sessionId)?.sessionId, first.sessionId);
    assert.equal(readSessionState(root, second.product, second.sessionId)?.sessionId, second.sessionId);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("bound task mode and selected Skills survive mixed keyword mentions without acquiring extra gates", () => {
  const root = fixture();
  try {
    const record = task(root); record.mode = "diagnose"; record.selectedSkills = ["lumine-run"]; saveTaskRecord(root, record);
    const input = normalizeHookInput("qoder", "prompt_submit", { cwd: root, session_id: "mode" });
    initializeSessionState(root, input);
    const bound = bindTask(root, input.product, input.sessionId!, record.taskId);
    assert.equal(bound.requestedActivity, "diagnose");
    assert.deepEqual(bound.expectedSkills?.map((skill) => skill.name), ["lumine-run"]);
    const routed = recordPromptRoute(root, input, "检查产品知识库的页面设计与技术方案；lumine-plan 与 lumine-knowledge 也相关");
    assert.equal(routed.requestedActivity, "diagnose");
    assert.deepEqual(routed.expectedSkills?.map((skill) => skill.name), ["lumine-run"]);
    assert.ok((routed.skillCandidates?.length ?? 0) > 1);
    assert.equal(checkSessionCompletion(root, routed).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("an unknown explicit name is diagnostic data and cannot poison later task binding", () => {
  const root = fixture();
  try {
    saveTaskRecord(root, task(root));
    const input = normalizeHookInput("qoder", "prompt_submit", { cwd: root, session_id: "unknown-skill" });
    initializeSessionState(root, input);
    const state = recordPromptRoute(root, input, "$uninstalled-skill $lumine-run");
    assert.deepEqual(state.selectedSkills, ["lumine-run"]);
    assert.deepEqual(state.expectedSkills?.map((entry) => entry.name), ["lumine-run"]);
    assert.deepEqual(state.skillSelectionDiagnostics, [{ name: "uninstalled-skill", code: "unknown-skill" }]);
    assert.doesNotThrow(() => bindTask(root, input.product, input.sessionId!, "search"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
