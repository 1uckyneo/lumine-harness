import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_EVENTS = {
  codex: ["session_start", "stop"],
  qoder: ["prompt_submit", "tool_before", "tool_after", "stop"],
  trae: ["session_start", "stop"],
  kimi: ["session_start", "stop"],
  cursor: ["session_start", "stop"],
  zcode: ["session_start", "prompt_submit", "tool_before", "tool_after", "stop"],
  codebuddy: ["session_start", "prompt_submit", "tool_before", "tool_after", "stop"],
  "deepseek-harness": ["session_start", "prompt_submit", "tool_before", "tool_after", "stop"]
};

function safe(value) {
  return String(value ?? "").replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 160);
}

function verificationRoot(root) {
  return path.join(root, ".harness", "runtime", "verification");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function readChallenge(dir) {
  const file = path.join(dir, "challenge.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function beginVerificationRun(root, product, options = {}) {
  const hostVersion = String(options.hostVersion ?? "").trim();
  if (!hostVersion) throw new Error("A real host version is required to begin runtime verification.");
  const runId = safe(options.verificationRunId ?? `${product}--${randomUUID()}`);
  const dir = path.join(verificationRoot(root), runId);
  if (existsSync(path.join(dir, "events.jsonl")) || existsSync(path.join(dir, "challenge.json"))) {
    throw new Error(`Verification run already exists: ${runId}`);
  }
  mkdirSync(dir, { recursive: true });
  const issuedAt = new Date();
  const challenge = {
    schemaVersion: 1,
    verificationRunId: runId,
    product,
    hostVersion,
    rootHash: sha256(path.resolve(root)),
    nonce: randomUUID(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + Number(options.maxAgeMs ?? 24 * 60 * 60 * 1000)).toISOString()
  };
  writeFileSync(path.join(dir, "challenge.json"), `${JSON.stringify(challenge, null, 2)}\n`, "utf8");
  return {
    product,
    status: "challenge_issued",
    verificationRunId: runId,
    hostVersion,
    message: `Start the real host with HARNESS_VERIFICATION_RUN_ID=${runId}; then run adapter verify ${product}.`
  };
}

export function verificationRunId(input, raw = {}) {
  const requested = raw.verification_run_id ?? raw.verificationRunId ?? process.env.HARNESS_VERIFICATION_RUN_ID;
  return safe(requested || `${input.product}--${input.sessionId}`);
}

export function appendVerificationEvent(root, input, details = {}) {
  if (!input?.product || !input?.sessionId || input.sessionId === "unknown") throw new Error("Runtime evidence requires explicit product and sessionId.");
  const runId = verificationRunId(input, details.raw ?? {});
  const dir = path.join(verificationRoot(root), runId);
  mkdirSync(dir, { recursive: true });
  const challenge = readChallenge(dir);
  const record = {
    schemaVersion: 1,
    verificationRunId: runId,
    product: input.product,
    event: input.event,
    sessionId: input.sessionId,
    cwd: path.resolve(input.cwd),
    at: new Date().toISOString(),
    challengeHash: challenge ? sha256(JSON.stringify(challenge)) : null,
    hostVersion: challenge?.hostVersion ?? null,
    skill: details.skill ? { name: details.skill.name, source: details.skill.relativeSource, hash: details.skill.hash } : undefined,
    decision: details.decision ? {
      action: details.decision.action,
      workStatus: details.decision.workStatus ?? null,
      workStatusRevision: details.decision.workStatusRevision ?? null
    } : undefined
  };
  appendFileSync(path.join(dir, "events.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

function readEvents(file) {
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function candidateRuns(root, product) {
  const dir = verificationRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const file = path.join(dir, entry.name, "events.jsonl");
    if (!existsSync(file)) return null;
    try {
      const events = readEvents(file);
      const filtered = events.filter((event) => event.product === product);
      return filtered.length ? { runId: entry.name, file, challenge: readChallenge(path.join(dir, entry.name)), events: filtered } : null;
    } catch { return null; }
  }).filter(Boolean).sort((left, right) => Date.parse(right.events.at(-1)?.at ?? 0) - Date.parse(left.events.at(-1)?.at ?? 0));
}

export function verifyRuntimeEvidence(root, product, options = {}) {
  if (product === "opencode") return { product, status: "runtime_pending", messages: ["This adapter has no complete Stop Gate contract."] };
  const runs = candidateRuns(root, product);
  const run = options.verificationRunId
    ? runs.find((item) => item.runId === safe(options.verificationRunId))
    : runs.find((item) => item.challenge);
  if (!run) return { product, status: "runtime_pending", messages: ["No runtime verification event stream was found."] };
  if (!run.challenge) return { product, status: "failed", messages: ["Evidence was not created from an issued verification challenge."] };
  if (run.challenge.product !== product || run.challenge.rootHash !== sha256(path.resolve(root))) {
    return { product, status: "failed", messages: ["Verification challenge belongs to a different product or Harness root."] };
  }
  if (Date.now() > Date.parse(run.challenge.expiresAt)) return { product, status: "failed", messages: ["Verification challenge expired."] };
  const challengeHash = sha256(JSON.stringify(run.challenge));
  if (run.events.some((event) => event.challengeHash !== challengeHash || event.hostVersion !== run.challenge.hostVersion)) {
    return { product, status: "failed", messages: ["Runtime events do not match the issued host challenge."] };
  }
  const sessions = new Set(run.events.map((event) => event.sessionId));
  if (sessions.size !== 1) return { product, status: "failed", messages: ["Evidence mixes multiple session IDs."] };
  const invalidRoot = run.events.some((event) => {
    const relative = path.relative(root, path.resolve(event.cwd));
    return relative.startsWith("..") || path.isAbsolute(relative);
  });
  if (invalidRoot) return { product, status: "failed", messages: ["Evidence was recorded outside the Harness root."] };
  const maxAgeMs = Number(options.maxAgeMs ?? 24 * 60 * 60 * 1000);
  if (Date.now() - Date.parse(run.events.at(-1).at) > maxAgeMs) return { product, status: "failed", messages: ["Runtime evidence is stale."] };
  const observed = new Set(run.events.map((event) => event.event));
  const missing = (REQUIRED_EVENTS[product] ?? []).filter((event) => !observed.has(event));
  if (missing.length) return { product, status: "failed", messages: [`Missing required events: ${missing.join(", ")}.`] };
  const readEvidence = run.events.some((event) => event.event === "tool_after" && event.skill?.source?.startsWith(".agents/skills/"));
  if ((REQUIRED_EVENTS[product] ?? []).includes("tool_after") && !readEvidence) {
    return { product, status: "failed", messages: ["No canonical .agents/skills read was proven."] };
  }
  return {
    product,
    status: "host_verified",
    verificationRunId: run.runId,
    sessionId: [...sessions][0],
    hostVersion: run.challenge.hostVersion,
    verifiedAt: run.events.at(-1).at,
    evidence: path.relative(root, run.file).replaceAll(path.sep, "/"),
    messages: ["Runtime challenge, event sequence, and canonical Skill read were verified."]
  };
}
