# Repo Wiki Chromium 最终交互回归

日期：2026-09-30（Asia/Shanghai）。使用本机 Chromium、Playwright CLI 和回环阅读服务验证；源仓为 `127.0.0.1:4318`，目标父仓为 `127.0.0.1:4319`。本记录只证明本机浏览器中的阅读器行为。

## 源仓：导航焦点与失败态

1. 从首页点击“理解 Lumine”主题，URL 变为 `?topic=lumine-overview`，焦点为 `main#workspace`，主题标题正确。
2. 从主题页点击“Core、Skill、Adapter 与构建分发”，URL 变为 `?doc=lumine-architecture`，焦点仍为 `main#workspace`，正文标题正确。
3. 文档 A 已加载后，只在该 Chromium 会话中将文档 B 的 `/api/document?id=lumine-root-config` 请求模拟为 HTTP 503，再点击文档 A 中指向 B 的关联链接。URL 变为 B，`main article` 数量为 0，正文不含 A 的标题；`role=alert` 显示加载失败，并提供“重试”“项目首页”。[失败态截图](screenshots/page-2026-09-29T20-17-19-819Z.png)
4. 移除模拟失败规则后点击“重试”，文档 B 的正文标题正常出现，错误提示消失。模拟的 HTTP 503 在浏览器控制台留下 1 条预期错误；这不是实际服务故障。

## 窄屏目录

源仓文档 B 在 390×844 下，本页导航默认收合，页面 `scrollWidth=390`。刷新后仍收合；调整到 1280 px 后展开，再缩回 390 px 后收合。[源仓窄屏截图](screenshots/page-2026-09-29T20-19-16-032Z.png)

目标父仓长文在 390 px 下，本页导航收合，`scrollWidth=390`；在 1280 px 下导航展开，`scrollWidth=1280`。

## 目标父仓：长文与 Mermaid

打开 `?doc=chat-stream-and-image-recovery`，沿本页导航依次进入 `#request-contracts`、`#exact-recovery`、`#cancel-contract`。三个图解离屏时显示“正在载入…”，滚动到所在章节后均生成 SVG。深链 URL 与目标标题同步，章节标题获得焦点。

目标父仓 Wiki 取消竞态内容修订后刷新 `#cancel-contract`，浏览器正文包含新增的“当前源码另有并发窗口”说明，Mermaid 文本包含“提交后尚无任务 ID”，`#cancellation-path` 生成 SVG。[最新桌面截图](screenshots/page-2026-09-29T20-27-30-124Z.png) [最新手机正文截图](screenshots/page-2026-09-29T20-24-06-125Z.png)

手机宽度下点击“放大图解”，模态层开启且含 SVG、放大、缩小、适合窗口、重置和源码/导出入口。连续两次点击“放大”，画布比例由 `0.250047` 增至 `0.300057`。[手机放大层截图](screenshots/page-2026-09-29T20-24-50-172Z.png)

目标父仓浏览器控制台无错误或警告。所见 API 请求均返回 HTTP 200；静态资源请求均指向本机 `127.0.0.1:4319`，未观察到外部资源请求。

## 验证边界

本轮验证的是本机阅读器与已保存 Wiki。模拟 503 只检验界面失败路径；未触发真实后端取消竞态，也不证明部署环境行为或人工接受。390 px 下完整 Mermaid 的内嵌缩图文字很小，细读需使用放大层继续缩放或查看 Mermaid 文本。
