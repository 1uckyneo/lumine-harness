import { findHarnessRoot } from "./root-resolver.ts";
import { loadProjectConfig } from "./project-config.ts";
import type { ContractIssue } from "./documents.ts";
export type Locale = "zh-CN" | "en";
export function commandLocale(args: string[]): Locale {
  try { const index = args.indexOf("--root"); const root = index >= 0 ? args[index + 1] : findHarnessRoot(); return root ? loadProjectConfig(root).locale : "en"; } catch { return "en"; }
}
const ZH: Record<string, [string, string]> = {
  MISSING_ASSET: ["项目所需文件缺失或为空。", "核对配置指向的文件，恢复缺失内容；不要覆盖已有人工修改。"],
  CONFIG_VERSION: ["项目配置尚未完成版本升级。", "使用初始化入口检查升级提案与恢复日志，再继续迁移。"],
  MISSING_SKILL: ["规范 Skill 缺失或格式无效。", "检查 root.json 的 skills 路径，并恢复该 Skill 的名称、说明和正文。"],
  INVALID_SKILL: ["项目 Skill 的名称、说明或身份存在冲突。", "按报告的路径修复规范文件，不创建另一套宿主副本。"],
  MISSING_RUNTIME: ["当前 Runtime 文件不完整。", "安装完整分发包；源码仓应从 TypeScript 重新构建。"],
  INVALID_DOC_ID: ["文档缺少有效的稳定身份。", "为 frontmatter 的 id 设置唯一标识；标题和文件名可继续使用中文。"],
  DUPLICATE_DOC_ID: ["多个当前文档使用了同一个身份。", "保留唯一规范正文；若重命名被中断，先查看 task doc-operations 并恢复操作。"],
  INVALID_DOC_TYPE: ["文档类型与所在集合不一致。", "产品方案使用 product-spec，执行计划使用 exec-plan。"],
  MISSING_DOC_STATUS: ["文档缺少状态。", "记录当前状态；历史资料使用 historical，不把历史结论改成当前已验收。"],
  DOCUMENT_RELATIONSHIP: ["文档引用缺失、重复或无法唯一定位。", "检查稳定 id、aliases 和引用的目标；不要通过改标题掩盖身份冲突。"],
  INVALID_SPEC_REF: ["引用的目标不是有效产品方案。", "核对 specRef/specId 指向的产品方案身份。"],
  INVALID_PLAN_REF: ["引用的目标不是执行计划。", "核对 planRef 指向的执行计划身份。"],
  INVALID_PLAN: ["检查目标不是执行计划。", "使用计划的稳定 id 或项目内路径。"],
  DESIGN_REFERENCE: ["设计材料引用的本地文件不存在。", "恢复或更新实际使用的引用；不要求补齐固定附件套件。"],
  PROJECT_CONTRACT: ["项目专属规则没有满足。", "核对仓库边界、所选 Adapter 和文档约定；检查失败不授权修改业务规则。"],
  ADAPTER_SCHEMA: ["Adapter 能力说明的版本无效。", "恢复分发包提供的能力说明文件。"],
  ADAPTER_CONTRACT: ["Adapter 能力说明缺少必要字段。", "恢复完整契约，并区分配置、静态检查和真实运行证据。"],
  ADAPTER_EVIDENCE: ["Adapter 的证据状态无效。", "使用合法状态，不把静态测试写成真实宿主已生效。"],
  MISSING_ADAPTER: ["所选 Adapter 没有对应能力声明。", "核对项目所选宿主与安装的分发包。"],
  VISIBLE_PLACEHOLDER: ["界面源码可能含有用户可见的临时文案。", "在真实页面核对是否可见，再按当前授权范围处理。"],
  AC_BASELINE_CHANGED: ["本任务引用的验收条目发生变化，需要复核语义影响。", "比较当前条目与任务基线；纯排版可更新基线，实质要求变化需重做相关验证，不机械地重新申请批准。"],
  MISSING_AC: ["引用的验收条目已不存在。", "核对产品方案与 AC 标识，明确当前任务真正覆盖的验收项。"],
  DUPLICATE_AC_REF: ["任务重复引用了同一验收项。", "合并重复引用，保留一份当前基线。"],
  INVALID_AC_SPEC: ["验收项没有关联到产品方案。", "修正 specId，保持验收项和产品方案的关联。"],
  UNSTABLE_AC_REF: ["验收引用使用了会变化的标题或文件名。", "使用产品方案 frontmatter 的稳定 id。"],
  EVIDENCE_CHANGED: ["验证证据内容与记录不一致。", "核对原始结果与哈希，不得把改写后的报告当成原验证证据。"],
  MISSING_ARTIFACT: ["缺少可核对的验证文件或哈希。", "记录真实执行结果与文件路径；未执行的结果保持未验证。"],
  INVALID_EVIDENCE: ["验证结果状态无效。", "明确 passed、failed 或 not_verified，避免混淆实现与验收。"],
  INCOMPLETE_EVIDENCE_CONTEXT: ["证据缺少操作、环境或观测时间。", "补充实际执行的命令或动作、环境和时间。"],
  FUTURE_EVIDENCE: ["证据时间晚于当前时间。", "核对时间来源，保留真实观测时间。"],
  MISSING_CODE_BASELINE: ["证据未关联适用的源码版本。", "记录仓库 id、文件路径和验证时的内容哈希。"],
  UNREGISTERED_REPOSITORY: ["证据引用了未登记的仓库。", "核对项目仓库边界及 repoId，不跨仓借用证据。"],
  CODE_BASELINE_CHANGED: ["相关源码已变化，旧证据不能证明当前实现。", "仅复核受到影响的验证，再记录当前源码基线。"],
  CODE_BASELINE_MISSING: ["证据关联的源码文件不可读取。", "检查仓库路径与文件位置；跨仓源码缺失时不要宣称已验证。"],
  UNSCOPED_EVIDENCE: ["证据引用了本任务范围之外的验收项。", "让证据明确关联本次任务的产品方案和 AC。"],
  INCOMPLETE_AC_REF: ["证据的产品方案与验收项引用不完整。", "同时提供 specId 和 acId，或按局部修复记录无 AC 的证据。"],
  CURRENT_VALIDATION_NOT_PASSED: ["当前关联验证仍未通过。", "如有实施授权，处理任务内剩余工作；只诊断或验证时可报告失败并结束。"],
  MISSING_IMPLEMENTATION_EVIDENCE: ["本次实施尚无有效验证证据。", "执行范围内有意义的验证并记录结果，不能用健康检查替代行为证据。"],
  AC_NOT_VERIFIED: ["当前验收项尚无有效通过证据。", "核对缺少的验收项与源码基线，记录实际结果。"],
  NO_PASSED_VALIDATION: ["局部修复没有通过的验证结果。", "补充适用于本次修复的验证，不要求无关的全项目检查。"],
  KNOWLEDGE_PENDING: ["本任务需要同步的知识尚未完成。", "更新受影响的正文或明确处置结果，保护已有人工修改。"],
  KNOWLEDGE_REFS_MISSING: ["知识同步没有可核对的引用。", "记录已同步正文或处置说明的项目内路径。"],
  KNOWLEDGE_REF_MISSING: ["知识同步引用的文件不存在。", "恢复或更新引用，保持任务与知识记录一致。"],
  TASK_NOT_BOUND: ["当前实施请求尚未绑定任务证据。", "使用 task record 和 task bind 关联当前会话；绑定本身不授予实施权限。"],
  TASK_CONTRACT_ERROR: ["任务记录无法验证。", "检查任务格式、路径、引用和当前证据；仅诊断无需为此自动修复。"],
  CHECK_ERROR: ["检查未能完成。", "核对下方目标、路径或配置错误；失败不自动授予修复权限。"]
};
export function formatHumanIssue(issue: ContractIssue, locale: Locale): string {
  if (locale === "en") return `${issue.code}: ${issue.message}\nNext: ${issue.remediation}`;
  const [description, next] = ZH[issue.code] ?? ["发现需要复核的问题。", "按当前授权范围核对该问题；不要将检查状态当作人工验收。"];
  return `${issue.code}: ${description}${issue.path ? `\n文件：${issue.path}` : ""}\n下一步：${next}\n详情：${issue.message}`;
}
export function formatCommandError(error: unknown, locale: Locale): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (locale === "en") return `${detail}\nReview the command, current document/task version, and recovery state before retrying. No files should be overwritten to bypass a conflict.`;
  let guidance = "核对命令参数、项目根目录与文件格式，再重试。";
  if (/--expect|changed|sha256/i.test(detail)) guidance = "文件版本已变化或缺少基线。先重新读取目标及其 sha256，核对人工修改，再提供 --expect。";
  if (/conflict|operation|lock|interrupted/i.test(detail)) guidance = "有操作冲突或未完成的操作。先查看 task doc-operations；核对后使用 doc-recover 继续或回滚，不覆盖人工后改。";
  if (/collid|ambiguous/i.test(detail)) guidance = "名称存在冲突。请使用稳定 id，并选择与现有文件在大小写及 Unicode 规范化后也不同的路径。";
  if (/--product|--session-id/i.test(detail)) guidance = "绑定会话需要明确的宿主与会话标识；不要猜测或借用另一会话。";
  return `操作未完成。${guidance}\n技术详情：${detail}`;
}
