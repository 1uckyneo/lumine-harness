import { stdin, stdout } from "node:process";

export async function readHookInput() {
  let raw = "";
  for await (const chunk of stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : {};
}

export function writeHookOutput(value) {
  if (value !== null && value !== undefined) stdout.write(JSON.stringify(value));
}

export function normalizeHookInput(product, event, input = {}) {
  return {
    product,
    event,
    sessionId: input.session_id ?? input.sessionId ?? input.conversation_id ?? input.conversationId ?? "unknown",
    cwd: input.cwd ?? process.cwd(),
    workspaceRoots: input.workspace_roots ?? input.workspaceRoots,
    lastAssistantMessage: input.last_assistant_message ?? input.lastAssistantMessage ?? input.text ?? null,
    loopCount: Number(input.loop_count ?? input.loopCount ?? 0),
    stopHookActive: Boolean(input.stop_hook_active ?? input.stopHookActive),
    raw: input
  };
}
