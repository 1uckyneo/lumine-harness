# Worker Coordination

Parallel worker 是辅助执行方式，不绑定 Codex、Claude、Gemini、Cursor 或其他具体 agent 产品，也不是每个任务默认开启。

## Default Worker Types

- mapper worker：只读边界探索。
- reviewer worker：只读复核 generated。
- doc normalizer worker：整理已确认口径，不做产品判断。
- backend/data worker：后端、DAO、SQL、租户/权限、数据迁移。
- frontend/UI worker：前端页面、组件、状态、接口调用和用户可见文案。
- integration worker：串行处理 glue、脚本、根仓 harness、跨域小整合。
- bugfix investigator：证据驱动调查和小范围修复。
- runtime verifier：最后运行态验证，默认只读。

## Dispatch Rules

- 简单单文件、小风险任务由 main agent 自己做。
- 不清楚边界时启动只读 mapper worker。
- generated 刷新后需要可信度判断时启动 reviewer worker。
- 后端和前端可并行，前提是 write set 完全互斥。
- integration worker 默认在专用 worker 后串行收口。
- runtime verifier 永远最后运行。

## Task Packet

可写 worker 必须拿到：

- `task_id`
- `objective`
- `input_context`
- `owned_write_set`
- `read_only_set`
- `forbidden_write_set`
- `validation_required`
- `stop_condition`

同一文件只能有一个 owner。worker 不直接问用户，不直接写 generated review metadata 或 active plan，除非 parent 明确授权片段。
