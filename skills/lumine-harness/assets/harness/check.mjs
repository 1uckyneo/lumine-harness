import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  ".harness/cli",
  ".harness/root.json",
  ".harness/adapter-capabilities.json",
  ".harness/adapter-manager.mjs",
  ".harness/adapter-cli.mjs",
  ".harness/core/contracts.d.ts",
  ".harness/core/root-resolver.mjs",
  ".harness/core/session-context.mjs",
  ".harness/core/stop-policy.mjs",
  ".harness/core/work-status.mjs",
  ".harness/check.mjs",
  ".harness/generated.mjs",
  "docs/FRONTEND.md",
  "docs/workflow-artifacts.md",
  "docs/drafts/index.md",
  "docs/design-docs/index.md",
  "docs/design-docs/core-beliefs.md",
  "docs/design-docs/design-gate.md",
  "docs/generated/index.md"
];

const REQUIRED_SKILLS = ["lumine-harness-navigate", "lumine-harness-draft", "lumine-harness-generated", "lumine-harness-design", "lumine-harness-plan", "lumine-harness-run", "lumine-harness-check"];
const GENERATED = ["workspace-index", "repo-doc-index", "api-map", "db-schema", "frontend-routes", "frontend-components"].map((name) => `docs/generated/${name}.md`);
const BAD_UI_PATTERNS = [
  { label: "待开发", pattern: /待开发/u },
  { label: "开发中", pattern: /开发中/u },
  { label: "测试文案", pattern: /测试文案/u },
  { label: "这里填写", pattern: /这里填写/u },
  { label: "visible TODO/FIXME/mock/placeholder", pattern: />[^<]*(TODO|FIXME|mock|placeholder)[^<]*</i },
];
const OLD_MARKERS = [
  ["HARNESS", "-SKILL:BEGIN"].join(""),
  ["managed", " block"].join(""),
  ["local", "-first"].join(""),
  ["harness", "-workspace-"].join(""),
  ["harness", "_draft_planner"].join(""),
  ["harness", "_implementation_worker"].join(""),
  ["harness", "_verifier"].join("")
];
const ARCHITECTURE_REQUIRED_SECTIONS = [
  { label: "仓库形态", patterns: [/^##\s+仓库形态(?:\s|$)/m, /^##\s+Repository Shape\b/mi] },
  { label: "目录地图", patterns: [/^##\s+目录地图(?:\s|$)/m, /^##\s+Directory Map\b/mi] },
  { label: "实现路径", patterns: [/^##\s+实现路径(?:\s|$)/m, /^##\s+Implementation Paths\b/mi] },
  { label: "架构不变量", patterns: [/^##\s+架构不变量(?:\s|$)/m, /^##\s+Architecture Invariants\b/mi] }
];
const AGENTS_WORKER_RULES = [
  { label: "parallel worker 自主开启条件", pattern: /(main agent|你)[\s\S]{0,160}(parallel worker|并行 worker|worker)/u },
  { label: "只读探索触发条件", pattern: /不清楚.*(owner|实现入口|generated).*只读/u },
  { label: "可写 worker 边界", pattern: /(task packet|owned_write_set|owned write set)[\s\S]{0,160}(同一文件只能有一个 owner|验收命令|validation)/u }
];
const WORK_STATUS_DOCS = [
  ["done", "已完成"],
  ["continue_autonomously", "可以自动继续"],
  ["needs_user_decision", "需要用户决策"],
  ["needs_credentials", "需要凭据"],
  ["needs_manual_app_step", "需要人工操作"],
  ["blocked_external", "外部阻塞"]
];
const ADAPTER_PRODUCTS = ["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "deepseek-harness"];
const FORBIDDEN_PRODUCT_SOURCES = [
  ".qoder/skills",
  ".trae/skills",
  ".kimi-code/skills",
  ".qoder/rules",
  ".trae/rules",
  ".cursor/rules",
  ".zcode/skills",
  ".zcode/rules",
  ".dsh/skills"
];
const ADAPTER_ENTRIES = {
  codex: ".codex/hooks.json",
  qoder: ".qoder/settings.json",
  trae: ".trae/hooks.json",
  kimi: ".harness/adapters/kimi/hooks/dispatch.mjs",
  cursor: ".cursor/hooks.json",
  opencode: ".opencode/plugins/harness.mjs",
  zcode: ".harness/adapters/zcode/marketplace/marketplace.json",
  "deepseek-harness": ".harness/adapters/deepseek-harness/bundle/package.json"
};

function rel(...parts) {
  return path.join(ROOT, ...parts);
}

function has(relPath) {
  return existsSync(rel(relPath));
}

function read(relPath) {
  return readFileSync(rel(relPath), "utf8");
}

function cleanYamlValue(value = "") {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[]" || trimmed === "''" || trimmed === "\"\"") return "";
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : "";
}

function prototypeEntries(yaml) {
  const lines = yaml.split(/\r?\n/);
  const entries = [];
  let inPrototypes = false;
  let current = null;
  let currentArray = "";

  for (const line of lines) {
    if (/^prototypes:\s*(?:\[\])?\s*$/.test(line)) {
      inPrototypes = true;
      continue;
    }
    if (!inPrototypes) continue;
    if (/^\S/.test(line)) break;

    const item = line.match(/^\s*-\s+id:\s*(.*?)\s*$/);
    if (item) {
      if (current) entries.push(current);
      current = { id: cleanYamlValue(item[1]), screenshots: [] };
      currentArray = "";
      continue;
    }

    if (!current) continue;

    const field = line.match(/^\s+([A-Za-z_]+):\s*(.*?)\s*$/);
    if (field) {
      const key = field[1];
      const value = cleanYamlValue(field[2]);
      if (key === "screenshots") {
        current.screenshots = [];
        currentArray = "screenshots";
      } else {
        current[key] = value;
        currentArray = "";
      }
      continue;
    }

    const arrayItem = line.match(/^\s*-\s+(.*?)\s*$/);
    if (arrayItem && currentArray) current[currentArray].push(cleanYamlValue(arrayItem[1]));
  }

  if (current) entries.push(current);
  return entries;
}

function safeDesignArtifactPath(artifactPath) {
  const normalized = path.posix.normalize(artifactPath.replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || path.isAbsolute(normalized)) return "";
  return normalized;
}

function checkDesignArtifact(base, artifactPath, label) {
  const normalized = safeDesignArtifactPath(artifactPath);
  if (!normalized) {
    fail(`${base} has invalid ${label}`, `Set ${label} to a relative path inside ${base}.`);
    return;
  }
  if (!has(`${base}/${normalized}`)) fail(`${base} missing ${label}: ${normalized}`, `Generate or link ${label} before approving the design.`);
}

function checkDesignData(base, artifactPath, page) {
  const normalized = safeDesignArtifactPath(artifactPath);
  if (!normalized) {
    fail(`${base} has invalid design_data for ${page}`, `Set design_data to a relative path inside ${base}.`);
    return;
  }
  const file = `${base}/${normalized}`;
  if (!has(file)) {
    fail(`${base} missing design data for ${page}: ${normalized}`, `Generate ${normalized} before approving the design.`);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(read(file));
  } catch {
    fail(`${file} is not valid JSON`, "Fix design_data so implementation agents can parse it.");
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${file} root must be an object`, "Make design_data a JSON object with a meta object.");
    return;
  }

  const meta = parsed.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    fail(`${file} missing meta`, "Add meta with authority, reviewStatus, sourceRefs, and deviationPolicy.");
    return;
  }

  for (const key of ["authority", "reviewStatus", "sourceRefs", "deviationPolicy"]) {
    if (!(key in meta)) fail(`${file} missing meta.${key}`, `Add meta.${key} to design_data.`);
  }

  if (/approval/i.test(String(meta.authority || ""))) {
    fail(`${file} authority cannot be approval source`, "Set meta.authority to implementation_context; user approval comes from DESIGN.md, prototype HTML, and screenshots.");
  }
}

function isDesignPrototypePath(relPath) {
  return relPath.startsWith("docs/design-docs/") && /\/prototypes\/.+\.html$/i.test(relPath);
}

function fail(message, remediation) {
  console.error(`FAIL: ${message}`);
  console.error(`Remediation: ${remediation}`);
  process.exitCode = 1;
}

function walk(dir, predicate = () => true, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "target", "tmp", "logs"].includes(entry.name)) continue;
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next, predicate, out);
    else if (predicate(next)) out.push(next);
  }
  return out;
}

function isTasteTarget(relPath) {
  if (relPath.startsWith("docs/generated/")) return false;
  if (relPath.startsWith("docs/templates/")) return false;
  if (relPath.startsWith("docs/design-docs/")) return isDesignPrototypePath(relPath);
  if (relPath.startsWith(".codex/")) return false;
  if (relPath.startsWith(".agents/")) return false;
  if (relPath.includes("/node_modules/") || relPath.includes("/dist/") || relPath.includes("/target/")) return false;

  return (
    relPath.endsWith(".vue") ||
    relPath.endsWith(".tsx") ||
    relPath.endsWith(".jsx") ||
    relPath.endsWith(".html")
  );
}

function gitChangedFiles(cwd, prefix = "") {
  try {
    return execSync("git status --short", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean)
      .map((line) => `${prefix}${line.slice(3)}`.replaceAll(path.sep, "/"));
  } catch {
    return [];
  }
}

function tasteCandidateFiles() {
  const designPrototypes = walk(rel("docs/design-docs"), (file) => file.endsWith(".html"))
    .map((file) => path.relative(ROOT, file).replaceAll(path.sep, "/"))
    .filter(isDesignPrototypePath);
  const changedUi = gitChangedFiles(ROOT).filter(isTasteTarget);

  return [...new Set([...designPrototypes, ...changedUi])]
    .map((file) => rel(file))
    .filter((file) => existsSync(file));
}

function checkDocs() {
  for (const file of REQUIRED_FILES) {
    if (!has(file)) fail(`missing required file ${file}`, "Re-run harness bootstrap assets or restore the file from templates.");
  }
  checkFlatPlanningPaths();
  const agents = has("AGENTS.md") ? read("AGENTS.md") : "";
  if (!/上下文地图|Context Map/i.test(agents)) fail("AGENTS.md is not a context map", "Rewrite AGENTS.md using the harness AGENTS template.");
  if (OLD_MARKERS.slice(0, 3).some((marker) => agents.includes(marker))) fail("AGENTS.md still contains old bootstrap workflow language", "Remove old wrapped-block or local-preference workflow text.");
  checkAgentsOperationalRules(agents);
  checkAdapters();
  for (const skill of REQUIRED_SKILLS) {
    if (!has(`.agents/skills/${skill}/SKILL.md`)) fail(`missing skill ${skill}`, "Copy assets/skills into .agents/skills.");
  }
  for (const file of GENERATED) {
    if (!has(file)) fail(`missing generated file ${file}`, "Run ./.harness/cli generated refresh all.");
    else checkGeneratedFile(file);
  }
}

function checkAgentsOperationalRules(agents) {
  for (const { label, pattern } of AGENTS_WORKER_RULES) {
    if (!pattern.test(agents)) {
      fail(`AGENTS.md missing ${label}`, "Document generic parallel worker rules, task packets, owned write sets, validation, and write-back boundaries.");
    }
  }
  if (!/WORK_STATUS[\s\S]{0,200}\.harness\/core\/stop-policy\.mjs/u.test(agents)) {
    fail("AGENTS.md missing public WORK_STATUS policy ownership", "Explain that .harness/core/stop-policy.mjs owns the public status policy and product Adapters only translate protocol input/output.");
  }
  for (const [status, label] of WORK_STATUS_DOCS) {
    const pattern = new RegExp(`\`${status}\`\\s*（${label}）`, "u");
    if (!pattern.test(agents)) fail(`AGENTS.md missing Chinese explanation for WORK_STATUS ${status}`, "Keep the machine status code but document its Chinese meaning.");
  }
}

function checkAdapters() {
  for (const forbidden of FORBIDDEN_PRODUCT_SOURCES) {
    if (has(forbidden)) fail(`forbidden product-specific Rule or Skill source: ${forbidden}`, "Keep AGENTS.md and .agents/skills as the only public instruction and Skill sources.");
  }

  let manifest;
  try {
    manifest = JSON.parse(read(".harness/adapter-capabilities.json"));
  } catch {
    fail("invalid .harness/adapter-capabilities.json", "Restore a valid capability manifest from the bootstrap package.");
    return;
  }
  if (manifest.skillSource !== ".agents/skills" || manifest.instructionSource !== "AGENTS.md") {
    fail("capability manifest does not declare the public sources", "Set skillSource=.agents/skills and instructionSource=AGENTS.md.");
  }
  for (const product of ADAPTER_PRODUCTS) {
    if (!manifest.products?.[product]) fail(`capability manifest missing ${product}`, "Declare every supported, partial, or unsupported product explicitly.");
  }
  if (manifest.products?.opencode?.stopGate !== "unsupported") {
    fail("OpenCode stopGate must remain unsupported", "Do not treat session.idle as a pre-stop continuation gate.");
  }
  if (manifest.products?.zcode?.install !== "local-marketplace+manual") {
    fail("ZCode must use a local Marketplace Plugin", "Project-level ZCode Hooks are ignored; keep the Hook-only local Marketplace install contract.");
  }
  if (manifest.products?.["deepseek-harness"]?.verifiedBridgeVersion !== "0.1.0-rc.7") {
    fail("DeepSeek Harness bridge version drifted", "Keep host and @deepseek-ai/dsh-hooks-codex on the verified 0.1.0-rc.7 contract until a newer pair is revalidated.");
  }

  const agents = read("AGENTS.md");
  for (const skill of REQUIRED_SKILLS) {
    if (!agents.includes(`.agents/skills/${skill}/SKILL.md`)) {
      fail(`AGENTS.md does not route to ${skill}`, "List the exact public Skill file path for every Harness phase.");
    }
  }

  for (const [product, entry] of Object.entries(ADAPTER_ENTRIES)) {
    if (!has(entry)) continue;
    const source = read(entry);
    if (product === "qoder" && source.includes('"SessionStart"')) {
      fail("Qoder project hook config declares SessionStart", "Use UserPromptSubmit until Qoder exposes project SessionStart.");
    }
    if (product === "opencode" && /session\.idle[\s\S]{0,200}(followup|continue|stopGate:\s*["']supported)/i.test(source)) {
      fail("OpenCode idle event is being used as a Stop Gate", "Keep session.idle audit-only.");
    }
  }
}

function checkFlatPlanningPaths() {
  const forbiddenNestedDocs = [
    ["docs/drafts", "Create draft as docs/drafts/<slug>.md."],
    ["docs/product-specs", "Create product spec as docs/product-specs/<slug>.md."],
    ["docs/exec-plans/active", "Create active plan as docs/exec-plans/active/<slug>.md."],
    ["docs/exec-plans/completed", "Archive completed plan as docs/exec-plans/completed/<slug>.md."],
  ];

  for (const [base, remediation] of forbiddenNestedDocs) {
    const root = rel(base);
    if (!existsSync(root)) continue;
    for (const file of walk(root, (candidate) => candidate.endsWith(".md"))) {
      const relPath = path.relative(ROOT, file).replaceAll(path.sep, "/");
      const rest = relPath.slice(base.length + 1);
      if (rest.includes("/")) fail(`nested planning document path: ${relPath}`, remediation);
    }
  }

  const activeRoot = rel("docs/exec-plans/active");
  if (existsSync(activeRoot)) {
    for (const entry of readdirSync(activeRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        fail(`active plan evidence directory found: docs/exec-plans/active/${entry.name}`, "Move runtime evidence to docs/validation/<slug>/<YYYY-MM-DD>/ and keep active plans as docs/exec-plans/active/<slug>.md.");
      }
    }
  }
}

function checkGeneratedFile(file) {
  const text = read(file);
  for (const key of ["AUTO-GENERATED", "Generated at:", "Source command:", "Source paths:", "Completeness:", "Review status:", "Known gaps:"]) {
    if (!text.includes(key)) fail(`${file} missing metadata ${key}`, "Refresh generated and review metadata.");
  }
  if (/Review status:\s*pending/i.test(text)) fail(`${file} review is pending`, "Review source samples and update review metadata.");
  if (/\.\.\.\s*\d+\s+more/i.test(text)) fail(`${file} contains truncated index`, "Regenerate full index grouped by module instead of truncating.");
}

function checkTaste() {
  const files = tasteCandidateFiles();
  for (const file of files) {
    const relPath = path.relative(ROOT, file).replaceAll(path.sep, "/");
    if (!isTasteTarget(relPath)) continue;
    const text = readFileSync(file, "utf8");
    for (const { label, pattern } of BAD_UI_PATTERNS) {
      if (pattern.test(text)) fail(`possible placeholder/developer text "${label}" in ${relPath}`, "Replace visible placeholder/developer copy or document why it is not user-facing.");
    }
  }
}

function checkArchitecture() {
  if (!has("ARCHITECTURE.md")) fail("missing ARCHITECTURE.md", "Create an architecture map from the template.");
  const text = has("ARCHITECTURE.md") ? read("ARCHITECTURE.md") : "";
  if (/^##\s+上下文入口(?:\s|$)/m.test(text) || /^##\s+Context Entry Points\b/mi.test(text)) {
    fail("ARCHITECTURE.md contains context entry points", "Keep context navigation in AGENTS.md; keep ARCHITECTURE.md focused on repository shape, directory map, implementation paths, runtime topology, domains, and invariants.");
  }
  for (const { label, patterns } of ARCHITECTURE_REQUIRED_SECTIONS) {
    if (!patterns.some((pattern) => pattern.test(text))) fail(`ARCHITECTURE.md missing ${label}`, "Fill the architecture map with discovered project facts. Chinese section titles are preferred; legacy English headings are only accepted for migration compatibility.");
  }
}

function checkDraft(target) {
  if (!target) return;
  const candidates = [`docs/drafts/${target}.md`, `docs/drafts/${target}`];
  if (!candidates.some(has)) fail(`draft not found: ${target}`, "Create docs/drafts/<slug>.md first.");
}

function checkDesign(target) {
  if (!target) return;
  const base = `docs/design-docs/${target}`;
  if (!has(`${base}/DESIGN.md`)) {
    fail(`design missing ${base}/DESIGN.md`, "Generate page design artifacts before implementation.");
    return;
  }

  const text = read(`${base}/DESIGN.md`);
  const yaml = frontmatter(text);
  if (!/design_status:\s*approved/i.test(text)) fail(`${base}/DESIGN.md is not approved`, "Update design after user approval.");
  if (/prototype_mode:\s*image/i.test(text)) fail(`${base}/DESIGN.md is image-only`, "Convert image exploration into html/hybrid handoff before implementation.");

  const entries = prototypeEntries(yaml);
  if (!entries.length) fail(`${base}/DESIGN.md missing prototypes[]`, "Add at least one prototypes[] page item before approving the design.");
  for (const entry of entries) {
    const page = entry.id || "<missing-id>";
    for (const key of ["id", "title", "app_route", "prototype", "component_map", "handoff", "design_data"]) {
      if (!entry[key]) fail(`${base}/DESIGN.md prototype ${page} missing ${key}`, `Fill prototypes[].${key} for every approved page.`);
    }
    if (!entry.screenshots?.length) fail(`${base}/DESIGN.md prototype ${page} missing screenshots`, "Add at least one screenshot path for every approved page.");
    if (entry.prototype) checkDesignArtifact(base, entry.prototype, `prototype for ${page}`);
    if (entry.component_map) checkDesignArtifact(base, entry.component_map, `component map for ${page}`);
    if (entry.handoff) checkDesignArtifact(base, entry.handoff, `handoff for ${page}`);
    if (entry.design_data) checkDesignData(base, entry.design_data, page);
    for (const screenshot of entry.screenshots || []) checkDesignArtifact(base, screenshot, `screenshot for ${page}`);
  }
}

function checkPlan(target) {
  if (!target) return;
  const active = `docs/exec-plans/active/${target}.md`;
  if (!has(active)) fail(`active plan not found: ${active}`, "Create or point to docs/exec-plans/active/<slug>.md.");
  if (has(active)) {
    const text = read(active);
    for (const marker of ["验证与验收", "Run Closeout", "Generated 状态"]) {
      if (!text.includes(marker)) fail(`${active} missing ${marker}`, "Update active plan using the harness exec-plan template.");
    }
  }
}

function checkStaleDocs() {
  const stale = walk(ROOT, (file) => /\.(md|mjs|toml|json)$/.test(file))
    .filter((file) => {
      const relPath = path.relative(ROOT, file).replaceAll(path.sep, "/");
      return !relPath.startsWith(".codex/local/") && !relPath.startsWith("docs/generated/");
    })
    .filter((file) => OLD_MARKERS.some((marker) => readFileSync(file, "utf8").includes(marker)));
  for (const file of stale) {
    fail(`old harness workflow residue in ${path.relative(ROOT, file)}`, "Replace old workflow references with current harness-* names and context-map language.");
  }
}

const [command, target] = process.argv.slice(2);
switch (command) {
  case "docs":
    checkDocs();
    break;
  case "draft":
    checkDraft(target);
    break;
  case "design":
    checkDesign(target);
    break;
  case "plan":
    checkPlan(target);
    break;
  case "architecture":
    checkArchitecture();
    break;
  case "taste":
    checkTaste();
    break;
  case "stale-docs":
    checkStaleDocs();
    break;
  case "adapters":
    checkAdapters();
    break;
  case "all":
    checkDocs();
    checkArchitecture();
    checkStaleDocs();
    break;
  default:
    console.error("Usage: node .harness/check.mjs <docs|draft|design|plan|architecture|taste|stale-docs|adapters|all> [target]");
    process.exit(2);
}

if (!process.exitCode) {
  console.log(`harness check ${command} passed`);
}
