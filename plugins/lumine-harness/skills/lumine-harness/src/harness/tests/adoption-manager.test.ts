import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyProposal, createProposal, inspectTarget } from "../../scripts/harness-manager.ts";

type ProposalFixture = ReturnType<typeof createProposal>;

interface ProjectManifestFixture {
  selectedAdapters: string[];
  generatedTargets?: string[];
  extensions?: Record<string, unknown>;
  autonomy?: Record<string, number>;
}

interface ManagedManifestFixture {
  proposalId: string;
  installedVersion: string;
  sourceSnapshotHash: string;
}

function tempTarget(prefix = "lumine-adopt-test-"): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function saveProposal(root: string, proposal: ProposalFixture, name = "proposal.json"): string {
  const file = path.join(path.dirname(root), `${path.basename(root)}-${name}`);
  writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  return file;
}

test("inspection classifies single repositories without modifying the target", () => {
  const root = tempTarget();
  try {
    writeFileSync(path.join(root, "package.json"), '{"devDependencies":{"vite":"latest"}}\n');
    const before = readFileSync(path.join(root, "package.json"), "utf8");
    const result = inspectTarget(root);
    assert.equal(result.topology, "frontend-only");
    assert.equal(result.signals.frontend, true);
    assert.equal(readFileSync(path.join(root, "package.json"), "utf8"), before);
    assert.equal(existsSync(path.join(root, ".harness")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inspection distinguishes backend, multi-repository, and library or CLI targets", () => {
  const backendRoot = tempTarget("lumine-backend-test-");
  const multiRoot = tempTarget("lumine-multi-test-");
  const cliRoot = tempTarget("lumine-cli-test-");
  const fullstackRoot = tempTarget("lumine-fullstack-test-");
  try {
    writeFileSync(path.join(backendRoot, "pom.xml"), "<project/>\n");
    assert.equal(inspectTarget(backendRoot).topology, "backend-only");

    const frontend = path.join(multiRoot, "frontend");
    const backend = path.join(multiRoot, "backend");
    mkdirSync(frontend);
    mkdirSync(backend);
    execFileSync("git", ["init"], { cwd: frontend, stdio: "ignore" });
    execFileSync("git", ["init"], { cwd: backend, stdio: "ignore" });
    writeFileSync(path.join(frontend, "package.json"), '{"dependencies":{"vue":"latest"}}\n');
    writeFileSync(path.join(backend, "go.mod"), "module example.invalid/backend\n");
    const multi = inspectTarget(multiRoot);
    assert.equal(multi.topology, "workspace-with-child-repos");
    assert.deepEqual(multi.childRepositories, ["backend", "frontend"]);

    writeFileSync(path.join(cliRoot, "package.json"), '{"name":"example-cli","bin":{"example":"cli.mjs"}}\n');
    const cli = inspectTarget(cliRoot);
    assert.equal(cli.topology, "library-or-cli");
    assert.equal(cli.signals.frontend, false);
    const proposal = createProposal(cliRoot, { adapters: "none", modules: "auto" });
    assert.equal(proposal.modules.includes("design"), false);
    assert.equal(proposal.modules.includes("frontend"), false);
    assert.equal(proposal.modules.includes("browser"), false);
    assert.equal(proposal.writeSet.some((item) => item.path === "docs/FRONTEND.md"), false);

    writeFileSync(path.join(fullstackRoot, "pom.xml"), "<project/>\n");
    writeFileSync(path.join(fullstackRoot, "package.json"), '{"dependencies":{"react":"latest"}}\n');
    assert.equal(inspectTarget(fullstackRoot).topology, "single-fullstack");
  } finally {
    rmSync(backendRoot, { recursive: true, force: true });
    rmSync(multiRoot, { recursive: true, force: true });
    rmSync(cliRoot, { recursive: true, force: true });
    rmSync(fullstackRoot, { recursive: true, force: true });
  }
});

test("inspection is read-only inside a Git worktree", () => {
  const mainRoot = tempTarget("lumine-worktree-main-");
  const worktreeRoot = `${mainRoot}-linked`;
  try {
    execFileSync("git", ["init"], { cwd: mainRoot, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "harness-test@example.invalid"], { cwd: mainRoot });
    execFileSync("git", ["config", "user.name", "Harness Test"], { cwd: mainRoot });
    writeFileSync(path.join(mainRoot, "package.json"), '{"name":"example-cli"}\n');
    execFileSync("git", ["add", "package.json"], { cwd: mainRoot });
    execFileSync("git", ["commit", "-m", "base"], { cwd: mainRoot, stdio: "ignore" });
    execFileSync("git", ["worktree", "add", "-b", "linked-test", worktreeRoot], { cwd: mainRoot, stdio: "ignore" });
    const before = execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: worktreeRoot, encoding: "utf8" });
    const inspection = inspectTarget(worktreeRoot);
    const proposal = createProposal(worktreeRoot, { adapters: "none", modules: "auto" });
    assert.equal(inspection.hasGit, true);
    assert.equal(inspection.topology, "library-or-cli");
    assert.equal(proposal.targetRoot, realpathSync(worktreeRoot));
    assert.equal(execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: worktreeRoot, encoding: "utf8" }), before);
    assert.equal(existsSync(path.join(worktreeRoot, ".harness")), false);
  } finally {
    rmSync(worktreeRoot, { recursive: true, force: true });
    rmSync(mainRoot, { recursive: true, force: true });
  }
});

test("proposal is read-only, defaults to no Adapter, and exposes an exact write set", () => {
  const root = tempTarget();
  try {
    writeFileSync(path.join(root, "README.md"), "# Existing project\n");
    const proposal = createProposal(root, { modules: "workflow" });
    assert.deepEqual(proposal.selectedAdapters, []);
    assert.match(proposal.proposalId, /^[0-9a-f-]{36}$/i);
    assert.ok(proposal.targetFingerprint);
    assert.ok(proposal.writeSet.length > 0);
    assert.equal(proposal.writeSet.some((item) => item.path === ".codex/hooks.json"), false);
    assert.equal(proposal.writeSet.some((item) => item.path.startsWith(".qoder/skills") || item.path.startsWith(".codebuddy/skills")), false);
    assert.equal(proposal.writeSet.some((item) => item.path.startsWith(".harness/adapters/")), false);
    assert.equal(existsSync(path.join(root, ".harness")), false);
    assert.equal(readFileSync(path.join(root, "README.md"), "utf8"), "# Existing project\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adopt requires the reviewed proposal and writes project and managed manifests", () => {
  const root = tempTarget();
  let proposalFile: string | undefined;
  try {
    const proposal = createProposal(root, { adapters: "none", modules: "workflow" });
    proposalFile = saveProposal(root, proposal);
    const result = applyProposal(proposalFile);
    assert.equal(result.status, "applied");
    assert.deepEqual(result.selectedAdapters, []);
    assert.equal(existsSync(path.join(root, "AGENTS.md")), true);
    assert.equal(existsSync(path.join(root, "ARCHITECTURE.md")), true);
    const project = JSON.parse(readFileSync(path.join(root, ".harness", "project.json"), "utf8")) as ProjectManifestFixture;
    const managed = JSON.parse(readFileSync(path.join(root, ".harness", "managed.json"), "utf8")) as ManagedManifestFixture;
    assert.deepEqual(project.selectedAdapters, []);
    assert.deepEqual(project.autonomy, { maxContinuationChain: 20, noProgressThreshold: 2 });
    assert.equal(managed.proposalId, proposal.proposalId);
    assert.equal(managed.installedVersion, "0.3.0");
    assert.match(managed.sourceSnapshotHash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(readFileSync(path.join(root, "AGENTS.md"), "utf8"), /\/Users\/|file:\/\/\/Users\//);
    for (const relative of [".codex", ".qoder", ".trae", ".cursor", ".opencode", ".codebuddy"]) {
      assert.equal(existsSync(path.join(root, relative)), false, relative);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (proposalFile) rmSync(proposalFile, { force: true });
  }
});

test("adopt writes only selected Adapter assets", () => {
  const root = tempTarget();
  let proposalFile: string | undefined;
  try {
    const proposal = createProposal(root, { adapters: "codex", modules: "workflow" });
    proposalFile = saveProposal(root, proposal);
    applyProposal(proposalFile);
    assert.equal(existsSync(path.join(root, ".codex", "hooks.json")), true);
    assert.equal(existsSync(path.join(root, ".harness", "adapters", "codex", "hooks", "session-start.mjs")), true);
    assert.equal(existsSync(path.join(root, ".harness", "adapters", "qoder")), false);
    assert.equal(existsSync(path.join(root, ".qoder")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (proposalFile) rmSync(proposalFile, { force: true });
  }
});

test("upgrade removes only unchanged managed Adapter files and backs them up", () => {
  const root = tempTarget();
  let adoptFile: string | undefined;
  let upgradeFile: string | undefined;
  try {
    const adopt = createProposal(root, { adapters: "codex", modules: "workflow" });
    adoptFile = saveProposal(root, adopt, "adopt.json");
    applyProposal(adoptFile);
    const upgrade = createProposal(root, { mode: "upgrade", adapters: "none", modules: "workflow" });
    assert.ok(upgrade.writeSet.some((item) => item.path === ".codex/hooks.json" && item.action === "delete-managed"));
    upgradeFile = saveProposal(root, upgrade, "upgrade.json");
    const result = applyProposal(upgradeFile);
    assert.equal(existsSync(path.join(root, ".codex", "hooks.json")), false);
    assert.equal(typeof result.backupDir, "string");
    assert.ok(typeof result.backupDir === "string");
    assert.equal(existsSync(path.join(result.backupDir, ".codex", "hooks.json")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (adoptFile) rmSync(adoptFile, { force: true });
    if (upgradeFile) rmSync(upgradeFile, { force: true });
  }
});

test("upgrade preserves modified project assets and project config while updating managed Core", () => {
  const root = tempTarget();
  let adoptFile: string | undefined;
  let upgradeFile: string | undefined;
  try {
    const adopt = createProposal(root, { adapters: "codex", modules: "workflow" });
    adoptFile = saveProposal(root, adopt, "adopt-preserve-config.json");
    applyProposal(adoptFile);
    const projectFile = path.join(root, ".harness", "project.json");
    const project = JSON.parse(readFileSync(projectFile, "utf8")) as ProjectManifestFixture;
    project.generatedTargets = ["workspace-index", "custom-api-map"];
    project.extensions = {
      readOnlyChildRepositories: ["backend"],
      startupSkill: ".agents/skills/start/SKILL.md",
      projectChecks: ".harness/check.mjs",
      generatedImplementation: ".harness/generated.mjs"
    };
    project.autonomy = { maxContinuationChain: 12 };
    writeFileSync(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    const projectSkill = path.join(root, ".agents", "skills", "lumine-harness-run", "SKILL.md");
    const workflowDoc = path.join(root, "docs", "workflow-artifacts.md");
    const projectCheck = path.join(root, ".harness", "check.mjs");
    writeFileSync(projectSkill, `${readFileSync(projectSkill, "utf8")}\nPROJECT-SKILL-CUSTOMIZATION\n`, "utf8");
    writeFileSync(workflowDoc, `${readFileSync(workflowDoc, "utf8")}\nPROJECT-DOC-CUSTOMIZATION\n`, "utf8");
    writeFileSync(projectCheck, `${readFileSync(projectCheck, "utf8")}\n// PROJECT-CHECK-CUSTOMIZATION\n`, "utf8");

    const upgrade = createProposal(root, { mode: "upgrade", adapters: "codex", modules: "workflow" });
    assert.equal(upgrade.writeSet.find((item) => item.path === ".harness/project.json")?.action, "update-config");
    assert.equal(upgrade.writeSet.find((item) => item.path === ".agents/skills/lumine-harness-run/SKILL.md")?.action, "preserve-project");
    assert.equal(upgrade.writeSet.find((item) => item.path === "docs/workflow-artifacts.md")?.action, "preserve-project");
    assert.equal(upgrade.writeSet.find((item) => item.path === ".harness/check.mjs")?.action, "preserve-project");
    assert.equal(upgrade.writeSet.some((item) => item.action === "conflict"), false);
    upgradeFile = saveProposal(root, upgrade, "upgrade-preserve-config.json");
    applyProposal(upgradeFile);
    const upgraded = JSON.parse(readFileSync(projectFile, "utf8")) as ProjectManifestFixture;
    assert.deepEqual(upgraded.generatedTargets, ["workspace-index", "custom-api-map"]);
    assert.deepEqual(upgraded.extensions, project.extensions);
    assert.deepEqual(upgraded.autonomy, { maxContinuationChain: 12, noProgressThreshold: 2 });
    assert.match(readFileSync(projectSkill, "utf8"), /PROJECT-SKILL-CUSTOMIZATION/);
    assert.match(readFileSync(workflowDoc, "utf8"), /PROJECT-DOC-CUSTOMIZATION/);
    assert.match(readFileSync(projectCheck, "utf8"), /PROJECT-CHECK-CUSTOMIZATION/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (adoptFile) rmSync(adoptFile, { force: true });
    if (upgradeFile) rmSync(upgradeFile, { force: true });
  }
});

test("inspection reports staged, modified, and untracked Git state without rewriting it", () => {
  const root = tempTarget();
  try {
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "harness-test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Harness Test"], { cwd: root });
    writeFileSync(path.join(root, "tracked.txt"), "base\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: root });
    execFileSync("git", ["commit", "-m", "base"], { cwd: root, stdio: "ignore" });
    writeFileSync(path.join(root, "tracked.txt"), "modified\n");
    writeFileSync(path.join(root, "staged.txt"), "staged\n");
    execFileSync("git", ["add", "staged.txt"], { cwd: root });
    writeFileSync(path.join(root, "untracked.txt"), "untracked\n");
    const before = execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).trim();
    const result = inspectTarget(root);
    assert.equal(result.gitStatus, before);
    assert.equal(execFileSync("git", ["status", "--porcelain=v1", "-uall"], { cwd: root, encoding: "utf8" }).trim(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply rejects target drift and unresolved overlapping files", () => {
  const driftRoot = tempTarget("lumine-drift-test-");
  const conflictRoot = tempTarget("lumine-conflict-test-");
  let driftProposalFile: string | undefined;
  let conflictProposalFile: string | undefined;
  try {
    const driftProposal = createProposal(driftRoot, { adapters: "none", modules: "workflow" });
    const driftFile = saveProposal(driftRoot, driftProposal);
    driftProposalFile = driftFile;
    mkdirSync(path.join(driftRoot, ".harness"), { recursive: true });
    writeFileSync(path.join(driftRoot, ".harness", "cli"), "user-owned untracked file\n");
    assert.throws(() => applyProposal(driftFile), /Target changed after Proposal creation/i);

    mkdirSync(path.join(conflictRoot, ".harness"), { recursive: true });
    writeFileSync(path.join(conflictRoot, ".harness", "cli"), "user-owned untracked file\n");
    const conflictProposal = createProposal(conflictRoot, { adapters: "none", modules: "workflow" });
    assert.equal(conflictProposal.writeSet.find((item) => item.path === ".harness/cli")?.action, "conflict");
    const conflictFile = saveProposal(conflictRoot, conflictProposal);
    conflictProposalFile = conflictFile;
    assert.throws(() => applyProposal(conflictFile), /unresolved conflicts/i);
    assert.equal(readFileSync(path.join(conflictRoot, ".harness", "cli"), "utf8"), "user-owned untracked file\n");
  } finally {
    rmSync(driftRoot, { recursive: true, force: true });
    rmSync(conflictRoot, { recursive: true, force: true });
    if (driftProposalFile) rmSync(driftProposalFile, { force: true });
    if (conflictProposalFile) rmSync(conflictProposalFile, { force: true });
  }
});

test("existing project maps are preserved instead of being overwritten", () => {
  const root = tempTarget();
  let proposalFile: string | undefined;
  try {
    writeFileSync(path.join(root, "AGENTS.md"), "# Existing project contract\n");
    writeFileSync(path.join(root, "ARCHITECTURE.md"), "# Existing architecture\n");
    const proposal = createProposal(root, { adapters: "none", modules: "workflow" });
    assert.equal(proposal.writeSet.find((item) => item.path === "AGENTS.md")?.action, "preserve-project");
    assert.equal(proposal.writeSet.find((item) => item.path === "ARCHITECTURE.md")?.action, "preserve-project");
    proposalFile = saveProposal(root, proposal);
    applyProposal(proposalFile);
    assert.equal(readFileSync(path.join(root, "AGENTS.md"), "utf8"), "# Existing project contract\n");
    assert.equal(readFileSync(path.join(root, "ARCHITECTURE.md"), "utf8"), "# Existing architecture\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (proposalFile) rmSync(proposalFile, { force: true });
  }
});
