import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/generated");
const TARGETS = ["workspace-index", "repo-doc-index", "api-map", "db-schema", "frontend-routes", "frontend-components"];
const SKIP = new Set([".git", "node_modules", "dist", "target", ".next", ".nuxt", ".output", "coverage"]);

function rel(abs) {
  return path.relative(ROOT, abs).replaceAll(path.sep, "/");
}

function has(relPath) {
  return existsSync(path.join(ROOT, relPath));
}

function read(abs) {
  return readFileSync(abs, "utf8");
}

function walk(dir, predicate = () => true, limit = 8000) {
  const out = [];
  const visit = (abs) => {
    if (!existsSync(abs) || out.length >= limit) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        if (![".agents", ".codex", ".claude"].includes(entry.name)) continue;
      }
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) visit(next);
      } else if (predicate(next)) {
        out.push(next);
      }
      if (out.length >= limit) return;
    }
  };
  visit(dir);
  return out.sort();
}

function nowShanghai() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+08:00`;
}

function metadata({ title, command, sourcePaths, completeness = "partial", notes = "" }) {
  return [
    `# ${title}`,
    "",
    "> AUTO-GENERATED",
    `> Generated at: ${nowShanghai()}`,
    `> Source command: ${command}`,
    "> Source paths:",
    ...sourcePaths.map((item) => `> - ${item}`),
    `> Completeness: ${completeness}`,
    `> Notes: ${notes || "静态扫描生成；动态运行时信息需要人工或运行态验证补充。"}`,
    "> Review status: pending",
    "> Reviewed at: pending",
    "> Reviewer: pending",
    "> Review scope: pending",
    "> Known gaps: pending model review",
    ""
  ].join("\n");
}

function section(title, lines) {
  return [`## ${title}`, "", ...(lines.length ? lines : ["无扫描结果或不适用。"]), ""].join("\n");
}

function bullets(items) {
  return items.map((item) => `- \`${item}\``);
}

function existing(paths) {
  return paths.filter(has);
}

function writeTarget(target, content) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, `${target}.md`), `${content.trimEnd()}\n`, "utf8");
}

function hasBackendSignals() {
  return has("pom.xml") || has("build.gradle") || has("go.mod") || has("pyproject.toml") || walk(ROOT, (file) => /\.(java|kt|go|py|rb|php|rs)$/.test(file), 50).length > 0;
}

function hasFrontendSignals() {
  return has("package.json") || walk(ROOT, (file) => /\.(vue|tsx|jsx|svelte)$/.test(file), 50).length > 0 || has("src/router") || has("src/pages");
}

function generateWorkspaceIndex(command) {
  const docs = walk(path.join(ROOT, "docs"), (file) => file.endsWith(".md"), 500).map(rel).filter((item) => !item.startsWith("docs/generated/"));
  const skills = walk(path.join(ROOT, ".agents/skills"), (file) => file.endsWith("SKILL.md"), 300).map(rel);
  const hooks = walk(path.join(ROOT, ".codex/hooks"), (file) => file.endsWith(".mjs"), 100).map(rel);
  return `${metadata({
    title: "Workspace Index",
    command,
    sourcePaths: ["AGENTS.md", "ARCHITECTURE.md", "docs/", ".agents/skills/", ".codex/hooks/"],
    notes: "根级 harness 静态索引。"
  })}
${section("Root Entrypoints", bullets(existing(["README.md", "AGENTS.md", "ARCHITECTURE.md", "harness"])))}
${section("Docs", bullets(docs))}
${section("Skills", bullets(skills))}
${section("Hooks And Checks", bullets([".codex/harness-check.mjs", ".codex/harness-generated.mjs", ...hooks].filter(has)))}`;
}

function generateRepoDocIndex(command) {
  const aiDocs = walk(ROOT, (file) => /(AGENTS|CLAUDE|README|SKILL)\.md$/.test(path.basename(file)), 1000).map(rel);
  const projectDocs = walk(path.join(ROOT, "docs"), (file) => file.endsWith(".md"), 600).map(rel).filter((item) => !item.startsWith("docs/generated/"));
  const childRoots = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(ROOT, entry.name, ".git")))
    .map((entry) => entry.name);
  return `${metadata({
    title: "Repo Doc Index",
    command,
    sourcePaths: ["AGENTS.md", "README.md", "CLAUDE.md", ".agents/skills/", ".codex/skills/", ".claude/skills/", "docs/"],
    notes: "项目规则、AI workflow 和子仓入口静态索引。"
  })}
${section("AI And Project Docs", bullets(aiDocs))}
${section("Docs", bullets(projectDocs))}
${section("Child Repo Candidates", bullets(childRoots))}`;
}

function generateApiMap(command) {
  if (!hasBackendSignals() && !hasFrontendSignals()) {
    return metadata({ title: "API Map", command, sourcePaths: ["."], completeness: "not applicable", notes: "未识别后端或前端 API 信号。" }) + "\n## Not Applicable\n\n当前 profile 未识别 API surface。\n";
  }
  const apiLike = walk(ROOT, (file) => /\.(java|kt|go|py|ts|js)$/.test(file) && /(controller|route|api|client|service)/i.test(file), 4000).map(rel);
  return `${metadata({ title: "API Map", command, sourcePaths: ["**/*controller*", "**/*route*", "**/*api*", "**/*client*"], notes: "静态扫描 API-like 文件；运行时路由和权限需源码/测试确认。" })}
${section("API-like Files", bullets(apiLike))}`;
}

function generateDbSchema(command) {
  const sqlFiles = walk(ROOT, (file) => /\.(sql|prisma)$/.test(file) || /migration/i.test(file), 3000).map(rel);
  const completeness = sqlFiles.length ? "partial" : "not applicable";
  return `${metadata({ title: "DB Schema Snapshot", command, sourcePaths: ["**/*.sql", "**/migrations/**", "**/*.prisma"], completeness, notes: sqlFiles.length ? "静态扫描 schema/migration 文件。" : "未识别数据库 schema 或 migration 文件。" })}
${section("Schema And Migration Files", bullets(sqlFiles))}`;
}

function generateFrontendRoutes(command) {
  if (!hasFrontendSignals()) {
    return metadata({ title: "Frontend Routes", command, sourcePaths: ["."], completeness: "not applicable", notes: "未识别前端 surface。" }) + "\n## Not Applicable\n\n当前 profile 未识别 frontend routes。\n";
  }
  const routes = walk(ROOT, (file) => /\.(vue|tsx|jsx|ts|js|svelte)$/.test(file) && /(router|route|pages|views)/i.test(file), 4000).map(rel);
  return `${metadata({ title: "Frontend Routes", command, sourcePaths: ["**/router/**", "**/routes/**", "**/pages/**", "**/views/**"], notes: "静态扫描前端路由和页面入口。" })}
${section("Routes And Views", bullets(routes))}`;
}

function generateFrontendComponents(command) {
  if (!hasFrontendSignals()) {
    return metadata({ title: "Frontend Components", command, sourcePaths: ["."], completeness: "not applicable", notes: "未识别前端 surface。" }) + "\n## Not Applicable\n\n当前 profile 未识别 frontend components。\n";
  }
  const components = walk(ROOT, (file) => /\.(vue|tsx|jsx|svelte)$/.test(file) && /(components|views|pages)/i.test(file), 5000).map(rel);
  return `${metadata({ title: "Frontend Components", command, sourcePaths: ["**/components/**", "**/views/**", "**/pages/**"], notes: "静态扫描前端组件和页面文件。" })}
${section("Components And Pages", bullets(components))}`;
}

function refresh(target, command) {
  const generators = {
    "workspace-index": generateWorkspaceIndex,
    "repo-doc-index": generateRepoDocIndex,
    "api-map": generateApiMap,
    "db-schema": generateDbSchema,
    "frontend-routes": generateFrontendRoutes,
    "frontend-components": generateFrontendComponents
  };
  writeTarget(target, generators[target](command));
}

const [action, target] = process.argv.slice(2);
if (action !== "refresh" || !target) {
  console.error("Usage: node .codex/harness-generated.mjs refresh <target|all>");
  process.exit(2);
}

const selected = target === "all" ? TARGETS : [target];
for (const item of selected) {
  if (!TARGETS.includes(item)) {
    console.error(`Unknown generated target: ${item}`);
    process.exit(2);
  }
  refresh(item, `./harness generated refresh ${target}`);
  console.log(`refreshed ${item}`);
}
