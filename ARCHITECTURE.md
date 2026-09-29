# Lumine Harness 架构地图

Lumine 将模型的判断指导、确定性工具与宿主协议分离。本仓使用自己的构建 Runtime 和规范 Skill；安装项目使用分发包与项目内四个 Skill。

## 规范源码与生成边界

- `skills/lumine-harness/src/harness/core/`：项目身份、任务、文档、状态与证据规则。
- `src/harness/adapters/`：宿主事件和返回协议。
- `src/harness/wiki/`：纯文本扫描、检索、三方合并、只读 HTTP 与来源约束。
- `src/browser/`：Markdown 和 Mermaid 驱动的 HTML 阅读器。
- `src/scripts/harness-manager.ts` 与 `src/migration/`：独立提案、安装升级和旧项目转换，不进入日常 Runtime。
- `assets/skills/` 与 `assets/locales/en/`：中英文资源；目标项目只安装选定语言。
- `scripts/build-runtime.ts`、`build-reader.ts`：生成 Node18 Runtime 与独立浏览器 bundle。
- `plugins/lumine-harness/`：由同步脚本生成的分发包装。

## 自用入口

`.lumine/root.json` 固定项目身份、Runtime 和规范 Skill 位置。`.lumine/project.json` 登记语言、来源仓库与监控范围。`docs/repo-wiki/` 的四个专题解释架构、采用恢复、任务检查和 Wiki 生命周期；所有图保持 Mermaid 文本来源。

知识的持久基线、候选与冲突和任务记录都属于项目资产，不随 Runtime 更新淘汰。阅读器的 HTML/SVG 是显示结果，不成为另一份知识正文。

## 验证与限制

运行类型、构建一致性、源/分发回归、Skill 包与 wrapper 检查。浏览器及 Node18 离线分发另验；Codex/Trae 的实际 Hook 执行不能由配置或模拟事件证明。私有路径、凭据及客户数据不得进入公共资源。
