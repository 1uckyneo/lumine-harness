# Lumine状态瘦身与请求上下文验证

对应 [专项执行计划](../exec-plans/active/Lumine状态瘦身与请求上下文执行计划.md)，2026-11-04；源仓起点 cc722c514f092fc8bc45fc964caa9d3315adadaf。用户已确认实施、两仓迁移与发布。产品要求仍维护原 Spec，同功能与任务身份未重建。

## 存储结果

| 对象 | 原始字节 | 纯迁移后 | 指南同步后 | 减少 |
| --- | ---: | ---: | ---: | ---: |
| 源仓自用状态 | 13,226,563 | 807,027 | 821,493 | 93.79% |
| 试点完整状态 | 159,905,059 | 14,864,077 | 14,876,671 | 90.70% |

当前资产树在提交时全部纳入 Git；以上不含本地备份和历史。源仓全部恢复目录 19,818,274 字节、Git 对象 9,746,996 字节；试点全部恢复目录 299,257,783 字节、Git 对象 111,487,688 字节（迁移后、发布前观测）。原字节备份保留且不提交，Git 历史未重写。

试点 18 prepared、11 partial 逐项核对，34 份活动候选及其状态／决定／结果保持，56 个生成基线仅授权两篇指南更新，44 个文档操作与 53 个旧任务原字节不变。169 项无法证明已经消费的旧候选继续保留；源仓保留 12 项同类候选。业务文件和展示配置未修改。schemaVersion 已升为 3，workflowVersion 仍为 2；后续 Runtime 升级保留该版本保护。

## 自动化与行为验证

- 执行 pnpm runtime:typecheck、runtime:build、runtime:check、runtime:test，以及 check-skill-package.sh、check-repo-sync.sh；生成产物来源为规范 TypeScript 与 Skill，wrapper 由同步脚本生成。
- 完整套件汇总：

```text
ℹ tests 306
ℹ suites 0
ℹ pass 305
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 12303.9865
```

跳过项为既有的 Doctor 产品设置测试，未在本次新增跳过。存储专项验证对象损坏、引用路径、真实生成基线、人工非重叠合并、重叠冲突、defer／keep-current、候选消费证明、事务回执和无引用对象回收。迁移专项覆盖各持久步骤中断、CAS 并发变化、无 Git 恢复、旧 Runtime 拒绝与零写入、后续人工修改阻止回滚；文档改名／归档旧记录保持原字节。

完整项目 Git archive 副本经正式 Runtime 升级后，所有 Wiki／状态／任务原字节保持；显式迁移、精确回滚再迁移后，扫描、同包应用、Wiki 恢复和整理恢复各 100 次无共享差异。冷缓存查询和实际浏览器搜索、导航、来源面板、Mermaid 放大／关闭均已观察，16 个图节点可见，浏览器错误／警告为 0。这里只证明隔离阅读器的这些行为，不代表业务功能验收。

请求专项覆盖实施后独立只读问题不检查旧实施证据、持续功能继续复用 taskId／Spec／Plan、有效确认与进度保留、同请求禁止降级、未知范围与缺验证阻断、真实证据漂移、会话隔离与自动续跑。迟到旧轮次 Stop 不覆盖当前作用域或报告，仍保留当前轮重试的幂等性。

## 宿主证据与限制

2026-11-04T11:19:49.770Z，当前真实 Codex 会话 Stop Hook 写入本机探针回执，session 哈希与当前会话一致，实际 Node 为 24.14.0；公共 adapter verify 报告 stop_gate=passed / runtime_observed。宿主返回继续执行提示，本轮通过 session begin --resume 延续原请求和任务，ID 与 userTurnRevision 均保持。详见 [脱敏 Hook 观察](lumine-storage-context/Codex真实Hook观察.json)。

此证据只证明实际 Stop Gate；公共探针缺少带匹配 continuationRequestId 的后续非 Stop 回执，automatic_continuation 仍为 not_tested。真实应用版本未可靠取得，保留 unknown；没有把创建探针、手工调用 Hook 或静态配置当作宿主实测。

Trae 已执行适配器协议与子进程回归；未打开真实 Trae 应用验证，不将协议测试写成真实宿主通过。安装器保留 applied 状态，不以人工填写回执伪造所选全部宿主认证完成。

## 检查附件与交付

[自动化原始输出](lumine-storage-context/自动化检查.log)仅包含脱敏源仓测试结果，不提交试点正文、私有路径或恢复原件。源仓 Wiki 结构检查通过；试点的既有全库引用问题由其升级记录单列，不扩大本次改造范围。

源码、发行产物、源仓迁移、Spec／Plan／Wiki／Validation 与任务证据随本次普通提交发布。发布步骤按计划先核对最新远端，分别推送 GitHub 与 Gitee；实际远端 SHA 在交付回执中读取核验，不在提交内写自引用哈希，不把跨远端发布描述为原子操作。
