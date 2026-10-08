import { isMainModule } from "../../../core/node-bootstrap.ts";
import { assertNodeRuntime } from "../../../core/node-runtime.ts";
import { runExternalHook } from "../../hook-bootstrap.ts";
import type { UnknownRecord } from "../../../core/contracts.ts";

interface HookResult { exitCode: number; stdout?: string; stderr?: string }

export async function handleKimiHook(raw: UnknownRecord = {}): Promise<HookResult> {
  assertNodeRuntime(process.versions.node);
  const implementation = await import("./dispatch.main.ts");
  return implementation.handleKimiHook(raw);
}

if (isMainModule(import.meta.url)) {
  await runExternalHook("kimi", async () => {
    const implementation = await import("./dispatch.main.ts");
    await implementation.runHookMain();
  });
}
