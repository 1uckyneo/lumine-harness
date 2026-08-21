---
name: lumine-harness-navigate
description: 判断目标 harness 根、业务仓、模块和实现入口；用于陌生项目定位、workspace/单仓边界判断、读取 ARCHITECTURE.md 和 generated 索引。
---

# Harness Navigate

## 使用流程

1. 读取 `AGENTS.md` 的上下文地图。
2. 需要详细架构时读取 `ARCHITECTURE.md`。
3. 需要仓库事实导航时读取 `docs/generated/workspace-index.md` 和 `docs/generated/repo-doc-index.md`。
4. 如果进入具体业务实现，再读取目标模块 README、规则文件、相关 skill 和源码。

## 规则

- 不把 generated 当事实源。
- Workspace 场景先判断根仓和子仓职责；single repo 场景直接映射模块。
- 不清楚 owner 时先只读探索，不直接编辑。
