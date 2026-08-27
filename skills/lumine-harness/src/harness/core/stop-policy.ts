import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { countWorkStatus, deriveStatusEmissionId, extractWorkStatus, readFreshStateStatus, readSessionState, recordUserTurn, recordWorkStatus, writeSessionState } from "./work-status.ts";
import type {
  HarnessHookDecision,
  HarnessProduct,
  HarnessSessionInput,
  SessionState,
  StopDisposition,
  UnknownRecord,
  WorkStatus
} from "./contracts.ts";

type PauseWorkStatus = Exclude<WorkStatus, "done" | "continue_autonomously">;

const PAUSE_MESSAGES: Record<PauseWorkStatus, string> = {
  needs_user_decision: "Pause and ask the user for the decision that changes direction, scope, or trade-offs.",
  needs_credentials: "Pause because credentials or authenticated access are required.",
  needs_manual_app_step: "Pause because a manual action in an external application is required.",
  blocked_external: "Pause because an external dependency is unavailable and no safe autonomous workaround remains."
};

export const DEFAULT_AUTONOMY_POLICY = Object.freeze({
  maxContinuationChain: 20,
  noProgressThreshold: 2
});

export interface AutonomyPolicy {
  maxContinuationChain: number;
  noProgressThreshold: number;
}

export interface StopCheckResult {
  ok: boolean;
  output?: string;
}

export interface StopPolicyOptions {
  root: string;
  autonomy?: Partial<AutonomyPolicy>;
  runCheck?: (root: string) => StopCheckResult;
}

type RuntimeHookInput = HarnessSessionInput & { raw?: UnknownRecord };

const HOST_CONTINUATION_LIMITS: Readonly<Partial<Record<HarnessProduct, number>>> = Object.freeze({ zcode: 3 });

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveAutonomyPolicy(
  root: string,
  product: HarnessProduct,
  override: Partial<AutonomyPolicy> = {}
): AutonomyPolicy {
  let configured: Partial<AutonomyPolicy> = {};
  const file = path.join(root, ".harness", "project.json");
  if (existsSync(file)) {
    try {
      const project = JSON.parse(readFileSync(file, "utf8")) as { autonomy?: Partial<AutonomyPolicy> };
      configured = project.autonomy ?? {};
    } catch {}
  }
  const requestedMax = positiveInteger(override.maxContinuationChain ?? configured.maxContinuationChain, DEFAULT_AUTONOMY_POLICY.maxContinuationChain);
  const hostMax = HOST_CONTINUATION_LIMITS[product] ?? Number.POSITIVE_INFINITY;
  return {
    maxContinuationChain: Math.min(requestedMax, hostMax),
    noProgressThreshold: positiveInteger(override.noProgressThreshold ?? configured.noProgressThreshold, DEFAULT_AUTONOMY_POLICY.noProgressThreshold)
  };
}

function legacyAction(disposition: StopDisposition): HarnessHookDecision["action"] {
  const actions: Record<StopDisposition, HarnessHookDecision["action"]> = {
    finish: "allow",
    request_continuation: "continue",
    pause_for_human: "pause",
    reject_completion: "block"
  };
  return actions[disposition];
}

function decision(
  disposition: StopDisposition,
  fields: Omit<Partial<HarnessHookDecision>, "disposition" | "action"> = {}
): HarnessHookDecision {
  return { disposition, action: legacyAction(disposition), ...fields };
}

function continuationRequestId(input: HarnessSessionInput, revision: number): string {
  return createHash("sha256").update(`${input.product}\0${input.sessionId}\0${revision}`).digest("hex");
}

function defaultRunCheck(root: string): StopCheckResult {
  const result = spawnSync(process.execPath, [path.join(root, ".harness", "check.mjs"), "all"], { cwd: root, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

function resolveStatus(input: RuntimeHookInput, root: string): { status: WorkStatus | null; reason: "message" | "state"; state?: SessionState | null } {
  const message = input.lastAssistantMessage ?? "";
  if (message) {
    if (countWorkStatus(message) !== 1) return { status: null, reason: "message" };
    const status = extractWorkStatus(message);
    const current = readSessionState(root, input.product, input.sessionId) ?? {};
    const emissionId = deriveStatusEmissionId(input, current);
    const state = status ? recordWorkStatus(root, input, status, { emissionId }) : null;
    return { status, reason: "message", state };
  }
  const state = readSessionState(root, input.product, input.sessionId);
  return { status: readFreshStateStatus(state), reason: "state", state };
}

export function evaluateStopPolicy(input: RuntimeHookInput, options: StopPolicyOptions): HarnessHookDecision {
  const root = options.root;
  // Some hosts expose a stable user-turn identifier only on their Stop event.
  // Reset the autonomous chain only when that explicit identifier changes;
  // Hook retries and loop counters are transport metadata, not user input.
  if (input.userTurnId) recordUserTurn(root, input, { userTurnId: input.userTurnId });
  const resolved = resolveStatus(input, root);
  if (!resolved.status) return decision("reject_completion", { message: "Record exactly one fresh WORK_STATUS before stopping." });
  const status = resolved.status;
  const state: Partial<SessionState> = resolved.state ?? readSessionState(root, input.product, input.sessionId) ?? {};
  const workStatusRevision = Number(state.workStatusRevision ?? 0);
  if (status === "continue_autonomously") {
    const revision = workStatusRevision;
    if (Number(state.lastEvaluatedContinuationRevision ?? -1) === revision) {
      const disposition: StopDisposition = state.lastContinuationDisposition ?? "pause_for_human";
      return decision(disposition, {
        workStatus: status,
        workStatusRevision,
        continuationRequestId: state.lastContinuationRequestId ?? state.pendingContinuationRequestId ?? undefined,
        shouldDeliver: false,
        message: state.lastContinuationMessage ?? "This continuation status was already evaluated."
      });
    }

    const policy = resolveAutonomyPolicy(root, input.product, options.autonomy);
    const chainCount = Number(state.autonomousChainCount ?? state.continuationCount ?? 0);
    if (chainCount >= policy.maxContinuationChain) {
      const message = `Automatic continuation reached the current limit of ${policy.maxContinuationChain}; pause for human review.`;
      writeSessionState(root, input.product, input.sessionId, {
        lastEvaluatedContinuationRevision: revision,
        lastContinuationDisposition: "pause_for_human",
        lastContinuationMessage: message
      });
      return decision("pause_for_human", { workStatus: status, workStatusRevision, shouldDeliver: false, message });
    }

    const progressRevision = Number(state.progressRevision ?? 0);
    const hadProgressBaseline = state.lastContinuationProgressRevision !== null && state.lastContinuationProgressRevision !== undefined;
    const noProgressCount = state.progressObservable && hadProgressBaseline && progressRevision === Number(state.lastContinuationProgressRevision)
      ? Number(state.noProgressCount ?? 0) + 1
      : 0;
    if (state.progressObservable && noProgressCount >= policy.noProgressThreshold) {
      const message = `No observable progress was recorded across ${policy.noProgressThreshold} continuation cycles; pause for human review.`;
      writeSessionState(root, input.product, input.sessionId, {
        noProgressCount,
        lastContinuationProgressRevision: progressRevision,
        lastEvaluatedContinuationRevision: revision,
        lastContinuationDisposition: "pause_for_human",
        lastContinuationMessage: message
      });
      return decision("pause_for_human", { workStatus: status, workStatusRevision, shouldDeliver: false, message });
    }

    const requestId = continuationRequestId(input, revision);
    const message = "Continue with the next concrete autonomous step, then report a fresh WORK_STATUS.";
    writeSessionState(root, input.product, input.sessionId, {
      autonomousChainCount: chainCount + 1,
      continuationCount: chainCount + 1,
      continuationConsumedRevision: revision,
      pendingContinuationRequestId: requestId,
      pendingContinuationRevision: revision,
      continuationRequestedAt: new Date().toISOString(),
      lastContinuationRequestId: requestId,
      lastContinuationRequestRevision: revision,
      lastContinuationProgressRevision: progressRevision,
      noProgressCount,
      lastEvaluatedContinuationRevision: revision,
      lastContinuationDisposition: "request_continuation",
      lastContinuationMessage: message
    });
    return decision("request_continuation", { workStatus: status, workStatusRevision, continuationRequestId: requestId, shouldDeliver: true, message });
  }
  if (status !== "done") return decision("pause_for_human", { workStatus: status, workStatusRevision, message: PAUSE_MESSAGES[status as PauseWorkStatus] });
  const check = (options.runCheck ?? defaultRunCheck)(root);
  if (!check.ok) return decision("reject_completion", { workStatus: status, workStatusRevision, message: check.output || "Harness checks failed." });
  return decision("finish", { workStatus: status, workStatusRevision });
}
