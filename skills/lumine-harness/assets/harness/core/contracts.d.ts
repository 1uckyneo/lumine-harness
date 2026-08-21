export type HarnessProduct =
  | "codex"
  | "qoder"
  | "trae"
  | "kimi"
  | "cursor"
  | "opencode"
  | "zcode"
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
  sessionId: string;
  cwd: string;
  workspaceRoots?: string[];
  lastAssistantMessage?: string | null;
  loopCount?: number;
  stopHookActive?: boolean;
}

export interface HarnessHookDecision {
  action: "allow" | "continue" | "pause" | "block";
  message?: string;
  workStatus?: string;
}
