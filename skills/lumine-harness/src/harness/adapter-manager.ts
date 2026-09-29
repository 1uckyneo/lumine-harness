import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { findHarnessRoot, isStartedAtHarnessRoot, projectRuntimeRoot } from "./core/root-resolver.ts";
import { discoverSharedSkills, getSharedSkill, inspectSharedSkillCatalog, searchSharedSkills } from "./core/skill-catalog.ts";
import { listCurrentSessionPointers, readCurrentSessionPointer, recordWorkReport, readSessionState, WORK_STATUSES } from "./core/work-status.ts";
import { beginVerificationRun, verifyRuntimeEvidence } from "./core/verification.ts";
import { commandLocale, type Locale } from "./core/messages.ts";
import { resolveHarnessRuntimeRoot } from "./core/runtime-layout.ts";
import type { RuntimeVerificationResult } from "./core/verification.ts";
import type {
  AdapterCapabilityName,
  AdapterCapabilityResult,
  AdapterReadiness,
  AdapterSetupAction,
  CapabilityEvidenceLevel,
  HarnessAdapterCapability,
  HarnessProduct,
  WorkStatus,
  WorkReport
} from "./core/contracts.ts";

const HERE = resolveHarnessRuntimeRoot(import.meta.url);
const PRODUCTS = ["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"] as const satisfies readonly HarnessProduct[];
const KIMI_BEGIN = "# BEGIN lumine-harness adapter (managed)";
const KIMI_END = "# END lumine-harness adapter (managed)";

const READINESS_LABELS: Record<AdapterReadiness, string> = Object.freeze({
  ready: "可以开始使用",
  setup_required: "完成一次设置后可用",
  trial_only: "可以试用",
  connection_error: "需要排查"
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

const CAPABILITY_GROUP_DEFINITIONS = [
  { id: "project_context", label: "工程上下文", capabilities: ["project_instructions", "session_context"] },
  { id: "skill_usage", label: "Skill 使用", capabilities: ["skill_discovery", "skill_read", "pre_mutation_gate"] },
  { id: "workflow_constraints", label: "流程约束", capabilities: ["stop_gate", "work_status_matrix"] },
  { id: "long_task_reliability", label: "长任务可靠性", capabilities: ["automatic_continuation", "session_isolation"] }
] as const satisfies ReadonlyArray<{
  id: CapabilityGroup["id"];
  label: string;
  capabilities: readonly AdapterCapabilityName[];
}>;

type DoctorStatus = "repository_ready" | "partial" | "needs_manual_app_step" | "not_selected" | "not_installed" | "error";
type RuntimeCapabilities = Partial<Record<AdapterCapabilityName, AdapterCapabilityResult>>;
type EvidenceSummary = "not_tested" | "repository_checked" | "runtime_observed" | "behavior_verified" | "failed";

interface CapabilityManifest {
  products: Record<HarnessProduct, HarnessAdapterCapability>;
}

interface HarnessProjectConfig {
  selectedAdapters?: string[];
}

interface AdapterOptions {
  reason?: string;
  nextStep?: string;
  emissionId?: string;
  expectedUserTurnRevision?: number;
  locale?: Locale;
  cwd?: string;
  root?: string;
  kimiHome?: string;
  cursorRestricted?: boolean;
  env?: NodeJS.ProcessEnv;
  validate?: (file: string) => boolean;
  kimiCommand?: string;
  product?: string;
  sessionId?: string;
  currentProduct?: string;
  now?: number;
  pointerMaxAgeMs?: number;
  limit?: number;
  hostVersion?: string;
  verificationRunId?: string;
  maxAgeMs?: number;
  details?: boolean;
}

interface SkillCatalogSummary {
  valid: number;
  invalid: number;
  diagnostics: ReturnType<typeof inspectSharedSkillCatalog>["diagnostics"];
}

interface DoctorResult {
  product: string;
  status: DoctorStatus;
  root?: string;
  capability?: HarnessAdapterCapability;
  skillCatalog?: SkillCatalogSummary | null;
  setupActions?: AdapterSetupAction[];
  limitations?: string[];
  messages: string[];
}

interface CapabilityLine {
  capability: AdapterCapabilityName;
  label: string;
  result: AdapterCapabilityResult["result"];
  evidenceLevel: AdapterCapabilityResult["evidenceLevel"];
  description: string;
}

interface CapabilityGroup {
  id: "project_context" | "skill_usage" | "workflow_constraints" | "long_task_reliability";
  label: string;
  capabilities: CapabilityLine[];
}

interface ProductStatusResult {
  product: HarnessProduct;
  readiness: AdapterReadiness;
  label: string;
  setup: { status: DoctorStatus; actions: AdapterSetupAction[]; messages: string[] };
  limitations: string[];
  continuation: { delivery: string; maxConsecutive?: number | null };
  evidence: {
    summary: EvidenceSummary;
    confirmed: CapabilityLine[];
    unconfirmed: CapabilityLine[];
    runtimeStatus: RuntimeVerificationResult["status"];
    status: RuntimeVerificationResult["status"];
    hostVersion: string;
    hostVersionSource: string;
    observedAt: string | null;
    evidence: string | null;
  };
  capabilities: RuntimeCapabilities;
  capabilityGroups: CapabilityGroup[];
  skillCatalog: SkillCatalogSummary | null;
  nextSteps: string[];
}

interface CurrentAdapterIdentification {
  status: "identified" | "invalid" | "ambiguous" | "unknown";
  source: "environment" | "runtime_pointer" | "unknown";
  product: HarnessProduct | null;
  reason?: string;
  hasSession?: boolean;
  pointerConflict?: boolean;
}

interface AdapterStatusResult {
  locale?: Locale;
  schemaVersion: 2;
  kind: "adapter_status" | "adapter_check";
  scope: string;
  readiness: AdapterReadiness | null;
  label: string | null;
  summary: string;
  source: string;
  product: HarnessProduct | null;
  products: ProductStatusResult[];
  notes?: string[];
  nextSteps: string[];
  groups?: Partial<Record<AdapterReadiness, HarnessProduct[]>>;
  probe?: {
    product: HarnessProduct;
    status: RuntimeVerificationResult["status"];
    verificationRunId?: string;
    reused: boolean;
  };
  details?: boolean;
  generatedAt: string;
}

type AdapterCommandItem = {
  product: string;
  status?: string;
  selected?: boolean;
  implementation?: string;
  maturity?: string;
  messages?: string[];
  message?: string;
  path?: string;
  setupActions?: AdapterSetupAction[];
  limitations?: string[];
};

interface AdapterCommandResult {
  locale?: Locale;
  kind: string;
  label?: string | null;
  summary?: string;
  scope?: string;
  products?: ProductStatusResult[];
  notes?: string[];
  nextSteps?: string[];
  readiness?: AdapterReadiness | null;
  groups?: Partial<Record<AdapterReadiness, HarnessProduct[]>>;
  details?: boolean;
  probe?: AdapterStatusResult["probe"];
  results?: AdapterCommandItem[];
}

function conciseCapabilityList(lines: CapabilityLine[], locale: Locale): string {
  if (!lines.length) return locale === "en" ? "None" : "无";
  return lines.map((line) => locale === "en"
    ? `${adapterText(line.label, locale)} (${adapterText(line.description, locale)})`
    : `${line.label}（${line.description}）`).join(locale === "en" ? "; " : "、");
}

function capabilityEvidenceSections(item: ProductStatusResult): {
  repositoryChecked: CapabilityLine[];
  runtimeObserved: CapabilityLine[];
  notApplicable: CapabilityLine[];
  unobserved: CapabilityLine[];
  failed: CapabilityLine[];
} {
  const sections = {
    repositoryChecked: [] as CapabilityLine[],
    runtimeObserved: [] as CapabilityLine[],
    notApplicable: [] as CapabilityLine[],
    unobserved: [] as CapabilityLine[],
    failed: [] as CapabilityLine[]
  };
  for (const [name, capability] of Object.entries(item.capabilities)) {
    if (!capability) continue;
    const line = capabilityLine(name as AdapterCapabilityName, capability);
    if (capability.result === "not_applicable") {
      sections.notApplicable.push(line);
    } else if (capability.result === "failed") {
      sections.failed.push(line);
    } else if (RUNTIME_EVIDENCE_LEVELS.has(capability.evidenceLevel)) {
      sections.runtimeObserved.push(line);
    } else if (["not_tested", "not_observable"].includes(capability.result)) {
      sections.unobserved.push(line);
    } else if (capability.evidenceLevel === "repository_checked") {
      sections.repositoryChecked.push(line);
    } else {
      sections.unobserved.push(line);
    }
  }
  return sections;
}

function formatProductStatus(item: ProductStatusResult, details: boolean, subjectLabel: string, locale: Locale): string {
  const t = (zh: string, en: string) => locale === "en" ? en : zh;
  const separator = t("：", ": ");
  const joiner = t("；", "; ");
  const evidence = capabilityEvidenceSections(item);
  const lines = [`${subjectLabel}${separator}${item.product}`, `${t("结论", "Readiness")}${separator}${item.label}`];
  if (item.setup.actions.length) {
    lines.push(`${t("开始前", "Before starting")}${separator}${item.setup.actions.map((action) => action.title).join(joiner)}`);
    for (const action of item.setup.actions) {
      action.steps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
      lines.push(`  ${t("完成标志", "Completion signal")}${separator}${action.successSignal}`);
      if (action.reloadRequired) lines.push(t("  完成后需要重新加载产品或开启新会话。", "  Reload the product or start a new session afterwards."));
    }
  } else {
    lines.push(t("开始前：无需额外设置", "Before starting: No additional setup required"));
  }
  if (item.limitations.length) lines.push(`${t("主要限制", "Key limitations")}${separator}${item.limitations.join(joiner)}`);
  lines.push(`${t("下一步", "Next")}${separator}${item.nextSteps.length ? item.nextSteps.join(joiner) : t("可以开始使用", "Ready to use")}`);
  if (details) {
    lines.push(`${t("仓库中已配置", "Repository checked")}${separator}${conciseCapabilityList(evidence.repositoryChecked, locale)}`);
    lines.push(`${t("当前会话已确认", "Observed in the current session")}${separator}${conciseCapabilityList(evidence.runtimeObserved, locale)}`);
    lines.push(`${t("当前产品不提供", "Not provided by this product")}${separator}${conciseCapabilityList(evidence.notApplicable, locale)}`);
    lines.push(`${t("尚待确认", "Awaiting confirmation")}${separator}${conciseCapabilityList(evidence.unobserved, locale)}`);
    if (evidence.failed.length) lines.push(`${t("存在异常", "Problems")}${separator}${conciseCapabilityList(evidence.failed, locale)}`);
    lines.push(t("能力详情：", "Capability details:"));
    for (const group of item.capabilityGroups) {
      lines.push(`  ${group.label}${separator}`);
      for (const capability of group.capabilities) lines.push(`    - ${capability.label}${separator}${capability.description}`);
    }
  }
  return lines.join("\n");
}

function isHarnessProduct(value: unknown): value is HarnessProduct {
  return typeof value === "string" && PRODUCTS.includes(value as HarnessProduct);
}

function capabilities(root: string): CapabilityManifest {
  return JSON.parse(readFileSync(path.join(projectRuntimeRoot(root), "adapter-capabilities.json"), "utf8")) as CapabilityManifest;
}

function projectConfig(root: string): HarnessProjectConfig | null {
  const file = path.join(root, ".lumine", "project.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")) as HarnessProjectConfig; } catch { return null; }
}

function selectedAdapters(root: string): HarnessProduct[] {
  const selected = projectConfig(root)?.selectedAdapters;
  if (Array.isArray(selected)) return selected.filter(isHarnessProduct);
  return PRODUCTS.filter((product) => existsSync(entry(root, product)) && !["kimi", "zcode", "deepseek-harness"].includes(product));
}

function entry(root: string, product: HarnessProduct): string {
  const runtime = projectRuntimeRoot(root);
  return {
    codex: path.join(root, ".codex", "hooks.json"),
    qoder: path.join(root, ".qoder", "settings.json"),
    trae: path.join(root, ".trae", "hooks.json"),
    kimi: path.join(runtime, "adapters", "kimi", "hooks", "dispatch.mjs"),
    cursor: path.join(root, ".cursor", "hooks.json"),
    opencode: path.join(root, ".opencode", "plugins", "harness.mjs"),
    zcode: path.join(runtime, "adapters", "zcode", "marketplace", "marketplace.json"),
    codebuddy: path.join(root, ".codebuddy", "settings.json"),
    "deepseek-harness": path.join(runtime, "adapters", "deepseek-harness", "bundle", "package.json")
  }[product];
}

function forbidden(root: string): string[] {
  return [
    ".qoder/skills",
    ".codebuddy/skills",
    path.relative(root, path.join(projectRuntimeRoot(root), "adapters", "zcode", "marketplace", "plugins", "lumine-harness-adapter", "skills")),
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

function importsRootAgents(root: string, file: string): boolean {
  const source = readFileSync(file, "utf8");
  const rootAgents = path.resolve(root, "AGENTS.md");
  return [...source.matchAll(/(?:^|\s)@([^\s]+)/gm)]
    .some((match) => path.resolve(path.dirname(file), match[1]) === rootAgents);
}

function raiseDoctorStatus(current: DoctorStatus, next: DoctorStatus): DoctorStatus {
  const rank: Record<DoctorStatus, number> = {
    repository_ready: 0,
    partial: 1,
    needs_manual_app_step: 2,
    not_selected: 3,
    not_installed: 3,
    error: 4
  };
  return rank[next] > rank[current] ? next : current;
}

function isCursorRestricted(options: AdapterOptions = {}): boolean {
  if (typeof options.cursorRestricted === "boolean") return options.cursorRestricted;
  const env = options.env ?? process.env;
  const restricted = String(env.CURSOR_WORKSPACE_RESTRICTED ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "restricted", "untrusted"].includes(restricted)) return true;
  const trust = String(env.CURSOR_WORKSPACE_TRUST ?? "").trim().toLowerCase();
  return ["restricted", "untrusted", "false", "0"].includes(trust);
}

function inspectRoutedSkillCatalog(root: string, product: HarnessProduct, messages: string[]): SkillCatalogSummary | null {
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

export function listAdapters(root = findHarnessRoot(process.cwd())): Array<{ product: HarnessProduct; selected: boolean } & HarnessAdapterCapability> {
  if (!root) throw new Error("Harness root not found.");
  const manifest = capabilities(root);
  const selected = new Set(selectedAdapters(root));
  return PRODUCTS.map((product) => ({ product, selected: selected.has(product), ...manifest.products[product] }));
}

export function hasManagedKimiBlock(configFile: string): boolean {
  if (!existsSync(configFile)) return false;
  const source = readFileSync(configFile, "utf8");
  return source.includes(KIMI_BEGIN);
}

function buildDoctorResult(product: string, options: AdapterOptions = {}): DoctorResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = options.root ?? findHarnessRoot(cwd);
  if (!isHarnessProduct(product)) return { product, status: "error", messages: [`未知的 Agent：${product}`] };
  if (!root) return { product, status: "error", messages: ["请从包含 .lumine/root.json 的工程根目录运行检查。"] };
  const capability = capabilities(root).products[product];
  if (!selectedAdapters(root).includes(product)) return {
    product,
    status: "not_selected",
    root,
    capability,
    setupActions: [],
    limitations: capability.limitations ?? [],
    messages: ["当前工程没有选择这个 Adapter。"]
  };
  const messages: string[] = [];
  let status: DoctorStatus = "repository_ready";
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
    messages.push("Qoder Adapter 会把明确的 Skill 或 Harness 阶段路由到 .agents/skills 中的真实文件，并要求 Agent 读取；自然语言隐式发现仍需在真实会话中确认。");
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
    messages.push("OpenCode 当前没有可在 Agent 停止前阻断的对等 Stop Gate；session.idle 只用于结束后审计，任务未完成时需要由人发起下一轮。");
  }
  if (product === "zcode" && status !== "not_installed" && status !== "error") {
    status = raiseDoctorStatus(status, "needs_manual_app_step");
    messages.push("请把本工程的 ZCode 本地 Plugin 加入并启用，然后从 Harness 根目录开启新会话。");
    messages.push("ZCode Adapter 会把明确的 Skill 或 Harness 阶段路由到 .agents/skills 中的真实文件，并要求 Agent 读取；自然语言隐式发现属于尽力支持。");
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
      messages.push("CodeBuddy Adapter 会把明确的 Skill 或 Harness 阶段路由到 .agents/skills 中的真实文件，并要求 Agent 读取；自然语言隐式发现属于尽力支持。");
    }
  }
  if (product === "deepseek-harness" && status !== "not_installed" && status !== "error") {
    status = raiseDoctorStatus(status, "needs_manual_app_step");
    messages.push("需要把本工程提供的本地 profile bundle 安装到准备使用的 DeepSeek Harness profile。");
    messages.push("当前仓库检查覆盖 @deepseek-ai/dsh 0.1.0-rc.7 与 @deepseek-ai/dsh-hooks-codex 0.1.0-rc.7；这不代表真实宿主已经验证通过。");
  }
  if (!messages.length) messages.push("工程侧 Adapter 配置已就绪；真实会话证据单独显示，不影响是否可以开始的判断。");
  const setupActions = status === "needs_manual_app_step"
    ? [...(capability.setupActions ?? [])]
    : [];
  if (status === "needs_manual_app_step" && product === "cursor" && setupActions.length === 0) {
    setupActions.push({
      id: "trust-cursor-workspace",
      title: "允许 Cursor 在当前工程运行项目 Hook",
      steps: ["按 Cursor 的受限项目提示信任当前工程。", "从 Harness 根目录重新开启会话。"],
      successSignal: "检查结果能识别 Cursor，并观察到项目 Hook 的会话入口。",
      reloadRequired: true,
      satisfiedBy: ["session_context"]
    });
  }
  return { product, status, root, capability, skillCatalog, setupActions, limitations: capability.limitations ?? [], messages };
}

export function verifyAdapter(product: string, options: AdapterOptions = {}): DoctorResult | (RuntimeVerificationResult & { capability: HarnessAdapterCapability }) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = options.root ?? findHarnessRoot(cwd);
  if (!root) return { product, status: "error", messages: ["没有找到 Harness 根目录。"] };
  const doctor = buildDoctorResult(product, options);
  if (["error", "not_installed", "not_selected"].includes(doctor.status)) return doctor;
  if (!isHarnessProduct(product)) return { product, status: "error", messages: [`未知的 Agent：${product}`] };
  return { ...verifyRuntimeEvidence(root, product, options), capability: capabilities(root).products[product] };
}

function mergeCapabilities(declared: RuntimeCapabilities = {}, observed: RuntimeCapabilities = {}): RuntimeCapabilities {
  const names = new Set<AdapterCapabilityName>([
    ...Object.keys(declared) as AdapterCapabilityName[],
    ...Object.keys(observed) as AdapterCapabilityName[]
  ]);
  return Object.fromEntries([...names].map((name) => {
    const baseline = declared[name] ?? { result: "not_tested", evidenceLevel: "official_declared" };
    const runtime = observed[name];
    if (!runtime) return [name, baseline];
    const baselineRank = EVIDENCE_LEVEL_RANK[baseline.evidenceLevel as CapabilityEvidenceLevel];
    const runtimeRank = EVIDENCE_LEVEL_RANK[runtime.evidenceLevel as CapabilityEvidenceLevel];
    return [name, runtimeRank > baselineRank ? runtime : baseline];
  }));
}

function isRuntimePass(capability: AdapterCapabilityResult | undefined): boolean {
  return capability?.result === "passed" && RUNTIME_EVIDENCE_LEVELS.has(capability.evidenceLevel);
}

function capabilityDescription(capability: AdapterCapabilityResult): string {
  if (capability.result === "needs_setup") return "需要先完成设置";
  if (capability.result === "not_tested") return "当前会话尚未观察";
  if (capability.result === "not_observable") return "当前宿主没有提供可观察证据";
  if (capability.result === "not_applicable") return "当前宿主不提供这项能力";
  if (capability.result === "failed") return "观察结果与预期不一致";
  if (capability.evidenceLevel === "behavior_verified") return "安全场景中的行为已经验证";
  if (capability.evidenceLevel === "runtime_observed") return "真实会话中已经观察到";
  if (capability.evidenceLevel === "repository_checked") return "仓库侧实现已经检查";
  return "产品协议声明支持，当前安装版本尚未观察";
}

function capabilityLine(name: AdapterCapabilityName, capability: AdapterCapabilityResult): CapabilityLine {
  return {
    capability: name,
    label: CAPABILITY_LABELS[name],
    result: capability.result,
    evidenceLevel: capability.evidenceLevel,
    description: capabilityDescription(capability)
  };
}

function capabilityGroups(capabilities: RuntimeCapabilities): CapabilityGroup[] {
  return CAPABILITY_GROUP_DEFINITIONS.map((group) => ({
    id: group.id,
    label: group.label,
    capabilities: group.capabilities
      .filter((name) => capabilities[name])
      .map((name) => capabilityLine(name, capabilities[name] as AdapterCapabilityResult))
  }));
}

function isConfirmedCapability(capability: AdapterCapabilityResult): boolean {
  if (capability.result === "not_applicable") return capability.evidenceLevel !== "official_declared";
  return capability.result === "passed" && capability.evidenceLevel !== "official_declared";
}

function evidenceSummary(runtime: RuntimeVerificationResult, mergedCapabilities: RuntimeCapabilities): EvidenceSummary {
  if (runtime.status === "failed") return "failed";
  const ranks: Record<Exclude<EvidenceSummary, "failed">, number> = {
    not_tested: 0,
    repository_checked: 1,
    runtime_observed: 2,
    behavior_verified: 3
  };
  let summary: Exclude<EvidenceSummary, "failed"> = "not_tested";
  for (const capability of Object.values(mergedCapabilities)) {
    if (!capability || !isConfirmedCapability(capability)) continue;
    const candidate = capability.evidenceLevel === "official_declared" ? "not_tested" : capability.evidenceLevel;
    if (ranks[candidate] > ranks[summary]) summary = candidate;
  }
  return summary;
}

function setupActionSatisfied(action: AdapterSetupAction, runtime: RuntimeVerificationResult): boolean {
  if (runtime.status !== "runtime_observed" || !action.satisfiedBy?.length) return false;
  return action.satisfiedBy.every((name) => isRuntimePass(runtime.capabilities?.[name]));
}

function remainingSetupActions(doctor: DoctorResult, runtime: RuntimeVerificationResult): AdapterSetupAction[] {
  if (doctor.status !== "needs_manual_app_step") return [];
  return (doctor.setupActions ?? []).filter((action) => !setupActionSatisfied(action, runtime));
}

function classifyReadiness(
  capability: HarnessAdapterCapability,
  doctor: DoctorResult,
  setupActions: AdapterSetupAction[]
): AdapterReadiness {
  if (["error", "not_installed", "not_selected"].includes(doctor.status)) return "connection_error";
  if (setupActions.length || (doctor.status === "needs_manual_app_step" && !(doctor.setupActions?.length))) return "setup_required";
  if (capability.maturity === "developer-preview") return "trial_only";
  return "ready";
}

function statusNextSteps(
  readiness: AdapterReadiness,
  product: HarnessProduct,
  setupActions: AdapterSetupAction[]
): string[] {
  if (readiness === "connection_error") return [`检查 ${product} 的启动目录和 Adapter 配置后重试。`];
  if (readiness === "setup_required") {
    return setupActions.length
      ? setupActions.map((action) => `${action.title}；完成标志：${action.successSignal}`)
      : [`完成 ${product} 返回的一次性设置后，重新开启会话。`];
  }
  if (readiness === "trial_only") return ["可以在低风险场景试用；不要把当前 Adapter 作为高风险操作的唯一门禁。"];
  return ["可以开始使用。"];
}

function productStatus(root: string, product: HarnessProduct, options: AdapterOptions = {}): ProductStatusResult {
  const capability = capabilities(root).products[product];
  const doctor = buildDoctorResult(product, { ...options, cwd: options.cwd ?? root });
  const runtime = verifyRuntimeEvidence(root, product, options);
  const mergedCapabilities = mergeCapabilities(capability.capabilities, runtime.capabilities);
  const setupActions = remainingSetupActions(doctor, runtime);
  const readiness = classifyReadiness(capability, doctor, setupActions);
  const lines = Object.entries(mergedCapabilities).map(([name, value]) => (
    capabilityLine(name as AdapterCapabilityName, value as AdapterCapabilityResult)
  ));
  const summary = evidenceSummary(runtime, mergedCapabilities);
  return {
    product,
    readiness,
    label: READINESS_LABELS[readiness],
    setup: {
      status: doctor.status,
      actions: setupActions,
      messages: doctor.messages ?? []
    },
    limitations: doctor.limitations ?? capability.limitations ?? [],
    continuation: capability.continuation ?? { delivery: "unsupported", maxConsecutive: 0 },
    evidence: {
      summary,
      confirmed: lines.filter((line) => isConfirmedCapability(mergedCapabilities[line.capability] as AdapterCapabilityResult)),
      unconfirmed: lines.filter((line) => !isConfirmedCapability(mergedCapabilities[line.capability] as AdapterCapabilityResult)),
      runtimeStatus: runtime.status,
      status: runtime.status,
      hostVersion: runtime.hostVersion ?? "unknown",
      hostVersionSource: runtime.hostVersionSource ?? "unknown",
      observedAt: runtime.verifiedAt ?? null,
      evidence: runtime.evidence ?? null
    },
    capabilities: mergedCapabilities,
    capabilityGroups: capabilityGroups(mergedCapabilities),
    skillCatalog: doctor.skillCatalog ?? null,
    nextSteps: statusNextSteps(readiness, product, setupActions)
  };
}

function freshCurrentPointers(root: string, options: AdapterOptions = {}): ReturnType<typeof listCurrentSessionPointers> {
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.pointerMaxAgeMs ?? 24 * 60 * 60 * 1000);
  return listCurrentSessionPointers(root).filter((pointer) => {
    if (!isHarnessProduct(pointer.product)) return false;
    const updatedAt = Date.parse(pointer.updatedAt);
    return Number.isFinite(updatedAt) && now - updatedAt <= maxAgeMs;
  });
}

function identifyCurrentAdapter(root: string, options: AdapterOptions = {}): CurrentAdapterIdentification {
  const env = options.env ?? process.env;
  const explicitProduct = options.currentProduct ?? env.HARNESS_PRODUCT;
  const explicitSessionId = options.sessionId ?? env.HARNESS_SESSION_ID;
  if (explicitProduct) {
    if (!isHarnessProduct(explicitProduct)) {
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

function buildAdapterStatus(scope = "current", options: AdapterOptions = {}): AdapterStatusResult {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = options.root ?? findHarnessRoot(cwd);
  const generatedAt = new Date(options.now ?? Date.now()).toISOString();
  if (!root) {
    return {
      schemaVersion: 2,
      kind: "adapter_status",
      scope,
      readiness: "connection_error",
      label: READINESS_LABELS.connection_error,
      summary: "没有找到 Harness 根目录。",
      source: "unknown",
      product: null,
      products: [],
      nextSteps: ["从包含 .lumine/root.json 的工程根目录重新运行。"],
      generatedAt
    };
  }

  if (scope === "current") {
    const current = identifyCurrentAdapter(root, options);
    if (current.status !== "identified") {
      return {
        schemaVersion: 2,
        kind: "adapter_status",
        scope,
        readiness: current.status === "invalid" ? "connection_error" : null,
        label: current.status === "invalid" ? READINESS_LABELS.connection_error : null,
        summary: current.reason ?? "无法识别当前 Agent。",
        source: current.source,
        product: null,
        products: [],
        nextSteps: ["请从目标工程根目录的新 Agent 会话中重新检查，或由 Adapter 显式提供 HARNESS_PRODUCT。"],
        generatedAt
      };
    }
    if (!current.product) throw new Error("Identified Adapter is missing a product.");
    const status = productStatus(root, current.product, { ...options, cwd });
    const notes = current.pointerConflict ? ["显式会话标识与旧运行指针不一致；本次以显式环境为准。"] : [];
    return {
      schemaVersion: 2,
      kind: "adapter_status",
      scope,
      readiness: status.readiness,
      label: status.label,
      summary: `${current.product}：${status.label}`,
      source: current.source,
      product: current.product,
      products: [status],
      notes,
      nextSteps: status.nextSteps,
      details: options.details,
      generatedAt
    };
  }

  if (isHarnessProduct(scope)) {
    const status = productStatus(root, scope, { ...options, cwd });
    return {
      schemaVersion: 2,
      kind: "adapter_status",
      scope,
      readiness: status.readiness,
      label: status.label,
      summary: `${scope}：${status.label}`,
      source: "explicit_product",
      product: scope,
      products: [status],
      nextSteps: status.nextSteps,
      details: options.details,
      generatedAt
    };
  }

  if (scope !== "selected") throw new Error("Usage: adapter status <current|selected|product> [--details] [--json]");
  const products = selectedAdapters(root).map((product) => productStatus(root, product, { ...options, cwd }));
  const groups: Partial<Record<AdapterReadiness, HarnessProduct[]>> = {};
  for (const product of products) {
    const items = groups[product.readiness] ?? [];
    items.push(product.product);
    groups[product.readiness] = items;
  }
  return {
    schemaVersion: 2,
    kind: "adapter_status",
    scope,
    readiness: null,
    label: null,
    summary: products.length ? `已汇总 ${products.length} 个已选择的 Adapter。` : "当前工程没有选择任何 Adapter。",
    source: "project_config",
    product: null,
    products,
    groups,
    nextSteps: [],
    details: options.details,
    generatedAt
  };
}


function adapterLocale(options: AdapterOptions): Locale {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  return options.locale ?? commandLocale(root ? ["--root", root] : []);
}

export function doctorAdapter(product: string, options: AdapterOptions = {}): DoctorResult {
  return localizeAdapterValue(buildDoctorResult(product, options), adapterLocale(options));
}

export function adapterStatus(scope = "current", options: AdapterOptions = {}): AdapterStatusResult {
  const locale = adapterLocale(options);
  return { ...localizeAdapterValue(buildAdapterStatus(scope, options), locale), locale };
}

export function runAdapterCommand(argv: string[], options: AdapterOptions = {}) {
  const locale = adapterLocale(options);
  return { ...localizeAdapterValue(buildAdapterCommand(argv, options), locale), locale };
}

export function adapterCheck(scope = "current", options: AdapterOptions = {}): AdapterStatusResult {
  const status = adapterStatus(scope, options);
  return { ...status, kind: "adapter_check" };
}

function tomlString(value: unknown): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function managedBlock(dispatcher: string): string {
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

function stripBlock(source: string): string {
  let result = source;
  for (const [begin, endMarker] of [[KIMI_BEGIN, KIMI_END]]) {
    const start = result.indexOf(begin);
    const end = result.indexOf(endMarker);
    if ((start === -1) !== (end === -1)) throw new Error("Kimi config contains an incomplete Harness managed block.");
    if (start === -1) continue;
    if (result.indexOf(begin, start + begin.length) !== -1) throw new Error("Kimi config contains duplicate Harness managed blocks.");
    result = `${result.slice(0, start)}${result.slice(end + endMarker.length)}`;
  }
  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function validateCandidate(file: string, options: AdapterOptions = {}): boolean {
  if (options.validate) return options.validate(file);
  const command = options.kimiCommand ?? "kimi";
  const result = spawnSync(command, ["doctor", "config", file], { encoding: "utf8" });
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    const source = readFileSync(file, "utf8");
    return source.includes(KIMI_BEGIN) === source.includes(KIMI_END);
  }
  return result.status === 0;
}

function backup(file: string): string | null {
  if (!existsSync(file)) return null;
  const target = `${file}.lumine-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(file, target);
  return target;
}

export function installKimiAdapter(options: AdapterOptions = {}) {
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
  const candidate = path.join(home, `.config.toml.lumine-${process.pid}.tmp`);
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

export function uninstallKimiAdapter(options: AdapterOptions = {}) {
  const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
  const config = path.join(home, "config.toml");
  if (!hasManagedKimiBlock(config)) return { product: "kimi", status: "not_installed" };
  const next = `${stripBlock(readFileSync(config, "utf8")).trimEnd()}\n`;
  const candidate = path.join(home, `.config.toml.lumine-${process.pid}.tmp`);
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

export function setCliWorkStatus(status: string, options: AdapterOptions = {}) {
  if (!WORK_STATUSES.has(status as WorkStatus)) throw new Error(`Invalid WORK_STATUS: ${status}; use done, continue or blocked.`);
  return setCliWorkReport({ protocolVersion: 2, status: status as WorkStatus, ...(options.reason ? { reason: options.reason } : {}), ...(options.nextStep ? { nextStep: options.nextStep } : {}) }, options);
}

export function setCliWorkReport(report: WorkReport, options: AdapterOptions = {}) {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  const product = options.product ?? process.env.HARNESS_PRODUCT;
  const sessionId = options.sessionId ?? process.env.HARNESS_SESSION_ID;
  if (!product || !sessionId) throw new Error("Pass --product and --session-id explicitly; Harness will not guess an active host session.");
  if (!isHarnessProduct(product)) throw new Error(`Invalid Harness product: ${product}`);
  if (options.expectedUserTurnRevision !== undefined) {
    if (!Number.isInteger(options.expectedUserTurnRevision) || options.expectedUserTurnRevision < 0) throw new Error("--expect-turn must be a non-negative integer.");
    const current = readSessionState(root, product, sessionId);
    if (!current || current.userTurnRevision !== options.expectedUserTurnRevision) throw new Error("STALE_WORK_REPORT: the current user turn differs from --expect-turn.");
  }
  return recordWorkReport(root, { product, sessionId, cwd: options.cwd ?? process.cwd() }, report, { emissionId: options.emissionId, source: "structured" });
}

function prepareManualAdapter(product: HarnessProduct, options: AdapterOptions = {}) {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  if (product === "zcode") {
    return {
      product,
      status: "needs_manual_app_step",
      path: path.join(projectRuntimeRoot(root), "adapters", "zcode", "marketplace"),
      message: "请把该目录作为本地 Marketplace 加入 ZCode，安装并启用 lumine-harness-adapter，然后开启新会话。"
    };
  }
  if (product === "deepseek-harness") {
    const bundle = path.join(projectRuntimeRoot(root), "adapters", "deepseek-harness", "bundle");
    return {
      product,
      status: "needs_manual_app_step",
      path: bundle,
      message: `单独授权修改用户 Profile 后执行：dsh plugin --profile <profile> add ${bundle}`
    };
  }
  throw new Error(`No manual installer contract for ${product}.`);
}

function buildAdapterCommand(argv: string[], options: AdapterOptions = {}) {
  const details = options.details ?? argv.includes("--details");
  const filteredArgv = argv.filter((item) => !["--details", "--json"].includes(item));
  const [action, target = "selected"] = filteredArgv;
  const commandOptions = { ...options, details };
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  const targets: readonly string[] = target === "all" ? PRODUCTS : target === "selected" ? (root ? selectedAdapters(root) : PRODUCTS) : [target];
  if (action === "status") return buildAdapterStatus(target, commandOptions);
  if (action === "check") {
    if (target === "selected" || target === "all") throw new Error("Usage: adapter check <current|product> [--details] [--json]");
    return { ...buildAdapterStatus(target, commandOptions), kind: "adapter_check" as const };
  }
  if (action === "list") return { schemaVersion: 1, kind: "adapter_list", results: listAdapters(root) };
  if (action === "doctor") return { schemaVersion: 1, kind: "adapter_doctor", target, results: targets.map((item) => buildDoctorResult(item, options)) };
  if (action === "verify" && argv.includes("--begin")) {
    if (!root) throw new Error("Harness root not found.");
    if (targets.length !== 1 || !isHarnessProduct(target)) throw new Error("Begin verification for one selected product at a time.");
    const versionIndex = argv.indexOf("--host-version");
    const hostVersion = versionIndex >= 0 ? argv[versionIndex + 1] : null;
    return { schemaVersion: 1, kind: "adapter_verify", target, results: [beginVerificationRun(root, target, { hostVersion: hostVersion ?? undefined })] };
  }
  if (action === "verify") return { schemaVersion: 1, kind: "adapter_verify", target, results: targets.map((item) => verifyAdapter(item, options)) };
  if (action === "install" && target === "kimi") return { schemaVersion: 1, kind: "adapter_install", target, results: [installKimiAdapter(options)] };
  if (action === "uninstall" && target === "kimi") return { schemaVersion: 1, kind: "adapter_uninstall", target, results: [uninstallKimiAdapter(options)] };
  if (action === "install" && (target === "zcode" || target === "deepseek-harness")) return { schemaVersion: 1, kind: "adapter_install", target, results: [prepareManualAdapter(target, options)] };
  if (action === "uninstall" && ["zcode", "deepseek-harness"].includes(target)) {
    return {
      schemaVersion: 1,
      kind: "adapter_uninstall",
      target,
      results: [{
        product: target,
        status: "needs_manual_app_step",
        message: target === "zcode"
          ? "请在 ZCode 的 Settings -> Plugins 中卸载 lumine-harness-adapter。"
          : "请对每个已安装的 Profile 执行：dsh plugin --profile <profile> remove @lumine/dsh-harness-adapter。"
      }]
    };
  }
  if (action === "install" || action === "uninstall") throw new Error(`${target} is repository-managed and has no user-level installer.`);
  throw new Error("Usage: adapter check <current|product> [--details] [--json] | adapter status <current|selected|product> [--details] [--json] | adapter <list|doctor|verify|install|uninstall> <product|selected|all>");
}

export function runSkillCommand(argv: string[], options: AdapterOptions = {}) {
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

export function formatAdapterResult(result: AdapterCommandResult): string {
  const locale = result.locale ?? "zh-CN";
  const t = (zh: string, en: string) => locale === "en" ? en : zh;
  const separator = t("：", ": ");
  const joiner = t("；", "; ");
  if (result.kind === "adapter_status" || result.kind === "adapter_check") {
    if (result.scope === "selected") {
      const lines = [result.summary ?? t("已选择的 Adapter：", "Selected Adapters:")];
      const order: AdapterReadiness[] = ["ready", "setup_required", "trial_only", "connection_error"];
      for (const readiness of order) {
        const products = result.groups?.[readiness] ?? [];
        if (!products.length) continue;
        lines.push(`${adapterText(READINESS_LABELS[readiness], locale)}${separator}${products.join(t("、", ", "))}`);
        if (result.details) for (const product of products) {
          const item = result.products?.find((candidate) => candidate.product === product);
          if (item) lines.push(formatProductStatus(item, true, t("检查对象", "Target"), locale).split("\n").map((line) => `  ${line}`).join("\n"));
        }
      }
      return lines.join("\n");
    }
    const item = result.products?.[0];
    if (!item) return [
      result.scope === "current" ? t("当前 Agent：无法识别", "Current Agent: Not identified") : `${t("检查对象", "Target")}${separator}${result.scope ?? t("无法识别", "Not identified")}`,
      t("结论：暂时无法判断", "Readiness: Cannot determine yet"),
      ...(result.summary ? [`${t("原因", "Reason")}${separator}${result.summary}`] : []),
      `${t("下一步", "Next")}${separator}${result.nextSteps?.join(joiner) ?? t("重新运行连接检查", "Run the connection check again")}`
    ].join("\n");
    const subjectLabel = result.scope === "current" ? t("当前 Agent", "Current Agent") : t("检查对象", "Target");
    const lines = [formatProductStatus(item, Boolean(result.details), subjectLabel, locale)];
    for (const note of result.notes ?? []) lines.push(`${t("说明", "Note")}${separator}${note}`);
    if (result.probe?.status === "challenge_issued") lines.push(`${t("安全探针", "Safe probe")}${separator}${result.probe.reused ? t("已复用当前探针", "Reused the current probe") : t("已创建", "Created")}`);
    return lines.join("\n");
  }
  if (result.kind === "adapter_list") return [
    t("以下仅表示工程中是否提供并选择了 Adapter，不代表真实 Agent 已验证通过。", "This lists Adapters provided and selected by the project; it does not confirm behavior in a real Agent session."),
    ...(result.results ?? []).map((item) => [
      `${item.product}${separator}${item.selected ? t("已选择", "Selected") : t("未选择", "Not selected")}`,
      `  - ${t("仓库实现", "Repository implementation")}${separator}${item.implementation ?? "unknown"}`,
      `  - ${t("成熟度", "Maturity")}${separator}${item.maturity ?? "unknown"}`
    ].join("\n"))
  ].join("\n");
  const labels: Record<string, string> = {
    repository_ready: t("工程配置已就绪", "Project configuration ready"),
    needs_manual_app_step: t("需要完成一次设置", "One-time setup required"),
    partial: t("基本流程可用但部分自动化需手动", "Basic workflow available; some steps remain manual"),
    not_selected: t("当前工程未选择", "Not selected in this project"),
    not_installed: t("连接异常", "Connection problem"), error: t("连接异常", "Connection problem"),
    not_tested: t("尚未完成真实验证", "Not yet verified in a real session"),
    runtime_observed: t("已观察到真实会话事件", "Real session events observed"),
    failed: t("连接异常", "Connection problem"),
    challenge_issued: t("已创建真实验证任务", "Runtime verification challenge created"),
    installed: t("安装完成", "Installed"), uninstalled: t("卸载完成", "Uninstalled")
  };
  return (result.results ?? []).map((item) => {
    const messages = [...(item.messages ?? []), ...(item.message ? [item.message] : []), ...(item.path ? [`Path: ${item.path}`] : [])];
    const status = item.status ? (labels[item.status] ?? item.status) : t("完成", "Done");
    const lines = [`${item.product}${separator}${status}`];
    for (const message of messages) lines.push(`  - ${message}`);
    for (const action of item.setupActions ?? []) {
      lines.push(`  - ${t("要做", "Action")}${separator}${action.title}`);
      action.steps.forEach((step, index) => lines.push(`    ${index + 1}. ${step}`));
      lines.push(`    ${t("完成标志", "Completion signal")}${separator}${action.successSignal}`);
      if (action.reloadRequired) lines.push(t("    完成后需要重新加载产品或开启新会话。", "    Reload the product or start a new session afterwards."));
    }
    for (const limitation of item.limitations ?? []) lines.push(`  - ${t("已知限制", "Known limitation")}${separator}${limitation}`);
    return lines.join("\n");
  }).join("\n");
}

export function formatSkillResult(result: unknown): string {
  const omitFile = ({ file: _file, ...skill }: Record<string, unknown>): Record<string, unknown> => skill;
  if (result === null || typeof result !== "object") return JSON.stringify(result, null, 2);
  const output = Array.isArray(result)
    ? result.map((item) => item && typeof item === "object" ? omitFile(item as Record<string, unknown>) : item)
    : omitFile(result as Record<string, unknown>);
  return JSON.stringify(output, null, 2);
}

// Translate built-in guidance only. Machine codes, paths and unknown project prose remain verbatim.
const ENGLISH_ADAPTER_TEXT: Record<string, string> = {
  "可以开始使用": "Ready to use",
  "完成一次设置后可用": "Ready after one-time setup",
  "可以试用": "Available for trial use",
  "需要排查": "Needs investigation",
  "项目指令": "Project instructions",
  "会话入口": "Session entry",
  "Skill 发现": "Skill discovery",
  "Skill 读取": "Skill reading",
  "首次修改前门禁": "Pre-mutation gate",
  "结束前门禁": "Stop gate",
  "自动续跑": "Automatic continuation",
  "状态转换": "Work status transitions",
  "会话隔离": "Session isolation",
  "工程上下文": "Project context",
  "Skill 使用": "Skill usage",
  "流程约束": "Workflow constraints",
  "长任务可靠性": "Long-task reliability",
  "需要先完成设置": "Setup required first",
  "当前会话尚未观察": "Not observed in the current session",
  "当前宿主没有提供可观察证据": "The current host has not provided observable evidence",
  "当前宿主不提供这项能力": "Not provided by the current host",
  "观察结果与预期不一致": "Observed behavior differs from expectations",
  "安全场景中的行为已经验证": "Behavior verified in a safe scenario",
  "真实会话中已经观察到": "Observed in a real session",
  "仓库侧实现已经检查": "Repository implementation checked",
  "产品协议声明支持，当前安装版本尚未观察": "Declared by the product protocol; not observed in the installed version",
  "请从包含 .lumine/root.json 的工程根目录运行检查。": "Run this check from the project root containing .lumine/root.json.",
  "当前工程没有选择这个 Adapter。": "This Adapter is not selected in the current project.",
  "工程中缺少对应的 Adapter 入口，请重新检查采用或升级配置。": "The project is missing this Adapter entry. Review the adoption or upgrade configuration.",
  "没有可读取的公共 Skill，请先修复 .agents/skills。": "No readable shared Skills were found. Repair .agents/skills first.",
  "请在 Trae 中启用项目 AGENTS.md、共享 Skills 和项目 Hooks，然后重新打开会话。": "Enable project AGENTS.md, shared Skills and project Hooks in Trae, then open a new session.",
  "需要单独授权安装 Kimi Code 用户级 Hook，然后重新打开 Kimi Code。": "Obtain authorization to install Kimi Code user-level Hooks, then reopen Kimi Code.",
  "Kimi Code 的 Hook 失败时默认放行，不能把它作为高风险操作的唯一安全门禁。": "Kimi Code Hooks fail open. Do not use them as the only safety gate for high-risk operations.",
  "Kimi Code 的 Hook 失败时默认放行，不能作为高风险操作的唯一安全门禁。": "Kimi Code Hooks fail open. Do not use them as the only safety gate for high-risk operations.",
  "Cursor 当前处于受限状态，需先信任当前工程，项目 Hook 才能运行。": "Cursor is in restricted mode. Trust the current project before project Hooks can run.",
  "OpenCode 当前没有可在 Agent 停止前阻断的对等 Stop Gate；session.idle 只用于结束后审计，任务未完成时需要由人发起下一轮。": "OpenCode has no equivalent blocking Stop Gate. session.idle supports post-stop auditing only; a person must start another turn if work remains.",
  "OpenCode 当前没有可在 Agent 停止前阻断的对等 Stop Gate；session.idle 只用于结束后审计，任务未完成时需要人发起下一轮。": "OpenCode has no equivalent blocking Stop Gate. session.idle supports post-stop auditing only; a person must start another turn if work remains.",
  "请把本工程的 ZCode 本地 Plugin 加入并启用，然后从 Harness 根目录开启新会话。": "Add and enable this project's local ZCode Plugin, then start a new session from the Harness root.",
  "请在 CodeBuddy Code 的 /hooks 中审核项目 Hook 变更，然后从 Harness 根目录开启新会话。": "Review the project Hook changes in CodeBuddy Code /hooks, then start a new session from the Harness root.",
  "需要把本工程提供的本地 profile bundle 安装到准备使用的 DeepSeek Harness profile。": "Install this project's local profile bundle into the DeepSeek Harness profile you intend to use.",
  "当前仓库检查覆盖 @deepseek-ai/dsh 0.1.0-rc.7 与 @deepseek-ai/dsh-hooks-codex 0.1.0-rc.7；这不代表真实宿主已经验证通过。": "Repository checks cover @deepseek-ai/dsh 0.1.0-rc.7 and @deepseek-ai/dsh-hooks-codex 0.1.0-rc.7. This does not establish verification in a real host.",
  "工程侧 Adapter 配置已就绪；真实会话证据单独显示，不影响是否可以开始的判断。": "Project Adapter configuration is ready. Real-session evidence is reported separately from readiness to start.",
  "允许 Cursor 在当前工程运行项目 Hook": "Allow Cursor to run project Hooks in this workspace",
  "按 Cursor 的受限项目提示信任当前工程。": "Follow Cursor's restricted-workspace prompt to trust this project.",
  "从 Harness 根目录重新开启会话。": "Start a new session from the Harness root.",
  "从 Harness 根目录开启新会话。": "Start a new session from the Harness root.",
  "检查结果能识别 Cursor，并观察到项目 Hook 的会话入口。": "The check identifies Cursor and observes the project Hook session entry.",
  "没有找到 Harness 根目录。": "Harness root not found.",
  "可以在低风险场景试用；不要把当前 Adapter 作为高风险操作的唯一门禁。": "Use this Adapter for low-risk trials. Do not rely on it as the only gate for high-risk operations.",
  "可以开始使用。": "Ready to use.",
  "没有找到与当前会话标识匹配的运行指针。": "No runtime pointer matches the current session ID.",
  "没有找到可用于识别当前 Agent 的运行指针。": "No runtime pointer identifies the current Agent.",
  "从包含 .lumine/root.json 的工程根目录重新运行。": "Run the command again from the project root containing .lumine/root.json.",
  "无法识别当前 Agent。": "The current Agent could not be identified.",
  "请从目标工程根目录的新 Agent 会话中重新检查，或由 Adapter 显式提供 HARNESS_PRODUCT。": "Check again in a new Agent session started from the project root, or have the Adapter provide HARNESS_PRODUCT explicitly.",
  "显式会话标识与旧运行指针不一致；本次以显式环境为准。": "The explicit session ID differs from the old runtime pointer. The explicit environment takes precedence for this check.",
  "当前工程没有选择任何 Adapter。": "No Adapters are selected in this project.",
  "启用 Trae 的项目指令、共享 Skills 和项目 Hooks": "Enable Trae project instructions, shared Skills and project Hooks",
  "在 Trae 的项目设置中启用 AGENTS.md 或项目指令。": "Enable AGENTS.md or project instructions in Trae project settings.",
  "启用共享 Skills。": "Enable shared Skills.",
  "启用项目 Hooks。": "Enable project Hooks.",
  "连接检查能识别 Trae 和会话入口，关键阶段能观察到 Agent 读取 .agents/skills 中的目标 SKILL.md。": "The connection check identifies Trae and its session entry; the Agent is observed reading the target SKILL.md from .agents/skills at the relevant stage.",
  "安装 Kimi Code 用户级 Hooks": "Install Kimi Code user-level Hooks",
  "获得修改 Kimi Code 用户配置的授权。": "Obtain authorization to modify the Kimi Code user configuration.",
  "重新加载 Kimi Code，并从 Harness 根目录开启新会话。": "Reload Kimi Code and start a new session from the Harness root.",
  "连接检查能识别 Kimi Code，并观察到会话入口和结束前处理。": "The connection check identifies Kimi Code and observes session entry and pre-stop handling.",
  "安装并启用 ZCode 本地 Adapter Plugin": "Install and enable the local ZCode Adapter Plugin",
  "把命令返回的目录加入 ZCode 本地 Marketplace。": "Add the directory returned by the command to the ZCode local Marketplace.",
  "安装并启用 lumine-harness-adapter。": "Install and enable lumine-harness-adapter.",
  "ZCode 最多连续自动续跑 3 次，达到限制后需要人重新发起。": "ZCode supports at most 3 consecutive automatic continuations; a person must restart after that limit.",
  "在 CodeBuddy Code 中审核项目 Hook": "Review project Hooks in CodeBuddy Code",
  "在 CodeBuddy Code 中运行 /hooks。": "Run /hooks in CodeBuddy Code.",
  "审核并确认当前项目的 Hook 变更。": "Review and confirm Hook changes for the current project.",
  "把 Lumine Harness Adapter 安装到 DeepSeek Harness profile": "Install the Lumine Harness Adapter into a DeepSeek Harness profile",
  "获得修改用户 profile 的授权。": "Obtain authorization to modify the user profile.",
  "按命令返回的 dsh plugin 指令安装到准备使用的 profile。": "Use the returned dsh plugin command to install into the intended profile.",
  "连接检查能识别 DeepSeek Harness，并观察到 profile 中的 Adapter 会话入口。": "The connection check identifies DeepSeek Harness and observes the Adapter session entry in the profile.",
  "当前仍是开发预览，不能作为生产、高风险或不可恢复操作的唯一门禁。": "This is a developer preview. Do not use it as the only gate for production, high-risk or irreversible operations.",
  "请把该目录作为本地 Marketplace 加入 ZCode，安装并启用 lumine-harness-adapter，然后开启新会话。": "Add this directory as a local Marketplace in ZCode, install and enable lumine-harness-adapter, then start a new session.",
  "请在 ZCode 的 Settings -> Plugins 中卸载 lumine-harness-adapter。": "Uninstall lumine-harness-adapter in ZCode Settings -> Plugins.",
  "请对每个已安装的 Profile 执行：dsh plugin --profile <profile> remove @lumine/dsh-harness-adapter。": "For each installed profile, run: dsh plugin --profile <profile> remove @lumine/dsh-harness-adapter."
};

function adapterText(value: string, locale: Locale): string {
  if (locale !== "en") return value;
  if (ENGLISH_ADAPTER_TEXT[value]) return ENGLISH_ADAPTER_TEXT[value];
  const completion = value.split("；完成标志：");
  if (completion.length === 2) return `${adapterText(completion[0], locale)}; Completion signal: ${adapterText(completion[1], locale)}`;
  const rules: Array<[RegExp, (...parts: string[]) => string]> = [
    [/^未知的 Agent：(.*)$/, (product) => `Unknown Agent: ${product}`],
    [/^HARNESS_PRODUCT 指向未知 Agent：(.*)$/, (product) => `HARNESS_PRODUCT names an unknown Agent: ${product}`],
    [/^请从 Harness 根目录启动 Agent：(.*)。当前目录是 (.*)。$/, (root, cwd) => `Start the Agent from the Harness root: ${root}. Current directory: ${cwd}.`],
    [/^发现不应存在的产品级 Skill 或 Rules 副本：(.*)$/, (paths) => `Unexpected product-specific Skill or Rules copies: ${paths}`],
    [/^已发现 (\d+) 个可读取的公共 Skill；内容只来自 .agents\/skills。$/, (count) => `Found ${count} readable shared Skills, sourced only from .agents/skills.`],
    [/^已隔离 (\d+) 个无效 Skill，其余有效 Skill 不受影响。$/, (count) => `Isolated ${count} invalid Skills; other valid Skills remain available.`],
    [/^(Qoder|ZCode|CodeBuddy) Adapter 会把明确的 Skill 或 Harness 阶段路由到 .agents\/skills 中的真实文件，并要求 Agent 读取；自然语言隐式发现(仍需在真实会话中确认|属于尽力支持)。$/, (product, mode) => `${product} routes explicit Skills or Harness stages to real files in .agents/skills and requires the Agent to read them. Implicit natural-language discovery ${mode === "属于尽力支持" ? "is best effort" : "still needs confirmation in a real session"}.`],
    [/^(Qoder|ZCode|CodeBuddy) 不会把 .agents\/skills 加入原生 Skill 列表；Lumine Harness 的 Adapter 会定位对应 Skill 并要求 Agent 读取真实文件(，关键阶段明确 Skill 名称会更稳定)?。$/, (product, explicit) => `${product} does not add .agents/skills to its native Skill list. The Lumine Harness Adapter locates the matching Skill and requires reading the real file.${explicit ? " Naming the Skill explicitly at important stages improves reliability." : ""}`],
    [/^以下 CodeBuddy 记忆文件会遮蔽根 AGENTS.md：(.*)。请删除它们或正确导入根 AGENTS.md。$/, (paths) => `These CodeBuddy memory files shadow the root AGENTS.md: ${paths}. Remove them or import the root AGENTS.md correctly.`],
    [/^检查 (.*) 的启动目录和 Adapter 配置后重试。$/, (product) => `Check the startup directory and Adapter configuration for ${product}, then retry.`],
    [/^完成 (.*) 返回的一次性设置后，重新开启会话。$/, (product) => `Complete the one-time setup reported by ${product}, then start a new session.`],
    [/^发现 (\d+) 个仍然有效的会话指针，无法确定当前 Agent。$/, (count) => `Found ${count} active session pointers; the current Agent is ambiguous.`],
    [/^已汇总 (\d+) 个已选择的 Adapter。$/, (count) => `Summary of ${count} selected Adapters.`],
    [/^([a-z-]+)：(可以开始使用|完成一次设置后可用|可以试用|需要排查)$/, (product, label) => `${product}: ${adapterText(label, locale)}`],
    [/^从 Harness 根目录运行 (.*)。$/, (command) => `From the Harness root, run ${command}.`],
    [/^连接检查能识别 (ZCode|CodeBuddy) 和会话入口，并能观察到 Agent 读取 .agents\/skills 中的目标 SKILL.md。$/, (product) => `The connection check identifies ${product} and its session entry, and observes the Agent reading the target SKILL.md in .agents/skills.`],
    [/^单独授权修改用户 Profile 后执行：(.*)$/, (command) => `After obtaining authorization to modify the user profile, run: ${command}`]
  ];
  for (const [pattern, translate] of rules) {
    const match = value.match(pattern);
    if (match) return translate(...match.slice(1));
  }
  return value;
}

const HUMAN_ADAPTER_FIELDS = new Set(["label", "summary", "messages", "message", "title", "steps", "successSignal", "limitations", "description", "reason", "notes", "nextSteps"]);
function localizeAdapterValue<T>(value: T, locale: Locale, humanField = false): T {
  if (locale !== "en") return value;
  if (typeof value === "string") return (humanField ? adapterText(value, locale) : value) as T;
  if (Array.isArray(value)) return value.map((item) => localizeAdapterValue(item, locale, humanField)) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeAdapterValue(item, locale, HUMAN_ADAPTER_FIELDS.has(key))])) as T;
  return value;
}

export function adapterHelp(locale: Locale): string {
  const usage = [
    "  adapter status <current|selected|product> [--details] [--json]",
    "  adapter check <current|product> [--details] [--json]",
    "  adapter doctor <product|selected|all> [--json]",
    "  adapter list [--json]",
    "  adapter verify <product> [--begin --host-version <version>] [--json]",
    "  adapter install <kimi|zcode|deepseek-harness>",
    "  adapter uninstall <kimi|zcode|deepseek-harness>",
    "  adapter help",
    "  work-status <done|continue|blocked> --product <host> --session-id <id> [--reason <text>] [--next-step <text>]",
    "  work-status --report <json-file|-> --product <host> --session-id <id> [--emission-id <id>] [--expect-turn <revision>] [--json]",
    "  --root <project-root>"
  ];
  return (locale === "en" ? [
    "Lumine Harness Adapter commands", ...usage,
    "status/check read configuration and existing evidence; doctor explains setup requirements. These checks do not install host configuration or start a probe.",
    "--details expands capability evidence. --json preserves machine codes; labels and guidance follow the project language.",
    "verify --begin creates a verification probe. Installation may require separately authorized host configuration changes."
  ] : [
    "Lumine Harness Adapter 命令", ...usage,
    "status/check 读取配置与已有证据；doctor 说明设置要求。这些检查不会安装宿主配置或创建探针。",
    "--details 展开能力证据；--json 保留机器代码，人类标签与指导遵循项目语言。",
    "verify --begin 会创建验证探针；安装可能涉及需要单独授权的宿主配置修改。"
  ]).join("\n");
}
