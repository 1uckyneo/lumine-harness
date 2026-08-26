import { existsSync, readFileSync } from "node:fs";
import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.mjs";
import { readSessionState } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

function transcriptFallback(file) {
  if (!file || !existsSync(file)) return "";
  try {
    const lines = readFileSync(file, "utf8").trim().split("\n").reverse();
    for (const line of lines) {
      const item = JSON.parse(line);
      if (item.role === "assistant" && typeof item.text === "string") return item.text;
      if (item.message?.role === "assistant" && typeof item.message?.content === "string") return item.message.content;
    }
  } catch {}
  return "";
}

try {
  const raw = await readHookInput();
  if (raw.status && raw.status !== "completed") process.exit(0);
  const input = normalizeHookInput("cursor", "stop", raw);
  const root = requireHarnessRoot(input);
  const state = readSessionState(root, input.product, input.sessionId);
  input.lastAssistantMessage = state?.lastAssistantMessage || transcriptFallback(raw.transcript_path) || input.lastAssistantMessage;
  const decision = evaluateStopPolicy(input, { root });
  appendVerificationEvent(root, input, { raw, decision });
  const delivery = continuationDeliveryFor(input.product, decision);
  if (decision.disposition === "reject_completion" && delivery === "automatic") {
    writeHookOutput({ followup_message: decision.message });
  } else if (decision.disposition === "request_continuation" && decision.shouldDeliver === true && delivery === "automatic") {
    writeHookOutput({ followup_message: decision.message });
  }
} catch (error) {
  process.stderr.write(`cursor stop hook failed: ${error.message}\n`);
  process.exitCode = 1;
}
