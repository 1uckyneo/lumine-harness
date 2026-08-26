import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findHarnessRoot, isStartedAtHarnessRoot } from "./core/root-resolver.mjs";
import { discoverSharedSkills, getSharedSkill, inspectSharedSkillCatalog, searchSharedSkills } from "./core/skill-catalog.mjs";
import { listCurrentSessionPointers, readCurrentSessionPointer, recordWorkStatus, WORK_STATUSES } from "./core/work-status.mjs";
import { beginVerificationRun, verifyRuntimeEvidence } from "./core/verification.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS = ["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"];
const KIMI_BEGIN = "# BEGIN lumine-harness adapter (managed)";
const KIMI_END = "# END lumine-harness adapter (managed)";
const LEGACY_KIMI_BEGIN = "# BEGIN harness-engineering adapter (managed)";
const LEGACY_KIMI_END = "# END harness-engineering adapter (managed)";

const STATUS_LABELS = Object.freeze({
  ready: "可以正常使用",
  needs_setup: "需要完成一次设置",
  manual_automation: "基本流程可用但部分自动化需手动",
  unverified: "尚未完成真实验证",
  connection_error: "连接异常"
});

const CAPABILITY_LABELS = Object.freeze({
  project_instructions: "项目指令",
  session_context: "会话入口",
  skill_discovery: "Skill 发现",
  skill_read: "Skill 读取",
  pre_mutation_gate: "首次修改前门禁",
  stop_gate: "结束前门禁",
  automatic_continuation: "自动续跑",
  work_status_matrix: "状态转换",
  session_isolation: "会话隔离"
});

const EVIDENCE_LEVEL_RANK = Object.freeze({
  official_declared: 0,
  repository_checked: 1,
  runtime_observed: 2,
  behavior_verified: 3
});

const RUNTIME_EVIDENCE_LEVELS = new Set(["runtime_observed", "behavior_verified"]);

function capabilities(root) {
  return JSON.parse(readFileSync(path.join(root, ".harness", "adapter-capabilities.json"), "utf8"));
}

function projectConfig(root) {
  const file = path.join(root, ".harness", "project.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function selectedAdapters(root) {
  const selected = projectConfig(root)?.selectedAdapters;
  if (Array.isArray(selected)) return selected.filter((product) => PRODUCTS.includes(product));
  return PRODUCTS.filter((product) => existsSync(entry(root, product)) && !["kimi", "zcode", "deepseek-harness"].includes(product));
}

function entry(root, product) {
  return {
    codex: path.join(root, ".codex", "hooks.json"),
    qoder: path.join(root, ".qoder", "settings.json"),
    trae: path.join(root, ".trae", "hooks.json"),
    kimi: path.join(root, ".harness", "adapters", "kimi", "hooks", "dispatch.mjs"),
    cursor: path.join(root, ".cursor", "hooks.json"),
    opencode: path.join(root, ".opencode", "plugins", "harness.mjs"),
    zcode: path.join(root, ".harness", "adapters", "zcode", "marketplace", "marketplace.json"),
    codebuddy: path.join(root, ".codebuddy", "settings.json"),
    "deepseek-harness": path.join(root, ".harness", "adapters", "deepseek-harness", "bundle", "package.json")
  }[product];
}

function forbidden(root) {
  return [
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
  ]
    .filter((item) => existsSync(path.join(root, item)));
}

function importsRootAgents(root, file) {
  const source = readFileSync(file, "utf8");
  const rootAgents = path.resolve(root, "AGENTS.md");
  return [...source.matchAll(/(?:^|\s)@([^\s]+)/gm)]
    .some((match) => path.resolve(path.dirname(file), match[1]) === rootAgents);
}

function raiseDoctorStatus(current, next) {
  const rank = {
    repository_ready: 0,
    partial: 1,
    needs_manual_app_step: 2,
    not_installed: 3,
    error: 4
  };
  return (rank[next] ?? 0) > (rank[current] ?? 0) ? next : current;
}

function isCursorRestricted(options = {}) {
  if (typeof options.cursorRestricted === "boolean") return options.cursorRestricted;
  const env = options.env ?? process.env;
  const restricted = String(env.CURSOR_WORKSPACE_RESTRICTED ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "restricted", "untrusted"].includes(restricted)) return true;
  const trust = String(env.CURSOR_WORKSPACE_TRUST ?? "").trim().toLowerCase();
  return ["restricted", "untrusted", "false", "0"].includes(trust);
}

function inspectRoutedSkillCatalog(root, product, messages) {
  if (!["qoder", "zcode", "codebuddy"].includes(product)) return null;
  const catalog = inspectSharedSkillCatalog(root);
  if (catalog.skills.length) {
    messages.push(`已发现 ${catalog.skills.length} 个可读取的公共 Skill；内容只来自 .agents/skills。`);
  }
  if (catalog.diagnostics.length) {
    messages.push(`已隔离 ${catalog.diagnostics.length} 个无效 Skill，其余有效 Skill 不受影响。`);
  }
  return {
    valid: catalog.skills.length,
    invalid: catalog.diagnostics.length,
    diagnostics: catalog.diagnostics
  };
}

export function listAdapters(root = findHarnessRoot(process.cwd())) {
  if (!root) throw new Error("Harness root not found.");
  const manifest = capabilities(root);
  const selected = new Set(selectedAdapters(root));
  return PRODUCTS.map((product) => ({ product, selected: selected.has(product), ...manifest.products[product] }));
}

export function hasManagedKimiBlock(configFile) {
  if (!existsSync(configFile)) return false;
  const source = readFileSync(configFile, "utf8");
  return source.includes(KIMI_BEGIN) || source.includes(LEGACY_KIMI_BEGIN);
}

export function doctorAdapter(product, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = findHarnessRoot(cwd);
  if (!PRODUCTS.includes(product)) return { product, status: "error", messages: [`未知的 Agent：${product}`] };
  if (!root) return { product, status: "error", messages: ["请从包含 .harness/root.json 的工程根目录运行检查。"] };
  if (!selectedAdapters(root).includes(product)) return { product, status: "not_selected", root, capability: capabilities(root).products[product], messages: ["当前工程没有选择这个 Adapter。"] };
  const messages = [];
  let status = "repository_ready";
  if (!isStartedAtHarnessRoot(root, cwd)) {
    status = "error";
    messages.push(`请从 Harness 根目录启动 Agent：${root}。当前目录是 ${cwd}。`);
  }
  if (!existsSync(entry(root, product))) {
    status = raiseDoctorStatus(status, "not_installed");
    messages.push("工程中缺少对应的 Adapter 入口，请重新检查采用或升级配置。");
  }
  const copies = forbidden(root);
  if (copies.length) {
    status = "error";
    messages.push(`发现不应存在的产品级 Skill 或 Rules 副本：${copies.join(", ")}`);
  }

  const skillCatalog = inspectRoutedSkillCatalog(root, product, messages);
  if (skillCatalog && skillCatalog.valid === 0) {
    status = raiseDoctorStatus(status, "error");
    messages.push("没有可读取的公共 Skill，请先修复 .agents/skills。");
  }

  if (product === "qoder" && status !== "not_installed" && status !== "error") {
    messages.push("Qoder 通过 Adapter 按真实路径读取公共 Skill；自然语言隐式发现仍需在真实会话中确认。");
  }
  if (product === "trae" && status === "repository_ready") {
    status = "needs_manual_app_step";
    messages.push("请在 Trae 中启用项目 AGENTS.md、共享 Skills 和项目 Hooks，然后重新打开会话。");
  }
  if (product === "kimi") {
    const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
    if (!hasManagedKimiBlock(path.join(home, "config.toml"))) {
      status = raiseDoctorStatus(status, "needs_manual_app_step");
      messages.push("需要单独授权安装 Kimi Code 用户级 Hook，然后重新打开 Kimi Code。");
    }
    messages.push("Kimi Code 的 Hook 失败时默认放行，不能把它作为高风险操作的唯一安全门禁。");
  }
  if (product === "cursor" && status === "repository_ready" && isCursorRestricted(options)) {
    status = "needs_manual_app_step";
    messages.push("Cursor 当前处于受限状态，需先信任当前工程，项目 Hook 才能运行。");
  }
  if (product === "opencode" && status !== "not_installed" && status !== "error") {
    status = "partial";
    messages.push("OpenCode 当前没有完整的停止前门禁；需要由人手动发起下一轮。");
  }
  if (product === "zcode" && status !== "not_installed" && status !== "error") {
    status = raiseDoctorStatus(status, "needs_manual_app_step");
    messages.push("请把本工程的 ZCode 本地 Plugin 加入并启用，然后从 Harness 根目录开启新会话。");
    messages.push("ZCode 通过 Adapter 按真实路径读取公共 Skill；自然语言隐式发现属于尽力支持。");
  }
  if (product === "codebuddy" && status !== "not_installed" && status !== "error") {
    const memoryFiles = [path.join(root, "CODEBUDDY.md"), path.join(root, ".codebuddy", "CODEBUDDY.md")].filter(existsSync);
    const shadowsAgents = memoryFiles.filter((file) => !importsRootAgents(root, file));
    if (shadowsAgents.length) {
      status = "error";
      messages.push(`以下 CodeBuddy 记忆文件会遮蔽根 AGENTS.md：${shadowsAgents.map((file) => path.relative(root, file)).join(", ")}。请删除它们或正确导入根 AGENTS.md。`);
    } else {
      status = raiseDoctorStatus(status, "needs_manual_app_step");
      messages.push("请在 CodeBuddy Code 的 /hooks 中审核项目 Hook 变更，然后从 Harness 根目录开启新会话。");
      messages.push("CodeBuddy 通过 Adapter 按真实路径读取公共 Skill；自然语言隐式发现属于尽力支持。");
    }
  }
  if (product === "deepseek-harness" && status !== "not_installed" && status !== "error") {
    status = raiseDoctorStatus(status, "needs_manual_app_step");
    messages.push("需要把本工程提供的本地 profile bundle 安装到准备使用的 DeepSeek Harness profile。");
    messages.push("当前仓库检查覆盖 @deepseek-ai/dsh 0.1.0-rc.7 与 @deepseek-ai/dsh-hooks-codex 0.1.0-rc.7；这不代表真实宿主已经验证通过。");
  }
  if (!messages.length) messages.push("工程侧 Adapter 配置已就绪；是否在真实 Agent 中生效还需要运行验证。");
  return { product, status, root, capability: capabilities(root).products[product], skillCatalog, messages };
}

export function verifyAdapter(product, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = findHarnessRoot(cwd);
  if (!root) return { product, status: "error", messages: ["没有找到 Harness 根目录。"] };
  const doctor = doctorAdapter(product, options);
  if (["error", "not_installed", "not_selected"].includes(doctor.status)) return doctor;
  return { ...verifyRuntimeEvidence(root, product, options), capability: capabilities(root).products[product] };
}

function mergeCapabilities(declared = {}, observed = {}) {
  const names = new Set([...Object.keys(declared), ...Object.keys(observed)]);
  return Object.fromEntries([...names].map((name) => {
    const baseline = declared[name] ?? { result: "not_tested", evidenceLevel: "official_declared" };
    const runtime = observed[name];
    if (!runtime) return [name, baseline];
    const baselineRank = EVIDENCE_LEVEL_RANK[baseline.evidenceLevel] ?? -1;
    const runtimeRank = EVIDENCE_LEVEL_RANK[runtime.evidenceLevel] ?? -1;
    return [name, runtimeRank > baselineRank ? runtime : baseline];
  }));
}

function isRuntimePass(capability) {
  return capability?.result === "passed" && RUNTIME_EVIDENCE_LEVELS.has(capability.evidenceLevel);
}

function manualSetupWasObserved(capability, runtime) {
  if (runtime.status !== "runtime_observed") return false;
  const setupCapabilities = Object.entries(capability.capabilities ?? {})
    .filter(([, value]) => value.result === "needs_setup")
    .map(([name]) => name);
  if (!setupCapabilities.length) return false;
  return setupCapabilities.every((name) => isRuntimePass(runtime.capabilities?.[name]));
}

function classifyProductStatus(product, capability, doctor, runtime, mergedCapabilities) {
  if (["error", "not_installed", "not_selected"].includes(doctor.status) || runtime.status === "failed") {
    return "connection_error";
  }
  if (doctor.status === "needs_manual_app_step" && !manualSetupWasObserved(capability, runtime)) {
    return "needs_setup";
  }
  if (runtime.status !== "runtime_observed") return "unverified";

  const basicNames = [
    "session_context",
    ...(capability.skills?.mode === "adapter-routed" ? ["skill_read"] : [])
  ];
  const basicObserved = basicNames.every((name) => isRuntimePass(mergedCapabilities[name]));
  const delivery = capability.continuation?.delivery;
  if (["manual_required", "unsupported"].includes(delivery)) {
    return basicObserved ? "manual_automation" : "unverified";
  }
  return basicObserved ? "ready" : "unverified";
}

function statusNextSteps(conclusion, product, doctor) {
  if (conclusion === "connection_error") return [`先修复 ${product} 的连接异常，再重新检查。`];
  if (conclusion === "needs_setup") {
    return doctor.messages?.length ? doctor.messages : [`完成 ${product} 的一次性设置后重新打开会话。`];
  }
  if (conclusion === "manual_automation") return ["基本流程可以使用；需要继续时，由人手动发起下一轮。"];
  if (conclusion === "unverified") {
    return [`当前会话还没有足够的真实证据。如需验证，请让 Agent 按 Adapter 高级验证流程为 ${product} 开始一次主动 Probe；否则保留“尚未完成真实验证”的结论。`];
  }
  return [];
}

function productStatus(root, product, options = {}) {
  const capability = capabilities(root).products[product];
  const doctor = doctorAdapter(product, { ...options, cwd: options.cwd ?? root });
  const runtime = verifyRuntimeEvidence(root, product, options);
  const mergedCapabilities = mergeCapabilities(capability?.capabilities, runtime.capabilities);
  const conclusion = classifyProductStatus(product, capability ?? {}, doctor, runtime, mergedCapabilities);
  return {
    product,
    conclusion,
    label: STATUS_LABELS[conclusion],
    setup: {
      status: doctor.status,
      messages: doctor.messages ?? []
    },
    continuation: capability?.continuation ?? { delivery: "unsupported", maxConsecutive: 0 },
    runtime: {
      status: runtime.status,
      hostVersion: runtime.hostVersion ?? "unknown",
      hostVersionSource: runtime.hostVersionSource ?? "unknown",
      observedAt: runtime.verifiedAt ?? null,
      evidence: runtime.evidence ?? null
    },
    capabilities: mergedCapabilities,
    skillCatalog: doctor.skillCatalog ?? null,
    nextSteps: statusNextSteps(conclusion, product, doctor)
  };
}

function freshCurrentPointers(root, options = {}) {
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.pointerMaxAgeMs ?? 24 * 60 * 60 * 1000);
  return listCurrentSessionPointers(root).filter((pointer) => {
    if (!PRODUCTS.includes(pointer.product)) return false;
    const updatedAt = Date.parse(pointer.updatedAt);
    return Number.isFinite(updatedAt) && now - updatedAt <= maxAgeMs;
  });
}

function identifyCurrentAdapter(root, options = {}) {
  const env = options.env ?? process.env;
  const explicitProduct = options.currentProduct ?? env.HARNESS_PRODUCT;
  const explicitSessionId = options.sessionId ?? env.HARNESS_SESSION_ID;
  if (explicitProduct) {
    if (!PRODUCTS.includes(explicitProduct)) {
      return { status: "invalid", source: "environment", product: null, reason: `HARNESS_PRODUCT 指向未知 Agent：${explicitProduct}` };
    }
    const pointer = readCurrentSessionPointer(root, explicitProduct);
    return {
      status: "identified",
      source: "environment",
      product: explicitProduct,
      hasSession: Boolean(explicitSessionId || pointer?.sessionId),
      pointerConflict: Boolean(explicitSessionId && pointer?.sessionId && explicitSessionId !== pointer.sessionId)
    };
  }

  let pointers = freshCurrentPointers(root, options);
  if (explicitSessionId) pointers = pointers.filter((pointer) => pointer.sessionId === explicitSessionId);
  if (pointers.length === 1) {
    return { status: "identified", source: "runtime_pointer", product: pointers[0].product, hasSession: true, pointerConflict: false };
  }
  if (pointers.length > 1) {
    return {
      status: "ambiguous",
      source: "runtime_pointer",
      product: null,
      reason: `发现 ${pointers.length} 个仍然有效的会话指针，无法确定当前 Agent。`
    };
  }
  return {
    status: "unknown",
    source: "unknown",
    product: null,
    reason: explicitSessionId ? "没有找到与当前会话标识匹配的运行指针。" : "没有找到可用于识别当前 Agent 的运行指针。"
  };
}

function aggregateConclusion(products) {
  const priority = ["connection_error", "needs_setup", "unverified", "manual_automation", "ready"];
  return priority.find((conclusion) => products.some((item) => item.conclusion === conclusion)) ?? "unverified";
}

export function adapterStatus(scope = "current", options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = options.root ?? findHarnessRoot(cwd);
  const generatedAt = new Date(options.now ?? Date.now()).toISOString();
  if (!root) {
    return {
      schemaVersion: 1,
      kind: "adapter_status",
      scope,
      conclusion: "connection_error",
      label: STATUS_LABELS.connection_error,
      summary: "没有找到 Harness 根目录。",
      source: "unknown",
      product: null,
      products: [],
      nextSteps: ["从包含 .harness/root.json 的工程根目录重新运行。"],
      generatedAt
    };
  }

  if (scope === "current") {
    const current = identifyCurrentAdapter(root, options);
    if (current.status !== "identified") {
      return {
        schemaVersion: 1,
        kind: "adapter_status",
        scope,
        conclusion: current.status === "invalid" ? "connection_error" : "unverified",
        label: STATUS_LABELS[current.status === "invalid" ? "connection_error" : "unverified"],
        summary: current.reason,
        source: current.source,
        product: null,
        products: [],
        nextSteps: ["请从目标工程根目录的新 Agent 会话中重新检查，或由 Adapter 显式提供 HARNESS_PRODUCT。"],
        generatedAt
      };
    }
    const status = productStatus(root, current.product, { ...options, cwd });
    const notes = current.pointerConflict ? ["显式会话标识与旧运行指针不一致；本次以显式环境为准。"] : [];
    return {
      schemaVersion: 1,
      kind: "adapter_status",
      scope,
      conclusion: status.conclusion,
      label: status.label,
      summary: `${current.product}：${status.label}`,
      source: current.source,
      product: current.product,
      products: [status],
      notes,
      nextSteps: status.nextSteps,
      generatedAt
    };
  }

  if (scope !== "selected") throw new Error("Usage: adapter status <current|selected> [--json]");
  const selected = selectedAdapters(root);
  const products = selected.map((product) => productStatus(root, product, { ...options, cwd }));
  const conclusion = aggregateConclusion(products);
  return {
    schemaVersion: 1,
    kind: "adapter_status",
    scope,
    conclusion,
    label: STATUS_LABELS[conclusion],
    summary: products.length ? `已汇总 ${products.length} 个已选择的 Adapter。` : "当前工程没有选择任何 Adapter。",
    source: "project_config",
    product: null,
    products,
    nextSteps: [...new Set(products.flatMap((item) => item.nextSteps))],
    generatedAt
  };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function managedBlock(dispatcher) {
  const command = `node "${String(dispatcher).replace(/"/g, '\\"')}"`;
  return [
    KIMI_BEGIN,
    "[[hooks]]",
    'event = "SessionStart"',
    'matcher = "startup|resume"',
    `command = ${tomlString(command)}`,
    "timeout = 30",
    "",
    "[[hooks]]",
    'event = "Stop"',
    `command = ${tomlString(command)}`,
    "timeout = 120",
    KIMI_END
  ].join("\n");
}

function stripBlock(source) {
  let result = source;
  for (const [begin, endMarker] of [[KIMI_BEGIN, KIMI_END], [LEGACY_KIMI_BEGIN, LEGACY_KIMI_END]]) {
    const start = result.indexOf(begin);
    const end = result.indexOf(endMarker);
    if ((start === -1) !== (end === -1)) throw new Error("Kimi config contains an incomplete Harness managed block.");
    if (start === -1) continue;
    if (result.indexOf(begin, start + begin.length) !== -1) throw new Error("Kimi config contains duplicate Harness managed blocks.");
    result = `${result.slice(0, start)}${result.slice(end + endMarker.length)}`;
  }
  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function validateCandidate(file, options = {}) {
  if (options.validate) return options.validate(file);
  const command = options.kimiCommand ?? "kimi";
  const result = spawnSync(command, ["doctor", "config", file], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    const source = readFileSync(file, "utf8");
    return source.includes(KIMI_BEGIN) === source.includes(KIMI_END);
  }
  return result.status === 0;
}

function backup(file) {
  if (!existsSync(file)) return null;
  const target = `${file}.harness-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(file, target);
  return target;
}

export function installKimiAdapter(options = {}) {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
  const config = path.join(home, "config.toml");
  const dispatcherDir = path.join(home, "lumine-harness-adapter");
  const dispatcher = path.join(dispatcherDir, "dispatch.mjs");
  mkdirSync(home, { recursive: true });
  const source = existsSync(config) ? readFileSync(config, "utf8") : "";
  const clean = stripBlock(source);
  const next = `${clean.trimEnd()}${clean.trim() ? "\n\n" : ""}${managedBlock(dispatcher)}\n`;
  const candidate = path.join(home, `.config.toml.harness-${process.pid}.tmp`);
  writeFileSync(candidate, next, "utf8");
  if (!validateCandidate(candidate, options)) {
    rmSync(candidate, { force: true });
    throw new Error("Kimi config validation failed; existing config was not modified.");
  }
  const backupFile = source ? backup(config) : null;
  mkdirSync(dispatcherDir, { recursive: true });
  writeFileSync(dispatcher, readFileSync(path.join(HERE, "adapters", "kimi", "installed-dispatcher.mjs"), "utf8"), "utf8");
  writeFileSync(config, next, "utf8");
  rmSync(candidate, { force: true });
  return { product: "kimi", status: "installed", configFile: config, dispatcher, backup: backupFile };
}

export function uninstallKimiAdapter(options = {}) {
  const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
  const config = path.join(home, "config.toml");
  if (!hasManagedKimiBlock(config)) return { product: "kimi", status: "not_installed" };
  const next = `${stripBlock(readFileSync(config, "utf8")).trimEnd()}\n`;
  const candidate = path.join(home, `.config.toml.harness-${process.pid}.tmp`);
  writeFileSync(candidate, next, "utf8");
  if (!validateCandidate(candidate, options)) {
    rmSync(candidate, { force: true });
    throw new Error("Kimi config validation failed; existing config was not modified.");
  }
  const backupFile = backup(config);
  writeFileSync(config, next, "utf8");
  rmSync(candidate, { force: true });
  rmSync(path.join(home, "lumine-harness-adapter"), { recursive: true, force: true });
  return { product: "kimi", status: "uninstalled", configFile: config, backup: backupFile };
}

export function setCliWorkStatus(status, options = {}) {
  if (!WORK_STATUSES.has(status)) throw new Error(`Invalid WORK_STATUS: ${status}`);
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  const product = options.product ?? process.env.HARNESS_PRODUCT;
  const sessionId = options.sessionId ?? process.env.HARNESS_SESSION_ID;
  if (!product || !sessionId) throw new Error("Pass --product and --session-id explicitly; Harness will not guess an active host session.");
  return recordWorkStatus(root, { product, sessionId, cwd: options.cwd ?? process.cwd() }, status);
}

function prepareManualAdapter(product, options = {}) {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  if (product === "zcode") {
    return {
      product,
      status: "needs_manual_app_step",
      path: path.join(root, ".harness", "adapters", "zcode", "marketplace"),
      message: "Add this directory as a local marketplace in ZCode, install lumine-harness-adapter, enable it, then start a new session."
    };
  }
  if (product === "deepseek-harness") {
    const bundle = path.join(root, ".harness", "adapters", "deepseek-harness", "bundle");
    return {
      product,
      status: "needs_manual_app_step",
      path: bundle,
      message: `After separately authorizing the user-profile change, run: dsh plugin --profile <profile> add ${bundle}`
    };
  }
  throw new Error(`No manual installer contract for ${product}.`);
}

export function runAdapterCommand(argv, options = {}) {
  const [action, target = "selected"] = argv;
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  const targets = target === "all" ? PRODUCTS : target === "selected" ? (root ? selectedAdapters(root) : PRODUCTS) : [target];
  if (action === "status") return adapterStatus(target, options);
  if (action === "list") return { schemaVersion: 1, kind: "adapter_list", results: listAdapters(root) };
  if (action === "doctor") return { schemaVersion: 1, kind: "adapter_doctor", target, results: targets.map((item) => doctorAdapter(item, options)) };
  if (action === "verify" && argv.includes("--begin")) {
    if (!root) throw new Error("Harness root not found.");
    if (targets.length !== 1 || !PRODUCTS.includes(target)) throw new Error("Begin verification for one selected product at a time.");
    const versionIndex = argv.indexOf("--host-version");
    const hostVersion = versionIndex >= 0 ? argv[versionIndex + 1] : null;
    return { schemaVersion: 1, kind: "adapter_verify", target, results: [beginVerificationRun(root, target, { hostVersion })] };
  }
  if (action === "verify") return { schemaVersion: 1, kind: "adapter_verify", target, results: targets.map((item) => verifyAdapter(item, options)) };
  if (action === "install" && target === "kimi") return { schemaVersion: 1, kind: "adapter_install", target, results: [installKimiAdapter(options)] };
  if (action === "uninstall" && target === "kimi") return { schemaVersion: 1, kind: "adapter_uninstall", target, results: [uninstallKimiAdapter(options)] };
  if (action === "install" && ["zcode", "deepseek-harness"].includes(target)) return { schemaVersion: 1, kind: "adapter_install", target, results: [prepareManualAdapter(target, options)] };
  if (action === "uninstall" && ["zcode", "deepseek-harness"].includes(target)) {
    return {
      schemaVersion: 1,
      kind: "adapter_uninstall",
      target,
      results: [{
        product: target,
        status: "needs_manual_app_step",
        message: target === "zcode"
          ? "Uninstall lumine-harness-adapter from ZCode Settings -> Plugins."
          : "Run dsh plugin --profile <profile> remove @lumine/dsh-harness-adapter for each profile where it was installed."
      }]
    };
  }
  if (action === "install" || action === "uninstall") throw new Error(`${target} is repository-managed and has no user-level installer.`);
  throw new Error("Usage: adapter status <current|selected> [--json] | adapter <list|doctor|verify|install|uninstall> <product|selected|all>");
}

export function runSkillCommand(argv, options = {}) {
  const [action, ...rest] = argv;
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  if (action === "list") return discoverSharedSkills(root);
  if (action === "search") return searchSharedSkills(root, rest.join(" "), { limit: options.limit ?? 3 });
  if (action === "inspect") {
    const skill = getSharedSkill(root, rest[0]);
    if (!skill) throw new Error(`Unknown shared Skill: ${rest[0]}`);
    return skill;
  }
  throw new Error("Usage: skills <list|search|inspect> [query|name]");
}

export function formatAdapterResult(result) {
  if (result.kind === "adapter_status") {
    const lines = [`${result.label}：${result.summary}`];
    for (const item of result.products ?? []) {
      lines.push(`  - ${item.product}：${item.label}`);
      if (result.scope === "current") {
        lines.push("    能力证据：");
        for (const [name, capability] of Object.entries(item.capabilities ?? {})) {
          let evidence = "尚未验证";
          if (capability.result === "needs_setup") evidence = "需要先完成设置";
          else if (capability.result === "not_observable") evidence = "当前宿主无法直接观察";
          else if (capability.result === "not_applicable") evidence = "当前宿主不提供此能力";
          else if (capability.result === "failed") evidence = "观察结果异常";
          else if (capability.result === "passed" && capability.evidenceLevel === "behavior_verified") evidence = "行为已经验证";
          else if (capability.result === "passed" && capability.evidenceLevel === "runtime_observed") evidence = "真实会话中已经观察到";
          else if (capability.result === "passed" && capability.evidenceLevel === "repository_checked") evidence = "仓库侧实现已经检查";
          else if (capability.result === "passed" && capability.evidenceLevel === "official_declared") evidence = "产品协议已声明支持";
          lines.push(`      - ${CAPABILITY_LABELS[name] ?? name}：${evidence}`);
        }
      }
    }
    for (const note of result.notes ?? []) lines.push(`  - ${note}`);
    if (result.nextSteps?.length) {
      lines.push("下一步：");
      for (const step of result.nextSteps) lines.push(`  - ${step}`);
    }
    return lines.join("\n");
  }
  if (result.kind === "adapter_list") {
    return [
      "以下仅表示工程中是否提供并选择了 Adapter，不代表真实 Agent 已验证通过。",
      ...result.results.map((item) => [
      `${item.product}：${item.selected ? "已选择" : "未选择"}`,
      `  - 仓库实现：${item.implementation ?? "unknown"}`,
      `  - 成熟度：${item.maturity ?? "unknown"}`
      ].join("\n"))
    ].join("\n");
  }
  const labels = {
    repository_ready: "工程配置已就绪",
    needs_manual_app_step: "需要完成一次设置",
    partial: "基本流程可用但部分自动化需手动",
    not_selected: "当前工程未选择",
    not_installed: "连接异常",
    error: "连接异常",
    not_tested: "尚未完成真实验证",
    runtime_observed: "已观察到真实会话事件",
    failed: "连接异常",
    challenge_issued: "已创建真实验证任务",
    installed: "安装完成",
    uninstalled: "卸载完成"
  };
  return result.results.map((item) => {
    const messages = [...(item.messages ?? []), ...(item.message ? [item.message] : []), ...(item.path ? [`Path: ${item.path}`] : [])];
    const status = labels[item.status] ?? item.status ?? "完成";
    return `${item.product}：${status}${messages.length ? `\n${messages.map((message) => `  - ${message}`).join("\n")}` : ""}`;
  }).join("\n");
}

export function formatSkillResult(result) {
  const omitFile = ({ file, ...skill }) => skill;
  const output = Array.isArray(result) ? result.map(omitFile) : omitFile(result);
  return JSON.stringify(output, null, 2);
}
