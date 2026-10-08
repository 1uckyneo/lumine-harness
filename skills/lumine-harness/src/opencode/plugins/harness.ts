import { assertNodeRuntime } from "../../harness/core/node-runtime.ts";
import { observeRuntimeProcess } from "../../harness/core/runtime-environment.ts";

interface OpenCodePluginOptions { directory: string }

export const HarnessPlugin = async (options: OpenCodePluginOptions) => {
  const environment = observeRuntimeProcess();
  if (environment.runtime === "node") assertNodeRuntime(environment.version);
  const implementation = await import("../../harness/adapters/opencode/plugin-main.ts");
  return implementation.HarnessPlugin(options);
};
