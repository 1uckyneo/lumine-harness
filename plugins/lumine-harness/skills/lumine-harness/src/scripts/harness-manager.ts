#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT_CANDIDATE = path.resolve(SCRIPT_DIR, "..");
const SKILL_ROOT = path.basename(SKILL_ROOT_CANDIDATE) === "src"
  ? path.dirname(SKILL_ROOT_CANDIDATE)
  : SKILL_ROOT_CANDIDATE;
const PRODUCTS = ["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"] as const;
const CORE_MODULES = ["workflow", "generated"] as const;

type Product = (typeof PRODUCTS)[number];
type WriteAction = "create" | "update-managed" | "preserve-project" | "conflict" | "unchanged" | "delete-managed" | "create-project-template" | "generate-config" | "update-config" | "generate-manifest" | "update-manifest";

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

interface TargetInspection {
  schemaVersion: number;
  targetRoot: string;
  topology: string;
  childRepositories: string[];
  signals: {
    backend: boolean;
    frontend: boolean;
    database: boolean;
    nodeProject: boolean;
    libraryOrCli: boolean;
  };
  hasGit: boolean;
  gitStatus: string;
  aiWorkflowSurfaces: string[];
}

interface ManagedFile {
  hash: string;
  source: string;
}

interface ManagedState {
  files: Record<string, ManagedFile>;
}

interface ProjectConfig {
  schemaVersion?: number;
  topology?: string;
  childRepositories?: string[];
  modules?: string[];
  selectedAdapters?: Product[];
  generatedTargets?: string[];
  autonomy?: Record<string, unknown>;
  extensions?: {
    projectChecks?: string;
    generatedImplementation?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface WriteSetItem {
  path: string;
  action: WriteAction;
  sourceHash?: string;
  currentHash?: string | null;
  previousHash?: string | null;
  reason?: string;
  projectModified?: boolean;
}

interface Proposal {
  schemaVersion: number;
  proposalId: string;
  mode: string;
  createdAt: string;
  targetRoot: string;
  inspect: TargetInspection;
  selectedAdapters: Product[];
  modules: string[];
  writeSet: WriteSetItem[];
  targetFingerprint: string;
  backupRequired: boolean;
  integrity: string;
}

interface ProposalOptions {
  adapters?: string;
  modules?: string;
  mode?: string;
}

function hash(value: string | NodeJS.ArrayBufferView): string { return createHash("sha256").update(value).digest("hex"); }
function slash(value: string): string { return value.replaceAll(path.sep, "/"); }
function readJson<T>(file: string): T { return JSON.parse(readFileSync(file, "utf8")) as T; }
function fileHash(file: string): string { return hash(readFileSync(file)); }
function relative(root: string, file: string): string { return slash(path.relative(root, file)); }

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "target"].includes(entry.name)) continue;
    if (path.basename(dir) === ".harness" && ["runtime", "local"].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}

function childGitRepositories(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || [".git", ".harness", "node_modules"].includes(entry.name)) continue;
    const candidate = path.join(root, entry.name);
    if (existsSync(path.join(candidate, ".git"))) result.push(entry.name);
    for (const nested of readdirSync(candidate, { withFileTypes: true })) {
      if (!nested.isDirectory()) continue;
      const nestedRoot = path.join(candidate, nested.name);
      if (existsSync(path.join(nestedRoot, ".git"))) result.push(slash(path.join(entry.name, nested.name)));
    }
  }
  return [...new Set(result)].sort();
}

function git(root: string, args: string[]): string {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

export function inspectTarget(targetRoot: string): TargetInspection {
  const root = realpathSync(path.resolve(targetRoot));
  const childRepositories = childGitRepositories(root);
  const files = walk(root).filter((file) => !file.includes(`${path.sep}.git${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`));
  const names = new Set(files.map((file) => path.basename(file)));
  const backend = ["pom.xml", "build.gradle", "go.mod", "pyproject.toml", "requirements.txt"].some((name) => names.has(name));
  const packageFile = path.join(root, "package.json");
  let packageNames = new Set<string>();
  if (existsSync(packageFile)) {
    try {
      const pkg = readJson<PackageManifest>(packageFile);
      packageNames = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
    } catch {
      packageNames = new Set();
    }
  }
  const frontendPackages = ["@angular/core", "@sveltejs/kit", "next", "nuxt", "react", "svelte", "vite", "vue"];
  const frontend = ["vite.config.ts", "vite.config.js", "next.config.js", "next.config.mjs", "nuxt.config.ts", "svelte.config.js", "angular.json"].some((name) => names.has(name))
    || frontendPackages.some((name) => packageNames.has(name));
  const nodeProject = existsSync(packageFile);
  const database = files.some((file) => file.endsWith(".sql") || file.endsWith(".prisma") || file.includes(`${path.sep}migrations${path.sep}`));
  const libraryOrCli = nodeProject && !backend && !frontend;
  const topology = childRepositories.length ? "workspace-with-child-repos" : backend && frontend ? "single-fullstack" : backend ? "backend-only" : frontend ? "frontend-only" : libraryOrCli ? "library-or-cli" : "unknown-traditional";
  const aiWorkflowSurfaces = ["AGENTS.md", "CLAUDE.md", "CODEBUDDY.md", ".agents/skills", ".harness", ".codex/hooks.json", ".qoder/settings.json", ".trae/hooks.json", ".cursor/hooks.json", ".opencode/plugins", ".codebuddy/settings.json"]
    .filter((item) => existsSync(path.join(root, item)));
  return {
    schemaVersion: 1,
    targetRoot: root,
    topology,
    childRepositories,
    signals: { backend, frontend, database, nodeProject, libraryOrCli },
    hasGit: Boolean(git(root, ["rev-parse", "--show-toplevel"])),
    gitStatus: git(root, ["status", "--porcelain=v1", "-uall"]),
    aiWorkflowSurfaces
  };
}

function selectedModules(inspect: TargetInspection, requested = "auto"): string[] {
  if (requested !== "auto") return [...new Set([...CORE_MODULES, ...requested.split(",").map((item) => item.trim()).filter(Boolean)])].sort();
  const modules: string[] = [...CORE_MODULES];
  if (inspect.signals.frontend) modules.push("design", "frontend", "browser");
  if (inspect.signals.database) modules.push("database");
  return modules.sort();
}

function parseProducts(value = "none"): Product[] {
  if (value === "none" || !value) return [];
  const products = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  const unknown = products.filter((product) => !PRODUCTS.includes(product as Product));
  if (unknown.length) throw new Error(`Unknown Adapter products: ${unknown.join(", ")}`);
  return products.sort() as Product[];
}

function addTree(map: Map<string, string>, sourceRoot: string, targetRoot: string, filter: (file: string) => boolean = () => true): void {
  for (const source of walk(sourceRoot)) {
    if (!filter(source)) continue;
    map.set(slash(path.join(targetRoot, relative(sourceRoot, source))), source);
  }
}

function sourceMap(_inspect: TargetInspection, adapters: Product[], modules: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const adapterRoot = path.join(SKILL_ROOT, "assets", "harness", "adapters");
  addTree(map, path.join(SKILL_ROOT, "assets", "harness"), ".harness", (file) => {
    if (file.includes(`${path.sep}tests${path.sep}`) || file.endsWith(`${path.sep}project.json`) || file.endsWith(`${path.sep}managed.json`)) return false;
    if (!file.startsWith(`${adapterRoot}${path.sep}`)) return true;
    const product = relative(adapterRoot, file).split("/")[0];
    return adapters.includes(product as Product);
  });
  addTree(map, path.join(SKILL_ROOT, "assets", "skills"), ".agents/skills");
  const entries: Partial<Record<Product, readonly [string, string]>> = {
    codex: ["assets/codex/hooks.json", ".codex/hooks.json"],
    qoder: ["assets/qoder/settings.json", ".qoder/settings.json"],
    trae: ["assets/trae/hooks.json", ".trae/hooks.json"],
    cursor: ["assets/cursor/hooks.json", ".cursor/hooks.json"],
    opencode: ["assets/opencode/plugins/harness.mjs", ".opencode/plugins/harness.mjs"],
    codebuddy: ["assets/codebuddy/settings.json", ".codebuddy/settings.json"]
  };
  for (const product of adapters) {
    const item = entries[product];
    if (item) map.set(item[1], path.join(SKILL_ROOT, item[0]));
  }
  const docs: Array<readonly [string, string, string]> = [
    ["assets/docs-seed/workflow-artifacts.md", "docs/workflow-artifacts.md", "workflow"],
    ["assets/docs-seed/generated/index.md", "docs/generated/index.md", "generated"],
    ["assets/docs-seed/drafts-index.md", "docs/drafts/index.md", "workflow"],
    ["assets/docs-seed/design-docs/index.md", "docs/design-docs/index.md", "design"],
    ["assets/docs-seed/design-docs/core-beliefs.md", "docs/design-docs/core-beliefs.md", "design"],
    ["assets/docs-seed/design-docs/design-gate.md", "docs/design-docs/design-gate.md", "design"],
    ["assets/docs-seed/FRONTEND.md", "docs/FRONTEND.md", "frontend"],
    ["assets/docs-seed/references/browser-automation/index.md", "docs/references/browser-automation/index.md", "browser"],
    ["assets/docs-seed/references/vendor-llms/index.md", "docs/references/vendor-llms/index.md", "workflow"]
  ];
  for (const [source, target, module] of docs) if (modules.includes(module)) map.set(target, path.join(SKILL_ROOT, source));
  const designTemplates = new Set(["DESIGN.md", "component-map.md", "handoff.md", "handoff.design.json"]);
  addTree(map, path.join(SKILL_ROOT, "assets", "docs-templates"), "docs/templates", (file) => modules.includes("design") || !designTemplates.has(path.basename(file)));
  return map;
}

function managedState(root: string): ManagedState {
  const file = path.join(root, ".harness", "managed.json");
  return existsSync(file) ? readJson<ManagedState>(file) : { files: {} };
}

function isProjectOwnedPath(target: string, project: ProjectConfig = {}): boolean {
  if (["AGENTS.md", "ARCHITECTURE.md"].includes(target)) return true;
  if (target.startsWith(".agents/skills/") || target.startsWith("docs/")) return true;
  const extensions = project.extensions ?? {};
  const extensionPaths = [extensions.projectChecks, extensions.generatedImplementation]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => slash(path.normalize(value)));
  return extensionPaths.includes(target);
}

function targetFingerprint(root: string, inspect: TargetInspection, paths: string[]): string {
  const state = paths.map((rel) => {
    const file = path.join(root, rel);
    if (!existsSync(file)) return [rel, null];
    const stat = lstatSync(file);
    return [rel, stat.isFile() ? fileHash(file) : `type:${stat.mode}`];
  });
  return hash(JSON.stringify({ topology: inspect.topology, gitStatus: inspect.gitStatus, state }));
}

export function createProposal(targetRoot: string, options: ProposalOptions = {}): Proposal {
  const inspect = inspectTarget(targetRoot);
  const selectedAdapters = parseProducts(options.adapters ?? "none");
  const modules = selectedModules(inspect, options.modules ?? "auto");
  const sources = sourceMap(inspect, selectedAdapters, modules);
  const previous = managedState(inspect.targetRoot);
  const currentProjectFile = path.join(inspect.targetRoot, ".harness", "project.json");
  const currentProject = existsSync(currentProjectFile) ? readJson<ProjectConfig>(currentProjectFile) : {};
  const writeSet: WriteSetItem[] = [];
  for (const [target, source] of sources) {
    const targetFile = path.join(inspect.targetRoot, target);
    const existing = existsSync(targetFile);
    const previousHash = previous.files?.[target]?.hash;
    const currentHash = existing && statSync(targetFile).isFile() ? fileHash(targetFile) : null;
    let action: WriteAction = !existing
      ? "create"
      : previousHash && currentHash === previousHash
        ? "update-managed"
        : isProjectOwnedPath(target, currentProject)
          ? "preserve-project"
          : "conflict";
    if (existing && currentHash === fileHash(source)) action = "unchanged";
    writeSet.push({ path: target, action, sourceHash: fileHash(source), currentHash });
  }
  for (const [target, metadata] of Object.entries(previous.files ?? {})) {
    if (sources.has(target) || [".harness/project.json", ".harness/managed.json", "AGENTS.md", "ARCHITECTURE.md"].includes(target)) continue;
    if (metadata?.source !== "lumine-harness") continue;
    const targetFile = path.join(inspect.targetRoot, target);
    if (!existsSync(targetFile)) continue;
    const currentHash = statSync(targetFile).isFile() ? fileHash(targetFile) : null;
    writeSet.push({
      path: target,
      action: currentHash === metadata.hash ? "delete-managed" : "conflict",
      currentHash,
      previousHash: metadata.hash,
      reason: "no-longer-selected-or-enabled"
    });
  }
  for (const target of ["AGENTS.md", "ARCHITECTURE.md"]) {
    if (sources.has(target)) continue;
    const file = path.join(inspect.targetRoot, target);
    writeSet.push({ path: target, action: existsSync(file) ? "preserve-project" : "create-project-template", currentHash: existsSync(file) ? fileHash(file) : null });
  }
  const projectFile = path.join(inspect.targetRoot, ".harness", "project.json");
  const projectCurrentHash = existsSync(projectFile) ? fileHash(projectFile) : null;
  const projectPreviousHash = previous.files?.[".harness/project.json"]?.hash;
  writeSet.push({
    path: ".harness/project.json",
    action: !projectCurrentHash ? "generate-config" : "update-config",
    currentHash: projectCurrentHash,
    previousHash: projectPreviousHash ?? null,
    projectModified: Boolean(projectPreviousHash && projectPreviousHash !== projectCurrentHash)
  });
  writeSet.push({ path: ".harness/managed.json", action: existsSync(path.join(inspect.targetRoot, ".harness", "managed.json")) ? "update-manifest" : "generate-manifest" });
  const trackedPaths = writeSet.map((item) => item.path).sort();
  const payload: Proposal = {
    schemaVersion: 1,
    proposalId: randomUUID(),
    mode: options.mode ?? "adopt",
    createdAt: new Date().toISOString(),
    targetRoot: inspect.targetRoot,
    inspect,
    selectedAdapters,
    modules,
    writeSet,
    targetFingerprint: targetFingerprint(inspect.targetRoot, inspect, trackedPaths),
    backupRequired: writeSet.some((item) => ["update-managed", "update-config", "update-manifest", "delete-managed"].includes(item.action)) || !inspect.hasGit,
    integrity: ""
  };
  payload.integrity = hash(JSON.stringify({ ...payload, integrity: undefined }));
  return payload;
}

function verifyProposal(proposal: Proposal): void {
  const expected = hash(JSON.stringify({ ...proposal, integrity: undefined }));
  if (proposal.integrity !== expected) throw new Error("Proposal integrity check failed.");
  if (!existsSync(proposal.targetRoot)) throw new Error("Proposal target no longer exists.");
  const tracked = proposal.writeSet.map((item) => item.path).sort();
  const current = targetFingerprint(proposal.targetRoot, inspectTarget(proposal.targetRoot), tracked);
  if (current !== proposal.targetFingerprint) throw new Error("Target changed after Proposal creation. Generate and review a new Proposal.");
  const conflicts = proposal.writeSet.filter((item) => item.action === "conflict");
  if (conflicts.length) throw new Error(`Proposal has unresolved conflicts: ${conflicts.map((item) => item.path).join(", ")}`);
  const sources = sourceMap(proposal.inspect, proposal.selectedAdapters, proposal.modules);
  const changedSources = proposal.writeSet.filter((item) => {
    const source = sources.get(item.path);
    return source && item.sourceHash && fileHash(source) !== item.sourceHash;
  });
  if (changedSources.length) throw new Error(`Lumine Harness source changed after Proposal creation: ${changedSources.map((item) => item.path).join(", ")}. Generate a new Proposal.`);
}

function renderProjectTemplate(name: string, inspect: TargetInspection): string {
  const source = readFileSync(path.join(SKILL_ROOT, "assets", "root", name), "utf8");
  const projectName = path.basename(inspect.targetRoot);
  return source
    .replaceAll("{{project_name}}", projectName)
    .replaceAll("{{target_root}}", ".")
    .replaceAll("{{topology}}", inspect.topology)
    .replaceAll("{{implementation_surface}}", `当前工程形态为 ${inspect.topology}，实现入口以工程地图和模块文档为准。`)
    .replaceAll("{{implementation_surfaces}}", inspect.childRepositories.join(", ") || ".")
    .replaceAll("{{repo_rules_entry}}", "AGENTS.md、ARCHITECTURE.md、README.md 与模块级文档")
    .replaceAll("{{directory_map}}", inspect.childRepositories.map((item) => `- \`${item}\`：关联仓库，具体规则以仓库内入口文档为准。`).join("\n") || "- `.`：当前工程根。")
    .replaceAll("{{fact_index_targets}}", "- `AGENTS.md`\n- `ARCHITECTURE.md`\n- `.agents/skills/`\n- `.harness/`\n- `docs/`")
    .replaceAll("{{tech_signals}}", `backend=${Number(inspect.signals.backend)}, frontend=${Number(inspect.signals.frontend)}, db=${Number(inspect.signals.database)}`)
    .replaceAll(/{{[a-z_]+}}/g, "TODO: inspect and document this project-specific value.");
}

function backupFiles(root: string, pathsToBackup: string[]): string | null {
  if (!pathsToBackup.length) return null;
  const dir = path.join(root, ".harness", "local", "harness-backup", new Date().toISOString().replace(/[:.]/g, "-"));
  for (const rel of pathsToBackup) {
    const source = path.join(root, rel);
    if (!existsSync(source) || !statSync(source).isFile()) continue;
    const target = path.join(dir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  return dir;
}

function pruneEmptyParents(root: string, start: string): void {
  let current = start;
  while (current.startsWith(`${root}${path.sep}`) && current !== root) {
    if ([".harness", ".agents", "docs"].includes(path.basename(current))) return;
    if (!existsSync(current) || readdirSync(current).length) return;
    rmdirSync(current);
    current = path.dirname(current);
  }
}

export function applyProposal(proposalFile: string): Record<string, unknown> {
  const proposal = readJson<Proposal>(path.resolve(proposalFile));
  verifyProposal(proposal);
  const root = proposal.targetRoot;
  const sources = sourceMap(proposal.inspect, proposal.selectedAdapters, proposal.modules);
  const backupDir = backupFiles(root, proposal.writeSet.filter((item) => ["update-managed", "update-config", "update-manifest", "delete-managed"].includes(item.action)).map((item) => item.path));
  const files: Record<string, ManagedFile> = {};
  for (const item of proposal.writeSet) {
    if (["generate-config", "update-config", "generate-manifest", "update-manifest"].includes(item.action)) continue;
    if (item.action === "delete-managed") {
      const target = path.join(root, item.path);
      rmSync(target, { force: true });
      pruneEmptyParents(root, path.dirname(target));
      continue;
    }
    if (["preserve-project", "unchanged"].includes(item.action)) {
      const file = path.join(root, item.path);
      if (existsSync(file) && statSync(file).isFile() && item.action === "unchanged") files[item.path] = { hash: fileHash(file), source: "lumine-harness" };
      continue;
    }
    const source = sources.get(item.path);
    const target = path.join(root, item.path);
    mkdirSync(path.dirname(target), { recursive: true });
    if (item.action === "create-project-template") writeFileSync(target, renderProjectTemplate(path.basename(item.path), proposal.inspect), "utf8");
    else if (source) copyFileSync(source, target);
    else throw new Error(`No source for planned file: ${item.path}`);
    files[item.path] = { hash: fileHash(target), source: "lumine-harness" };
  }
  const projectFile = path.join(root, ".harness", "project.json");
  const existingProject = existsSync(projectFile) ? readJson<ProjectConfig>(projectFile) : {};
  const project = {
    ...existingProject,
    schemaVersion: Math.max(Number(existingProject.schemaVersion ?? 1), 1),
    topology: proposal.inspect.topology,
    childRepositories: proposal.inspect.childRepositories,
    modules: proposal.modules,
    selectedAdapters: proposal.selectedAdapters,
    generatedTargets: Array.isArray(existingProject.generatedTargets)
      ? existingProject.generatedTargets
      : ["workspace-index", "repo-doc-index"],
    autonomy: {
      maxContinuationChain: 20,
      noProgressThreshold: 2,
      ...(existingProject.autonomy ?? {})
    },
    extensions: existingProject.extensions ?? {}
  };
  mkdirSync(path.join(root, ".harness"), { recursive: true });
  writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  files[".harness/project.json"] = { hash: fileHash(projectFile), source: "project-config" };
  const revision = git(SKILL_ROOT, ["rev-parse", "HEAD"]) || null;
  const sourceDirty = Boolean(git(SKILL_ROOT, ["status", "--porcelain=v1", "-uall"]));
  const installedVersion = readJson<{ distributionVersion?: string }>(path.join(SKILL_ROOT, "assets", "harness", "root.json")).distributionVersion ?? "unversioned";
  const sourceSnapshotHash = hash(JSON.stringify(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))));
  const managed = {
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    installedVersion,
    proposalId: proposal.proposalId,
    sourceRevision: revision,
    sourceState: sourceDirty ? "working-tree" : "clean",
    sourceSnapshotHash,
    files
  };
  writeFileSync(path.join(root, ".harness", "managed.json"), `${JSON.stringify(managed, null, 2)}\n`, "utf8");
  return { status: "applied", mode: proposal.mode, proposalId: proposal.proposalId, targetRoot: root, backupDir, selectedAdapters: proposal.selectedAdapters, modules: proposal.modules };
}

function argument<T extends string | null>(args: string[], name: string, fallback: T): string | T {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function printEnv(inspect: TargetInspection): string {
  const values = {
    TARGET_ROOT: inspect.targetRoot,
    TOPOLOGY: inspect.topology,
    HAS_GIT: Number(inspect.hasGit),
    CHILD_REPOS: inspect.childRepositories.join(",") || "none",
    BACKEND_SIGNAL: Number(inspect.signals.backend),
    FRONTEND_SIGNAL: Number(inspect.signals.frontend),
    NODE_PROJECT_SIGNAL: Number(inspect.signals.nodeProject),
    LIBRARY_OR_CLI_SIGNAL: Number(inspect.signals.libraryOrCli),
    DB_SIGNAL: Number(inspect.signals.database),
    AI_WORKFLOW_SURFACES: inspect.aiWorkflowSurfaces.join(" ") || "none"
  };
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (command === "inspect") {
    const result = inspectTarget(args[0]);
    process.stdout.write(`${args.includes("--format=env") ? printEnv(result) : JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "proposal" || (command === "upgrade" && args[0] === "--plan")) {
    const target = command === "proposal" ? args[0] : args[1];
    if (!target) throw new Error("A target path is required.");
    const current = existsSync(path.join(target, ".harness", "project.json")) ? readJson<ProjectConfig>(path.join(target, ".harness", "project.json")) : null;
    const proposal = createProposal(target, {
      mode: command === "proposal" ? "adopt" : "upgrade",
      adapters: argument(args, "--adapters", current?.selectedAdapters?.join(",") ?? "none"),
      modules: argument(args, "--modules", current?.modules?.join(",") ?? "auto")
    });
    const output = argument(args, "--output", null);
    if (output) { mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); writeFileSync(path.resolve(output), `${JSON.stringify(proposal, null, 2)}\n`, "utf8"); }
    process.stdout.write(`${JSON.stringify(proposal, null, 2)}\n`);
    return;
  }
  if (command === "adopt" || (command === "upgrade" && args[0] === "--apply")) {
    const proposalFile = argument(args, "--proposal", null);
    if (!proposalFile) throw new Error("A reviewed --proposal <file> is required.");
    process.stdout.write(`${JSON.stringify(applyProposal(proposalFile), null, 2)}\n`);
    return;
  }
  throw new Error("Usage: harness-manager.mjs inspect <target> | proposal <target> [--adapters none|list] [--modules auto|list] [--output file] | adopt --proposal file | upgrade --plan <target> [--output file] | upgrade --apply --proposal file");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; });
}
