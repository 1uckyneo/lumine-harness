# Browser Automation

浏览器验证优先顺序：

1. Chrome DevTools MCP / live Chrome：适合真实登录态、console/network/DOM/screenshot；live session 必须 preflight。
2. Codex Chrome plugin：DevTools 中途断开或授权失效时接管。
3. Codex in-app Browser：适合本地 dev server、公开页面、HTML 原型。
4. Playwright/headless：适合 prototype、mock、视觉回归和无需个人登录态的路径。

没有截图、DOM、console 或 network 记录，不得声称浏览器验证通过。
