# 项目合同

## 公共入口与存储

- `.lumine/root.json` 标识项目根；`.lumine/project.json` 管理语言、仓库、能力和知识配置。
- `.agents/skills/` 只分发 `lumine-plan`、`lumine-run`、`lumine-knowledge`、`lumine-design` 四个日常规范入口。初始化维护入口仍为 `lumine-harness`。
- `AGENTS.md` 是规则与地图，`ARCHITECTURE.md` 是架构概览。强制规则不能只靠知识检索发现。
- Spec 默认 `docs/product-specs/`，Plan 默认 `docs/exec-plans/active/`，历史执行计划位于 `completed/`，证据位于 `docs/validation/`。
- 知识正文默认 `docs/repo-wiki/`，配置只指定一个权威根。`.lumine/wiki-state/` 保存持久维护状态；`.lumine/local/wiki/` 只保存可重建缓存／本机态。

## 身份与语言

Spec／Plan 使用 `id` 和类型；Wiki 单元按知识接口保存稳定 ID。标题、文件名和稳定身份分开；可读名称允许中文与空格。AC 使用显式 `AC-001` 类编号，图和重要章节有稳定引用。CLI 通过 ID、路径或无歧义名称解析，不猜测同名目标。

项目语言为 `zh-CN` 或 `en`，在提案和指纹前确定。新正文遵循默认语言，已有文档保持自身语言；切换界面或临时答复语言不翻译正文。语言资源必须语义一致，协议字段、状态值和 Skill 技术名不翻译。

## 工作与证据

规划可以只产出 Spec；完整功能通常使用 Spec＋Plan。技术方案由 Plan 维护，实施后的稳定知识进入 Wiki，未实现目标不覆盖现状。四个 Skill 由意图与授权调度，不要求用户逐项调用，不因阶段切换重审批。只验证模式不修复。

Runtime 承担可确定的检查，四个能力承担各自语义评审。完成依据对应当前请求、验收子集、内容基线与真实操作，测试、运行、部署和用户接受分别表达。任务记录位于 `.lumine/tasks/`，绑定当前会话和模式；详情参见[检查与证据](runtime-checks.md)。

公共控制状态为 `done`、`continue`、`blocked`；具体阻塞原因与下一步另行说明。状态不产生授权，自动跟进共享预算和去重。诊断 done 可以包含失败发现。只有明确包含在本任务内的知识同步才能影响该任务完成。

## 知识表达

Markdown 与 Mermaid 文本是一份内容真源，卡片为 HTML DOM。模型仅处理文本，图在浏览器即时渲染；不生成图片、缩略图或视觉模型输入。图解释实际机制并关联来源，文字阅读和文本复制／导出始终可用。
