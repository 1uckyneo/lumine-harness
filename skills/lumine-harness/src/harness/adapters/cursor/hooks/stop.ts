import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("cursor stop", async () => {
  const implementation = await import("./stop.main.ts");
  await implementation.runHookMain();
});
