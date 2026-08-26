import { stdin, stdout } from "node:process";

export async function readHookInput() {
  let raw = "";
  for await (const chunk of stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : {};
}

export function writeHookOutput(value) {
  if (value !== null && value !== undefined) stdout.write(JSON.stringify(value));
}

function booleanValue(value) {
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}

function optionalBooleanValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return booleanValue(value);
}

function firstIdentifier(input, names) {
  for (const name of names) {
    const value = input[name];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return null;
}

export function normalizeHookInput(product, event, input = {}) {
  const sessionId = input.session_id ?? input.sessionId ?? input.conversation_id ?? input.conversationId ?? null;
  const eventId = firstIdentifier(input, ["hook_run_id", "hookRunId", "event_id", "eventId", "request_id", "requestId"]);
  const responseId = firstIdentifier(input, ["assistant_message_id", "assistantMessageId", "response_id", "responseId", "message_id", "messageId", "generation_id", "generationId"]);
  const userTurnId = firstIdentifier(input, ["user_turn_id", "userTurnId", "user_prompt_id", "userPromptId"]);
  return {
    product,
    event,
    sessionId: sessionId ? String(sessionId) : null,
    cwd: input.cwd ?? process.cwd(),
    workspaceRoots: input.workspace_roots ?? input.workspaceRoots,
    lastAssistantMessage: input.last_assistant_message ?? input.lastAssistantMessage ?? input.text ?? null,
    loopCount: Number(input.loop_count ?? input.loopCount ?? 0),
    stopHookActive: booleanValue(input.stop_hook_active ?? input.stopHookActive),
    sessionMode: input.source ?? input.session_mode ?? input.sessionMode ?? null,
    eventId,
    statusEmissionId: responseId,
    userTurnId,
    userInitiated: optionalBooleanValue(input.user_initiated ?? input.userInitiated ?? input.is_user_input ?? input.isUserInput),
    progressObservable: booleanValue(input.harness_progress_observable ?? input.progressObservable),
    progressObserved: booleanValue(input.harness_progress_observed ?? input.progressObserved),
    raw: input
  };
}
