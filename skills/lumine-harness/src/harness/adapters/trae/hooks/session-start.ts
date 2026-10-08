import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("trae session-start", async () => {
  const implementation = await import("./session-start.main.ts");
  await implementation.runHookMain();
});
