import { isSupportedNodeVersion } from "./node-runtime.ts";

/** Actual process metadata, kept separate from product host versions and configuration. */
export interface RuntimeProcessObservation {
  source: "actual_process";
  runtime: "node" | "bun" | "unknown";
  version: string;
  nodeCompatibilityVersion?: string;
  support: "supported" | "unsupported" | "unverified";
}

interface RuntimeVersions { node?: string; bun?: string }

export function observeRuntimeProcess(versions: RuntimeVersions = process.versions): RuntimeProcessObservation {
  if (versions.bun) return {
    source: "actual_process",
    runtime: "bun",
    version: versions.bun,
    nodeCompatibilityVersion: versions.node,
    support: "unverified"
  };
  if (versions.node) return {
    source: "actual_process",
    runtime: "node",
    version: versions.node,
    support: isSupportedNodeVersion(versions.node) ? "supported" : "unsupported"
  };
  return { source: "actual_process", runtime: "unknown", version: "unknown", support: "unverified" };
}

/** Re-evaluate recorded versions under the current policy; never trust a stored pass label. */
export function recordedRuntimeProcess(value: unknown): RuntimeProcessObservation | null {
  if (!value || typeof value !== "object") return null;
  const recorded = value as Partial<RuntimeProcessObservation>;
  if (recorded.source !== "actual_process" || typeof recorded.version !== "string") return null;
  if (recorded.runtime === "node") return observeRuntimeProcess({ node: recorded.version });
  if (recorded.runtime === "bun") return observeRuntimeProcess({
    bun: recorded.version,
    node: typeof recorded.nodeCompatibilityVersion === "string" ? recorded.nodeCompatibilityVersion : undefined
  });
  return recorded.runtime === "unknown" ? observeRuntimeProcess({}) : null;
}
