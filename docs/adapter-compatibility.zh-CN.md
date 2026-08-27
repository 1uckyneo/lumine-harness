# 在不同 Agent 中使用 Lumine Harness

本文适用于已经完成 Lumine Harness 项目接入的工程。Harness 根目录是包含 `.harness/root.json` 和 `.harness/cli` 的工程目录；如果还没有这些文件，请先返回[中文 README](../README.zh-CN.md)完成接入。

下面列出的是各产品的接入方式和 Lumine Harness 仓库已经提供的 Adapter，不代表你本机的当前会话已经验证通过。

## 找到你使用的 Agent

| Agent | 接入后的使用方式 | 第一次要做什么 | 使用时的主要差异 |
| --- | --- | --- | --- |
| Codex | 项目接入后直接使用 | 从 Harness 根目录开启新会话 | 原生发现 `.agents/skills`；项目 Hook 负责会话入口、结束检查和继续处理 |
| Cursor | 项目接入后直接使用 | 从 Harness 根目录开启新会话；只有 Cursor 明确提示工程受限时才按提示信任工程 | 原生发现 `.agents/skills`；未完成任务通过新一轮消息继续 |
| Trae | 完成一次设置后使用 | 在“设置 > 规则 > 导入设置”启用 `AGENTS.md`，在“设置 > 技能与命令 > 导入设置”启用 `.agents` 技能目录，并在“设置 > Hooks”启用项目 Hook，然后开启新会话 | 设置完成后原生发现 `.agents/skills` |
| Kimi Code | 安装一次后使用 | 运行 `./.harness/cli adapter install kimi`，重新加载 Kimi Code，再从 Harness 根目录开启新会话 | 原生发现 `.agents/skills`；Hook 失败时默认放行，高风险操作仍需独立确认 |
| Qoder | 项目接入后直接使用 | 从 Harness 根目录开启新会话；关键阶段明确说出 Skill 名称会更稳定 | Skill 不进入 Qoder 原生列表；Adapter 定位真实文件并要求 Agent 读取 |
| CodeBuddy | 确认项目 Hook 后使用 | 在 CodeBuddy 对话中运行 `/hooks`，审核当前项目的 Hook 变更，再开启新会话 | Skill 不进入 CodeBuddy 原生列表；Adapter 定位真实文件并要求 Agent 读取 |
| ZCode | 启用本地 Plugin 后使用 | 运行 `./.harness/cli adapter install zcode`，把返回目录加入 ZCode 本地 Marketplace，安装并启用 `lumine-harness-adapter`，再开启新会话 | Skill 不进入 ZCode 原生列表；最多连续自动继续 3 次 |
| OpenCode | 核心流程可以直接使用 | 从 Harness 根目录开启新会话 | 原生发现 `.agents/skills`；没有对等 Stop Gate，任务需要继续时由人发起下一轮 |
| DeepSeek Harness | 完成配置后试用 | 运行 `./.harness/cli adapter install deepseek-harness`，授权修改用户 profile，执行命令返回的 `dsh plugin` 安装指令，再开启新会话 | 当前属于开发预览，不应作为高风险操作的唯一门禁 |

所有项目 Skill 的正文只保存在 `.agents/skills/`。支持该目录的产品会直接发现它；Qoder、CodeBuddy 和 ZCode 的 Adapter 会根据明确的 Skill 名称或 Harness 阶段定位真实文件，要求 Agent 读取，并在宿主提供相应事件时检查是否已经读取。Adapter 不会复制 Skill 正文，也不会代替模型阅读文件。

## 最关键的 Hook 差异：结束前能不能先检查

多数产品都能在新会话开始或提交提示时补充工程上下文。真正影响长任务闭环的是：Agent 准备结束时，宿主是否提供停止前门禁（Stop Gate）。本文把各产品提供的这类结束前能力统称为 Stop Gate；它不一定是产品中的实际事件名称。

这些差异不是把 `.codex` 改成另一个目录名就能解决。不同 Agent 的 Hook 没有统一协议：配置位置、事件名称、触发时机和返回值都可能不同；有的 Hook 可以阻断当前动作并向 Agent 反馈，有的只能在动作结束后收到通知；失败时也可能分别采用默认阻断或默认放行。Lumine Harness 的 Adapter 可以把已有协议转换为统一的 Harness 语义，但不能补出宿主本身没有提供的生命周期能力。

Stop Gate 在本轮真正结束前执行。它可以读取 `WORK_STATUS`、运行 Harness Check，并据此允许结束、要求继续，或把需要决策、凭据和人工操作的事项交还给人。结束后的日志或通知事件不能替代它。

| 情况 | Agent | 对使用者的影响 |
| --- | --- | --- |
| 有停止前门禁，宿主协议允许 Adapter 请求继续 | Codex、Qoder、Trae、Cursor、CodeBuddy | 未完成的长任务可以先检查，再继续推进 |
| 有停止前门禁，但存在产品限制 | Kimi Code、ZCode、DeepSeek Harness | Kimi Hook 失败时默认放行；ZCode 最多连续自动继续 3 次；DeepSeek Harness 仍是开发预览 |
| 没有对等的停止前门禁 | OpenCode | 可以读取工程资产并执行核心流程，但不能在停止前阻止过早结束；任务未完成时需要人发起下一轮 |

OpenCode 的 `session.idle` 发生在 Agent 已经进入空闲状态以后。Lumine Harness 的 OpenCode Adapter 只把它用于结束后审计；它不能当作 Stop Gate，也不能可靠地自动重新进入本轮任务。

## 检查是否已经生效

完成上表中的首次设置后，从 Harness 根目录开启新会话，然后发送：

```text
检查当前 Agent 的 Lumine Harness 是否已经生效。
```

检查结果会告诉你：

- 现在能不能开始；
- 还需要完成什么一次性设置；
- 当前产品有哪些会影响使用的限制；
- 接下来应该做什么。

这项检查是只读的，不会修改业务代码或项目文档。

如果结果显示“无法识别当前 Agent”：

1. 确认当前会话是从 Harness 根目录新开的；
2. 仍无法识别时，让 Agent 运行 `./.harness/cli adapter check <product>`，把 `<product>` 换成当前产品标识；
3. 显式产品检查只能确认工程配置和已知限制，不能证明本次会话已经实际触发 Hook。

显示“可以开始”后，就可以提出第一项真实需求。显示仍有设置未完成时，按结果完成设置，再开启新会话复查。

Skill 发现方式和 Hook 能力改变的是自动化方式，不改变 Draft、按需 Design、Product Spec、Exec Plan、Run 和 Validation 的项目流程。

普通使用者到这里就足够了。只有维护 Adapter 或排查产品协议时，才需要阅读 [Adapter 调试与发布检查](adapter-verification.zh-CN.md)。

## 官方能力参考

- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [Qoder Skills](https://docs.qoder.com/extensions/skills) 与 [Qoder Hooks](https://docs.qoder.com/extensions/hooks)
- [Trae Skills](https://docs.trae.cn/ide_skills) 与 [Trae Hooks](https://docs.trae.cn/ide_automate-actions-with-hooks)
- [Kimi Code Skills](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html) 与 [Kimi Code Hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)
- [Cursor Skills](https://cursor.com/docs/skills) 与 [Cursor Hooks](https://cursor.com/docs/hooks)
- [OpenCode Skills](https://opencode.ai/docs/skills/)、[OpenCode Plugins](https://opencode.ai/docs/plugins/) 与 [停止前事件提案](https://github.com/anomalyco/opencode/issues/16626)
- [ZCode Skills](https://zcode.z.ai/en/docs/skill) 与 [ZCode Hooks](https://zcode.z.ai/en/docs/hooks)
- [CodeBuddy Skills](https://www.codebuddy.ai/docs/cli/skills) 与 [CodeBuddy Hooks](https://www.codebuddy.ai/docs/cli/hooks)
- [DeepSeek Harness Skills](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md) 与 [Codex Hook bridge](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/hooks-codex/README.md)
