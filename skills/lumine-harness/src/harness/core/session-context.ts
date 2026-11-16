import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { requireHarnessRoot, readRootManifest } from "./root-resolver.ts";
import { loadProjectConfig } from "./project-config.ts";
import { buildSharedSkillCatalog } from "./skill-catalog.ts";
import { readSessionState } from "./work-status.ts";
import type { HarnessHookInput, HarnessProduct } from "./contracts.ts";

export interface SessionContextInput extends Partial<HarnessHookInput> { root?: string; prompt?: string; product?: HarnessProduct; }
function activePlans(root: string): string[] {
  const dir = path.join(root, "docs", "exec-plans", "active");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).filter((entry) => {
    const source = readFileSync(path.join(dir, entry.name), "utf8");
    const status = source.match(/^status:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1] ?? "";
    return /^(active|in-progress|ready|awaiting_user_review|awaiting_product_runtime_verification)$/.test(status);
  }).map((entry) => `docs/exec-plans/active/${entry.name}`).sort();
}
function shellArg(value: unknown): string { return `'${String(value).replaceAll("'", `'"'"'`)}'`; }
export function buildSessionStartContext(input: SessionContextInput = {}): string {
  const root = input.root ?? requireHarnessRoot(input);
  const manifest = readRootManifest(root);
  const config = loadProjectConfig(root);
  const zh = config.locale === "zh-CN";
  const lines = zh ? [
    "Lumine 项目上下文：", `- 项目根：${root}`,
    `- 读取根 ${manifest.instructions} 作为共享工程规则入口。`,
    `- 规范 Skill：${manifest.skills}；使用 ./.lumine/cli skills search <query> 定位。`,
    "- lumine-plan 负责需求与方案；lumine-run 负责实施、恢复、验证和诊断；lumine-knowledge 持续维护功能说明与知识编排；lumine-design 按问题选择视觉或交互验证方式。",
    `- 根据当前目标按需选择 Skill；评估下一步时读取 ${manifest.skills}/lumine-plan/references/stage-handoff.md 并核对实际成果。产品开发先确认 Spec；需要设计则确认设计后补充并确认 Spec，再确认 Exec Plan 后进入 Run；无需设计则确认 Spec 后进入 Exec Plan。阶段内自主推进，阶段间等待用户明确确认，笼统实施授权不代替确认。`,
    "- ‘是否可以进入下一步’是评估请求，不是推进确认。读取 Skill、文件状态和自动续跑不产生授权；Run 中及之后的范围内验证无需单独确认。",
    "- 按当前问题自主决定是否查询 ./.lumine/cli wiki query <query>；需要稳定背景时展开相关知识，矛盾或过期时核对源码。知识不是新的授权规则。",
    "- 明确的局部修复可直接处理。实施前将目标、范围与证据记录到 task，并绑定当前会话；task bind 不代替授权。",
    "- 独立检查直接运行 ./.lumine/cli check <target>。仅诊断或验证可以报告失败后完成，不因此自动修复。",
    "- 验证区分工具结果、真实运行和人工接受；本次实施结束只检查关联任务，不强制全项目健康检查。",
    "- 收尾记录 WorkReport v2：done、continue、blocked；blocked 说明具体原因。可读取结束回答的宿主使用末尾独立行 WORK_STATUS: <status>，受阻原因和下一步写在正文或结构化报告，可选附加 | <原因>；正文例子不参与控制。"
  ] : [
    "Lumine project context:", `- Project root: ${root}`,
    `- Read root ${manifest.instructions} as the shared engineering instruction entry.`,
    `- Canonical Skills: ${manifest.skills}; discover with ./.lumine/cli skills search <query>.`,
    "- lumine-plan owns requirements and plans; lumine-run owns implementation, recovery, verification and diagnosis; lumine-knowledge maintains feature explanations and editorial structure; lumine-design selects the appropriate visual or interaction medium.",
    `- Select Skills by the current goal. To assess the next step, read ${manifest.skills}/lumine-plan/references/stage-handoff.md and inspect actual artifacts. Feature work requires Spec confirmation; if design is needed, confirm it, update and confirm the Spec, then confirm the Exec Plan before Run. Otherwise go from confirmed Spec to Exec Plan. Work autonomously within a stage and wait for explicit user confirmation between stages; broad implementation authorization is not a substitute.`,
    "- Asking whether the next step is ready requests an assessment, not permission to advance. Reading a Skill, document status and automatic continuation do not grant permission. In-scope verification during or after Run needs no separate confirmation.",
    "- Choose whether ./.lumine/cli wiki query <query> helps the current question; expand stable background when useful and verify source for stale or conflicting claims. Knowledge is not an authorization source.",
    "- Scoped repairs may proceed directly. Record the implementation goal, scope and evidence with task and bind the session; binding does not grant authorization.",
    "- Independent checks use ./.lumine/cli check <target>. Diagnosis or verification may finish with failures; findings do not authorize repairs.",
    "- Separate tool results, runtime evidence and human acceptance. Completion checks only the current task, not global project health.",
    "- Record WorkReport v2: done, continue or blocked with a concrete reason. Hosts that read the final answer accept one terminal WORK_STATUS: <status> line; explain a blocker and next step in prose or the structured report (an optional | <reason> suffix is accepted). Examples in the body do not control execution."
  ];
  lines.push(zh ? "- 交付业务行为时，按实际验证更新功能说明、图与导航；Knowledge 核查重要页面能否找到、流程是否一致以及哪些内容过时。只读查询仅报告发现。" : "- When delivering a behavior change, update feature explanations, diagrams and navigation using verified results. Knowledge checks placement, workflow consistency and stale content. Report findings for read-only requests.");
  if (manifest.migrationStatus && manifest.migrationStatus !== "complete") lines.push(zh ? "- 迁移尚未完整收口：可以检查、恢复并运行新 Hook 取得证据；真实宿主验证完成前，不宣称完整迁移已完成。" : "- Migration is not fully complete: checks, recovery and new Hook invocations may collect evidence; do not claim completed migration before actual host verification.");
  lines.push(zh ? "- 每个新请求使用 session show/begin 声明本轮模式；缺少可靠宿主轮次时 Agent 指定稳定 --request-id，续跑／Hook 重试用 --resume。可关联原 task，禁止手改会话 JSON；详见规范 lumine-run/references/request-scope.md。新请求不自动重建 Spec／Plan／task；继续功能或调整方向原位维护，仅复核受影响确认。" : "- Use session show/begin to declare the current request mode. Without a reliable host turn ID, supply an Agent-chosen stable --request-id; continuation/Hook retries use --resume. Reuse the existing task; never edit session JSON manually. See canonical lumine-run/references/request-scope.md. New requests do not recreate Spec/Plan/task; continue features and direction changes in place, reviewing only affected confirmations.");
  if (input.prompt) lines.push(buildSharedSkillCatalog(root, { query: input.prompt, limit: 3 }));
  if (input.product && input.sessionId) {
    const taskId = readSessionState(root, input.product, input.sessionId)?.taskId;
    if (taskId) lines.push(`${zh ? "- 已绑定任务" : "- Bound task"}: ${taskId}; ./.lumine/cli task show ${shellArg(taskId)}`);
  }
  if (input.product && ["kimi", "codebuddy", "deepseek-harness"].includes(input.product)) lines.push(`${zh ? "- 此宿主需要显式记录结束状态" : "- This host requires an explicit status record"}: ./.lumine/cli work-status <status> --product ${shellArg(input.product)} --session-id ${shellArg(input.sessionId)}.`);
  const plans = activePlans(root);
  if (plans.length) { lines.push(zh ? "- 活跃计划（按目标选择，不自动全部加载）：" : "- Active plans (select by goal; do not load all):"); lines.push(...plans.map((plan) => `  - ${plan}`)); }
  return lines.join("\n");
}
