import { existsSync, readFileSync } from "node:fs";
import { readHookInput, writeHookOutput, normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { evaluateStopPolicy } from "../../../core/stop-policy.ts";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.ts";
import { readSessionState } from "../../../core/work-status.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";

function transcriptFallback(file: unknown): string {
  if (typeof file !== "string" || !file || !existsSync(file)) return "";
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
  process.stderr.write(`cursor stop hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
