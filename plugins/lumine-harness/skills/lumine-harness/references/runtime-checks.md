# 检查与证据

确定性检查通过 `.lumine/cli` 提供。它验证结构、引用、基线和记录完整性，不能判断产品取舍合理、视觉符合目标或业务真正验收。对应语义分别由 plan、run、knowledge、design 负责。

## 项目与任务

```bash
./.lumine/cli check health
./.lumine/cli check docs
./.lumine/cli task record <task.json>
./.lumine/cli task bind <taskId> --product <host> --session-id <session> --mode verify
./.lumine/cli task show <taskId>
./.lumine/cli task check <taskId> --json
```

任务接口支持 `--root <root>`；更新已有记录时使用 `task record ... --expect <previous-record-sha256>` 防止覆盖并发修改。任务包含身份、本轮模式、适用 Spec／Plan／AC、授权范围及验证证据；以 Runtime 输出和帮助为字段合同，不手写未经验证的“通过”。模式为 `plan`、`implement`、`verify` 或 `diagnose`。

只做项目诊断可直接运行健康／文档检查，不必制造实施任务。诊断结果有失败时仍可完成本轮报告，不能被自动转换成修复请求。全局健康检查与任务收尾分开，不把无关文档状态作为每个 done 的门槛。

## 知识与宿主

`wiki check` 验证知识结构和关联；语义真实性仍由来源复核。`adapter check current` 报告当前宿主及设置，`adapter status selected` 汇总所选接入。Doctor 静态检查、真实 Hook 事件、实际 Skill 读取和自动继续证据分别报告；无法观测不等于通过。

## 记录质量

证据说明操作、结果、时间、代码／环境适用范围与未覆盖项。历史结果不重标为当前要求已通过。用户要求不写文件时只在回复中报告，不为迎合检查创建虚假证据或擅自修复。
