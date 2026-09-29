#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  renameSync,
  chmodSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectLegacy,
  legacyRetirements,
  pruneRetiredSkillDirectories,
  legacyRetirementConflicts,
  convertLegacyProject,
  convertLegacySessions,
  legacyTransition,
  backupLegacy,
  finishLegacy,
  restoreLegacy,
} from "../migration/legacy.ts";
import { planKnowledgeMigration } from "../migration/knowledge.ts";
import { withWikiLock } from "../harness/wiki/files.ts";
import { convertWorkStatusSession, planWorkStatusMigration } from "../migration/work-status.ts";
const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT =
  path.basename(path.dirname(here)) === "src"
    ? path.resolve(here, "../..")
    : path.resolve(here, "..");
const PRODUCTS = [
  "codex",
  "qoder",
  "trae",
  "kimi",
  "cursor",
  "opencode",
  "zcode",
  "codebuddy",
  "deepseek-harness",
];
// Only these files are installer-owned root entries; their containing directories
// can also hold user settings and must never be retired recursively.
const ROOT_ADAPTER_ENTRIES: Record<string, string> = {
  codex: "codex/hooks.json",
  trae: "trae/hooks.json",
  qoder: "qoder/settings.json",
  cursor: "cursor/hooks.json",
  codebuddy: "codebuddy/settings.json",
  opencode: "opencode/plugins/harness.mjs",
};
export type Locale = "zh-CN" | "en";
type Config = Record<string, any>;
export interface Operation {
  path: string;
  action: "write" | "delete" | "preserve" | "conflict";
  before: string | null;
  after: string | null;
  content?: string;
  mode?: number;
  source?: string;
  sourceHash?: string;
}
export interface Proposal {
  schemaVersion: 2;
  proposalId: string;
  targetRoot: string;
  mode: string;
  locale: Locale;
  createdAt: string;
  project: Config;
  inspect: ReturnType<typeof inspectTarget>;
  operations: Operation[];
  integrity: string;
  warnings: string[];
  legacy?: {
    before: Record<string, string>;
    bridges: Record<string, string>;
    protectedPaths?: string[];
  };
}
export interface ProposalOptions {
  adapters?: string;
  modules?: string;
  locale?: Locale;
  mode?: string;
  overrides?: Record<string, string>;
  sourceSelfUse?: boolean;
  reviewedRetirements?: string[];
  reviewedLegacyFiles?: string[];
}
const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const readJson = (f: string): Config => JSON.parse(readFileSync(f, "utf8"));
const slash = (s: string) => s.split(path.sep).join("/");
function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isSymbolicLink()
        ? []
        : e.isDirectory()
          ? [".git", "node_modules"].includes(e.name)
            ? []
            : files(path.join(dir, e.name))
          : e.isFile()
            ? [path.join(dir, e.name)]
            : [],
    )
    .sort();
}
function fingerprint(f: string): string | null {
  if (!existsSync(f)) return null;
  if (!lstatSync(f).isFile() || lstatSync(f).isSymbolicLink())
    throw new Error("Unsupported file type: " + f);
  return hash(readFileSync(f));
}
function target(root: string, rel: string): string {
  if (
    path.isAbsolute(rel) ||
    rel.includes("\\") ||
    rel.split("/").includes("..")
  )
    throw new Error("Unsafe target path: " + rel);
  const f = path.resolve(root, rel);
  if (!f.startsWith(root + path.sep)) throw new Error("Target outside project");
  let p = f;
  while (p !== root) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink())
      throw new Error("Symlink target rejected: " + rel);
    p = path.dirname(p);
  }
  return f;
}
function atomic(f: string, content: Uint8Array, mode = 0o644) {
  mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + ".lumine-" + randomUUID() + ".tmp";
  writeFileSync(tmp, content, { mode });
  renameSync(tmp, f);
  chmodSync(f, mode);
}
function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
export function inspectTarget(input: string) {
  const root = realpathSync(path.resolve(input));
  const childRepositories = readdirSync(root, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        existsSync(path.join(root, e.name, ".git")),
    )
    .map((e) => e.name)
    .sort();
  const roots = [root, ...childRepositories.map((r) => path.join(root, r))];
  const backend = roots.some((r) =>
    ["go.mod", "server/go.mod", "pom.xml", "pyproject.toml"].some((f) =>
      existsSync(path.join(r, f)),
    ),
  );
  const frontend = roots.some((r) =>
    ["vite.config.ts", "nuxt.config.ts", "web/package.json", "src/views"].some(
      (f) => existsSync(path.join(r, f)),
    ),
  );
  const nodeProject = existsSync(path.join(root, "package.json"));
  return {
    schemaVersion: 2,
    targetRoot: root,
    childRepositories,
    hasGit: git(root, ["rev-parse", "--show-toplevel"]) === root,
    gitStatus: git(root, ["status", "--porcelain=v1", "-uall"]),
    topology: childRepositories.length
      ? "workspace-with-child-repos"
      : backend && frontend
        ? "single-fullstack"
        : backend
          ? "backend-only"
          : frontend
            ? "frontend-only"
            : nodeProject
              ? "library-or-cli"
              : "unknown-traditional",
    signals: {
      backend,
      frontend,
      nodeProject,
      database: backend,
      libraryOrCli: nodeProject && !frontend && !backend,
    },
    aiWorkflowSurfaces: [
      "AGENTS.md",
      ".agents/skills",
      ".lumine",
      ".codex/hooks.json",
      ".trae/hooks.json",
    ].filter((f) => existsSync(path.join(root, f))),
  };
}
function localized(relative: string, locale: Locale): string {
  const local = path.join(SKILL_ROOT, "assets/locales", locale, relative);
  if (locale === "en" && existsSync(local)) return local;
  return path.join(SKILL_ROOT, "assets", relative);
}
function sourceMap(locale: Locale, adapters: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const add = (
    dir: string,
    prefix: string,
    filter: (f: string) => boolean = () => true,
  ) => {
    for (const f of files(dir)) {
      if (filter(f))
        map.set(
          slash(path.join(prefix, path.relative(dir, f))).replace(
            /\.template$/,
            "",
          ),
          f,
        );
    }
  };
  add(path.join(SKILL_ROOT, "assets/harness"), ".lumine", (f) => {
    const rel = slash(
      path.relative(path.join(SKILL_ROOT, "assets/harness"), f),
    );
    return (
      !rel.startsWith("tests/") &&
      !["project.json", "root.json", "managed.json"].includes(rel) &&
      !rel.startsWith("generated") &&
      (!rel.startsWith("adapters/") || adapters.includes(rel.split("/")[1]))
    );
  });
  add(path.join(SKILL_ROOT, "assets/wiki-reader"), ".lumine/wiki-reader");
  add(localized("skills", locale), ".agents/skills");
  add(localized("docs-templates", locale), "docs/templates");
  add(localized("docs-seed", locale), "docs");
  for (const name of ["AGENTS.md", "ARCHITECTURE.md"])
    map.set(name, localized("root/" + name, locale));
  for (const a of adapters) {
    const entry = ROOT_ADAPTER_ENTRIES[a];
    if (entry)
      map.set("." + entry, path.join(SKILL_ROOT, "assets", entry));
  }
  return map;
}
function renderRootTemplate(
  content: string,
  root: string,
  project: Config,
  inspect: ReturnType<typeof inspectTarget>,
  locale: Locale,
): string {
  const zh = locale === "zh-CN",
    map = project.repositories
      .map((r: any) => "- " + r.id + ": `" + r.path + "`")
      .join("\n");
  const unverified = zh
    ? "尚未核实；按当前任务从登记仓库的源码、配置和验证记录确认，不将目录信号当作运行证明。"
    : "Not yet verified. Inspect registered source, configuration and evidence for the current task; directory signals do not establish runtime behavior.";
  const values: Record<string, string> = {
    project_name: path.basename(root),
    topology: inspect.topology,
    repo_rules_entry: "AGENTS.md",
    directory_map: map,
    detailed_directory_map: map,
    fact_index_targets: "- " + project.wiki.root,
    tech_signals: JSON.stringify(inspect.signals),
    implementation_surface: zh
      ? "登记仓库及其相对位置：\n" + map
      : "Registered repositories and their relative locations:\n" + map,
    implementation_surfaces: project.repositories
      .map((r: any) => r.id)
      .join(", "),
    project_specific_rules: zh
      ? "保留既有项目规则及当前请求明确的写入范围。首次采用不会为业务代码或外部操作增加授权。"
      : "Preserve existing project rules and the write scope of the current request. Adoption does not grant permission for business changes or external actions.",
    implementation_paths: unverified,
    domain_map: unverified,
    architecture_invariants: zh
      ? "每个登记仓库保持独立边界；源码、历史证据与部署状态分别判断。"
      : "Keep registered repository boundaries separate; distinguish source, historical evidence and deployed behavior.",
    verification_entry_points:
      "`./.lumine/cli check health` · `./.lumine/cli wiki check`",
    known_gaps: unverified,
  };
  const rendered = content.replace(/{{([a-z_]+)}}/g, (_, key) => {
    if (!(key in values)) throw new Error("Unknown template field: " + key);
    return values[key];
  });
  return rendered;
}
function sign(p: Omit<Proposal, "integrity"> | Proposal): string {
  const { integrity: _, ...v } = p as Proposal;
  return hash(JSON.stringify(v));
}
export function createProposal(
  input: string,
  options: ProposalOptions = {},
): Proposal {
  const inspect = inspectTarget(input),
    root = inspect.targetRoot;
  const legacy = inspectLegacy(root);
  const configFile = path.join(root, ".lumine/project.json");
  const current = existsSync(configFile)
    ? readJson(configFile)
    : legacy.project;
  if (existsSync(configFile) && legacy.exists) {
    const marker = path.join(root, ".lumine/root.json");
    const m = existsSync(marker) ? readJson(marker) : {};
    if (!m.migrationId || typeof m.migrationId !== "string") throw new Error("Conflicting active roots; recover the incomplete migration first.");
    const previousProposal = target(root, `.lumine-migrations/${m.migrationId}/proposal.json`);
    if (!existsSync(previousProposal)) throw new Error("Conflicting active roots: migration identity has no recovery proposal.");
    const previous = readJson(previousProposal) as Proposal;
    if (previous.targetRoot !== root || previous.proposalId !== m.migrationId || sign(previous) !== previous.integrity) throw new Error("Conflicting active roots: migration identity mismatch.");
  }
  const locale = options.locale ?? current.locale ?? "en";
  if (!["zh-CN", "en"].includes(locale))
    throw new Error("locale must be zh-CN or en");
  const adapters =
    options.adapters === undefined
      ? (current.selectedAdapters ?? [])
      : options.adapters === "none"
        ? []
        : [...new Set(options.adapters.split(",").filter(Boolean))];
  if (adapters.some((x: string) => !PRODUCTS.includes(x)))
    throw new Error("Unknown adapter");
  const proposalId = randomUUID();
  const project: Config = convertLegacyProject(
    current,
    inspect.childRepositories,
  );
  Object.assign(project, {
    schemaVersion: 2,
    workflowVersion: 2,
    locale,
    topology: inspect.topology,
    selectedAdapters: adapters,
  });
  if (options.modules)
    project.modules = options.modules
      .split(",")
      .filter((x) => x !== "generated");
  project.wiki ??= {
    root: "docs/repo-wiki",
    watchScopes: project.repositories.map((r: any) => ({
      repoId: r.id,
      path: ".",
    })),
    maxCards: 6,
    maxContextChars: 12000,
  };
  const previousFile = path.join(root, ".lumine/managed.json");
  const previous = existsSync(previousFile)
    ? (readJson(previousFile).files ?? {})
    : legacy.managed;
  const operations: Operation[] = [];
  const retirementWarnings: string[] = [];
  const add = (
    rel: string,
    body: Uint8Array,
    source?: string,
    mode = 0o644,
    force = false,
  ) => {
    const before = fingerprint(target(root, rel));
    const after = hash(body);
    let action: Operation["action"] = "write";
    if (before && before !== after && !force) {
      if (previous[rel]?.hash === before) action = "write";
      else if (
        rel.startsWith("docs/") ||
        rel === ".gitignore" ||
        ["AGENTS.md", "ARCHITECTURE.md"].includes(rel) ||
        rel.startsWith(".agents/skills/")
      )
        action = "preserve";
      else action = "conflict";
    }
    operations.push({
      path: rel,
      action,
      before,
      after,
      content: Buffer.from(body).toString("base64"),
      mode,
      source,
      sourceHash: source ? (fingerprint(source) ?? undefined) : undefined,
    });
  };
  for (const [rel, f] of sourceMap(locale, adapters)) {
    if (options.sourceSelfUse && (rel.startsWith(".agents/skills/") || rel.startsWith(".lumine/"))) continue;
    if (!existsSync(f)) throw new Error("Missing distribution asset: " + rel);
    let body = readFileSync(f);
    if (rel === "AGENTS.md" || rel === "ARCHITECTURE.md") {
      body = Buffer.from(
        renderRootTemplate(body.toString(), root, project, inspect, locale),
      );
    }
    add(rel, body, f, rel.endsWith("/cli") ? 0o755 : 0o644);
  }
  if (options.sourceSelfUse) add(".lumine/cli", Buffer.from('#!/usr/bin/env bash\nset -euo pipefail\nLUMINE_SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"\nexec "$LUMINE_SOURCE_ROOT/skills/lumine-harness/assets/harness/cli" "$@"\n'), undefined, 0o755, true);
  const overrides = options.overrides ?? {};
  if (overrides[".lumine/project.json"]) {
    const custom = JSON.parse(
      Buffer.from(overrides[".lumine/project.json"], "base64").toString(),
    );
    if (custom.locale !== locale || custom.schemaVersion !== 2)
      throw new Error(
        "Config override must match proposal language and version",
      );
    Object.assign(project, custom);
    project.selectedAdapters = adapters;
  }
  for (const [rel, content] of Object.entries(overrides)) {
    if (
      [
        ".lumine/project.json",
        ".lumine/root.json",
        ".lumine/managed.json",
      ].includes(rel)
    )
      continue;
    const i = operations.findIndex((o) => o.path === rel);
    const body = Buffer.from(content, "base64");
    const source = i >= 0 && operations[i].after === hash(body) ? operations[i].source : undefined;
    if (i >= 0) operations.splice(i, 1);
    add(rel, body, source, 0o644, true);
  }
  const ignoreFile = path.join(root, ".gitignore"),
    ignore = existsSync(ignoreFile) ? readFileSync(ignoreFile, "utf8") : "";
  const patterns = [".lumine/local/", ".lumine-migrations/"];
  const updated =
    ignore +
    (ignore && !ignore.endsWith("\n") ? "\n" : "") +
    patterns
      .filter((p) => !ignore.split("\n").includes(p))
      .map((p) => p + "\n")
      .join("");
  add(".gitignore", Buffer.from(updated), undefined, 0o644, true);
  add(
    ".lumine/project.json",
    Buffer.from(json(project)),
    undefined,
    0o644,
    true,
  );
  const oldMarker = existsSync(path.join(root, ".lumine/root.json"))
    ? readJson(path.join(root, ".lumine/root.json"))
    : {};
  const marker = {
    ...oldMarker,
    schemaVersion: 2,
    kind: "lumine-root",
    projectId: oldMarker.projectId ?? randomUUID(),
    distributionVersion: "2.0.0",
    instructions: "AGENTS.md",
    skills: options.sourceSelfUse
      ? "skills/lumine-harness/assets/skills"
      : ".agents/skills",
    ...(options.sourceSelfUse ? { runtime: "skills/lumine-harness/assets/harness" } : {}),
    migrationId: proposalId,
    migrationStatus: "applied",
  };
  add(".lumine/root.json", Buffer.from(json(marker)), undefined, 0o644, true);
  for (const [rel, body] of convertLegacySessions(root)) {
    if (!existsSync(target(root, rel))) add(rel, Buffer.from(json(convertWorkStatusSession(JSON.parse(body)))));
  }
  for (const rel of legacyRetirements(root, options.reviewedRetirements)) {
    if (operations.some((o) => o.path === rel)) continue;
    operations.push({
      path: rel,
      action: "delete",
      before: fingerprint(target(root, rel)),
      after: null,
    });
  }
  for (const [adapter, entry] of Object.entries(ROOT_ADAPTER_ENTRIES)) {
    const rel = "." + entry;
    if (adapters.includes(adapter) || operations.some((o) => o.path === rel))
      continue;
    const meta = previous[rel];
    const wasSelected = Array.isArray(current.selectedAdapters) && current.selectedAdapters.includes(adapter);
    if (!wasSelected && meta?.source !== "lumine-harness") continue;
    const before = fingerprint(target(root, rel));
    if (!before) continue;
    const ownedAndUnchanged = meta?.source === "lumine-harness" && meta.hash === before;
    operations.push({ path: rel, action: ownedAndUnchanged ? "delete" : "conflict", before, after: null });
    if (!ownedAndUnchanged) retirementWarnings.push(locale === "zh-CN"
      ? `取消选择 ${adapter} 时保留 ${rel}：文件已修改或缺少安装器所有权记录。请通过已审阅的提案覆盖指定最终内容，仅移除 Lumine 入口并保留其他设置。`
      : `Deselecting ${adapter} preserves ${rel}: the file was modified or has no installer ownership record. Supply a reviewed proposal override containing the final configuration, removing only the Lumine entry and preserving other settings.`);
  }
  for (const [rel, meta] of Object.entries(previous) as [string, any][]) {
    if (
      operations.some((o) => o.path === rel) ||
      !rel.startsWith(".lumine/") ||
      rel.startsWith(".lumine/wiki-state/") ||
      rel.startsWith(".lumine/tasks/") ||
      rel.startsWith(".lumine/project-checks/") ||
      rel.startsWith(".lumine/local/")
    )
      continue;
    const before = fingerprint(target(root, rel));
    if (before && meta.hash === before)
      operations.push({ path: rel, action: "delete", before, after: null });
  }
  for (const rel of legacyRetirementConflicts(
    root,
    options.reviewedRetirements,
  ))
    operations.push({
      path: rel,
      action: "conflict",
      before: fingerprint(target(root, rel)),
      after: null,
    });
  const transition = legacyTransition(
    root,
    adapters,
    options.reviewedLegacyFiles,
  );
  for (const [rel, body] of Object.entries(transition.bridges))
    add(
      rel,
      Buffer.from(body),
      undefined,
      rel.endsWith("/cli") ? 0o755 : 0o644,
      true,
    );
  // Maintenance conversion is planned with the same backup/CAS/recovery contract as installation.
  // Project knowledge remains an asset, never a distribution-owned file.
  const conversions = [planKnowledgeMigration(root, project.wiki.root), planWorkStatusMigration(root)];
  for (const conversion of conversions) {
    for (const issue of conversion.issues) {
      retirementWarnings.push(`${issue.code}: ${issue.path}: ${issue.message}`);
      if (!operations.some((op) => op.path === issue.path)) operations.push({ path: issue.path, action: "conflict", before: fingerprint(target(root, issue.path)), after: null });
    }
    for (const change of conversion.changes) {
      if (operations.some((op) => op.path === change.path)) throw new Error("Migration ownership conflict: " + change.path);
      operations.push({ path: change.path, action: "write", before: change.beforeHash, after: change.afterHash, content: Buffer.from(change.content).toString("base64"), mode: 0o644 });
    }
  }
  const managed = {
    schemaVersion: 2,
    files: Object.fromEntries(
      operations
        .filter(
          (o) =>
            o.action === "write" &&
            (!!o.source ||
              o.path === ".lumine/project.json" ||
              o.path === ".lumine/root.json") &&
            !o.path.startsWith(".lumine/tasks/") &&
            !o.path.startsWith(".lumine/wiki-state/") &&
            !o.path.startsWith(".lumine/local/"),
        )
        .map((o) => [o.path, { hash: o.after, source: "lumine-harness" }]),
    ),
  };
  add(
    ".lumine/managed.json",
    Buffer.from(json(managed)),
    undefined,
    0o644,
    true,
  );
  const p: Proposal = {
    schemaVersion: 2,
    legacy: transition,
    proposalId,
    targetRoot: root,
    mode: options.mode ?? (legacy.exists ? "migrate" : "adopt"),
    locale,
    createdAt: new Date().toISOString(),
    project,
    inspect,
    operations,
    integrity: "",
    warnings: [
      ...(legacy.exists
        ? [
            locale === "zh-CN" ? "历史文档保留，项目专有约束通过已审阅内容转换。迁移完成前需要刷新宿主并核实新入口的实际调用。" : "Historical documents are preserved; project-specific workflow and Skill constraints require reviewed conversion. Host configuration must be refreshed before finalization.",
          ]
        : []),
      ...retirementWarnings,
    ],
  };
  p.integrity = sign(p);
  return p;
}
function recoveryDir(p: Proposal) {
  return target(p.targetRoot, ".lumine-migrations/" + p.proposalId);
}
function verify(p: Proposal, checkSources = true) {
  if (p.schemaVersion !== 2 || sign(p) !== p.integrity)
    throw new Error("Proposal integrity mismatch");
  if (realpathSync(p.targetRoot) !== p.targetRoot)
    throw new Error("Project identity changed");
  for (const op of p.operations) {
    target(p.targetRoot, op.path);
    if (op.content && hash(Buffer.from(op.content, "base64")) !== op.after)
      throw new Error("Invalid operation content");
    if (checkSources && op.source && fingerprint(op.source) !== op.sourceHash)
      throw new Error("Distribution changed: " + op.path);
  }
}
interface Journal {
  proposalId: string;
  status: string;
  applied: string[];
  backups: Record<string, { content: string; mode: number } | null>;
  hostEvidence?: unknown;
  appliedAt?: string;
  finalized?: Record<string, string>;
}
// The maintenance writer shares the Wiki writer lock. Re-scan even when a format
// marker exists: proposals and partially applied migrations are not snapshots of
// files created later, and an old pending journal must be recovered before upgrade.
function verifyKnowledgeInputs(p: Proposal, requireComplete = false) {
  const plan = planKnowledgeMigration(p.targetRoot, p.project.wiki.root);
  if (plan.issues.length) {
    const issue = plan.issues[0];
    throw new Error(`${issue.code}: ${issue.path}: ${issue.message}`);
  }
  for (const change of plan.changes) {
    const operation = p.operations.find((op) => op.path === change.path);
    if (requireComplete || operation?.action !== "write" || operation.before !== change.beforeHash || operation.after !== change.afterHash)
      throw new Error(`KNOWLEDGE_PROPOSAL_STALE: ${change.path}: recover or roll back the current proposal before reviewing newly required conversion.`);
  }
}

export function applyProposal(
  proposalFile: string,
  options: {
    failAfter?: number;
    failAfterWrite?: number;
    failAfterIgnore?: boolean;
  } = {},
) {
  const p = JSON.parse(readFileSync(proposalFile, "utf8")) as Proposal;
  verify(p);
  return withWikiLock(p.targetRoot, () => applyVerifiedProposal(p, options));
}
function applyVerifiedProposal(p: Proposal, options: { failAfter?: number; failAfterWrite?: number; failAfterIgnore?: boolean }) {
  if (p.operations.some((o) => o.action === "conflict"))
    throw new Error(
      "Proposal contains conflicts; supply reviewed overrides before applying.",
    );
  const dir = recoveryDir(p),
    jf = path.join(dir, "journal.json");
  const journal: Journal = existsSync(jf)
    ? (readJson(jf) as Journal)
    : {
        proposalId: p.proposalId,
        status: "applying",
        applied: [],
        backups: {},
      };
  verifyKnowledgeInputs(p, journal.status === "complete");
  if (journal.status === "complete")
    return { status: "complete", proposalId: p.proposalId, backupDir: dir };
  // Validate all affected files before writing; tolerate only original or precisely applied content.
  for (const op of p.operations) {
    if (op.action === "preserve") continue;
    const current = fingerprint(target(p.targetRoot, op.path));
    if (current !== op.before && current !== op.after)
      throw new Error("Target changed: " + op.path);
  }

  // Persist the original ignore rules before mutation; no project source bytes are saved until recovery is ignored.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const ignored = p.operations.find((o) => o.path === ".gitignore");
  if (ignored?.content && !(".gitignore" in journal.backups)) {
    const original = target(p.targetRoot, ".gitignore");
    journal.backups[".gitignore"] = ignored.before
      ? {
          content: readFileSync(original).toString("base64"),
          mode: lstatSync(original).mode & 0o777,
        }
      : null;
    atomic(jf, Buffer.from(json(journal)), 0o600);
  }
  if (
    ignored?.content &&
    fingerprint(target(p.targetRoot, ".gitignore")) === ignored.before
  ) {
    atomic(
      target(p.targetRoot, ".gitignore"),
      Buffer.from(ignored.content, "base64"),
    );
    if (options.failAfterIgnore)
      throw new Error("Injected interruption after ignore write");
    journal.applied.push(".gitignore");
    atomic(jf, Buffer.from(json(journal)), 0o600);
  }
  atomic(path.join(dir, "proposal.json"), Buffer.from(json(p)), 0o600);
  for (const op of p.operations) {
    if (op.action === "preserve") continue;
    const file = target(p.targetRoot, op.path);
    if (!(op.path in journal.backups)) {
      journal.backups[op.path] = existsSync(file)
        ? {
            content: readFileSync(file).toString("base64"),
            mode: lstatSync(file).mode & 0o777,
          }
        : null;
    }
  }
  atomic(jf, Buffer.from(json(journal)), 0o600);
  if (p.legacy) backupLegacy(p.targetRoot, dir, p.legacy.before);
  let count = 0;
  // The format marker is a commit indicator, not permission to skip residual conversion.
  const writes = [...p.operations].sort((a, b) => Number(a.path === ".lumine/wiki-state/format.json") - Number(b.path === ".lumine/wiki-state/format.json"));
  for (const op of writes) {
    if (op.action === "preserve") continue;
    const file = target(p.targetRoot, op.path);
    if (fingerprint(file) !== op.after) {
      if (op.action === "delete") rmSync(file);
      else atomic(file, Buffer.from(op.content!, "base64"), op.mode);
    }
    if (
      options.failAfterWrite !== undefined &&
      count + 1 === options.failAfterWrite
    )
      throw new Error("Injected interruption after target write");
    if (!journal.applied.includes(op.path)) journal.applied.push(op.path);
    atomic(jf, Buffer.from(json(journal)), 0o600);
    count++;
    if (options.failAfter !== undefined && count === options.failAfter)
      throw new Error("Injected migration interruption");
  }
  verifyKnowledgeInputs(p, true);
  pruneRetiredSkillDirectories(p.targetRoot);
  journal.appliedAt ??= new Date().toISOString();
  journal.status = p.project.selectedAdapters.length
    ? "awaiting_host_verification"
    : "applied";
  atomic(jf, Buffer.from(json(journal)), 0o600);
  return {
    status: journal.status,
    proposalId: p.proposalId,
    backupDir: dir,
    preserved: p.operations
      .filter((o) => o.action === "preserve")
      .map((o) => o.path),
  };
}
export function rollbackProposal(proposalFile: string) {
  const p = JSON.parse(readFileSync(proposalFile, "utf8")) as Proposal;
  verify(p, false);
  return withWikiLock(p.targetRoot, () => rollbackVerifiedProposal(p));
}
function rollbackVerifiedProposal(p: Proposal) {
  // Pending writes can reference either version; recover them with their installed
  // Runtime before replacing it. Newly added ordinary documents remain protected.
  const knowledge = planKnowledgeMigration(p.targetRoot, p.project.wiki.root);
  const recovery = knowledge.issues.find((issue) => issue.code === "KNOWLEDGE_RECOVERY_REQUIRED");
  if (recovery) throw new Error(`${recovery.code}: ${recovery.path}: ${recovery.message}`);
  const dir = recoveryDir(p),
    jf = path.join(dir, "journal.json"),
    j = readJson(jf) as Journal;
  const conflicts: string[] = [];
  for (const op of [...p.operations].reverse()) {
    if (!(op.path in j.backups)) continue;
    const f = target(p.targetRoot, op.path),
      current = fingerprint(f);
    if (current === op.before) continue;
    // Finalization intentionally removed these files; restoreLegacy validates
    // their original backups below. Missing files are not later user edits here.
    if (current === null && p.legacy?.bridges[op.path] &&
        (j.status === "complete" || j.status === "finalizing")) continue;
    if (current !== op.after && current !== j.finalized?.[op.path]) {
      conflicts.push(op.path);
      continue;
    }
    const b = j.backups[op.path];
    if (b) {
      let body = Buffer.from(b.content, "base64");
      if (hash(body) !== op.before) {
        conflicts.push(op.path);
        continue;
      }
      if (
        op.path === ".gitignore" &&
        !body.toString().split("\n").includes(".lumine-migrations/")
      )
        body = Buffer.from(body.toString() + "\n.lumine-migrations/\n");
      atomic(f, body, b.mode);
    } else if (op.path === ".gitignore")
      atomic(f, Buffer.from(".lumine-migrations/\n"));
    else if (existsSync(f)) rmSync(f);
  }
  if (p.legacy)
    conflicts.push(
      ...restoreLegacy(p.targetRoot, dir, p.legacy.before, p.legacy.bridges),
    );
  j.status = conflicts.length ? "rollback_conflicts" : "rolled_back";
  atomic(jf, Buffer.from(json(j)), 0o600);
  return { status: j.status, conflicts };
}
export function finalizeProposal(proposalFile: string, evidenceFile?: string) {
  const p = JSON.parse(readFileSync(proposalFile, "utf8")) as Proposal;
  verify(p, false);
  return withWikiLock(p.targetRoot, () => finalizeVerifiedProposal(p, evidenceFile));
}
function finalizeVerifiedProposal(p: Proposal, evidenceFile?: string) {
  verifyKnowledgeInputs(p, true);
  const dir = recoveryDir(p),
    jf = path.join(dir, "journal.json"),
    j = readJson(jf) as Journal;
  if (!["applied", "awaiting_host_verification", "finalizing", "complete"].includes(j.status))
    throw new Error("Migration application is incomplete; resume the proposal before finalization.");
  if (j.status === "complete")
    return { status: "complete", proposalId: p.proposalId };
  if (p.project.selectedAdapters.length) {
    if (!evidenceFile)
      throw new Error("Real host evidence is required for selected adapters");
    const evidence = readJson(evidenceFile);
    for (const adapter of p.project.selectedAdapters) {
      const e = evidence[adapter];
      if (!e?.sessionId || !e?.observedAt || !e?.artifact)
        throw new Error("Missing host evidence: " + adapter);
      const observedAt = Date.parse(e.observedAt);
      const appliedAt = Date.parse(j.appliedAt ?? "");
      if (!Number.isFinite(observedAt) || !Number.isFinite(appliedAt) ||
          observedAt < appliedAt || observedAt > Date.now() + 60000)
        throw new Error("Host evidence must be observed after this proposal was applied");
      const artifact = target(p.targetRoot, e.artifact);
      if (!existsSync(artifact)) throw new Error("Host evidence file missing");
      const payload = readJson(artifact);
      if (
        payload.product !== adapter ||
        payload.sessionId !== e.sessionId ||
        payload.schemaVersion !== 2 ||
        payload.harnessRoot !== p.targetRoot
      )
        throw new Error("Host evidence does not match project/session");
    }
    j.hostEvidence = evidence;
  }
  for (const op of p.operations) {
    if (
      op.action === "preserve" ||
      (!op.source &&
        ![".lumine/project.json", ".lumine/root.json", ".lumine/managed.json", ".lumine/cli"].includes(op.path) &&
        !p.legacy?.bridges[op.path])
    )
      continue;
    const actual = fingerprint(target(p.targetRoot, op.path));
    if (
      actual !== op.after &&
      actual !== j.finalized?.[op.path] &&
      !(
        j.status === "finalizing" &&
        p.legacy?.bridges[op.path] &&
        actual === null
      )
    )
      throw new Error("Finalization input changed: " + op.path);
  }
  // Sessions and knowledge are live project assets: real host verification may advance them.
  // Verify their new contract, not the old migration bytes; rollback remains compare-and-swap.
  for (const op of p.operations) {
    if (op.action !== "write") continue;
    if (op.path.startsWith(".lumine/local/runtime/sessions/")) {
      const session = readJson(target(p.targetRoot, op.path));
      if (session.statusProtocolVersion !== 2) throw new Error("Session conversion is incomplete: " + op.path);
    }
    if (op.path === ".lumine/wiki-state/format.json") {
      const format = readJson(target(p.targetRoot, op.path));
      if (format.schemaVersion !== 1 || format.knowledgeFormat !== 3) throw new Error("Knowledge conversion is incomplete");
    }
  }
  j.status = "finalizing";
  atomic(jf, Buffer.from(json(j)), 0o600);
  if (p.legacy)
    finishLegacy(
      p.targetRoot,
      dir,
      p.legacy.before,
      p.legacy.bridges,
      p.legacy.protectedPaths,
    );
  const markerFile = target(p.targetRoot, ".lumine/root.json");
  const marker = { ...readJson(markerFile), migrationStatus: "complete" };
  const markerBody = Buffer.from(json(marker));
  const managedFile = target(p.targetRoot, ".lumine/managed.json");
  const managed = readJson(managedFile);
  managed.files[".lumine/root.json"].hash = hash(markerBody);
  const managedBody = Buffer.from(json(managed));
  j.finalized = {
    ".lumine/root.json": hash(markerBody),
    ".lumine/managed.json": hash(managedBody),
  };
  atomic(jf, Buffer.from(json(j)), 0o600);
  atomic(markerFile, markerBody);
  atomic(managedFile, managedBody);
  j.status = "complete";
  atomic(jf, Buffer.from(json(j)), 0o600);
  return { status: "complete", proposalId: p.proposalId };
}
function arg(args: string[], name: string, fallback?: string) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
async function main() {
  const a = process.argv.slice(2),
    command = a.shift();
  if (command === "inspect") {
    const v = inspectTarget(a[0]);
    if (a.includes("--format=env"))
      process.stdout.write(
        Object.entries({
          TARGET_ROOT: v.targetRoot,
          TOPOLOGY: v.topology,
          HAS_GIT: Number(v.hasGit),
          CHILD_REPOS: v.childRepositories.join(",") || "none",
          BACKEND_SIGNAL: Number(v.signals.backend),
          FRONTEND_SIGNAL: Number(v.signals.frontend),
          NODE_PROJECT_SIGNAL: Number(v.signals.nodeProject),
          LIBRARY_OR_CLI_SIGNAL: Number(v.signals.libraryOrCli),
          DB_SIGNAL: Number(v.signals.database),
          AI_WORKFLOW_SURFACES: v.aiWorkflowSurfaces.join(" "),
        })
          .map(([k, v]) => k + "=" + v)
          .join("\n") + "\n",
      );
    else process.stdout.write(json(v));
    return;
  }
  if (command === "proposal" || (command === "upgrade" && a[0] === "--plan")) {
    const p = createProposal(command === "proposal" ? a[0] : a[1], {
      locale: arg(a, "--locale") as Locale | undefined,
      adapters: arg(a, "--adapters"),
      modules: arg(a, "--modules"),
      mode: command === "upgrade" ? "upgrade" : "adopt",
      overrides: arg(a, "--overrides")
        ? readJson(arg(a, "--overrides")!)
        : undefined,
      sourceSelfUse: a.includes("--source-self-use"),
      reviewedRetirements: arg(a, "--reviewed-retirements")
        ? JSON.parse(readFileSync(arg(a, "--reviewed-retirements")!, "utf8"))
        : undefined,
      reviewedLegacyFiles: arg(a, "--reviewed-legacy-files")
        ? JSON.parse(readFileSync(arg(a, "--reviewed-legacy-files")!, "utf8"))
        : undefined,
    });
    const output = arg(a, "--output");
    if (output) {
      mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      atomic(path.resolve(output), Buffer.from(json(p)), 0o600);
    }
    process.stdout.write(
      json({ ...p, operations: p.operations.map(({ content, ...op }) => op) }),
    );
    return;
  }
  const proposal = arg(a, "--proposal");
  if (proposal) {
    if (
      command === "adopt" ||
      (command === "upgrade" && a[0] === "--apply") ||
      command === "resume"
    )
      process.stdout.write(json(applyProposal(proposal)));
    else if (command === "rollback")
      process.stdout.write(json(rollbackProposal(proposal)));
    else if (command === "finalize")
      process.stdout.write(
        json(finalizeProposal(proposal, arg(a, "--host-evidence"))),
      );
    else throw new Error("Unknown command");
    return;
  }
  throw new Error(
    "Usage: inspect <root> | proposal <root> --locale zh-CN|en --output file | upgrade --plan <root> --output file | adopt --proposal file | resume|rollback|finalize --proposal file",
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    const args = process.argv.slice(2);
    let locale = arg(args, "--locale") ?? "en";
    try { const proposalFile = arg(args, "--proposal"); if (proposalFile) locale = readJson(proposalFile).locale ?? locale; } catch {}
    const detail = e instanceof Error ? e.message : String(e);
    const guidance = locale === "zh-CN" ? "维护操作未完成。请保留提案与恢复日志，核对以下原因；不要强制覆盖已变化的文件：" : "Maintenance did not complete. Keep the proposal and recovery journal; review this cause before retrying:";
    process.stderr.write(guidance + "\n" + detail + "\n");
    process.exitCode = 2;
  });
