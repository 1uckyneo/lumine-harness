import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertNodeRuntime, inspectNodeRuntime, type RuntimeLocale } from "./node-runtime.ts";

/** Bootstrap must not read project configuration, stdin, journals or Hook state. */
export function bootstrapLocale(args: string[]): RuntimeLocale {
  const index = args.indexOf("--locale");
  const locale = index >= 0 ? args[index + 1] : process.env.LUMINE_LOCALE || process.env.LANG;
  return locale === "zh-CN" || /^zh(?:[_-]|$)/i.test(locale || "") ? "zh-CN" : "en";
}

export function isMainModule(entryUrl: string): boolean {
  if (!process.argv[1]) return false;
  try {
    // Node resolves module symlinks; argv keeps the invocation spelling (e.g. /tmp).
    // Normalize only the running files, without probing project configuration.
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(entryUrl));
  } catch {
    return false;
  }
}

/** true means rejected. No implementation module has been imported at this point. */
export function reportUnsupportedNodeRuntime(args = process.argv.slice(2), version = process.versions.node): boolean {
  const diagnostic = inspectNodeRuntime(version, bootstrapLocale(args));
  if (diagnostic.ok) return false;
  process.stderr.write(args.includes("--json")
    ? `${JSON.stringify(diagnostic)}\n`
    : `[${diagnostic.code}] ${diagnostic.message}\n${diagnostic.remediation}\n`);
  process.exitCode = 2;
  return true;
}

export interface NodeMainOptions {
  entryUrl: string;
  args?: string[];
  version?: string;
}

/** Public entry exports remain synchronous after loading on a supported Node. */
export async function loadNodeMain<T>(loader: () => Promise<T>, options: NodeMainOptions): Promise<T | undefined> {
  const args = options.args || process.argv.slice(2), version = options.version === undefined ? process.versions.node : options.version;
  if (isMainModule(options.entryUrl)) {
    if (reportUnsupportedNodeRuntime(args, version)) return undefined;
  } else {
    assertNodeRuntime(version, bootstrapLocale(args));
  }
  return loader();
}

/** A rejected direct invocation has exports but cannot run an operation. */
export function unavailableNodeRuntime(): never {
  assertNodeRuntime(process.versions.node, bootstrapLocale(process.argv.slice(2)));
  throw new Error("Lumine Harness implementation was not loaded.");
}
