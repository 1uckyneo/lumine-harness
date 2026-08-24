import { normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";
import {
  isMutatingTool,
  markExpectedSkillRead,
  pendingExpectedSkills,
  recordPromptRoute,
  requireExpectedSkillRead,
  toolReadsExpectedSkill
} from "../../../core/phase-router.mjs";
import { sharedSkillLoadedFromTool, sharedSkillReadFromTool } from "../../../core/skill-catalog.mjs";
import { initializeSessionState, readSessionState, recordUsedSkill } from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";

function eventFor(raw) {
  return {
    SessionStart: "session_start",
    UserPromptSubmit: "prompt_submit",
    PreToolUse: "tool_before",
    PostToolUse: "tool_after",
    Stop: "stop"
  }[raw.hook_event_name];
}

function ensureSession(root, input) {
  if (!readSessionState(root, input.product, input.sessionId)) initializeSessionState(root, input);
}

function contextOutput(event, context) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: context
    }
  });
}

export async function handleCodeBuddyHook(raw = {}) {
  const event = eventFor(raw);
  if (!event) return { exitCode: 0 };
  const input = normalizeHookInput("codebuddy", event, raw);
  const root = requireHarnessRoot(input);
  if (event === "session_start") initializeSessionState(root, input);
  else ensureSession(root, input);
  appendVerificationEvent(root, input, { raw });

  if (event === "session_start") {
    return { exitCode: 0, stdout: contextOutput("SessionStart", buildSessionStartContext({ ...input, root })) };
  }

  if (event === "prompt_submit") {
    const state = recordPromptRoute(root, input, raw.prompt ?? "");
    const expected = pendingExpectedSkills(state);
    const required = expected.length
      ? `\n- Before mutation, read these canonical shared Skills completely:\n${expected.map((skill) => `  - ${skill.path} (${skill.reason})`).join("\n")}`
      : "";
    return {
      exitCode: 0,
      stdout: contextOutput("UserPromptSubmit", `${buildSessionStartContext({ ...input, root, prompt: raw.prompt ?? "" })}${required}`)
    };
  }

  if (event === "tool_after") {
    let state = readSessionState(root, input.product, input.sessionId);
    const loadedSkill = sharedSkillLoadedFromTool(root, raw);
    if (loadedSkill) state = requireExpectedSkillRead(root, input, state, loadedSkill);
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
  if (decision.action === "continue" || decision.action === "block") {
    return { exitCode: 0, stdout: JSON.stringify({ continue: false, reason: decision.message }) };
  }
  return { exitCode: 0 };
}

async function main() {
  let source = "";
  for await (const chunk of process.stdin) source += chunk;
  const result = await handleCodeBuddyHook(source.trim() ? JSON.parse(source) : {});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`codebuddy hook failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
