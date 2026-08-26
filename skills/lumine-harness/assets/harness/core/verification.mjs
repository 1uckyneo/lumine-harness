import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ADAPTER_CAPABILITIES = [
  "project_instructions",
  "session_context",
  "skill_discovery",
  "skill_read",
  "pre_mutation_gate",
  "stop_gate",
  "automatic_continuation",
  "work_status_matrix",
  "session_isolation"
];

const TOOL_EVENT_PRODUCTS = new Set(["qoder", "zcode", "codebuddy", "deepseek-harness"]);

function safe(value) {
  return String(value ?? "").replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 160);
}

function verificationRoot(root) {
  return path.join(root, ".harness", "runtime", "probes");
}

function activeProbeFile(root, product) {
  return path.join(verificationRoot(root), "active", `${safe(product)}.json`);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function readChallenge(dir) {
  const file = path.join(dir, "probe.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function beginVerificationRun(root, product, options = {}) {
  const hostVersion = String(options.hostVersion ?? "unknown").trim() || "unknown";
  const hostVersionSource = options.hostVersion ? (options.hostVersionSource ?? "user_reported") : "unknown";
  const runId = safe(options.verificationRunId ?? `${product}--${randomUUID()}`);
  const dir = path.join(verificationRoot(root), runId);
  if (existsSync(path.join(dir, "events.jsonl")) || existsSync(path.join(dir, "probe.json"))) {
    throw new Error(`Verification run already exists: ${runId}`);
  }
  mkdirSync(dir, { recursive: true });
  const issuedAt = new Date();
  const challenge = {
    schemaVersion: 1,
    verificationRunId: runId,
    product,
    hostVersion,
    hostVersionSource,
    rootHash: sha256(path.resolve(root)),
    nonce: randomUUID(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + Number(options.maxAgeMs ?? 24 * 60 * 60 * 1000)).toISOString()
  };
  writeFileSync(path.join(dir, "probe.json"), `${JSON.stringify(challenge, null, 2)}\n`, "utf8");
  const activeFile = activeProbeFile(root, product);
  mkdirSync(path.dirname(activeFile), { recursive: true });
  writeFileSync(activeFile, `${JSON.stringify({ product, verificationRunId: runId, expiresAt: challenge.expiresAt }, null, 2)}\n`, "utf8");
  return {
    product,
    status: "challenge_issued",
    verificationRunId: runId,
    hostVersion,
    hostVersionSource,
    message: "Start a new real Agent session from this Harness root. The Adapter will discover the active probe automatically."
  };
}

function activeVerificationRunId(root, product) {
  const file = activeProbeFile(root, product);
  if (!existsSync(file)) return null;
  try {
    const active = JSON.parse(readFileSync(file, "utf8"));
    if (active.product !== product || Date.now() > Date.parse(active.expiresAt)) return null;
    return safe(active.verificationRunId);
  } catch { return null; }
}

export function verificationRunId(input, raw = {}, root = null) {
  const requested = raw.verification_run_id ?? raw.verificationRunId;
  if (requested) return safe(requested);
  return root ? activeVerificationRunId(root, input.product) : null;
}

export function appendVerificationEvent(root, input, details = {}) {
  if (!input?.product || !input?.sessionId || input.sessionId === "unknown") throw new Error("Runtime evidence requires explicit product and sessionId.");
  const runId = verificationRunId(input, details.raw ?? {}, root);
  if (!runId) return null;
  const dir = path.join(verificationRoot(root), runId);
  const challenge = readChallenge(dir);
  if (!challenge || challenge.product !== input.product || Date.now() > Date.parse(challenge.expiresAt)) return null;
  mkdirSync(dir, { recursive: true });
  const relativeCwd = path.relative(root, path.resolve(input.cwd)) || ".";
  const record = {
    schemaVersion: 1,
    verificationRunId: runId,
    product: input.product,
    event: input.event,
    sessionIdHash: sha256(input.sessionId),
    cwd: relativeCwd.split(path.sep).join("/"),
    at: new Date().toISOString(),
    challengeHash: challenge ? sha256(JSON.stringify(challenge)) : null,
    hostVersion: challenge?.hostVersion ?? null,
    hostVersionSource: challenge?.hostVersionSource ?? "unknown",
    observations: Array.isArray(details.observations) ? [...new Set(details.observations.filter((item) => ADAPTER_CAPABILITIES.includes(item)))] : undefined,
    skill: details.skill ? { name: details.skill.name, source: details.skill.relativeSource, hash: details.skill.hash } : undefined,
    decision: details.decision ? {
      action: details.decision.action,
      disposition: details.decision.disposition ?? null,
      workStatus: details.decision.workStatus ?? null,
      workStatusRevision: details.decision.workStatusRevision ?? null,
      continuationRequestId: details.decision.continuationRequestId ?? null,
      shouldDeliver: details.decision.shouldDeliver ?? null
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

function capabilityDefaults(product) {
  return Object.fromEntries(ADAPTER_CAPABILITIES.map((capability) => {
    let result = "not_tested";
    if (["skill_read", "pre_mutation_gate"].includes(capability) && !TOOL_EVENT_PRODUCTS.has(product)) result = "not_observable";
    if (product === "opencode" && ["stop_gate", "automatic_continuation", "work_status_matrix"].includes(capability)) result = "not_applicable";
    return [capability, { result, evidenceLevel: "official_declared", observedAt: null, evidence: null }];
  }));
}

function summarizeCapabilities(product, events, evidence) {
  const capabilities = capabilityDefaults(product);
  const observedAt = events.at(-1)?.at ?? null;
  const observations = new Set(events.flatMap((event) => event.observations ?? []));
  if (events.some((event) => ["session_start", "prompt_submit"].includes(event.event))) observations.add("session_context");
  if (events.some((event) => event.skill?.source?.startsWith(".agents/skills/"))) {
    observations.add("skill_discovery");
    observations.add("skill_read");
  }
  if (events.some((event) => event.event === "stop")) observations.add("stop_gate");

  const statuses = new Set(events.filter((event) => event.event === "stop").map((event) => event.decision?.workStatus).filter(Boolean));
  if (["done", "continue_autonomously", "needs_user_decision", "needs_credentials", "needs_manual_app_step", "blocked_external"].every((status) => statuses.has(status))) {
    observations.add("work_status_matrix");
  }

  const continuationIndex = events.findIndex((event) => event.event === "stop" && event.decision?.disposition === "request_continuation" && event.decision?.continuationRequestId);
  if (continuationIndex >= 0 && events.slice(continuationIndex + 1).some((event) => event.event !== "stop")) observations.add("automatic_continuation");

  const sessions = new Map();
  for (const event of events) {
    const items = sessions.get(event.sessionIdHash) ?? [];
    items.push(event);
    sessions.set(event.sessionIdHash, items);
  }
  if (sessions.size >= 2 && [...sessions.values()].every((items) => (
    items.some((event) => ["session_start", "prompt_submit"].includes(event.event))
    && items.some((event) => event.event === "stop" && Number.isInteger(event.decision?.workStatusRevision))
  ))) observations.add("session_isolation");

  for (const capability of observations) {
    if (!capabilities[capability] || capabilities[capability].result === "not_applicable") continue;
    capabilities[capability] = { result: "passed", evidenceLevel: "runtime_observed", observedAt, evidence };
  }
  return capabilities;
}

function failedEvidence(product, message) {
  return { product, status: "failed", capabilities: capabilityDefaults(product), messages: [message] };
}

export function verifyRuntimeEvidence(root, product, options = {}) {
  const runs = candidateRuns(root, product);
  const run = options.verificationRunId
    ? runs.find((item) => item.runId === safe(options.verificationRunId))
    : runs.find((item) => item.challenge);
  if (!run) return { product, status: "not_tested", capabilities: capabilityDefaults(product), messages: ["No active probe event stream was found."] };
  if (!run.challenge) return failedEvidence(product, "Evidence was not created from an issued probe.");
  if (run.challenge.product !== product || run.challenge.rootHash !== sha256(path.resolve(root))) {
    return failedEvidence(product, "Probe belongs to a different product or Harness root.");
  }
  if (Date.now() > Date.parse(run.challenge.expiresAt)) return failedEvidence(product, "Probe expired.");
  const challengeHash = sha256(JSON.stringify(run.challenge));
  if (run.events.some((event) => event.challengeHash !== challengeHash || event.hostVersion !== run.challenge.hostVersion)) {
    return failedEvidence(product, "Runtime events do not match the issued probe.");
  }
  if (run.events.some((event) => !event.sessionIdHash)) return failedEvidence(product, "Evidence contains an event without a session identity.");
  if (run.events.some((event) => String(event.cwd).startsWith("..") || path.isAbsolute(event.cwd))) return failedEvidence(product, "Evidence was recorded outside the Harness root.");
  const maxAgeMs = Number(options.maxAgeMs ?? 24 * 60 * 60 * 1000);
  if (Date.now() - Date.parse(run.events.at(-1).at) > maxAgeMs) return failedEvidence(product, "Runtime evidence is stale.");
  const evidence = path.relative(root, run.file).replaceAll(path.sep, "/");
  return {
    product,
    status: "runtime_observed",
    verificationRunId: run.runId,
    hostVersion: run.challenge.hostVersion,
    hostVersionSource: run.challenge.hostVersionSource ?? "unknown",
    verifiedAt: run.events.at(-1).at,
    evidence,
    capabilities: summarizeCapabilities(product, run.events, evidence),
    messages: ["The active probe observed runtime events. This is not a host authenticity claim or maintainer behavior verification."]
  };
}
