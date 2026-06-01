---
name: harness-generated
description: 刷新并复核 docs/generated 下的导航索引，包括 workspace-index、repo-doc-index、api-map、db-schema、frontend-routes、frontend-components；用于 planning/run 前让 Codex 看见当前仓库入口、检查 stale 和更新 review metadata。
---

# Harness Generated

## 命令

```bash
./harness generated refresh all
./harness generated refresh workspace-index
./harness generated refresh repo-doc-index
./harness generated refresh api-map
./harness generated refresh db-schema
./harness generated refresh frontend-routes
./harness generated refresh frontend-components
```

## 使用流程

1. 按任务选择 target。
2. 运行 refresh；初始 `Review status` 为 `pending`。
3. 抽样读取 source paths，确认索引覆盖任务相关源码、无 stale、无截断。
4. 高风险时启动只读 `harness_generated_reviewer`。
5. 由 main agent 写回 review metadata。

## 规则

- generated 是导航索引，不是事实源。
- profile 不适用的 target 标记 `Completeness: not applicable`。
- 不允许出现 `... N more` 截断。
