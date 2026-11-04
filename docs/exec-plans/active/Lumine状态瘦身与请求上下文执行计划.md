---
id: lumine-storage-context-plan
title: Lumine状态瘦身与请求上下文执行计划
type: exec-plan
status: active
locale: zh-CN
specId: lumine-refactor-product
---

# Lumine状态瘦身与请求上下文执行计划

## 当前结果与授权

2026-11-04 用户以“PLEASE IMPLEMENT THIS PLAN”明确确认本计划的实施、迁移、提交与推送。源仓基线 cc722c514f092fc8bc45fc964caa9d3315adadaf；源仓状态 13,226,563 字节，试点状态 159,905,059 字节。原有未跟踪目录保留。本轮任务为 lumine-storage-context-20261104，存储与请求作用域已实现，源仓与试点均已显式迁移；适用验证已完成，提交和远端核验作为本计划最后交付步骤。

## 目标与验收

原位补充[现有产品方案](../../product-specs/Lumine%20流程与文本知识体验.md)的 AC-storage、AC-storage-migration、AC-request、AC-storage-delivery，复用 AC-update、AC-cold、AC-task 的保护要求。试点维护自身升级计划和验证资料，通过源仓文档／提交引用，不复制第二套产品合同。

## 技术方案

内存对象保持既有行为接口，磁盘通过统一层双读旧记录／内容引用；对象按 SHA-256 存储，校验类型、长度、路径和字节。完成包和事务转为轻量回执，活动包保留全部语义，三方合并读取独立生成基线。强引用与审计哈希区分，完成后回收无引用全文。

整理预演输出输入库存、精确哈希、预计收益与保护列表。应用重核清单哈希并持有 Wiki 锁，在忽略恢复目录保存原始字节。配置 schemaVersion 3 作为旧 Runtime 拒绝入口，workflowVersion 不变。先版本保护、再转换、完整性核验、最后清理；恢复幂等，回滚最后恢复旧配置。后续人工修改使恢复／回滚冲突，不覆盖。已有 document-operations 回滚记录原字节保留。

请求作用域只存本机；可靠 host turn 标识或公共 session begin/show 建立范围，任务引用独立。自动续跑、重试不产生新产品需求，同一功能延用任务与 Spec／Plan；仅确认变化影响。未知范围要求澄清声明，实施门禁保留。共享 Skills 与 Adapter 上下文引导 Agent 调公开入口，不手改会话 JSON。

## 实施顺序与文件归属

1. 冻结两仓完整状态、旧 Runtime、任务和 Git 基线（已完成）。
2. 并行实现：存储 owner 维护 wiki/storage、engine、documents、transactions；迁移 owner 维护 compaction 及故障测试；请求 owner 维护 session/core/adapter CLI 及回归。集成 owner 维护配置 schema、wiki CLI、文档与构建，不交叉写同一文件。
3. 规范 TypeScript／Skill 变更后统一生成 Runtime、Hook 配置、Plugin wrapper。
4. 试点完整状态副本隔离演练，核对活动包、人工编辑、故障、回滚、体积与旧 Runtime 拒绝。
5. 正式升级提案安装 Runtime，显式整理试点；保留业务、服务、个人 Skill、任务身份及历史证据。
6. 源仓自用环境执行同工具迁移；记录独立恢复备份。
7. 验证、形成源仓提交，再使试点升级记录引用该源提交并发布双方目标。

## 验证与交付

源仓规定 typecheck、build、check、完整 runtime:test、Skill 包及 wrapper 检查全部执行。专项测试覆盖对象损坏、路径、非 Git、持久步骤中断、CAS、降级、活动包与三方合并；100 次无变化扫描／应用／恢复不产生共享差异。试点从完整状态演练，保留18 prepared 和11 partial语义；冷缓存阅读、搜索和Mermaid另有运行证据。Codex真实Hook与Trae协议测试分开记载。验证详情集中[验证记录](../../validation/Lumine状态瘦身与请求上下文验证.md)。

发布使用普通提交。源仓 main 先更新远端引用并核对，再分别推至 origin/main 与 gitee/main；不描述为跨远端原子推送。试点拉取最新共享分支并合入个人分支、检查后再次拉取、快进合并，原子推送两个同源分支。读取四个远端 SHA 核验；任何一路失败保留已成功状态，不强推。

## 实施结果（2026-11-04）

源仓当前状态 821,493 字节，试点 14,876,671 字节，分别减少约 93.79% 与 90.70%；本地备份和 Git 历史另列。18 prepared／11 partial 与旧任务、人工内容、文档回滚资料保持。完整测试 306 项：305 通过、1 项既有跳过、0 失败；类型、构建、生成一致性、Skill 包与 wrapper 检查通过。隔离副本的四类无变化操作各 100 次、旧 Runtime 拒绝与原字节回滚、冷启动阅读器及真实 Codex Stop 均有证据。

最终评审发现的迟到轮次／回复重放与正常进度关联边界已补回归；有界历史及缺少可靠宿主标识的限制写入共享指引。Trae 只取得协议测试，公共探针未取得自动续跑送达认证所需的完整回执。试点五条既有知识引用解析问题与旧版本完全一致，未扩大范围修复。具体证据与限制以验证记录为准；本计划及原 Spec、任务身份原位保留。
