import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("cursor after-agent-response", async () => {
  const implementation = await import("./after-agent-response.main.ts");
  await implementation.runHookMain();
});
