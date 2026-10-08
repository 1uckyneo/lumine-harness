import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("qoder tool-after", async () => {
  const implementation = await import("./tool-after.main.ts");
  await implementation.runHookMain();
});
