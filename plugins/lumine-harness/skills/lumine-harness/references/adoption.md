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
提案列出精确写入、保留、冲突、备份、语言、来源版本和宿主限制。按[迁移策略](migration-policy.md)保护实际内容和恢复状态。安装维护的同一具体范围已有授权时不重复询问；新范围或不可安全决定的冲突再请求用户决定。这不替代产品开发各阶段对具体成果的确认。用户级配置和外部动作遵守独立授权范围。

<!-- LH-ADOPT-04 -->
采用[项目合同](harness-contract.md)，安装选定语言的四个日常 Skill、模板及 `.lumine/`，合并项目有效约束。按[阶段交接指导](../assets/skills/lumine-plan/references/stage-handoff.md)核对安装或升级后的根规则、工作流资料与日常 Skills：阶段内自主推进，跨阶段以人的明确确认为依据；旧的无条件跨阶段连续执行语句须在活跃指引中对齐，不改写历史决定或证据。业务根规则保持宿主中立，不加入宿主配置文件地图或社区 Adapter 兼容性说明；所选 Adapter 的实际配置仍单独维护。安装后由当前 Agent 接续 `lumine-knowledge` 的建库指导：理解实际能力、规划适应项目的目录，并默认深入覆盖所有主要模块；用户可以明确缩小范围或延后。Agent 读取来源、撰写正文与 Mermaid、核实跨模块关系；程序只准备、校验和保护性保存。大项目分批并保存恢复位置。升级保留已有知识资产，不默认重新生成全库。

<!-- LH-ADOPT-05 -->
完成后按[检查与证据](runtime-checks.md)验证分发、根解析和实际宿主状态，并检查已安装的阶段交接参考可读取、当前规则无冲突；仅保留旧项目文件不算完成工作流升级。报告已完成、未覆盖、真实宿主限制和可用下一步，区分配置存在、静态检查与实际运行。需要并行时读[协作](worker-coordination.md)。
