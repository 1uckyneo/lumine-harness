# Adapter 兼容性说明

本页记录 Lumine Harness 与不同 Agent 产品之间的协议边界。产品能力会随版本变化，因此必须分别判断：仓库是否准备好、产品是否真实执行、当前能力成熟到什么程度，以及失败时是否会放行。

## 四个判断维度

### 静态就绪状态

- `not-selected`：项目没有选择这个 Adapter；
- `needs-setup`：仓库入口存在，但还需要产品设置、安装或授权；
- `repository-ready`：仓库侧配置和人工步骤已经就绪。

`adapter doctor` 只检查这一层。配置文件存在，不代表产品实际读取或执行。

### 运行证据

- `runtime-pending`：还没有完成指定产品与版本的真实事件验证；
- `host-verified`：已经保存产品、版本、日期和完整事件链证据。

仓库单元测试不能把 `runtime-pending` 自动升级为 `host-verified`。

### 能力成熟度

- `full`：目标生命周期能力在 Adapter 设计中完整；
- `partial`：产品缺少某些生命周期能力，部分门禁会降级；
- `developer-preview`：协议或依赖仍不稳定，不作为正式兼容承诺。

### 失败模式

- `fail-closed`：门禁失败时阻止或暂停继续执行；
- `fail-open`：Hook 错误或超时时产品仍可能继续运行，不能作为高风险操作的唯一安全门。

## 公共工程资产

Lumine Harness 把公共资产统一保存在：

- 根 `AGENTS.md`；
- `.agents/skills` 中的真实 Skill；
- Draft、Product Spec、Exec Plan、Validation 和 generated；
- `.harness` Core、CLI、检查和运行状态。

这表示仓库只维护一份公共真源，不代表每个 Agent 产品都已经成功加载。实际读取和生命周期执行必须由对应产品的运行证据证明。

Adapter 只负责上下文注入、工具事件、生命周期和产品协议转换。目标工程的 `AGENTS.md` 不包含产品兼容矩阵，也不要求模型判断自己运行在哪个产品中。

## Skill 接入方式

- `native`：产品可以直接发现项目 `.agents/skills`；
- `native-with-toggle`：产品具备原生发现能力，但需要用户开启相关设置；
- `adapter-routed`：Adapter 根据显式 Skill 名称或 Harness 阶段定位真实 `SKILL.md`，并检查它是否在首次修改前被读取；
- `unsupported`：当前没有可靠的发现或读取链路。

`adapter-routed` 不等于原生语义发现。显式 `$skill-name` 和 Harness 阶段可以确定性路由；普通自然语言的隐式发现仍是 `best-effort`。

## 当前能力摘要

| 产品 | Skill 方式 | 需要的设置 | 运行证据 | 成熟度 | 失败模式 |
| --- | --- | --- | --- | --- | --- |
| Codex | native | 仓库配置 | runtime-pending | full | fail-closed |
| Qoder | adapter-routed | 仓库配置，具体 Hook 随产品形态和版本变化 | runtime-pending | partial | fail-closed |
| Trae | native-with-toggle | 仓库配置 + 人工开启项目指令、共享 Skills 和 Hooks | runtime-pending | partial | fail-closed |
| Kimi Code | native | 用户级配置，需要单独授权 | runtime-pending | partial | fail-open |
| Cursor | native | 仓库配置 + Workspace Trust | runtime-pending | partial | fail-closed |
| OpenCode | native | 仓库 Plugin | runtime-pending | partial，无完整 Stop Gate | fail-open |
| ZCode | adapter-routed | 本地 Marketplace Plugin + 人工安装 | runtime-pending | partial | fail-closed |
| CodeBuddy | adapter-routed | 仓库配置 + 人工复核 Hooks | runtime-pending | partial | fail-closed |
| DeepSeek Harness | native | profile bundle + 人工设置 | runtime-pending | developer-preview | fail-open |

这张表描述当前规范实现，不代表所有产品已经完成端到端验证。Capability Manifest 和 Validation 证据必须记录产品版本、验证日期、事件序列和已知缺口。

## Doctor 与真实产品验证

先检查当前项目选择的 Adapter：

```bash
./.harness/cli adapter doctor selected
```

Doctor 只判断静态配置与人工步骤。要声明 `host-verified`，还需要为一个具体产品签发一次性验证：

```bash
./.harness/cli adapter verify <product> --begin --host-version <version>
```

随后必须由该真实产品会话写入当前事件。普通 `adapter verify <product>` 会核对一次性 challenge、产品版本和完整事件链；配置文件、旧日志或手工编写的 JSONL 不能成为真实产品验证证据。

## 真实产品必须证明什么

1. 根 `AGENTS.md` 已进入上下文；
2. SessionStart 或等价入口真实触发；
3. 显式 Skill 定位到 `.agents/skills/<name>/SKILL.md`；
4. 阶段要求读取 Skill 时，未读取前的首次修改会被阻断或可靠暂停；
5. 读取后允许继续；
6. 六种 `WORK_STATUS` 得到正确处理；
7. `continue_autonomously` 对同一 revision 只续跑一次；
8. 两个并行会话不会互相污染状态；
9. 事件日志能够证明上述过程，且不记录凭据、原始 Prompt 或客户数据。

## 产品说明

### Qoder

Qoder 的 Hook 事件可能随 IDE、CLI 等产品形态和版本变化。采用时必须记录具体形态和版本，不能把 Qoder 当成一个永远不变的协议。

### Kimi Code

公共 Skill 使用项目 `.agents/skills`；用户级 Hooks 必须单独授权安装。Hook 失败或超时时产品会继续运行，因此不能把 Hook 作为高风险操作的唯一安全门。

### OpenCode

公共 Skill 可以使用 `.agents/skills`。当前没有等价的完整 Stop Gate；结束后事件只能用于审计，不能伪装成停止前阻断和自动续跑。

### ZCode 与 CodeBuddy

它们不保存完整 Skill 副本。Adapter 只在需要时定位公共 Skill；没有真实 Hook 日志和 Skill 读取证据前保持 `runtime-pending`。

### DeepSeek Harness

Profile bundle 和生命周期桥接仍属于开发预览。锁定依赖版本并通过仓库测试，仍不能替代真实 DSH 会话中的 SessionStart、状态和 Stop 验证。

## 维护规则

- 产品协议变化时更新 Capability Manifest、测试、本页和验证证据；
- 没有真实证据时不得把 `runtime-pending` 改成 `host-verified`；
- 不把产品兼容说明复制到目标工程的 `AGENTS.md`；
- 产品目录只保存协议需要的最小入口，不保存公共工作流和 Skill 正文。
