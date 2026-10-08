import { reportUnsupportedNodeRuntime } from "../core/node-bootstrap.ts";

/** Load Hook implementation only after checking the actual external Node process. */
export async function runExternalHook(label: string, loadMain: () => Promise<void>): Promise<void> {
  if (reportUnsupportedNodeRuntime()) return;
  try {
    await loadMain();
  } catch (error) {
    process.stderr.write(`${label} hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
