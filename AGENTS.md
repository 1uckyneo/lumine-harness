# AGENTS.md - Lumine Harness 源码仓库维护约定

## 适用范围

- 本文件只约束 Lumine Harness 源码仓库本身。
- 本文件不会被复制到采用 Lumine Harness 的目标工程。
- 目标工程使用的入口模板是 `skills/lumine-harness/assets/root/AGENTS.md`。
- `plugins/lumine-harness/skills/lumine-harness/assets/root/AGENTS.md` 是 Plugin wrapper 中的生成副本，禁止直接编辑。

## 仓库地图

- `skills/lumine-harness/`：唯一规范 Agent Skill，包含入口指令、参考资料、模板、公共 Harness Core、项目阶段 Skills 和产品 Adapter。
- `plugins/lumine-harness/`：Codex Plugin 分发包装；其中的 `skills/lumine-harness/` 由规范 Skill 同步生成，不是第二套实现。
- `.agents/plugins/marketplace.json`：仓库级 Codex Marketplace 目录，只声明 Plugin 的发现和安装位置，不承载 Harness 工作流。
- `scripts/sync-plugin-wrapper.sh`：从规范 Skill 重新生成 Plugin wrapper 中的 Skill。
- `scripts/check-repo-sync.sh`：检查规范 Skill、Plugin wrapper、名称口径和公开说明没有漂移。
- `README.md`、`README.zh-CN.md`：面向使用者的英文和简体中文说明，关键能力、命令和限制必须保持一致。
- `docs/adapter-compatibility.md`、`docs/adapter-compatibility.zh-CN.md`：Adapter 协议、静态就绪、运行证据、成熟度和失败模式的详细说明。
- `SECURITY.md`：安全问题报告和目标工程迁移安全边界。

## 唯一真源与生成关系

- Skill 行为、参考资料、模板、Harness Core、项目阶段 Skills 和 Adapter 只在 `skills/lumine-harness/` 中维护。
- 不要直接修改 `plugins/lumine-harness/skills/lumine-harness/` 下的任何文件；同步脚本会覆盖这些改动。
- 修改规范 Skill 后必须执行：

```bash
bash scripts/sync-plugin-wrapper.sh
bash scripts/check-repo-sync.sh
```

- Plugin manifest、图标、仓库地址等 Codex 分发元数据可以在 `plugins/lumine-harness/` 的对应元数据文件中维护，但不得写入公共 Harness Core。
- `.agents/plugins/marketplace.json` 只维护 Marketplace 条目和分发策略，不复制 Skill、Hooks 或 Adapter 逻辑。

## 修改路由

### Skill、模板或工作流

修改 `skills/lumine-harness/`，随后同步 Plugin wrapper。不要从某个已采用 Harness 的业务项目反向复制模板。

### Adapter 或宿主能力

- 修改规范 Skill 下的公共 Core、Adapter、Capability Manifest 和相应测试。
- 产品名称只用于真实协议、产品目录、兼容性说明和验证证据。
- 同步更新中英文 Adapter 兼容性文档；README 只保留普通用户需要的能力摘要和入口链接。
- 配置文件存在不等于产品端已经执行；没有真实 Hook、Skill 读取或续跑证据时，不得宣称完整兼容。

### Plugin 分发

- `plugins/lumine-harness/` 只负责 Codex Plugin 包装。
- Plugin 和独立安装的 `lumine-harness` Skill 是同一 Skill 的两种安装方式，不得演变为两套行为。
- 修改规范 Skill 后必须通过同步脚本更新 wrapper，不能在 wrapper 内单独修复行为。

### 用户文档

- 用户安装、首次采用、日常流程或兼容性说明发生变化时，同步修改 `README.md` 与 `README.zh-CN.md`。
- README 面向普通使用者；源码结构、同步规则和维护约束留在本文件。
- 终端命令与发送给 Agent 的自然语言必须明确区分。
- 不把目标工程默认称为 Workspace 仓库：单仓使用仓库根目录，多仓使用能覆盖全部关联仓库的共同父目录；共同父目录本身可以不是 Git 仓库。

## 名称与技术口径

- Lumine 中文写作“卢米安”。
- 不使用“卢米安的 Harness”“Lumine's Harness”等个人所有关系表达。
- 公共 Core、Skills、模板和工作流保持模型与 Agent 产品中立。
- 公共流程中禁止绑定具体模型 ID，或把 Codex、Claude、Gemini 等产品写成固定执行主体。
- 模型负责语义理解、判断和内容生成；Agent 负责组装上下文、选择 Skill、调用工具并推进阶段；Adapter 和宿主负责生命周期与协议转换。
- 产品名称可以出现在 Adapter、官方路径、依赖包名、兼容性说明和真实验证记录中。
- 生成到目标工程的根 `AGENTS.md` 是 Agent 入口地图，`ARCHITECTURE.md` 是架构地图。
- 生成到目标工程的 `.agents/skills` 是唯一公共 Skill 内容真源；不要生成产品级 Rules、Skill 正文副本或产品级 Skill 投影。无法原生发现该目录的宿主由 Adapter 按需路由并要求实际读取规范文件。
- generated 只辅助导航，不能替代源码、测试、运行态验证或 Validation 证据。

## 首次采用安全边界

- 首次采用必须先 Inspect，再向用户提交 Migration Proposal；用户确认前不能写目标工程。
- 迁移提案必须列明将创建、替换、保留和备份的文件，以及所选 Adapter 的能力边界。
- 不修改与 Harness 采用无关的业务代码，不覆盖用户未提交修改。
- 不自动提交、推送、修改远端、切换分支、stash、reset 或改写 Git 历史。
- Git 目标依赖 diff 和历史回看迁移变更；非 Git 目标在替换旧 AI workflow 前备份到 `.harness/local/harness-backup/<timestamp>/`。
- Kimi Code 等需要用户级配置的 Adapter 必须单独获得授权，不能在普通 Adopt 中静默修改用户环境。
- 任何敏感信息、私有路径、Token 或客户数据都不得进入模板、示例、generated 文档或公开材料。

## 仓库验证

修改完成后至少运行：

```bash
bash skills/lumine-harness/scripts/check-skill-package.sh
bash scripts/check-repo-sync.sh
node --test skills/lumine-harness/assets/harness/tests/*.test.mjs
```

验证要求：

- 英文和中文 README 的安装方式、工作流、命令和产品边界一致。
- Plugin wrapper 与规范 Skill 完全一致。
- 公共资产不存在具体模型绑定或产品固定执行主体。
- Adapter 能力声明、实现、测试和公开说明一致。
- 不把 `not applicable`、需要人工设置或仅有配置文件的状态写成验证通过。

## Git 与交付

- 保留工作树中不属于当前任务的修改，不使用破坏性命令清理它们。
- 只有用户明确要求时才提交或推送。
- GitHub `origin` 是 skills.sh 收录和国际用户安装使用的规范发布源；Gitee `gitee` 是面向中国大陆用户的同步镜像。
- 对外发布时必须将同一 `main` 提交和需要发布的 tags 推送到 GitHub 与 Gitee，并核对两边远端 HEAD 一致。
- 中英文 README 的主安装步骤必须直接展示 GitHub 与 Gitee 两个来源，不得把 Gitee 命令只放在折叠参考区。
- 收尾时报告修改范围、执行的检查、未验证的产品端步骤和仍需人工完成的事项。
