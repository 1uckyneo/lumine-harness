---
name: lumine-knowledge
description: 定位实现、查询和维护 Repo Wiki，或打开、启动、重启、停止本地 Wiki 阅读器；知识以 Markdown、Mermaid 文本和来源证据维护，不生成卡片图片。
---

# 项目知识

<!-- LH-KNOWLEDGE-01 -->
先读 `AGENTS.md` 的约束与工程地图，使用已确认 Harness 根和 `.lumine/project.json` 配置。Wiki 默认在 `docs/repo-wiki/`，以配置为准；不能把最近 Git 根当多仓 Harness 根。检索不会替代必须读取的项目规则。

<!-- LH-KNOWLEDGE-02 -->
围绕当前问题自主选择目录、章节检索、直接读 Markdown 或源码；不要求先查 Wiki，不按调用次数判断合规。需要工具时用 `wiki map / query / show / related` 按需展开。结果最多六条并受上下文预算限制；检查范围、来源和时效，必要时重述中英文或代码标识符查询。详见[调查与检索](references/investigation.md)。

<!-- LH-KNOWLEDGE-03 -->
首次建库读取[理解项目与建库](references/building.md)，默认深入覆盖所有主要模块，目录由项目决定；用户可以缩小范围或延后。维护读取[知识维护](references/maintenance.md)。Agent／模型理解来源、判断过期影响、撰写正文和 Mermaid；`scan` 只提供变化线索，`update` 只校验并保护性保存 Agent 的文本，不调用模型生产知识。无活动 Agent 时只登记待处理内容。

<!-- LH-KNOWLEDGE-04 -->
正文、摘要、Mermaid 文本和来源是人／Agent 共用的一份内容。卡片由 HTML DOM 呈现，图由浏览器即时渲染。知识扫描、生成、更新、查询和审阅只接收文本，不调用图片生成、截图识别或视觉模型，不生成卡片图片或缩略图文件，不把渲染后的 SVG 送入模型。文本复制／导出使用 Markdown 或 Mermaid。浏览器专项 UI 验证与知识流水线分开。

<!-- LH-KNOWLEDGE-05 -->
语义审阅须核对实际来源和重要关系。Wiki 描述已知实现，Spec 描述目标，Plan 描述此次技术变化；不能将未实施方案写成现状。工程约定只解释并引用权威规则；设计理由缺乏记录时标为推断，源码不能证明部署与运行结果。

<!-- LH-KNOWLEDGE-06 -->
按问题组织“回答→机制与图解→取舍和限制→来源”。稳定章节支持具体机制和约束的检索，不把整页简介当成全部知识。目录、页面、章节和卡片共用正文与知识地图；复杂主题拆页。核实缺口、过期或矛盾后，在授权范围内把可复用结论写回相关知识；明确只读时只报告。没有知识增量可以零更新，不为每次查询留日志。保护人工修改、有效候选和冲突。

<!-- LH-KNOWLEDGE-07 -->
用户要求打开知识库或启动、重启、停止阅读器时，读取[阅读器管理](references/reader.md)。优先复用属于当前项目的服务，停止前核实进程归属；直接阅读 Markdown 和 Agent 检索不需要启动服务。
