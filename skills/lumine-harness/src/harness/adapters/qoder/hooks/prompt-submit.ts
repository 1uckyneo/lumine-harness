import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("qoder prompt-submit", async () => {
  const implementation = await import("./prompt-submit.main.ts");
  await implementation.runHookMain();
});
