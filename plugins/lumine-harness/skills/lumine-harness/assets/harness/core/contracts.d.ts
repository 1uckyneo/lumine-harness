export type HarnessProduct =
  | "codex"
  | "qoder"
  | "trae"
  | "kimi"
  | "cursor"
  | "opencode"
  | "zcode"
  | "codebuddy"
  | "deepseek-harness";

export type HarnessHookEvent =
  | "session_start"
  | "prompt_submit"
  | "tool_before"
  | "tool_after"
  | "assistant_response"
  | "stop";

export interface HarnessHookInput {
  product: HarnessProduct;
  event: HarnessHookEvent;
  sessionId: string | null;
  cwd: string;
  workspaceRoots?: string[];
  lastAssistantMessage?: string | null;
  loopCount?: number;
  stopHookActive?: boolean;
  sessionMode?: string | null;
}

export interface HarnessHookDecision {
  action: "allow" | "continue" | "pause" | "block";
  message?: string;
  workStatus?: string;
}

export type SkillDiscoveryMode = "native" | "native-with-toggle" | "adapter-routed" | "unsupported";
export type RuntimeVerificationStatus = "repository-tested" | "runtime-pending" | "host-verified";

export interface HarnessAdapterCapability {
  implementation: "available" | "unsupported";
  setup: string;
  skills: { mode: SkillDiscoveryMode; implicitDiscovery?: "best-effort" };
  runtimeVerification: RuntimeVerificationStatus;
  maturity: "full" | "partial" | "developer-preview";
  failMode: "open" | "closed";
  sessionStart: string;
  stopGate: string;
  hostVersion: string | null;
  verifiedAt: string | null;
  evidence: string | null;
}
