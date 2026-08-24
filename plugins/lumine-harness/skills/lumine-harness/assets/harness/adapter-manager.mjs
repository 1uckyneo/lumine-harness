import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findHarnessRoot, isStartedAtHarnessRoot } from "./core/root-resolver.mjs";
import { discoverSharedSkills, getSharedSkill, searchSharedSkills } from "./core/skill-catalog.mjs";
import { recordWorkStatus, WORK_STATUSES } from "./core/work-status.mjs";
import { beginVerificationRun, verifyRuntimeEvidence } from "./core/verification.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS = ["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"];
const KIMI_BEGIN = "# BEGIN lumine-harness adapter (managed)";
const KIMI_END = "# END lumine-harness adapter (managed)";
const LEGACY_KIMI_BEGIN = "# BEGIN harness-engineering adapter (managed)";
const LEGACY_KIMI_END = "# END harness-engineering adapter (managed)";

function capabilities(root) {
  return JSON.parse(readFileSync(path.join(root, ".harness", "adapter-capabilities.json"), "utf8"));
}

function projectConfig(root) {
  const file = path.join(root, ".harness", "project.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function selectedAdapters(root) {
  const selected = projectConfig(root)?.selectedAdapters;
  if (Array.isArray(selected)) return selected.filter((product) => PRODUCTS.includes(product));
  return PRODUCTS.filter((product) => existsSync(entry(root, product)) && !["kimi", "zcode", "deepseek-harness"].includes(product));
}

function entry(root, product) {
  return {
    codex: path.join(root, ".codex", "hooks.json"),
    qoder: path.join(root, ".qoder", "settings.json"),
    trae: path.join(root, ".trae", "hooks.json"),
    kimi: path.join(root, ".harness", "adapters", "kimi", "hooks", "dispatch.mjs"),
    cursor: path.join(root, ".cursor", "hooks.json"),
    opencode: path.join(root, ".opencode", "plugins", "harness.mjs"),
    zcode: path.join(root, ".harness", "adapters", "zcode", "marketplace", "marketplace.json"),
    codebuddy: path.join(root, ".codebuddy", "settings.json"),
    "deepseek-harness": path.join(root, ".harness", "adapters", "deepseek-harness", "bundle", "package.json")
  }[product];
}

function forbidden(root) {
  return [
    ".qoder/skills",
    ".codebuddy/skills",
    ".harness/adapters/zcode/marketplace/plugins/lumine-harness-adapter/skills",
    ".trae/skills",
    ".kimi-code/skills",
    ".qoder/rules",
    ".trae/rules",
    ".cursor/rules",
    ".zcode/skills",
    ".zcode/rules",
    ".codebuddy/rules",
    ".dsh/skills"
  ]
    .filter((item) => existsSync(path.join(root, item)));
}

function importsRootAgents(root, file) {
  const source = readFileSync(file, "utf8");
  const rootAgents = path.resolve(root, "AGENTS.md");
  return [...source.matchAll(/(?:^|\s)@([^\s]+)/gm)]
    .some((match) => path.resolve(path.dirname(file), match[1]) === rootAgents);
}

export function listAdapters(root = findHarnessRoot(process.cwd())) {
  if (!root) throw new Error("Harness root not found.");
  const manifest = capabilities(root);
  const selected = new Set(selectedAdapters(root));
  return PRODUCTS.map((product) => ({ product, selected: selected.has(product), ...manifest.products[product] }));
}

export function hasManagedKimiBlock(configFile) {
  if (!existsSync(configFile)) return false;
  const source = readFileSync(configFile, "utf8");
  return source.includes(KIMI_BEGIN) || source.includes(LEGACY_KIMI_BEGIN);
}

export function doctorAdapter(product, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = findHarnessRoot(cwd);
  if (!PRODUCTS.includes(product)) return { product, status: "error", messages: [`Unknown product: ${product}`] };
  if (!root) return { product, status: "error", messages: ["Open the workspace containing .harness/root.json."] };
  if (!selectedAdapters(root).includes(product)) return { product, status: "not_selected", root, capability: capabilities(root).products[product], messages: ["This Adapter is available but not selected in .harness/project.json."] };
  const messages = [];
  let status = "repository_ready";
  if (!isStartedAtHarnessRoot(root, cwd)) {
    status = "error";
    messages.push(`Open the parent Harness root ${root}; current start directory is ${cwd}.`);
  }
  if (!existsSync(entry(root, product))) {
    status = status === "error" ? status : "not_installed";
    messages.push("Repository adapter entry was not selected during Adopt.");
  }
  const copies = forbidden(root);
  if (copies.length) {
    status = "error";
    messages.push(`Forbidden product-specific sources: ${copies.join(", ")}`);
  }
  if (product === "qoder" && status !== "not_installed") {
    messages.push("Qoder host variants expose different lifecycle events. Explicit and phase Skills are routed to canonical .agents/skills; implicit discovery is best-effort until host verification.");
  }
  if (product === "trae" && status === "repository_ready") {
    status = "needs_manual_app_step";
    messages.push("Enable project AGENTS.md, shared .agents/skills, and project Hooks in TRAE settings.");
  }
  if (product === "kimi") {
    const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
    if (!hasManagedKimiBlock(path.join(home, "config.toml"))) {
      status = status === "error" ? status : "needs_manual_app_step";
      messages.push("With separate approval, run ./.harness/cli adapter install kimi and reload Kimi Code.");
    }
    messages.push("Kimi Hooks are fail-open and are not the only high-risk safety barrier.");
  }
  if (product === "cursor" && status === "repository_ready") {
    status = "needs_manual_app_step";
    messages.push("Open the parent workspace in Cursor and confirm Workspace Trust.");
  }
  if (product === "opencode" && status !== "not_installed" && status !== "error") {
    status = "partial";
    messages.push("stopGate is unsupported; session.idle is audit-only.");
  }
  if (product === "zcode" && status !== "not_installed" && status !== "error") {
    const evidence = verifyRuntimeEvidence(root, product);
    if (evidence.status !== "host_verified") {
      status = "needs_manual_app_step";
      messages.push("Add .harness/adapters/zcode/marketplace in ZCode Settings -> Plugins, install lumine-harness-adapter, enable it, and start a new session.");
      messages.push("ZCode project-level hooks are ignored; runtime Hook evidence is required before compatibility is verified.");
    } else {
      messages.push("ZCode runtime Hook evidence exists; inspect it with adapter verify before relying on the Stop Gate.");
    }
    messages.push("ZCode uses Adapter routing to canonical .agents/skills; implicit discovery is best-effort.");
  }
  if (product === "codebuddy" && status !== "not_installed" && status !== "error") {
    const memoryFiles = [path.join(root, "CODEBUDDY.md"), path.join(root, ".codebuddy", "CODEBUDDY.md")].filter(existsSync);
    const shadowsAgents = memoryFiles.filter((file) => !importsRootAgents(root, file));
    if (shadowsAgents.length) {
      status = "error";
      messages.push(`CodeBuddy memory shadows root AGENTS.md: ${shadowsAgents.map((file) => path.relative(root, file)).join(", ")}. Remove it or import the root AGENTS.md with the correct relative @path, then start a new session.`);
    } else {
      const evidence = verifyRuntimeEvidence(root, product);
      if (evidence.status !== "host_verified") {
        status = "needs_manual_app_step";
        messages.push("Open /hooks in CodeBuddy Code, review the project Hook changes, then start a new session from the Harness root.");
      } else {
        messages.push("CodeBuddy Hook runtime evidence exists; inspect adapter verify output before relying on continuation behavior.");
      }
      messages.push("CodeBuddy uses Adapter routing to canonical .agents/skills; implicit discovery is best-effort.");
    }
  }
  if (product === "deepseek-harness" && status !== "not_installed" && status !== "error") {
    const evidence = verifyRuntimeEvidence(root, product);
    if (evidence.status !== "host_verified") {
      status = "needs_manual_app_step";
      messages.push("Install the local DSH profile bundle explicitly, then run DeepSeek Harness from the parent Harness root.");
    } else {
      status = "partial";
      messages.push("DeepSeek Harness Hook evidence exists, but the official bridge still has partial SessionStart and Stop semantics.");
    }
    messages.push("Verified contract: @deepseek-ai/dsh 0.1.0-rc.7 with @deepseek-ai/dsh-hooks-codex 0.1.0-rc.7.");
    messages.push("The native DSH instruction and Skill loaders read root AGENTS.md and project .agents/skills when started from the Harness root.");
  }
  if (!messages.length) messages.push("Repository adapter contract is present; product runtime verification is still required.");
  return { product, status, root, capability: capabilities(root).products[product], messages };
}

export function verifyAdapter(product, options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const root = findHarnessRoot(cwd);
  if (!root) return { product, status: "error", messages: ["Harness root not found."] };
  const doctor = doctorAdapter(product, options);
  if (["error", "not_installed", "not_selected"].includes(doctor.status)) return doctor;
  return { ...verifyRuntimeEvidence(root, product, options), capability: capabilities(root).products[product] };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function managedBlock(dispatcher) {
  const command = `node "${String(dispatcher).replace(/"/g, '\\"')}"`;
  return [
    KIMI_BEGIN,
    "[[hooks]]",
    'event = "SessionStart"',
    'matcher = "startup|resume"',
    `command = ${tomlString(command)}`,
    "timeout = 30",
    "",
    "[[hooks]]",
    'event = "Stop"',
    `command = ${tomlString(command)}`,
    "timeout = 120",
    KIMI_END
  ].join("\n");
}

function stripBlock(source) {
  let result = source;
  for (const [begin, endMarker] of [[KIMI_BEGIN, KIMI_END], [LEGACY_KIMI_BEGIN, LEGACY_KIMI_END]]) {
    const start = result.indexOf(begin);
    const end = result.indexOf(endMarker);
    if ((start === -1) !== (end === -1)) throw new Error("Kimi config contains an incomplete Harness managed block.");
    if (start === -1) continue;
    if (result.indexOf(begin, start + begin.length) !== -1) throw new Error("Kimi config contains duplicate Harness managed blocks.");
    result = `${result.slice(0, start)}${result.slice(end + endMarker.length)}`;
  }
  return result.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function validateCandidate(file, options = {}) {
  if (options.validate) return options.validate(file);
  const command = options.kimiCommand ?? "kimi";
  const result = spawnSync(command, ["doctor", "config", file], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    const source = readFileSync(file, "utf8");
    return source.includes(KIMI_BEGIN) === source.includes(KIMI_END);
  }
  return result.status === 0;
}

function backup(file) {
  if (!existsSync(file)) return null;
  const target = `${file}.harness-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(file, target);
  return target;
}

export function installKimiAdapter(options = {}) {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
  const config = path.join(home, "config.toml");
  const dispatcherDir = path.join(home, "lumine-harness-adapter");
  const dispatcher = path.join(dispatcherDir, "dispatch.mjs");
  mkdirSync(home, { recursive: true });
  const source = existsSync(config) ? readFileSync(config, "utf8") : "";
  const clean = stripBlock(source);
  const next = `${clean.trimEnd()}${clean.trim() ? "\n\n" : ""}${managedBlock(dispatcher)}\n`;
  const candidate = path.join(home, `.config.toml.harness-${process.pid}.tmp`);
  writeFileSync(candidate, next, "utf8");
  if (!validateCandidate(candidate, options)) {
    rmSync(candidate, { force: true });
    throw new Error("Kimi config validation failed; existing config was not modified.");
  }
  const backupFile = source ? backup(config) : null;
  mkdirSync(dispatcherDir, { recursive: true });
  writeFileSync(dispatcher, readFileSync(path.join(HERE, "adapters", "kimi", "installed-dispatcher.mjs"), "utf8"), "utf8");
  writeFileSync(config, next, "utf8");
  rmSync(candidate, { force: true });
  return { product: "kimi", status: "installed", configFile: config, dispatcher, backup: backupFile };
}

export function uninstallKimiAdapter(options = {}) {
  const home = options.kimiHome ?? process.env.KIMI_CODE_HOME ?? path.join(os.homedir(), ".kimi-code");
  const config = path.join(home, "config.toml");
  if (!hasManagedKimiBlock(config)) return { product: "kimi", status: "not_installed" };
  const next = `${stripBlock(readFileSync(config, "utf8")).trimEnd()}\n`;
  const candidate = path.join(home, `.config.toml.harness-${process.pid}.tmp`);
  writeFileSync(candidate, next, "utf8");
  if (!validateCandidate(candidate, options)) {
    rmSync(candidate, { force: true });
    throw new Error("Kimi config validation failed; existing config was not modified.");
  }
  const backupFile = backup(config);
  writeFileSync(config, next, "utf8");
  rmSync(candidate, { force: true });
  rmSync(path.join(home, "lumine-harness-adapter"), { recursive: true, force: true });
  return { product: "kimi", status: "uninstalled", configFile: config, backup: backupFile };
}

export function setCliWorkStatus(status, options = {}) {
  if (!WORK_STATUSES.has(status)) throw new Error(`Invalid WORK_STATUS: ${status}`);
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  const product = options.product ?? process.env.HARNESS_PRODUCT;
  const sessionId = options.sessionId ?? process.env.HARNESS_SESSION_ID;
  if (!product || !sessionId) throw new Error("Pass --product and --session-id explicitly; Harness will not guess an active host session.");
  return recordWorkStatus(root, { product, sessionId, cwd: options.cwd ?? process.cwd() }, status);
}

function prepareManualAdapter(product, options = {}) {
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  if (product === "zcode") {
    return {
      product,
      status: "needs_manual_app_step",
      path: path.join(root, ".harness", "adapters", "zcode", "marketplace"),
      message: "Add this directory as a local marketplace in ZCode, install lumine-harness-adapter, enable it, then start a new session."
    };
  }
  if (product === "deepseek-harness") {
    const bundle = path.join(root, ".harness", "adapters", "deepseek-harness", "bundle");
    return {
      product,
      status: "needs_manual_app_step",
      path: bundle,
      message: `After separately authorizing the user-profile change, run: dsh plugin --profile <profile> add ${bundle}`
    };
  }
  throw new Error(`No manual installer contract for ${product}.`);
}

export function runAdapterCommand(argv, options = {}) {
  const [action, target = "selected"] = argv;
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  const targets = target === "all" ? PRODUCTS : target === "selected" ? (root ? selectedAdapters(root) : PRODUCTS) : [target];
  if (action === "list") return { results: listAdapters(options.root) };
  if (action === "doctor") return { results: targets.map((item) => doctorAdapter(item, options)) };
  if (action === "verify" && argv.includes("--begin")) {
    if (!root) throw new Error("Harness root not found.");
    if (targets.length !== 1 || !PRODUCTS.includes(target)) throw new Error("Begin verification for one selected product at a time.");
    const versionIndex = argv.indexOf("--host-version");
    const hostVersion = versionIndex >= 0 ? argv[versionIndex + 1] : null;
    return { results: [beginVerificationRun(root, target, { hostVersion })] };
  }
  if (action === "verify") return { results: targets.map((item) => verifyAdapter(item, options)) };
  if (action === "install" && target === "kimi") return { results: [installKimiAdapter(options)] };
  if (action === "uninstall" && target === "kimi") return { results: [uninstallKimiAdapter(options)] };
  if (action === "install" && ["zcode", "deepseek-harness"].includes(target)) return { results: [prepareManualAdapter(target, options)] };
  if (action === "uninstall" && ["zcode", "deepseek-harness"].includes(target)) {
    return {
      results: [{
        product: target,
        status: "needs_manual_app_step",
        message: target === "zcode"
          ? "Uninstall lumine-harness-adapter from ZCode Settings -> Plugins."
          : "Run dsh plugin --profile <profile> remove @lumine/dsh-harness-adapter for each profile where it was installed."
      }]
    };
  }
  if (action === "install" || action === "uninstall") throw new Error(`${target} is repository-managed and has no user-level installer.`);
  throw new Error("Usage: adapter <list|doctor|verify|install|uninstall> <product|selected|all>; begin runtime verification with adapter verify <product> --begin --host-version <version>");
}

export function runSkillCommand(argv, options = {}) {
  const [action, ...rest] = argv;
  const root = options.root ?? findHarnessRoot(options.cwd ?? process.cwd());
  if (!root) throw new Error("Harness root not found.");
  if (action === "list") return discoverSharedSkills(root);
  if (action === "search") return searchSharedSkills(root, rest.join(" "), { limit: options.limit ?? 3 });
  if (action === "inspect") {
    const skill = getSharedSkill(root, rest[0]);
    if (!skill) throw new Error(`Unknown shared Skill: ${rest[0]}`);
    return skill;
  }
  throw new Error("Usage: skills <list|search|inspect> [query|name]");
}

export function formatAdapterResult(result) {
  return result.results.map((item) => {
    const messages = [...(item.messages ?? []), ...(item.message ? [item.message] : []), ...(item.path ? [`Path: ${item.path}`] : [])];
    return `${item.product}: ${item.status ?? item.stopGate ?? "ok"}${messages.length ? `\n${messages.map((message) => `  - ${message}`).join("\n")}` : ""}`;
  }).join("\n");
}

export function formatSkillResult(result) {
  const omitFile = ({ file, ...skill }) => skill;
  const output = Array.isArray(result) ? result.map(omitFile) : omitFile(result);
  return JSON.stringify(output, null, 2);
}
