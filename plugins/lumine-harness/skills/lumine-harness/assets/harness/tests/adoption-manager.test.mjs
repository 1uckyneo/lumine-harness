import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyProposal, createProposal, inspectTarget } from "../../../scripts/harness-manager.mjs";

function tempTarget(prefix = "lumine-adopt-test-") {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function saveProposal(root, proposal, name = "proposal.json") {
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
  let proposalFile;
  try {
    const proposal = createProposal(root, { adapters: "none", modules: "workflow" });
    proposalFile = saveProposal(root, proposal);
    const result = applyProposal(proposalFile);
    assert.equal(result.status, "applied");
    assert.deepEqual(result.selectedAdapters, []);
    assert.equal(existsSync(path.join(root, "AGENTS.md")), true);
    assert.equal(existsSync(path.join(root, "ARCHITECTURE.md")), true);
    const project = JSON.parse(readFileSync(path.join(root, ".harness", "project.json"), "utf8"));
    const managed = JSON.parse(readFileSync(path.join(root, ".harness", "managed.json"), "utf8"));
    assert.deepEqual(project.selectedAdapters, []);
    assert.equal(managed.proposalId, proposal.proposalId);
    assert.equal(managed.installedVersion, "0.2.0");
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
  let proposalFile;
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
  let adoptFile;
  let upgradeFile;
  try {
    const adopt = createProposal(root, { adapters: "codex", modules: "workflow" });
    adoptFile = saveProposal(root, adopt, "adopt.json");
    applyProposal(adoptFile);
    const upgrade = createProposal(root, { mode: "upgrade", adapters: "none", modules: "workflow" });
    assert.ok(upgrade.writeSet.some((item) => item.path === ".codex/hooks.json" && item.action === "delete-managed"));
    upgradeFile = saveProposal(root, upgrade, "upgrade.json");
    const result = applyProposal(upgradeFile);
    assert.equal(existsSync(path.join(root, ".codex", "hooks.json")), false);
    assert.ok(result.backupDir);
    assert.equal(existsSync(path.join(result.backupDir, ".codex", "hooks.json")), true);
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
  let driftProposalFile;
  let conflictProposalFile;
  try {
    const driftProposal = createProposal(driftRoot, { adapters: "none", modules: "workflow" });
    driftProposalFile = saveProposal(driftRoot, driftProposal);
    mkdirSync(path.join(driftRoot, ".harness"), { recursive: true });
    writeFileSync(path.join(driftRoot, ".harness", "cli"), "user-owned untracked file\n");
    assert.throws(() => applyProposal(driftProposalFile), /Target changed after Proposal creation/i);

    mkdirSync(path.join(conflictRoot, ".harness"), { recursive: true });
    writeFileSync(path.join(conflictRoot, ".harness", "cli"), "user-owned untracked file\n");
    const conflictProposal = createProposal(conflictRoot, { adapters: "none", modules: "workflow" });
    assert.equal(conflictProposal.writeSet.find((item) => item.path === ".harness/cli")?.action, "conflict");
    conflictProposalFile = saveProposal(conflictRoot, conflictProposal);
    assert.throws(() => applyProposal(conflictProposalFile), /unresolved conflicts/i);
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
  let proposalFile;
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
