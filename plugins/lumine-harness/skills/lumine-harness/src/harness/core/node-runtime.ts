/** The shared Node policy is pure: importing Core never rejects an embedded host. */
export const SUPPORTED_NODE_RANGE = "22.x >=22.18.0 || 24.x >=24.11.0";
export const SUPPORTED_NODE_ENGINES = "^22.18.0 || ^24.11.0";
export const RECOMMENDED_NODE_VERSION = "24.x LTS";
export const UNSUPPORTED_NODE_RUNTIME = "UNSUPPORTED_NODE_RUNTIME";
export type RuntimeLocale = "zh-CN" | "en";
export interface NodeRuntimeInspection {
  ok: boolean;
  runtime: "node";
  currentVersion: string;
  supportedRange: string;
  recommendedVersion: string;
  code?: typeof UNSUPPORTED_NODE_RUNTIME;
  message?: string;
  remediation?: string;
}

/** Only the reviewed LTS branches qualify; prereleases and future majors do not. */
export function isSupportedNodeVersion(version: string): boolean {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return (major === 22 && minor >= 18) || (major === 24 && minor >= 11);
}

export function inspectNodeRuntime(version: string, locale: RuntimeLocale = "en"): NodeRuntimeInspection {
  const result: NodeRuntimeInspection = {
    ok: isSupportedNodeVersion(version),
    runtime: "node",
    currentVersion: version,
    supportedRange: SUPPORTED_NODE_RANGE,
    recommendedVersion: RECOMMENDED_NODE_VERSION,
  };
  if (!result.ok) {
    result.code = UNSUPPORTED_NODE_RUNTIME;
    result.message = locale === "zh-CN"
      ? `当前 Node.js ${version} 不受支持。支持范围：${SUPPORTED_NODE_RANGE}。`
      : `Node.js ${version} is not supported. Supported versions: ${SUPPORTED_NODE_RANGE}.`;
    result.remediation = locale === "zh-CN"
      ? "请使用 Node.js 24 LTS（24.11.0 或更高的 24.x 版本）运行 Lumine Harness；同时核对宿主 Hook 实际使用的 Node。"
      : "Run Lumine Harness with Node.js 24 LTS (24.x, 24.11.0 or later), and check the Node executable used by the host Hook.";
  }
  return result;
}

export class NodeRuntimeError extends Error {
  readonly code = UNSUPPORTED_NODE_RUNTIME;
  readonly diagnostic: NodeRuntimeInspection;
  constructor(diagnostic: NodeRuntimeInspection) {
    super(`[${UNSUPPORTED_NODE_RUNTIME}] ${diagnostic.message} ${diagnostic.remediation}`);
    this.name = "NodeRuntimeError";
    this.diagnostic = diagnostic;
  }
}

export function assertNodeRuntime(version: string, locale: RuntimeLocale = "en"): void {
  const diagnostic = inspectNodeRuntime(version, locale);
  if (!diagnostic.ok) throw new NodeRuntimeError(diagnostic);
}
