import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSessionStartContext } from "../../harness/core/session-context.ts";
import { findHarnessRoot } from "../../harness/core/root-resolver.ts";

interface OpenCodePluginOptions { directory: string }
interface SystemTransformOutput { system: string[] }
interface CompactingOutput { context: string[] }
interface ToolInput { tool?: unknown }
interface HostEvent { type?: string }

export const HarnessPlugin = async ({ directory }: OpenCodePluginOptions) => {
  const root = findHarnessRoot(directory);
  if (!root) return {};
  const context = buildSessionStartContext({ root, cwd: directory });
  const audit = async (event: string, payload: Record<string, unknown> = {}): Promise<void> => {
    const dir = path.join(root, ".harness", "runtime", "opencode");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "latest-audit.json"),
      `${JSON.stringify({ event, at: new Date().toISOString(), ...payload }, null, 2)}\n`,
      "utf8"
    );
  };
  return {
    "experimental.chat.system.transform": async (_input: unknown, output: SystemTransformOutput) => {
      if (!output.system.includes(context)) output.system.push(context);
    },
    "experimental.session.compacting": async (_input: unknown, output: CompactingOutput) => {
      output.context.push(context);
    },
    "tool.execute.before": async (input: ToolInput) => audit("tool.execute.before", { tool: input.tool }),
    "tool.execute.after": async (input: ToolInput) => audit("tool.execute.after", { tool: input.tool }),
    event: async ({ event }: { event: HostEvent }) => {
      if (event.type === "session.idle") {
        await audit("session.idle", {
          stopGate: "unsupported",
          action: "audit_only",
          continuationDelivery: "manual_required"
        });
      }
    }
  };
};
