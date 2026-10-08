import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalSkillsRoot, projectRuntimeRoot, readRootManifest, requireHarnessRoot } from "./core/root-resolver.ts";
import { loadProjectConfig, resolveProjectPath } from "./core/project-config.ts";
import { checkDocumentContracts, resolveDocument, type ContractIssue } from "./core/documents.ts";
import { inspectSharedSkillCatalog } from "./core/skill-catalog.ts";
import { checkProjectContracts } from "./core/project-checks.ts";
import { commandLocale, formatCommandError, formatHumanIssue } from "./core/messages.ts";
import { checkTask } from "./core/task-contract.ts";

const REQUIRED_SKILLS = ["lumine-plan", "lumine-run", "lumine-knowledge", "lumine-design"];
const CAPABILITIES = ["project_instructions", "session_context", "skill_discovery", "skill_read", "pre_mutation_gate", "stop_gate", "automatic_continuation", "work_status_matrix", "session_isolation"];
const RESULTS = new Set(["passed", "needs_setup", "not_tested", "not_observable", "not_applicable", "failed"]);
const EVIDENCE_LEVELS = new Set(["official_declared", "repository_checked", "runtime_observed", "behavior_verified"]);
export interface CheckResult { ok: boolean; scope: string; issues: ContractIssue[]; evidenceLevel: "repository_checked"; }
/** Read-only structural checks. A passing check never grants implementation permission or proves host behavior. */
export function runChecks(root: string, command = "health", target?: string): CheckResult {
  const issues: ContractIssue[] = [];
  const rel = (...parts: string[]) => resolveProjectPath(root, parts.join("/"));
  const has = (file: string) => existsSync(rel(file));
  const read = (file: string) => readFileSync(rel(file), "utf8");
  const fail = (message: string, remediation: string, code = "CHECK_FAILED", file?: string) => issues.push({ code, message, remediation, path: file });
  const required = (file: string) => { if (!has(file) || !read(file).trim()) fail(`Required file missing or empty: ${file}`, "Restore the configured project asset.", "MISSING_ASSET", file); };
  const config = loadProjectConfig(root);
  const manifest = readRootManifest(root);
  const runtime = projectRuntimeRoot(root);
  const checkDocs = () => { issues.push(...checkDocumentContracts(root)); };
  const checkArchitecture = () => { required("ARCHITECTURE.md"); };
  const checkHealth = () => {
    required(".lumine/project.json");
    required(manifest.instructions);
    checkArchitecture();
    const raw = JSON.parse(read(".lumine/project.json"));
    if (raw.schemaVersion !== 2 || raw.workflowVersion !== 2) fail("Project configuration must declare version 2", "Complete the reviewed project migration.", "CONFIG_VERSION");
    const inspection = inspectSharedSkillCatalog(root);
    const catalog = inspection.skills;
    for (const issue of inspection.diagnostics) fail(issue.message, "Fix this canonical project Skill metadata.", "INVALID_SKILL", issue.file);
    for (const name of REQUIRED_SKILLS) if (!catalog.some((skill) => skill.name === name)) fail(`Missing shared Skill: ${name}`, `Restore ${path.relative(root, canonicalSkillsRoot(root))}/${name}/SKILL.md.`, "MISSING_SKILL");
    for (const file of ["cli", "check.mjs", "core/task-cli.mjs", "core/session-context.mjs"]) {
      const absolute = path.join(runtime, file);
      if (!existsSync(absolute)) fail(`Missing runtime asset: ${path.relative(root, absolute)}`, "Reinstall or rebuild the runtime from its TypeScript source.", "MISSING_RUNTIME");
    }
    checkDocs();
    issues.push(...checkProjectContracts(root));
  };
  const checkAdapters = () => {
    const file = path.join(runtime, "adapter-capabilities.json");
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (value.schemaVersion !== 4) fail("Invalid adapter capability schema", "Restore schemaVersion 4 capability metadata.", "ADAPTER_SCHEMA");
    for (const [product, raw] of Object.entries(value.products ?? {})) {
      const item = raw as Record<string, any>;
      for (const field of ["implementation", "setup", "setupActions", "limitations", "skills", "continuation", "capabilities", "maturity", "failMode"]) {
        if (!(field in item)) fail(`${product} capability manifest missing ${field}`, "Restore the complete capability contract.", "ADAPTER_CONTRACT");
      }
      for (const name of CAPABILITIES) {
        const evidence = item.capabilities?.[name];
        if (!evidence || !RESULTS.has(evidence.result) || !EVIDENCE_LEVELS.has(evidence.evidenceLevel)) fail(`${product}: invalid ${name} evidence`, "Keep repository checks separate from actual host observations.", "ADAPTER_EVIDENCE");
      }
    }
    for (const product of config.selectedAdapters) if (!value.products?.[product]) fail(`No capability declaration for ${product}`, "Restore the selected Adapter manifest.", "MISSING_ADAPTER");
  };
  const checkPlan = () => {
    if (!target) throw new Error("check plan requires a document ID or path");
    const document = resolveDocument(root, target);
    if (document.type !== "exec-plan") fail(`Expected an exec-plan: ${target}`, "Reference an execution plan by its stable docId or path.", "INVALID_PLAN");
    checkDocs();
  };
  const checkTaste = () => {
    if (!target) throw new Error("check taste requires an explicit file or directory; it does not scan unrelated repositories");
    const start = rel(target);
    const walk = (file: string) => {
      if (readdirSync(path.dirname(file), { withFileTypes: true }).find((item) => item.name === path.basename(file))?.isDirectory()) {
        for (const item of readdirSync(file, { withFileTypes: true })) if (![".git", "node_modules", "dist", ".lumine"].includes(item.name) && !item.isSymbolicLink()) walk(path.join(file, item.name));
      } else if (/\.(vue|html|tsx|jsx)$/.test(file)) {
        const source = readFileSync(file, "utf8");
        if (/>[^<]*(?:TODO|FIXME|placeholder|待开发|测试文案)[^<]*</i.test(source)) fail(`Potential user-visible placeholder: ${path.relative(root, file)}`, "Review the rendered UI and replace temporary copy if visible.", "VISIBLE_PLACEHOLDER", path.relative(root, file));
      }
    };
    walk(start);
  };
  const checkDesign = (target: string): void => {
    const file = target.endsWith(".md") || target.endsWith(".html") ? target : `docs/design-docs/${target}/DESIGN.md`;
    required(file);
    if (!has(file)) return;
    for (const match of read(file).matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
      if (!link || /^(?:https?:|mailto:|#)/i.test(link)) continue;
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(link.split("#")[0])));
      if (!has(relative)) fail(`Design reference is missing: ${link}`, "Restore or update this declared reference; no fixed attachment suite is required.", "DESIGN_REFERENCE", file);
    }
  };
  try {
    switch (command) {
      case "health": checkHealth(); break;
      case "docs": checkDocs(); break;
      case "architecture": checkArchitecture(); issues.push(...checkProjectContracts(root)); break;
      case "project": issues.push(...checkProjectContracts(root)); break;
      case "adapters": checkAdapters(); break;
      case "plan": checkPlan(); break;
      case "design": if (!target) throw new Error("check design requires a design directory name"); else checkDesign(target); break;
      case "taste": checkTaste(); break;
      case "task": if (!target) throw new Error("check task requires taskId"); else issues.push(...checkTask(root, target).issues); break;
      case "all": checkHealth(); checkAdapters(); break;
      default: throw new Error("Usage: check <health|docs|task|architecture|design|plan|taste|adapters|project|all> [target] [--json] [--root path]");
    }
  } catch (error) { fail(error instanceof Error ? error.message : String(error), "Correct the reported input or project contract; diagnostics do not authorize repair.", "CHECK_ERROR"); }
  return { ok: issues.length === 0, scope: command, issues, evidenceLevel: "repository_checked" };
}

export function runCheckCommand(args: string[]): CheckResult {
  const rootIndex = args.indexOf("--root");
  const root = requireHarnessRoot({ root: rootIndex >= 0 ? args[rootIndex + 1] : undefined });
  return runChecks(root, args[0] ?? "health", args[1]?.startsWith("--") ? undefined : args[1]);
}
export function runCheckCli(): void {
  try {
    const result = runCheckCommand(process.argv.slice(2));
    const locale = commandLocale(process.argv.slice(2));
    if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(locale === "zh-CN" ? `Lumine 检查 ${result.scope}：${result.ok ? "通过" : "未通过"}` : `Lumine check ${result.scope}: ${result.ok ? "passed" : "failed"}`);
      for (const issue of result.issues) console.log(formatHumanIssue(issue, locale));
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) { console.error(formatCommandError(error, commandLocale(process.argv.slice(2)))); process.exitCode = 2; }
}
