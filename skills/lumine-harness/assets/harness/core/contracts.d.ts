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
  statusEmissionId?: string | null;
  userTurnId?: string | null;
  eventId?: string | null;
  userInitiated?: boolean;
  progressObservable?: boolean;
  progressObserved?: boolean;
}

export type StopDisposition =
  | "finish"
  | "request_continuation"
  | "pause_for_human"
  | "reject_completion";

export type ContinuationDelivery = "automatic" | "manual_required" | "unsupported";

export interface HarnessHookDecision {
  disposition: StopDisposition;
  /** @deprecated Adapter migration compatibility. Use disposition instead. */
  action: "allow" | "continue" | "pause" | "block";
  message?: string;
  workStatus?: string;
  workStatusRevision?: number;
  continuationRequestId?: string;
  shouldDeliver?: boolean;
}

export type SkillDiscoveryMode = "native" | "native-with-toggle" | "adapter-routed" | "unsupported";
export type CapabilityEvidenceLevel = "official_declared" | "repository_checked" | "runtime_observed" | "behavior_verified";
export type CapabilityResult = "passed" | "needs_setup" | "not_tested" | "not_observable" | "not_applicable" | "failed";
export type AdapterCapabilityName =
  | "project_instructions"
  | "session_context"
  | "skill_discovery"
  | "skill_read"
  | "pre_mutation_gate"
  | "stop_gate"
  | "automatic_continuation"
  | "work_status_matrix"
  | "session_isolation";

export interface AdapterCapabilityResult {
  result: CapabilityResult;
  evidenceLevel: CapabilityEvidenceLevel;
  observedAt?: string | null;
  evidence?: string | null;
}

export interface HarnessAdapterCapability {
  implementation: "available" | "unsupported";
  setup: string;
  skills: { mode: SkillDiscoveryMode; implicitDiscovery?: "best-effort" };
  capabilities: Partial<Record<AdapterCapabilityName, AdapterCapabilityResult>>;
  continuation?: { delivery: ContinuationDelivery; maxConsecutive?: number | null };
  maturity: "full" | "partial" | "developer-preview";
  failMode: "open" | "closed";
}
