import { normalizeHookInput } from "../../../core/hook-io.ts";
import { requireHarnessRoot } from "../../../core/root-resolver.ts";
import { buildSessionStartContext } from "../../../core/session-context.ts";
import { evaluateStopPolicy } from "../../../core/stop-policy.ts";
import { continuationDeliveryFor } from "../../../core/continuation-delivery.ts";
import {
  isMutatingTool,
  markExpectedSkillRead,
  pendingExpectedSkills,
  recordPromptRoute,
  requireExpectedSkillRead,
  toolReadsExpectedSkill
} from "../../../core/phase-router.ts";
import { sharedSkillLoadedFromTool, sharedSkillReadFromTool } from "../../../core/skill-catalog.ts";
import {
  initializeSessionState,
  observeHarnessEvent,
  recordUsedSkill,
  readSessionState
} from "../../../core/work-status.ts";
import { appendVerificationEvent } from "../../../core/verification.ts";
import type { HarnessHookEvent, NormalizedHarnessHookInput, UnknownRecord } from "../../../core/contracts.ts";

const EVENT_MAP = {
    SessionStart: "session_start",
    UserPromptSubmit: "prompt_submit",
    PreToolUse: "tool_before",
    PostToolUse: "tool_after",
    Stop: "stop"
} as const satisfies Record<string, HarnessHookEvent>;

interface HookResult { exitCode: number; stdout?: string; stderr?: string }

function eventFor(raw: UnknownRecord): HarnessHookEvent | undefined {
  const eventName = raw.hook_event_name;
  return typeof eventName === "string" ? EVENT_MAP[eventName as keyof typeof EVENT_MAP] : undefined;
}

function ensureSession(root: string, input: NormalizedHarnessHookInput): void {
  if (!readSessionState(root, input.product, input.sessionId)) {
    initializeSessionState(root, input);
  }
}

export async function handleZCodeHook(raw: UnknownRecord = {}): Promise<HookResult> {
  const event = eventFor(raw);
  if (!event) return { exitCode: 0 };
  const input = normalizeHookInput("zcode", event, raw);
  const root = requireHarnessRoot(input);
  if (event === "session_start") initializeSessionState(root, input);
  else ensureSession(root, input);
  if (event !== "stop") {
    observeHarnessEvent(root, input, {
      eventId: input.eventId,
      userInitiated: event === "prompt_submit" && input.userInitiated
    });
  }
  appendVerificationEvent(root, input, { raw });

  if (event === "session_start") {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: buildSessionStartContext({ ...input, root })
        }
      })
    };
  }

  if (event === "prompt_submit") {
    const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
    const state = recordPromptRoute(root, input, prompt);
    const expected = pendingExpectedSkills(state);
    const phaseContext = expected.length
      ? `\n- Before any mutating tool, read these canonical shared Skills completely:\n${expected.map((skill) => `  - ${skill.path} (${skill.reason})`).join("\n")}`
      : "";
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `${buildSessionStartContext({ ...input, root, prompt })}${phaseContext}`
        }
      })
    };
  }

  if (event === "tool_after") {
    let state = readSessionState(root, input.product, input.sessionId);
    const loadedSkill = sharedSkillLoadedFromTool(root, raw);
    if (loadedSkill) {
      state = requireExpectedSkillRead(root, input, state, loadedSkill);
      recordUsedSkill(root, input, loadedSkill);
      appendVerificationEvent(root, input, { raw, skill: loadedSkill });
      state = markExpectedSkillRead(root, input, state, loadedSkill.file);
    }
    const sharedSkill = sharedSkillReadFromTool(root, raw);
    if (sharedSkill) {
      recordUsedSkill(root, input, sharedSkill);
      appendVerificationEvent(root, input, { raw, skill: sharedSkill });
      state = readSessionState(root, input.product, input.sessionId);
    }
    for (const skill of pendingExpectedSkills(state)) {
      if (toolReadsExpectedSkill(raw, skill.path)) state = markExpectedSkillRead(root, input, state, skill.path);
    }
    return { exitCode: 0 };
  }

  if (event === "tool_before") {
    const state = readSessionState(root, input.product, input.sessionId);
    const pending = pendingExpectedSkills(state);
    if (isMutatingTool(raw) && pending.length) {
      appendVerificationEvent(root, input, { raw, observations: ["pre_mutation_gate"] });
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Read the required canonical shared Skills before mutation: ${pending.map((skill) => skill.path).join(", ")}.`
          }
        })
      };
    }
    return { exitCode: 0 };
  }

  const decision = evaluateStopPolicy(input, { root });
  appendVerificationEvent(root, input, { raw, decision });
  const delivery = continuationDeliveryFor(input.product, decision);
  if (decision.disposition === "reject_completion" && delivery === "automatic") {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ decision: "block", reason: decision.message })
    };
  }
  if (decision.disposition === "request_continuation" && decision.shouldDeliver === true && delivery === "automatic") {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ decision: "block", reason: decision.message })
    };
  }
  return { exitCode: 0 };
}

async function main() {
  let source = "";
  for await (const chunk of process.stdin) source += chunk;
  const result = await handleZCodeHook(source.trim() ? JSON.parse(source) : {});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`zcode hook failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
