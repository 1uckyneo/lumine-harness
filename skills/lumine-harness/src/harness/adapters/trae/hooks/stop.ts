import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("trae stop", async () => {
  const implementation = await import("./stop.main.ts");
  await implementation.runHookMain();
});
