# Subagent Lanes

Subagent 是辅助 lane，不是每个任务默认开启。

## Default Lanes

- `harness_repo_mapper`：只读边界探索。
- `harness_generated_reviewer`：只读复核 generated。
- `harness_doc_normalizer`：整理已确认口径，不做产品判断。
- `harness_backend_data_worker`：后端、DAO、SQL、租户/权限、数据迁移。
- `harness_frontend_ui_worker`：前端页面、组件、状态、接口调用和用户可见文案。
- `harness_integration_worker`：串行处理 glue、脚本、根仓 harness、跨域小整合。
- `harness_bugfix_investigator`：证据驱动调查和小范围修复。
- `harness_runtime_verifier`：最后运行态验证，默认只读。

## Dispatch Rules

- 简单单文件、小风险任务由 main agent 自己做。
- 不清楚边界时启动 `repo_mapper`。
- generated 刷新后需要可信度判断时启动 `generated_reviewer`。
- 后端和前端可并行，前提是 write set 完全互斥。
- integration worker 默认在专用 worker 后串行收口。
- runtime verifier 永远最后运行。

## Task Packet

可写 lane 必须拿到：

- `task_id`
- `objective`
- `input_context`
- `owned_write_set`
- `read_only_set`
- `forbidden_write_set`
- `validation_required`
- `stop_condition`

同一文件只能有一个 owner。subagent 不直接问用户，不直接写 generated review metadata 或 active plan，除非 parent 明确授权片段。
