import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("qoder tool-before", async () => {
  const implementation = await import("./tool-before.main.ts");
  await implementation.runHookMain();
});
