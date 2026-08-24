import { normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";
import {
  isMutatingTool,
  markExpectedSkillRead,
  pendingExpectedSkills,
  recordPromptRoute,
  toolLoadsExpectedSkill,
  toolReadsExpectedSkill
} from "../../../core/phase-router.mjs";
import {
  initializeSessionState,
  readSessionState
} from "../../../core/work-status.mjs";
import { appendVerificationEvent } from "../../../core/verification.mjs";
import { getSharedSkill } from "../../../core/skill-catalog.mjs";

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
  if (!readSessionState(root, input.product, input.sessionId)) {
    initializeSessionState(root, input);
  }
}

export async function handleDeepSeekHarnessHook(raw = {}) {
  const event = eventFor(raw);
  if (!event) return { exitCode: 0 };
  const input = normalizeHookInput("deepseek-harness", event, raw);
  const root = requireHarnessRoot(input);
  if (event === "session_start") initializeSessionState(root, input);
  else ensureSession(root, input);
  appendVerificationEvent(root, input, { raw });

  if (event === "session_start") {
    return { exitCode: 0, stdout: buildSessionStartContext({ ...input, root }) };
  }

  if (event === "prompt_submit") {
    const prompt = raw.prompt ?? "";
    const state = recordPromptRoute(root, input, prompt);
    const expected = pendingExpectedSkills(state);
    const phaseContext = expected.length
      ? `\n- Before mutating the workspace, load these native shared Skills:\n${expected.map((skill) => `  - ${skill.name} from ${skill.path}`).join("\n")}`
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
    for (const skill of pendingExpectedSkills(state)) {
      if (toolLoadsExpectedSkill(raw, skill.name) || toolReadsExpectedSkill(raw, skill.path)) {
        state = markExpectedSkillRead(root, input, state, skill.path);
        const sharedSkill = getSharedSkill(root, skill.name);
        if (sharedSkill) appendVerificationEvent(root, input, { raw, skill: sharedSkill });
      }
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
            permissionDecisionReason: `Load the required shared Skills before mutation: ${pending.map((skill) => skill.name).join(", ")}.`
          }
        })
      };
    }
    return { exitCode: 0 };
  }

  const decision = evaluateStopPolicy(input, { root });
  appendVerificationEvent(root, input, { raw, decision });
  if (decision.action === "continue" || decision.action === "block") {
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
  const result = await handleDeepSeekHarnessHook(source.trim() ? JSON.parse(source) : {});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`deepseek-harness hook failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
