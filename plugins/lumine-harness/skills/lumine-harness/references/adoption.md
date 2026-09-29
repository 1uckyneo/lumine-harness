# 采用与升级

<!-- LH-ADOPT-01 -->
从用户指定的目标开始检查仓库边界、已有规则与未提交修改。单仓以业务根为目标，多仓以能够覆盖关联仓库的共同目录为目标，该目录可以没有 Git。需要判定时读[目标形态](target-topology.md)。

<!-- LH-ADOPT-02 -->
先确定语言和选中的宿主 Adapter，再生成具体迁移提案。使用分发 Skill 中的工具：

```bash
node scripts/harness-manager.mjs inspect <target-root>
node scripts/harness-manager.mjs proposal <target-root> --locale zh-CN --adapters <list-or-none> --output <proposal.json>
node scripts/harness-manager.mjs adopt --proposal <proposal.json>
```

已有项目使用 `upgrade --plan <target-root> --locale zh-CN --output <proposal.json>`，再用 `upgrade --apply --proposal <proposal.json>`。路径含空格时正确引用；不要把命令中的占位符当实际目标。

<!-- LH-ADOPT-03 -->
提案列出精确写入、保留、冲突、备份、语言、来源版本和宿主限制。按[迁移策略](migration-policy.md)保护实际内容和恢复状态。已有授权覆盖当前具体范围时继续，不要求重复阶段确认；新范围或不可安全决定的冲突再请求用户决定。用户级配置和外部动作遵守独立授权范围。

<!-- LH-ADOPT-04 -->
采用[项目合同](harness-contract.md)，从规范资产安装选定语言的四个日常 Skill、模板及 `.lumine/`。合并项目有效约束，不复制其他项目实例，不保留并行旧主流程。初始化 Wiki 使用当前 Agent 和文本来源：以项目实际问题选择主题，范围明确、来源可核查，无活动 Agent 时不宣称语义生成完成。

<!-- LH-ADOPT-05 -->
完成后按[检查与证据](runtime-checks.md)验证分发、根解析和实际宿主状态。报告已完成、未覆盖、真实宿主限制和可用下一步，区分配置存在、静态检查与实际运行。需要并行时读[协作](worker-coordination.md)。
