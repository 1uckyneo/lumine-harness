import { runExternalHook } from "../../hook-bootstrap.ts";

await runExternalHook("codex stop-gate", async () => {
  const implementation = await import("./stop-gate.main.ts");
  await implementation.runHookMain();
});
