import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "harness",
  "docs/FRONTEND.md",
  "docs/workflow-artifacts.md",
  "docs/drafts/index.md",
  "docs/design-docs/index.md",
  "docs/design-docs/core-beliefs.md",
  "docs/design-docs/design-gate.md",
  "docs/generated/index.md",
  ".codex/harness-check.mjs",
  ".codex/harness-generated.mjs"
];

const REQUIRED_SKILLS = ["harness-navigate", "harness-draft", "harness-generated", "harness-design", "harness-plan", "harness-run", "harness-check"];
const REQUIRED_AGENTS = ["harness_repo_mapper", "harness_generated_reviewer", "harness_doc_normalizer", "harness_backend_data_worker", "harness_frontend_ui_worker", "harness_integration_worker", "harness_bugfix_investigator", "harness_runtime_verifier"];
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
  for (const skill of REQUIRED_SKILLS) {
    if (!has(`.agents/skills/${skill}/SKILL.md`)) fail(`missing skill ${skill}`, "Copy assets/skills into .agents/skills.");
  }
  for (const agent of REQUIRED_AGENTS) {
    if (!has(`.codex/agents/${agent}.toml`)) fail(`missing subagent ${agent}`, "Copy assets/codex/agents into .codex/agents.");
  }
  for (const file of GENERATED) {
    if (!has(file)) fail(`missing generated file ${file}`, "Run ./harness generated refresh all.");
    else checkGeneratedFile(file);
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
  for (const marker of ["Repository Shape", "Directory Map", "Implementation Paths", "Architecture Invariants"]) {
    if (!text.includes(marker)) fail(`ARCHITECTURE.md missing ${marker}`, "Fill the architecture template with discovered project facts.");
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
    for (const key of ["id", "title", "app_route", "prototype", "component_map"]) {
      if (!entry[key]) fail(`${base}/DESIGN.md prototype ${page} missing ${key}`, `Fill prototypes[].${key} for every approved page.`);
    }
    if (!entry.screenshots?.length) fail(`${base}/DESIGN.md prototype ${page} missing screenshots`, "Add at least one screenshot path for every approved page.");
    if (entry.prototype) checkDesignArtifact(base, entry.prototype, `prototype for ${page}`);
    if (entry.component_map) checkDesignArtifact(base, entry.component_map, `component map for ${page}`);
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
  case "all":
    checkDocs();
    checkArchitecture();
    checkStaleDocs();
    break;
  default:
    console.error("Usage: node .codex/harness-check.mjs <docs|draft|design|plan|architecture|taste|stale-docs|all> [target]");
    process.exit(2);
}

if (!process.exitCode) {
  console.log(`harness check ${command} passed`);
}
