import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeHookInput } from "../../../core/hook-io.mjs";
import { requireHarnessRoot } from "../../../core/root-resolver.mjs";
import { buildSessionStartContext } from "../../../core/session-context.mjs";
import { evaluateStopPolicy } from "../../../core/stop-policy.mjs";
import {
  expectedSkillPath,
  isMutatingTool,
  recordPromptRoute,
  routeHarnessPhase,
  toolLoadsExpectedSkill,
  toolReadsExpectedSkill
} from "../../../core/phase-router.mjs";
import {
  initializeSessionState,
  readSessionState,
  writeSessionState
} from "../../../core/work-status.mjs";

function eventFor(raw) {
  return {
    SessionStart: "session_start",
    UserPromptSubmit: "prompt_submit",
    PreToolUse: "tool_before",
    PostToolUse: "tool_after",
    Stop: "stop"
  }[raw.hook_event_name];
}

function recordEvidence(root, input, raw) {
  const dir = path.join(root, ".harness", "runtime", "deepseek-harness");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "latest-hook.json"),
    `${JSON.stringify({
      product: "deepseek-harness",
      event: raw.hook_event_name,
      sessionId: input.sessionId,
      cwd: input.cwd,
      at: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );
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
  recordEvidence(root, input, raw);

  if (event === "session_start") {
    return { exitCode: 0, stdout: buildSessionStartContext({ ...input, root }) };
  }

  if (event === "prompt_submit") {
    const prompt = raw.prompt ?? "";
    recordPromptRoute(root, input, prompt);
    const phase = routeHarnessPhase(prompt);
    const phaseContext = phase
      ? `\n- This prompt entered the ${phase.id} phase. Load the native shared Skill ${phase.skill} from ${expectedSkillPath(root, phase.skill)} before mutating the workspace.`
      : "";
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `${buildSessionStartContext({ ...input, root })}${phaseContext}`
        }
      })
    };
  }

  if (event === "tool_after") {
    const state = readSessionState(root, input.product, input.sessionId);
    if (
      state?.expectedSkill &&
      (toolLoadsExpectedSkill(raw, state.expectedSkill) || toolReadsExpectedSkill(raw, state.expectedSkillPath))
    ) {
      writeSessionState(root, input.product, input.sessionId, {
        expectedSkillRead: true,
        expectedSkillReadAt: new Date().toISOString()
      });
    }
    return { exitCode: 0 };
  }

  if (event === "tool_before") {
    const state = readSessionState(root, input.product, input.sessionId);
    if (isMutatingTool(raw) && state?.expectedSkill && !state.expectedSkillRead) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Load ${state.expectedSkill} before executing the ${state.expectedPhase} phase.`
          }
        })
      };
    }
    return { exitCode: 0 };
  }

  const decision = evaluateStopPolicy(input, { root });
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
