# Harness Engineering Bootstrap

[English](README.md) | [简体中文](README.zh-CN.md)

把现有代码库采用或迁移为一套结构化的 AI 工程 harness。

`harness-engineering-bootstrap` 是一个 Codex-first、兼容 Agent Skills 的工具包，用于把陌生仓库转换成 AI 可操作的工程工作区。它会围绕 `AGENTS.md`、`ARCHITECTURE.md`、draft/design/spec/plan/run 交接、generated 导航索引、checks、hooks 和 subagent lanes 落地一套可重复执行的工作流。

## 适用场景

当仓库需要完整 AI workflow，或已有 AI workflow 需要替换成 harness-centered 工作流时使用。它支持 workspace + 子仓、单 full-stack 仓库、纯后端项目、纯前端项目，以及拓扑暂不明确的传统项目。

不要把它用于已经完成 harness 迁移后的单个功能实现。项目安装 harness 后，日常工作应使用生成出来的项目 skills 和 docs。

## 安装

### Codex Skill

直接从本仓库安装 skill：

```bash
$skill-installer install https://github.com/1uckyneo/harness-engineering-bootstrap/tree/main/skills/harness-engineering-bootstrap
```

安装新 skill 后重启 Codex。

### Codex Plugin Marketplace

把本仓库添加为 Codex plugin marketplace：

```bash
codex plugin marketplace add 1uckyneo/harness-engineering-bootstrap
```

然后打开 Codex plugin browser，安装 **Harness Engineering Bootstrap**，并开启新线程。

### 手动安装

把 skill 文件夹复制到用户 skills 目录：

```bash
mkdir -p ~/.codex/skills
cp -R skills/harness-engineering-bootstrap ~/.codex/skills/
```

复制后重启 Codex。

## 用法

让 Codex 采用目标仓库：

```text
Use harness-engineering-bootstrap to adopt /path/to/my-project
```

skill 会先检查目标仓库，并在写入前给出迁移提案。提案会说明检测出的 topology、要创建或替换的文件、冲突的 AI workflow 文件、generated 索引、checks，以及当前 profile 下不适用的检查项。

## 它会创建什么

- 根目录 `AGENTS.md`，作为 agent 入口地图。
- 根目录 `ARCHITECTURE.md`，作为详细架构地图。
- `docs/drafts`、`docs/design-docs`、`docs/product-specs`、`docs/exec-plans`、`docs/generated` 和 `docs/validation` 约定。
- 本地 `./harness` wrapper，用于 generated refresh 和 checks。
- Codex hooks、checks、generated-index refresh tooling、项目 skills 和 subagent lane 定义。

## 安全模型

这个包是 adoption workflow，不是保守补丁。它可能会在给出迁移提案后替换已有 AI workflow 文件。

对于 git 仓库，变更文件可以通过 git diff 和历史记录回看。对于非 git 目标，被替换的 AI workflow 文件会先备份到 `.codex/local/harness-backup/<timestamp>/`。

generated 索引只是导航辅助，不替代源码检查、测试、运行态验证或用户确认。

## 校验本包

在仓库根目录运行内置检查：

```bash
bash skills/harness-engineering-bootstrap/scripts/check-skill-package.sh
node --check skills/harness-engineering-bootstrap/assets/codex/harness-check.mjs
node --check skills/harness-engineering-bootstrap/assets/codex/harness-generated.mjs
```

## 仓库结构

```text
skills/harness-engineering-bootstrap/       # canonical Agent Skill package
plugins/harness-engineering-bootstrap/      # Codex plugin wrapper for marketplace installs
.agents/plugins/marketplace.json            # Codex repo marketplace catalog
```

## License

MIT. See [LICENSE](LICENSE).
