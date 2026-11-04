## 当前请求作用域

每个新的用户请求先核对当前作用域；自动续跑、Hook 重试和恢复同一请求复用它。请求不是长期任务，也不创建新的产品文档。继续同一功能或调整方向时原位维护同一 Spec／Plan，保留 taskId、进度及仍适用确认，只复核变化影响。

使用可信宿主与会话身份，通过公开入口操作，禁止手工修改会话 JSON：

```text
./.lumine/cli session show --product <host> --session-id <session> --json
./.lumine/cli session begin --product <host> --session-id <session> --mode <mode> --request-id <stable-request-key> [--task <existing-task-id>] --json
./.lumine/cli session begin --product <host> --session-id <session> --resume --json
```

mode 为 plan、implement、verify、diagnose 或 check。宿主提供可靠 userTurnId 时由 Runtime 使用；缺少时由 Agent 为本轮选取稳定 request-id，重试沿用该键，不能每次工具调用换键。新请求可关联原任务，普通讨论／只读检查无需创建长期任务或 Spec／Plan；本机作用域记录不作为业务修改或实施授权。未知模式不能直接完成；实施必须关联适用任务并保有实际验证。同一作用域不能把 implement 降为只读绕过门禁，新独立只读请求不检查旧任务实施证据。用户无需手动运行这些命令。

迟到与重放保护按可核实的宿主身份判断，不按提示词内容猜测。每会话最多保留最近 128 个已退出请求的 ID 哈希、当前请求最近 128 个已处理 Stop 的稳定 response/emission 哈希，以及最近 128 个退休 Stop 哈希；不在这些记录中保存提示词或回复正文。已退出请求、已退休回复或已被更新回复取代的旧 Stop 不得重置当前作用域、写入当前报告或再次触发续跑；当前最新回复的正常重试仍复用原结果。

请求 ID 历史超出窗口后，未知 userTurnId 的 Stop 无法证明是新请求，Runtime 会保留当前状态并报告 REQUEST_HISTORY_BOUNDARY；应由真实用户启动事件建立新请求，缺少该事件的宿主需要新的真实会话。没有可靠 turn/response 标识时，或仅有已超出保留窗口的 response 标识时，Runtime 无法识别跨请求迟到事件；Agent 的 request-id 不能冒充宿主提供的身份。测试与兼容报告必须明确此限制，不能宣称所有宿主的跨请求重放均已覆盖。未知作用域、实施绑定及验证门禁仍保持有效。

response 标识只用于判断实际报告载荷是否重放；新 prompt、普通进度或无报告的续跑事件携带旧回复关联，不等于重放旧报告。这些事件按当前 userTurnId 和匹配的 continuation 回执归属；无报告的 Stop 仍须提供本轮新鲜结构报告，否则按缺少报告处理。
