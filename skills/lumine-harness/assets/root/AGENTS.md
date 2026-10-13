# AGENTS.md - {{project_name}}

## 范围与边界

{{implementation_surface}}

在实际实现仓内执行代码、验证与 Git 操作。Harness 根由 `.lumine/root.json` 及项目身份确定，不用最近 Git 根替代。保留可写／只读范围与已有修改，不自动提交、推送、部署、切分支或改写历史。

## 按需入口

- `README.md`：启动与使用。
- `docs/repo-wiki/README.md`：架构、实现入口、领域语言、工程资料与 Lumine 使用指南；知识根以 `.lumine/project.json` 为准。
- `docs/workflow-artifacts.md`：Spec、Plan、Wiki、Validation 的职责。
- `docs/product-specs/`、`docs/exec-plans/active/`：产品要求与本次技术方案；`completed/` 保存执行历史。
- `docs/validation/`：实际验证与采用验收；`.lumine/`：配置、任务和维护状态。
- `.agents/skills/`：规范 Skill 唯一公共位置。
- {{repo_rules_entry}}

{{directory_map}}

{{fact_index_targets}}

## 日常工作

按目标读取适用 Skill：`lumine-plan` 负责需求与技术规划，`lumine-design` 负责视觉交互，`lumine-run` 负责实施、恢复、验证和诊断，`lumine-knowledge` 负责知识与阅读器。名称命中或目录存在不代表已读取。项目服务使用已有扩展，区分 Wiki 阅读器与业务服务。

产品工作按 Spec →（必要设计 → 回写同一 Spec）→ Exec Plan → Run 推进。Agent 判断就绪和下一步，各阶段交接针对具体成果取得人的明确确认；阶段内自主，同一范围不重复确认。就绪询问、文档状态和早期笼统意愿不产生下一阶段授权。细则见[阶段交接](.agents/skills/lumine-plan/references/stage-handoff.md)。Run 中或之后验证不另设确认；明确局部维护、只验证和诊断按自身范围处理，诊断不自动授权修复。

检查是 Runtime 工具，不是第五个 Skill。`./.lumine/cli --help` 提供接口；结构检查不能代替语义审阅、真实运行或用户接受。

## 规范、知识与事实

- 本文件保留最小硬规则并直接链接适用规范附件，按任务完整读取，不用检索片段代替；详细规范、示例、实现知识各只维护一份正文。以本文件及明确授权附件为准，遗留代码不自动推翻规范。
- Spec 定义目标，Plan 定义本次技术选择与进度。Wiki 保存现状、已确认的长期领域语言与决定、使用指南及授权规范，明确效力和实现状态。未实施方案不写成现状；源码、测试、运行、部署和用户接受分别表达。
- 普通知识同步不得改变规范或授权；规则变更须说明依据并复核相关内容。Wiki 内部用正文链接和 relations 关联，不互相登记为来源快照，关系不自动触发来源过期。
- 按问题选择 Wiki、源码或组合，核实后在授权范围回写；明确只读时保持只读。权威规范不受搜索排名或卡片预算限制。
- 新正文与主题文件名默认跟随项目 locale，保留 README、模板名及必要技术词。稳定 ID、AC、章节独立于文件名；已有文件不批量改名，名称兼容 Windows。
- Markdown、Mermaid 与文本来源是知识真源；知识维护不生成图片或视觉模型输入。敏感值、私有地址和客户资料不进入公共文档、日志或截图。
- `.lumine/wiki-state/`、任务与验证是持久资产；`.lumine/local/wiki/` 才是可重建缓存／本机态。保留人工内容、有效候选、冲突与唯一恢复资料。

## 协作与收尾

并行写入分配互斥 owner，集成串行。证据放 Validation，Plan 留当前摘要与链接。本任务承诺的知识同步未完成不能整体报完成，无关欠账不阻塞。

收尾只写一条 `WORK_STATUS: done|continue|blocked`，分别表示本轮完成、可自主继续、需具体条件；正文说明原因和下一步。状态不产生授权，诊断完成可包含失败发现。安装完成、内容完成与实际验证分别报告。

## 项目约定与规范附件

{{project_specific_rules}}
