# AGENTS.md - {{project_name}}

## 范围与边界

{{implementation_surface}}

在实际实现仓内执行代码、验证与 Git 操作。Harness 根由 `.lumine/root.json` 及项目身份确定，不用最近 Git 根替代。保留项目明确的可写／只读范围与已有修改，不自动提交、推送、部署、切分支或改写历史。

## 工程入口

按任务选读，不机械加载全部资料。

- `README.md`：启动、使用和常用命令。
- `ARCHITECTURE.md`：架构边界与实现入口。
- `docs/workflow-artifacts.md`：Spec、Plan、Wiki 与验证的职责。
- `docs/product-specs/`：产品目标、行为和验收。
- `docs/exec-plans/active/`：当前技术方案、进度和恢复；`completed/` 保存历史执行记录。
- `docs/repo-wiki/`：默认知识正文根；实际位置以 `.lumine/project.json` 为准。
- `docs/validation/`：验证证据。
- `.agents/skills/`：项目规范 Skill 的唯一公共位置。
- `.lumine/`：Runtime、配置、任务与知识维护状态。
- {{repo_rules_entry}}

只在启用并需要时读取 `docs/FRONTEND.md` 和设计参考。

## 实现地图

{{directory_map}}

{{fact_index_targets}}

## 四个日常能力

实际读取适用 Skill，不能把目录存在或名称命中当作已读。

- `lumine-plan`：需求、产品 Spec、技术 Exec Plan 及方案审阅；只改 Spec 时不强制建 Plan。
- `lumine-run`：实施、恢复、验证和诊断；只验证请求不自动修复。
- `lumine-knowledge`：定位、查询、来源核实和 Wiki 维护。
- `lumine-design`：视觉与交互选择及设计审阅。

按本轮目标和授权选择能力，不用关键词决定实施。完整功能通常是 Spec → 必要设计 → Plan → 实施验证 → 相关知识更新；既有授权下连续推进，不因切换能力新增确认。没有新产品决定、不改变既定行为合同且无需独立协调的局部修复可以直接处理，仍须目标、边界和证据。

检查是 Runtime 工具，不是第五个 Skill。结构检查不能替代对应领域的语义审阅。运行 `./.lumine/cli --help` 查看接口；任务检查与显式项目健康检查分别使用。

## 事实、语言与知识

- Spec 定义预期行为，Plan 定义本次技术选择与进度，Wiki 解释已知现状。源码证明开发实现；测试、实际运行、部署和用户接受分别记录。
- 按目标自主选择 Wiki、源码或组合，不全量注入知识，也不强制每次查询。核实缺口、过期或矛盾后，在授权范围内把可复用结论写回；明确只读时保持只读。权威规则不受卡片预算或检索排名限制。
- 需求、验收、文档与图使用稳定身份，标题和中文／英文文件名可变。内容指纹发现变化，不代表用户批准。
- 采用项目 `locale` 作为新内容默认语言；已有文档保持自身语言。临时答复语言不改项目配置。
- Wiki 正文、摘要与 Mermaid 是唯一知识内容，卡片为 HTML；知识维护不生成图片、截图或视觉模型输入。
- `.lumine/wiki-state/` 的基线、人工保护、候选和冲突是持久资产；`.lumine/local/wiki/` 才是可重建缓存与本机态。不要清理唯一恢复资料。
- 敏感值、私有地址和客户资料不进入公共文档、日志或截图。

## 协作与收尾

并行写入使用互斥 owner，明确输入、写入范围、验收和停止条件；集成串行，运行验证在相关实现集成后执行。详细证据放 `docs/validation/`，Plan 只保存当前摘要和链接。本任务需要的知识同步未完成不能整体报完成，无关过期页面不阻塞。

收尾只写一条 `WORK_STATUS: <status>`：

- `done`：本轮目标已完成；诊断报告可包含失败结果，不意味着自动修复。
- `continue`：下一步明确、在当前授权内且可以自主推进。
- `blocked`：当前不能自主推进；在正文说明具体原因和下一步。

状态不产生新授权，不能用其他续跑分支绕过预算；仅诊断完成不强制修复。详细协议由 Runtime 维护。

## 项目约定

{{project_specific_rules}}
