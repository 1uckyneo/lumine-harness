# Browser Automation

本文件属于可选 Browser 模块；只有目标工程需要浏览器验证时生成。

浏览器验证优先顺序：

1. Chrome DevTools MCP / live Chrome：适合真实登录态、console/network/DOM/screenshot；live session 必须 preflight。
2. 当前 Agent 宿主提供的浏览器自动化能力：在 DevTools 中途断开或授权失效时接管。
3. Playwright/headless：适合 prototype、mock、视觉回归和无需个人登录态的路径。

没有截图、DOM、console 或 network 记录，不得声称浏览器验证通过。
