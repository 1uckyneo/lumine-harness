// Pause statuses are parallel categories. This hook only gates continuation and does not archive exec plans or rewrite docs.
export const WORK_STATUSES = new Set([
  "done",
  "continue_autonomously",
  "needs_user_decision",
  "needs_credentials",
  "needs_manual_app_step",
  "blocked_external"
]);

const STATUS_REASONS = {
  continue_autonomously:
    "The last assistant message marked WORK_STATUS: continue_autonomously. Continue with the next concrete autonomous step only, then stop again with a fresh WORK_STATUS line.",
  needs_user_decision:
    "Pause because the next step depends on a user decision that the agent cannot safely make alone. The stop gate does not choose for the user or archive plan files.",
  needs_credentials:
    "Pause because credentials, login material, or access tokens are required before the task can continue.",
  needs_manual_app_step:
    "Pause because the next step requires a manual action in an external application or UI.",
  blocked_external:
    "Pause because an external dependency is unavailable and there is no safe autonomous workaround."
};

const FALLBACK_PATTERNS = [
  {
    status: "needs_credentials",
    patterns: [
      /\b(password|passcode|otp|mfa|2fa|api key|api_key|token|cookie)\b/i,
      /验证码/u,
      /需要.*(密码|令牌|验证码|凭证)/u
    ]
  },
  {
    status: "needs_manual_app_step",
    patterns: [
      /\b(after you log in|please log in|once you approve|manual step)\b/i,
      /手动登录/u,
      /需要.*手工/u
    ]
  },
  {
    status: "needs_user_decision",
    patterns: [
      /\b(need your decision|please choose|which option|need confirmation)\b/i,
      /需要你(决定|确认|选择)/u
    ]
  },
  {
    status: "blocked_external",
    patterns: [
      /\b(blocked by external|external system unavailable|cannot reach external|service unavailable)\b/i,
      /外部系统.*不可达/u
    ]
  }
];

export function extractWorkStatus(message = "") {
  const match = message.match(/WORK_STATUS:\s*([a-z_]+)/i);

  if (!match) {
    return null;
  }

  const normalized = match[1].toLowerCase();
  return WORK_STATUSES.has(normalized) ? normalized : null;
}

export function inferPauseStatus(message = "") {
  for (const { status, patterns } of FALLBACK_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(message))) {
      return status;
    }
  }

  return null;
}

export function decideStopHookResponse(input = {}) {
  const message = input.last_assistant_message ?? "";
  const status = extractWorkStatus(message) ?? inferPauseStatus(message);

  if (!status || status === "done") {
    return null;
  }

  if (status === "continue_autonomously") {
    if (input.stop_hook_active) {
      return {
        continue: false,
        stopReason: "Auto-continuation already used for this turn.",
        systemMessage:
          "The harness stop hook already continued this turn once. Pause now and emit an updated WORK_STATUS line on the next assistant message."
      };
    }

    return {
      decision: "block",
      reason: STATUS_REASONS.continue_autonomously
    };
  }

  return {
    continue: false,
    stopReason: STATUS_REASONS[status],
    systemMessage: STATUS_REASONS[status]
  };
}
