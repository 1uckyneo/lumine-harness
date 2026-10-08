---
id: lumine-node-runtime-execution
title: Lumine Harness Node 支持基线调整
type: exec-plan
status: active
locale: zh-CN
specIds:
  - lumine-refactor-product
  - lumine-wiki-product-experience
---

# Lumine Harness Node 支持基线调整

## 当前结果与阶段

2026-09-30，用户确认上一轮已展示的全局产品政策和范围：推荐 Node24 LTS，最低支持22.18，覆盖整个 Harness。产品要求已原位回写[整体 Spec](../../product-specs/Lumine%20流程与文本知识体验.md)的全局政策、AC-runtime、AC-distribution，并同步[Repo Wiki Spec](../../product-specs/Repo%20Wiki%20知识体系与%20React%20阅读体验.md)第6节与AC-012。无需新的视觉设计，现有阅读设计继续适用。

2026-09-30，用户对已展示的本执行计划回复“执行”，Run 已确认。N0 已保存原生成资产、父仓受管及知识资产快照和两子仓指纹；源仓快照在并行入口整理初期取得，不能视为全部源码的改动前副本。两业务子仓干净，当前维护终端为 Node24.14.0；官方22.18.0、24.11.0、20.19.0、22.17.0已下载至临时目录并按官方SHA256校验，旧18.20.8验证环境保留。N1～N4规范实现、生成分发、双语说明、341项真实版本矩阵和69项最终配置增量已完成；源码与分发各235通过、1跳过。Node22.18／24.11浏览器正文、搜索与五类Mermaid请求隔离验证通过，中文文件／稳定ID／HTTP读取及服务重启补验通过。三项适用AC的本次证据与四项知识同步通过新Run任务合同检查；原Wiki其他AC保留原身份和缺口。N5父仓最终增量已应用并完成文件保护核对，四页知识通过受保护更新；正式升级仍待新入口真实Hook，未finalize。结果见[实施与验收](../../validation/lumine-node-runtime/2026-09-30/实施与验收.md)。本计划只复核受影响验收，不重新规划阅读器。

## 范围与约束

- 可实施范围：规范 TypeScript、构建脚本及清单、规范 Skill 与模板、项目自用入口、源码仓规则、中英文公开说明、相关测试和知识解释；生成 mjs、Plugin wrapper 通过构建与同步更新。
- 当前采用父工程用于对照和受管升级验证。先只读核对 Node 执行环境、未提交修改、受管清单和恢复资料，生成逐项升级提案；沿用已授权的父仓 Harness 范围，实际应用前核对提案不含业务文件和知识覆盖。环境或所有权冲突时停止该目标更新。
- Vue／Go业务子仓只读；不自动改业务 package.json/.nvmrc、依赖、分支、系统Node或用户profile，不提交、推送、部署或发布。
- 与既有 Repo Wiki 修改共存，保留原任务、验证、旧提案和恢复副本；不清理无关工作树。新增版本要求在实现与验证之后才写入 Wiki 现状。

## 已核实基线

| 对象 | 当前源码与限制 |
|---|---|
| 维护工具 | package.json 已要求22.18+或24.11+，但@types/node为26，未约束最低版本API |
| 公共分发 | tsdown.config.ts及scripts/build-runtime.ts的vendor构建仍target node18 |
| CLI与安装器 | assets/harness/cli使用PATH node；harness-manager同一Node进程执行inspect/proposal/apply/resume/rollback/finalize，分发入口未统一预检 |
| 外部Adapter | Codex/Qoder/Trae/Cursor通过node -e及process.execPath调用Hook；Kimi/ZCode/CodeBuddy/DeepSeek配置外部node命令 |
| OpenCode | src/opencode/plugins/harness.ts由宿主直接加载Core；源码不证明实际宿主为某个Node/Bun版本 |
| 历史验收 | Repo Wiki Node18运行和冷启动是其原构建证据，保留且不算新基线通过 |

Kimi/ZCode installed-dispatcher的旧harness-root判断与当前lumine-root标记不一致，是此次只读审计发现的独立问题。不能因提高Node版本宣称它已修复。为版本边界测试建立正负夹具时，如该问题阻挡测试，应将最小修复及验证单列，不静默扩大至用户profile或真实宿主安装。

## 技术选择

### 1. 一个支持策略，区分外部Node与宿主嵌入

正式Node范围为22.x >=22.18.0、24.x >=24.11.0的LTS发行版；预发布版和其他大版本不自动支持。维护包engines、版本谓词、帮助与双语说明同源，未来LTS加入需新的真实验证。推荐24 LTS不意味着能在最低22版本中调用24专属API。

版本信息与判断保持纯函数可测；实际执行入口读取当前进程，不能以维护终端或PATH探测值替代当前Hook进程。公共Core模块不在import时统一按process.versions.node硬挡。OpenCode激活时识别实际宿主，Bun的兼容Node版本不充当Node验收；必要API检查与真实宿主运行证据单独记录，未实测时保持未验证。

### 2. 先预检，再导入实现，再处理命令

外部Node入口使用低版本可解析的薄启动层，先给出稳定错误码、实际版本、支持范围和升级动作，再动态导入按node22构建的实现。不在已导入整个新Runtime之后才检查版本，否则新语法/API可能先报错。拒绝发生在读写业务状态、创建提案目录、改变Hook收据或启动服务之前；必要的启动诊断不生成项目状态。

覆盖包装器与直接mjs入口：check、wiki、task、adapter/skills/work-status、harness-manager、各外部Hook及installed dispatcher。将命令主流程显式导出给薄层调用，保持现有CLI参数、JSON输出、Hook协议和公共导出名称；测试必须检查直接mjs绕过包装器的路径。Bash帮助与直接Node调用遵循同一支持范围，不新增多套最低版本字面量。

薄启动层及它的最小策略依赖可保留较低语法目标，只为准确拒绝不支持环境；这不恢复Node18功能支持。其他Runtime与vendor统一node22目标。浏览器es2020目标、React/Mermaid离线分发与清洗仍独立保留。

### 3. 环境反馈与升级保护

Adapter检查分别报告实际Runtime、配置状态和宿主后验证据。若只能看到终端Node或静态配置，报告该观察边界，不给出宿主执行通过。Node不合格的Hook按该宿主既有失败协议反馈；不把宿主选择放行等同于Lumine已执行。中英文普通文案显示明确下一步，机器调用保留稳定错误身份。

安装/升级工具在目标写入前拒绝不支持环境；不静默改用户Node、PATH或版本管理器配置。已有业务项目仍可保持自己的Node要求，由用户为Harness提供合格执行环境。原恢复工具和备份留在被替换Runtime外，新版入口拒绝不能删除旧的独立恢复路径；旧工具仅在其已记录范围内使用，不承诺任意版本通用回滚。

### 4. 构建、类型与分发

约束Node类型到22系列，并以22.18实际Runtime复验；类型版本不单独证明每个API在22.18可用。先改TypeScript和规范静态入口/配置，再runtime:build生成产物，同步Plugin。构建清单显式登记薄层、实现模块和最小策略依赖，检查无未登记Runtime文件及错误静态导入。

README中英文、Adapter兼容说明、AGENTS、采用指引、Reader说明和帮助同步新要求。公共Core保持Agent产品中立；Adapter配置只写实际启动协议。许可、vendor自包含、路径保护、原子发布、旧chunk与人工修改保护保留。

## 实施顺序、Owner与暂停条件

| 阶段 | 结果与Owner | 暂停条件 |
|---|---|---|
| N0 基线与任务 | 主Agent记录并绑定新implement任务、适用AC哈希、源仓/父仓相关文件指纹、环境与恢复材料；保留原Wiki任务 | 提案/工作树/真实执行环境与计划不符 |
| N1 策略与薄入口 | 单一Owner维护版本策略、启动层、CLI/manager模块拆分及构建清单，先以负路径夹具证明写入前拒绝 | 低Node先遇解析异常，或公共导出/协议改变 |
| N2 Adapter与类型 | 独立Owner处理外部Hook配置/dispatcher与OpenCode识别；Node类型和构建目标串行集成 | Bun兼容声明被误判为真实Node、配置被冒充宿主验证 |
| N3 分发与说明 | 文档Owner同步规范说明和双语；主Agent构建、同步wrapper、核对产物/许可/清单 | source/wrapper或两种语言漂移 |
| N4 实际版本验收 | 正负Node矩阵、独立Skill与Plugin隔离安装、CLI/迁移/服务和Adapter协议回归 | 拒绝路径有目标写入，最低版本不能实际运行 |
| N5 父仓与知识收口 | 主Agent复核受管提案、在合格Node上验证父仓；保护子仓/业务引擎；核实后写回受影响Wiki，整理WorkReport与未验证范围 | 目标Node缺失、受管资产漂移或需用户级设置授权 |

并行不共享文件Owner：薄层/构建清单与Adapter接线约定接口后分工；集成和受管应用串行。无法同时取得某个实际Node或宿主时报告具体缺口，不能用版本字符串stub补成运行通过。

## 验证矩阵与验收映射

适用验收基线来自已确认的 Spec。这里只登记编号与指纹，不复制验收正文；后续语义变化先判断批准范围，再更新任务引用。

| Spec ID | AC | 当前基线 SHA256 |
|---|---|---|
| lumine-refactor-product | AC-runtime | `87ccae8d29935e83677b6fb34a26fcffad7172aebeadc6e9256f4ff42d4a1c6c` |
| lumine-refactor-product | AC-distribution | `12e470ec3f91c16deeb288deba722bb9fa99e181eb5702337de5dfbab13e19a2` |
| lumine-wiki-product-experience | AC-012 | `fdc7e2202aed2934be558b5ff37bbc115a2a37a76b3191cd672a0540978e66e1` |

| 判据 | 必要验证 |
|---|---|
| 全局AC-runtime | 实际22.18.0、24.11.0及当前24 LTS；18、20、22.17负路径；另用纯函数覆盖不支持大版本/预发布。启动检查与实际调用分别记录 |
| CLI/写入边界 | 包装器、直接mjs和外部Hook；不支持环境下help/查询/维护命令有准确反馈，apply/resume/rollback前后目标、知识、安装状态与用户配置哈希不变 |
| 全局AC-distribution | 规范源码构建、vendor/许可/资产清单、独立Skill与Plugin同源；支持版本无源码仓node_modules也能运行 |
| RepoWiki AC-012 | 支持版本无开发依赖/缓存、禁止外部请求情况下读取正文、查询、绘制既有Mermaid；说明请求隔离与物理断网区别，不用HTTP200代替图解和用户理解 |
| Adapter/嵌入 | 外部Node协议夹具逐Adapter核对；终端合格而Hook旧Node不误报；OpenCode/Bun实际宿主单独观察，未测试的产品端生命周期标为未验证 |
| 采用保护 | 非Git与Git隔离项目的拒绝、安装、升级/恢复/回滚；正式父仓只操作受管资产，Vue/Go业务树及业务Node配置保持原指纹；旧恢复材料可用 |
| 源仓门禁 | runtime:typecheck/build/check/test:source/test、专项启动与构建测试、check-skill-package、sync-plugin-wrapper、check-repo-sync、diff --check |

测试只覆盖上述变更及必要既有合同，不重新跑与本次无关的业务服务或全项目健康检查。自动化、CLI真实进程、浏览器、实际宿主、人工接受与发布分别报告。源码Wiki旧任务只更新已确认变更的AC-012基线并保留旧指纹，不把已取得的Node18记录改写为新基线证据。

## 恢复与交付

只在本次拥有且指纹仍匹配的文件上恢复；不reset/stash清理整个工作树。目标采用继续使用独立提案、逐项备份和恢复日志，回滚不覆盖后续人工修改。构建与同步只能重建规范资产，不用于抹掉目标知识状态或私有local资料。

交付包含全局支持策略与双语反馈、规范及生成分发、实际版本/隔离安装记录、父仓受管升级状态、受影响知识决定。没有真实Hook收据仍保留awaiting_host_verification，不以本机成功完成finalize；未测试的社区宿主与Bun不能宣称完整兼容。

## 自审与交接

计划对应用户已确认的全局范围；不修改业务Node，不降低离线/来源/恢复保护，明确了薄入口、嵌入Core、真实版本矩阵和安装写入边界。本文的结构检查与独立语义评审结果在本轮规划记录中保存；检查通过不等于新Runtime已运行。

本轮规划记录见[全局 Node 计划检查](../../validation/lumine-node-runtime/2026-09-30/计划检查.md)。规划任务 `lumine-node-runtime-20260930` 使用 plan 模式；原 Wiki implement 任务保留其实现及证据身份，不以任务绑定替代阶段确认。

Run 确认记录：2026-09-30 用户对本计划明确回复“执行”。N1～N4和N5可自主完成的受管同步与知识收口已完成；下一步取得父工程新入口真实SessionStart／Stop及实际Node记录后finalize。不重复请求同一范围的阶段许可；真实宿主缺口不是新的阶段授权问题。


## 2026-10-08 恢复记录

用户要求继续已确认 Run。当前 Node 24.14.0 下，独立 Node Run 的既有证据与知识合同仍通过；父仓恢复起点 200 项 postHash、198 项受管哈希无漂移，但全部既有 Hook 材料早于最终应用，旧探针已过期。已通过正式 CLI 准备新探针，保留原记录，未调用 Hook 或 finalize。

本日原 Wiki Run 发现并修复桌面宽表逐字竖排，受管增量 `8c2059a8-f42b-4fb0-9425-13e7f86452db` 已接续应用，保护核对通过。它是当前最新待真实宿主收口的提案；旧 Node 提案的历史状态保留。用户同时明确阅读器不要求窄屏使用场景，该产品范围由 Wiki Spec／设计／原 Plan 原位维护，未更改全局 Node 政策。恢复证据与准确下一步见[恢复与宿主验证](../../validation/lumine-node-runtime/2026-10-08/恢复与宿主验证.md)。不重复请求同范围阶段许可。


## 2026-10-08 宿主缺口的独立记录

本轮第二次只读核对仍为 `awaiting_host_verification`：200 项 postHash、198 项受管哈希一致；有效探针没有最新应用后的真实 Hook 或 processRuntime。原探针保留，不再重复 begin、Node 矩阵或受管 apply，不调用 finalize。证据见[第二次宿主核对](../../validation/lumine-node-runtime/2026-10-08/second-pass-host-audit.json)。后续只需父仓真实 Codex 会话正常交互，再核对匹配回执。

用户指出当前验收可能过严。据实际影响将该宿主缺口单列：它限制 Node 宿主运行声明与升级 finalize，不阻塞已经有桌面、文本知识及分发证据的 Wiki 改造成果交付。Node 支持政策不变，长期／人工接受／Token 等未观测项不合并成新的全局门禁；本轮停止追加无具体缺陷依据的验证。
