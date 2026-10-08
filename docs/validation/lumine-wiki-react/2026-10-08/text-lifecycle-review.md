# 正常文本知识创建、更新与检索验证

日期：2026-10-08。范围：既有 Repo Wiki Run 中 AC-010 的正常文本维护链路；不代表整个 AC-010 或产品最终接受。

## 结果

通过。实际 Node `v24.14.0` 进程执行 14 个短生命周期命令（含 1 个网络拦截负控），51 条固定断言通过。未发现本轮产品缺陷；未修改实现、生成资产、父仓或业务仓。

证据：[完整结果与各步文件清单](text-lifecycle-result.json)、[保留的首次失败](text-lifecycle-attempt-1.json)。结果文件保留源码文件哈希、分发文件清单及哈希、正式命令、已脱敏的标准输出、实际来源和候选 Markdown、每一步目标文件清单与 SHA256。

## 实际执行

1. 将 Plugin 中的规范 Skill 分发复制到独立临时目录，排除 `src` 和 `node_modules`。使用这份副本中的正式 installer 执行 `inspect`、`proposal --locale zh-CN --adapters none`、`adopt --proposal`。提案确认 `project.selectedAdapters` 为空，未安装宿主配置。
2. 在安装后的目标根创建真实 `src/session.ts` 来源文件。初始 `recoverTextSession` 对 `ready` 返回复用动作，对 `expired` 返回登录动作。
3. 用正式 `wiki update prepare --manifest` 和 `wiki update apply --candidate` 创建知识页。页面使用最小 frontmatter、来源元数据、稳定章节 `recovery`／`boundaries`／`sources`，以及稳定图引用 `recovery-flow` 的 Mermaid 文本。
4. 对实际来源作小改：把 `revoked` 纳入登录分支。正式 `prepare text-session` 的来源哈希随之改变，再用 `apply` 更新同页。
5. `wiki query "revoked 会话恢复 不重新提交" --collection wiki` 返回新增事实和稳定引用 `text-session#recovery`；`show` 分别取得新机制、限制和 Mermaid 源码。`wiki check` 通过。

检索实际摘要为：

> 恢复机制 recoverTextSession 在 ready 时复用已有会话；expired 或 revoked 时要求重新登录。 此函数只返回恢复动作，不重新提交请求。

检索卡片包含实际来源 `project:src/session.ts`、`current` 来源观察。限制章节明确：来源未执行网络请求、令牌刷新或模型调用，也不能证明真实部署、持久化、并发安全或人类接受。章节和图身份在更新前后保持不变。

## 文件与请求观察

安装后基线为 205 个文件；加入测试来源并完成更新后为 218 个。每次正式 Wiki 命令后均保存完整相对路径清单与内容哈希，逐步比较新增、修改、删除项。

- 正常知识创建、更新仅写入 `.md` 和 `.json`；所有变动文件均经 UTF-8 往返及 NUL 字节检查。
- 正常查询、章节／图源码读取、结构检查未改变文件。
- 最终知识正文、持久 Wiki 状态及 `.lumine/local/wiki/` 合计 14 个 Markdown／JSON 文本文件。未出现图片扩展名、缩略图、截图、预览缓存或卡片图像路径。
- Wiki 输出未出现 SVG／HTML 图片、`data:image`、`image_url` 或 `input_image` 载荷。图以 Mermaid fenced text 返回。
- 每个 CLI 子进程预加载同一 Node 标准请求拦截器。正常 installer 与 Wiki 过程的 `fetch`／`http`／`https` 请求尝试均为 0。负控主动调用三个 API，三个调用均在网络发出前被拦截并记录，因此“0 次尝试”有实际可工作的检测器支撑。

## 首次失败与范围限制

首次运行在 installer 提案自检处失败：验证脚本读取不存在的顶层 `proposal.adapters`，实际契约为 `proposal.project.selectedAdapters`。尚未 adopt 或写入知识。保留原始完整失败记录；按实际契约修正，同时使用 installer 登记的 `project` 仓库身份，在另一独立目标完整重跑通过。这是测试脚本假设修正，不是产品代码修复。

请求拦截只覆盖本轮 Node 进程的全局 `fetch` 和标准 `node:http`／`node:https` 的 `request/get`；不声称封锁任意原生自定义传输，也不声称物理断网。没有启动浏览器、图片工具、视觉模型或长驻服务器；所有 `spawnSync` 子进程均退出。临时目录只含无凭据的合成来源、分发副本和验证日志，保留供复核，不修改用户环境。

本轮验证的是正常文本资产创建、保护性更新和检索的实际运行结果，不扩展为对所有宿主、异常恢复、人类理解质量或所有业务知识语义的证明。既有浏览器绘图证据独立于本轮知识流水线。
