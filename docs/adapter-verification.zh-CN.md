# Adapter 调试与发布检查

本文只面向 Lumine Harness 维护者。普通使用者只需发送：

```text
检查当前 Agent 的 Lumine Harness 是否已经生效。
```

然后按结果完成一次性设置即可。日常开发不需要运行探针，也不需要逐项验证九个 Agent。

## 维护时检查到什么程度

采用三级策略，避免把兼容性维护做成一套认证工程。

### 每次修改都运行：自动回归

自动测试覆盖不会因产品版本频繁变化的核心逻辑：

- 六种 `WORK_STATUS` 的处理结果；
- 同一状态不会重复触发下一轮；
- 不同会话不会串用状态；
- `.agents/skills` 的目录发现和 Adapter 路由；
- 各 Adapter 的输入输出转换。

状态机和会话隔离属于底层安全测试，不需要出现在普通兼容检查中。

### Adapter 或配置变化时运行：静态检查

```bash
./.harness/cli adapter doctor <product>
./.harness/cli adapter check <product>
```

- `doctor` 检查 Adapter 文件、Hook、Plugin 或用户级配置是否准备好；
- `check` 用自然语言汇总能否开始、还缺什么设置和主要限制；
- 两者都是只读检查，不能证明真实 Agent 已经执行了 Hook 或读取了 Skill。

### 宿主升级或出现异常时运行：最小真实冒烟测试

只验证发生变化或被报告异常的产品，不要求每次发布把全部产品重新测一遍：

1. 从 Harness 根目录开启该产品的新会话；
2. 发送“检查当前 Agent 的 Lumine Harness 是否已经生效”；
3. 让 Agent 读取一个无副作用的项目 Skill，确认路径路由正确；
4. 如果该产品支持结束检查或自动继续，再验证一次安全的 `continue_autonomously`；
5. 只有遇到串任务问题时，才额外运行并行会话检查。

需要保存协议事件协助排查时，可以选择使用：

```bash
./.harness/cli adapter verify <product> --begin --host-version <version>
./.harness/cli adapter verify <product>
```

`verify` 是可选诊断工具，不是普通发布门禁，也不要求维护者长期维护一张逐能力认证表。

## 其他命令

```bash
./.harness/cli adapter status current [--details] [--json]
./.harness/cli adapter status selected [--details] [--json]
```

`status` 用于排查时查看已有信息。默认输出保持简洁；`--details` 才展开 Skill、Hook、状态转换和会话隔离等内部结果，`--json` 供脚本读取。

## 程序能证明什么

程序可以检查：

- 仓库是否生成了正确的 Adapter 和配置；
- 宿主是否向 Adapter 发出了生命周期事件；
- 带路径的工具事件是否读取了目标 `SKILL.md`；
- 状态是否幂等处理、会话是否隔离。

程序不能独立证明：

- 模型是否理解并遵守了全部 `AGENTS.md`；
- 没有暴露给 Hook 的宿主内部上下文；
- 某个未来版本仍与当前协议完全一致。

因此，仓库测试通过代表 Lumine 的实现符合当前协议假设，不等于所有产品版本都经过完整人工认证。出现真实差异时，更新对应 Adapter、测试和简短兼容说明即可。

## 运行记录与隐私

- 正常开发不持续记录详细验证事件；
- 只有主动执行 `verify` 时才在 `.harness/runtime/probes/` 写入临时诊断记录；
- 不记录原始 Prompt、Token、凭据、Cookie、业务数据或完整工具输出；
- 临时记录不得进入业务提交。

各产品对普通用户的实际影响见 [在不同 Agent 中使用 Lumine Harness](adapter-compatibility.zh-CN.md)。
