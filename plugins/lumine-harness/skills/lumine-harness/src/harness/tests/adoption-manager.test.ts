import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync } from "node:fs";
import { resolveSkillPackageRoot } from "../core/runtime-layout.ts";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSessionStatePath } from "../core/work-status.ts";
import {
  createProposal,
  applyProposal,
  rollbackProposal,
  finalizeProposal,
} from "../../scripts/harness-manager.ts";
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-adoption-"));
  const save = (p: unknown) => {
    const f = path.join(root, "proposal.json");
    writeFileSync(f, JSON.stringify(p));
    return f;
  };
  return {
    root,
    save,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}
test("locale is pinned before proposal content; clean installation has four new Skills", () => {
  for (const locale of ["zh-CN", "en"] as const) {
    const f = fixture();
    try {
      const p = createProposal(f.root, { locale });
      const file = f.save(p);
      applyProposal(file);
      const cfg = JSON.parse(
        readFileSync(path.join(f.root, ".lumine/project.json"), "utf8"),
      );
      assert.equal(cfg.locale, locale);
      for (const rootDoc of ["AGENTS.md", "ARCHITECTURE.md"])
        assert.doesNotMatch(
          readFileSync(path.join(f.root, rootDoc), "utf8"),
          /\{\{[a-z_]+\}\}/,
        );
      for (const name of ["plan", "run", "knowledge", "design"])
        assert.ok(
          existsSync(
            path.join(f.root, ".agents/skills/lumine-" + name + "/SKILL.md"),
          ),
        );
      assert.equal(existsSync(path.join(f.root, ".harness")), false);
      assert.equal(
        existsSync(path.join(f.root, ".agents/skills/lumine-harness-plan")),
        false,
      );
    } finally {
      f.clean();
    }
  }
});
test("proposal integrity rejects locale tampering", () => {
  const f = fixture();
  try {
    const p = createProposal(f.root, { locale: "en" });
    p.locale = "zh-CN";
    assert.throws(() => applyProposal(f.save(p)), /integrity/);
  } finally {
    f.clean();
  }
});
test("reader upgrade preserves older managed chunks and writes the entry after its assets", () => {
  const f = fixture();
  try {
    applyProposal(f.save(createProposal(f.root, { locale: "en" })));
    const oldChunk = ".lumine/wiki-reader/chunks/reader-older-only.js";
    const oldContent = "export const olderReaderChunk = true;\n";
    const oldNotice = oldChunk + ".LEGAL.txt";
    const oldNoticeContent = "Older chunk legal notice.\n";
    mkdirSync(path.dirname(path.join(f.root, oldChunk)), { recursive: true });
    writeFileSync(path.join(f.root, oldChunk), oldContent);
    writeFileSync(path.join(f.root, oldNotice), oldNoticeContent);
    const managedPath = path.join(f.root, ".lumine/managed.json");
    const managed = JSON.parse(readFileSync(managedPath, "utf8"));
    const oldHash = createHash("sha256").update(oldContent).digest("hex");
    managed.files[oldChunk] = { hash: oldHash, source: "lumine-harness" };
    const noticeHash = createHash("sha256").update(oldNoticeContent).digest("hex");
    managed.files[oldNotice] = { hash: noticeHash, source: "lumine-harness" };
    const licensePath = path.join(f.root, ".lumine/wiki-reader/THIRD-PARTY-LICENSES.txt");
    const olderNotice = "older-reader-package@1.0.0 (MIT)\nOlder reader license.";
    const olderLicenses = readFileSync(licensePath, "utf8") + "\n\n--------------------\n\n" + olderNotice;
    writeFileSync(licensePath, olderLicenses);
    managed.files[".lumine/wiki-reader/THIRD-PARTY-LICENSES.txt"].hash = createHash("sha256").update(olderLicenses).digest("hex");
    writeFileSync(managedPath, JSON.stringify(managed));

    const proposal = createProposal(f.root, { locale: "en", mode: "upgrade" });
    assert.equal(proposal.operations.some((op) => op.path === oldChunk), false);
    assert.equal(proposal.operations.some((op) => op.path === oldNotice), false);
    const paths = proposal.operations.map((op) => op.path);
    const entry = paths.indexOf(".lumine/wiki-reader/reader.js");
    assert.ok(entry > paths.indexOf(".lumine/wiki-reader/styles.css"));
    assert.ok(entry > Math.max(...paths.map((rel, index) => rel.startsWith(".lumine/wiki-reader/chunks/") ? index : -1)));
    const upgradeFile = f.save(proposal);
    writeFileSync(path.join(f.root, oldChunk), "changed after planning");
    assert.throws(() => applyProposal(upgradeFile), /Retained reader asset changed/);
    writeFileSync(path.join(f.root, oldChunk), oldContent);
    applyProposal(upgradeFile);
    assert.equal(readFileSync(path.join(f.root, oldChunk), "utf8"), oldContent);
    assert.equal(readFileSync(path.join(f.root, oldNotice), "utf8"), oldNoticeContent);
    assert.match(readFileSync(licensePath, "utf8"), /older-reader-package@1\.0\.0/);
    const upgraded = JSON.parse(readFileSync(managedPath, "utf8"));
    assert.deepEqual(upgraded.files[oldChunk], { hash: oldHash, source: "lumine-harness" });
    assert.deepEqual(upgraded.files[oldNotice], { hash: noticeHash, source: "lumine-harness" });
    writeFileSync(path.join(f.root, oldNotice), "changed after upgrade");
    assert.throws(() => rollbackProposal(upgradeFile), /Retained reader asset changed/);
    writeFileSync(path.join(f.root, oldNotice), oldNoticeContent);
    assert.deepEqual(rollbackProposal(upgradeFile).conflicts, []);
  } finally { f.clean(); }
});
test("interrupted migration resumes and rollback preserves edits after application", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, "AGENTS.md"), "custom rules\n");
    const p = createProposal(f.root, { locale: "en" });
    const file = f.save(p);
    assert.throws(() => applyProposal(file, { failAfter: 3 }), /interruption/);
    applyProposal(file);
    assert.equal(
      readFileSync(path.join(f.root, "AGENTS.md"), "utf8"),
      "custom rules\n",
    );
    const chosen = p.operations.find(
      (o) => o.action === "write" && o.path.endsWith("SKILL.md"),
    )!;
    writeFileSync(path.join(f.root, chosen.path), "user edit");
    const result = rollbackProposal(file);
    assert.ok(result.conflicts.includes(chosen.path));
    assert.equal(
      readFileSync(path.join(f.root, chosen.path), "utf8"),
      "user edit",
    );
  } finally {
    f.clean();
  }
});
test("pre-application drift fails before any runtime mutation", () => {
  const f = fixture();
  try {
    const p = createProposal(f.root);
    const file = f.save(p);
    mkdirSync(path.join(f.root, ".lumine"), { recursive: true });
    writeFileSync(path.join(f.root, ".lumine/project.json"), "{}");
    assert.throws(() => applyProposal(file), /Target changed/);
    assert.equal(
      existsSync(path.join(f.root, ".agents/skills/lumine-plan")),
      false,
    );
  } finally {
    f.clean();
  }
});
test("old sessions preserve progress but reset retired Skill gate; legacy code stays in migration", () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, ".harness/runtime/sessions"), {
      recursive: true,
    });
    writeFileSync(
      path.join(f.root, ".harness/project.json"),
      JSON.stringify({
        schemaVersion: 1,
        selectedAdapters: [],
        autonomy: { maxContinuationChain: 7 },
        extensions: { custom: "kept" },
      }),
    );
    writeFileSync(
      path.join(f.root, ".harness/runtime/sessions/test.json"),
      JSON.stringify({
        product: "codex",
        sessionId: "test",
        taskId: "task",
        expectedSkill: "lumine-harness-check",
        expectedSkillRead: true,
      }),
    );
    const p = createProposal(f.root, { locale: "zh-CN" });
    applyProposal(f.save(p));
    const s = JSON.parse(
      readFileSync(getSessionStatePath(f.root, "codex", "test"), "utf8"),
    );
    assert.equal(s.taskId, "task");
    assert.deepEqual(s.expectedSkills, []);
    assert.equal(s.expectedSkill, undefined);
    assert.equal(p.project.autonomy.maxContinuationChain, 7);
  } finally {
    f.clean();
  }
});
test("wiki state and user docs survive runtime upgrade", () => {
  const f = fixture();
  try {
    applyProposal(f.save(createProposal(f.root, { locale: "en" })));
    mkdirSync(path.join(f.root, ".lumine/wiki-state"), { recursive: true });
    writeFileSync(path.join(f.root, ".lumine/wiki-state/human.json"), "human");
    const p = createProposal(f.root, { locale: "en" });
    assert.equal(
      p.operations.some((o) => o.path.includes("wiki-state")),
      false,
    );
    applyProposal(f.save(p));
    assert.equal(
      readFileSync(path.join(f.root, ".lumine/wiki-state/human.json"), "utf8"),
      "human",
    );
  } finally {
    f.clean();
  }
});

test("write-before-journal crash can roll back without resume", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, ".gitignore"), "original\n");
    const p = createProposal(f.root, { locale: "en" });
    const file = f.save(p);
    assert.throws(
      () => applyProposal(file, { failAfterWrite: 2 }),
      /target write/,
    );
    const result = rollbackProposal(file);
    assert.deepEqual(result.conflicts, []);
    assert.equal(existsSync(path.join(f.root, ".lumine/managed.json")), false);
    for (const op of p.operations.filter(
      (o) => o.before === null && o.path !== ".gitignore",
    ))
      assert.equal(existsSync(path.join(f.root, op.path)), false, op.path);
  } finally {
    f.clean();
  }
});
test("first ignore write has a persistent original backup", () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, ".gitignore"), "original\n");
    const file = f.save(createProposal(f.root));
    assert.throws(
      () => applyProposal(file, { failAfterIgnore: true }),
      /ignore write/,
    );
    applyProposal(file);
    rollbackProposal(file);
    assert.equal(
      readFileSync(path.join(f.root, ".gitignore"), "utf8"),
      "original\n\n.lumine-migrations/\n",
    );
  } finally {
    f.clean();
  }
});
test("finalization is idempotent and rollback includes managed metadata", () => {
  const f = fixture();
  try {
    const file = f.save(createProposal(f.root, { locale: "en" }));
    applyProposal(file);
    assert.equal(finalizeProposal(file).status, "complete");
    assert.equal(finalizeProposal(file).status, "complete");
    assert.deepEqual(rollbackProposal(file).conflicts, []);
    assert.equal(existsSync(path.join(f.root, ".lumine/managed.json")), false);
    assert.equal(existsSync(path.join(f.root, ".lumine/root.json")), false);
  } finally {
    f.clean();
  }
});

test('installed Hook command resolves a non-Git parent from a child checkout',()=>{const f=fixture();try{const p=createProposal(f.root,{locale:'en',adapters:'codex'});applyProposal(f.save(p));const child=path.join(f.root,'app');mkdirSync(path.join(child,'.git'),{recursive:true});const config=JSON.parse(readFileSync(path.join(f.root,'.codex/hooks.json'),'utf8'));const command=config.hooks.SessionStart[0].hooks[0].command;const result=spawnSync(command,{cwd:child,shell:true,input:JSON.stringify({cwd:child,session_id:'nested-install-test'}),encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('Lumine')||result.stdout.includes('Harness'));}finally{f.clean();}});

test('source self-use points to canonical built Runtime and Skills without another implementation copy',()=>{const f=fixture();try{const pkg=resolveSkillPackageRoot(import.meta.url)!;for(const folder of ['harness','skills'])cpSync(path.join(pkg,'assets',folder),path.join(f.root,'skills/lumine-harness/assets',folder),{recursive:true});const p=createProposal(f.root,{locale:'zh-CN',sourceSelfUse:true});applyProposal(f.save(p));const marker=JSON.parse(readFileSync(path.join(f.root,'.lumine/root.json'),'utf8'));assert.equal(marker.runtime,'skills/lumine-harness/assets/harness');assert.equal(marker.skills,'skills/lumine-harness/assets/skills');assert.equal(existsSync(path.join(f.root,'.lumine/core')),false);const result=spawnSync(path.join(f.root,'.lumine/cli'),['check','health'],{cwd:f.root,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);}finally{f.clean();}});

test("rollback restores finalized migration bridges without a false conflict", () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, ".harness"));
    const original = "#!/bin/sh\necho previous-runtime\n";
    writeFileSync(path.join(f.root, ".harness/cli"), original);
    writeFileSync(path.join(f.root, ".harness/project.json"), JSON.stringify({schemaVersion: 1, selectedAdapters: []}));
    const proposal = createProposal(f.root, {locale: "en", reviewedLegacyFiles: [".harness/cli"]});
    const file = f.save(proposal);
    applyProposal(file);
    assert.equal(finalizeProposal(file).status, "complete");
    assert.equal(existsSync(path.join(f.root, ".harness/cli")), false);
    assert.equal(rollbackProposal(file).status, "rolled_back");
    assert.equal(readFileSync(path.join(f.root, ".harness/cli"), "utf8"), original);
  } finally { f.clean(); }
});

test("migration finalization rejects stale host receipts from before the current application", () => {
  const f = fixture();
  try {
    const proposal = createProposal(f.root, {locale: "en", adapters: "codex"});
    const file = f.save(proposal);
    applyProposal(file);
    writeFileSync(path.join(f.root, "host.json"), JSON.stringify({schemaVersion: 2, product: "codex", sessionId: "fixture", harnessRoot: f.root}));
    const receipt = path.join(f.root, "receipt.json");
    writeFileSync(receipt, JSON.stringify({codex: {sessionId: "fixture", observedAt: "2000-01-01T00:00:00Z", artifact: "host.json"}}));
    assert.throws(() => finalizeProposal(file, receipt), /after this proposal/);
  } finally { f.clean(); }
});


const ROOT_ADAPTER_FIXTURES = {
  codex: ".codex/hooks.json",
  trae: ".trae/hooks.json",
  qoder: ".qoder/settings.json",
  cursor: ".cursor/hooks.json",
  codebuddy: ".codebuddy/settings.json",
  opencode: ".opencode/plugins/harness.mjs",
};

test("deselecting managed adapters removes only unchanged installer-owned entry files and is reversible", () => {
  const f = fixture();
  try {
    applyProposal(f.save(createProposal(f.root, { locale: "en", adapters: Object.keys(ROOT_ADAPTER_FIXTURES).join(",") })));
    assert.ok(existsSync(path.join(f.root, ".lumine/adapters/trae/hooks/session-start.mjs")));
    assert.ok(existsSync(path.join(f.root, ".lumine/adapters/opencode/plugin-main.mjs")));
    assert.equal(existsSync(path.join(f.root, ".opencode/plugins/harness.main.mjs")), false);
    const originals = Object.fromEntries(Object.values(ROOT_ADAPTER_FIXTURES).map((file) => [file, readFileSync(path.join(f.root, file), "utf8")]));
    const userFiles = [".trae/settings.json", ".qoder/user.json", ".opencode/plugins/user.mjs"];
    for (const file of userFiles) writeFileSync(path.join(f.root, file), "user-owned sibling");
    const p = createProposal(f.root, { locale: "en", adapters: "codex" });
    for (const [adapter, file] of Object.entries(ROOT_ADAPTER_FIXTURES)) {
      assert.equal(p.operations.find((op) => op.path === file)?.action, adapter === "codex" ? "write" : "delete", file);
    }
    assert.equal(p.operations.some((op) => op.action === "conflict"), false);
    const proposalFile = f.save(p);
    applyProposal(proposalFile);
    for (const [adapter, file] of Object.entries(ROOT_ADAPTER_FIXTURES)) {
      assert.equal(existsSync(path.join(f.root, file)), adapter === "codex", file);
    }
    assert.equal(existsSync(path.join(f.root, ".lumine/adapters/trae/hooks/session-start.mjs")), false);
    assert.equal(existsSync(path.join(f.root, ".lumine/adapters/opencode/plugin-main.mjs")), false);
    for (const file of userFiles) assert.equal(readFileSync(path.join(f.root, file), "utf8"), "user-owned sibling");
    assert.deepEqual(rollbackProposal(proposalFile).conflicts, []);
    for (const [file, original] of Object.entries(originals)) assert.equal(readFileSync(path.join(f.root, file), "utf8"), original);
  } finally { f.clean(); }
});

test("source self-use deselection removes host entry while preserving canonical community adapters", () => {
  const f = fixture();
  try {
    const pkg = resolveSkillPackageRoot(import.meta.url)!;
    const canonical = "skills/lumine-harness/assets/harness";
    cpSync(path.join(pkg, "assets/harness"), path.join(f.root, canonical), { recursive: true });
    applyProposal(f.save(createProposal(f.root, { locale: "zh-CN", adapters: "codex,trae", sourceSelfUse: true })));
    const manifest = readFileSync(path.join(f.root, canonical, "adapter-capabilities.json"), "utf8");
    const adapterFiles = ["trae/hooks/session-start.mjs", "trae/hooks/stop.mjs"];
    for (const file of adapterFiles) assert.ok(existsSync(path.join(f.root, canonical, "adapters", file)), file);
    const p = createProposal(f.root, { locale: "zh-CN", adapters: "codex", sourceSelfUse: true });
    assert.equal(p.operations.find((op) => op.path === ".trae/hooks.json")?.action, "delete");
    assert.equal(p.operations.some((op) => op.path.startsWith(canonical)), false);
    applyProposal(f.save(p));
    assert.equal(existsSync(path.join(f.root, ".trae/hooks.json")), false);
    assert.equal(existsSync(path.join(f.root, ".codex/hooks.json")), true);
    assert.equal(readFileSync(path.join(f.root, canonical, "adapter-capabilities.json"), "utf8"), manifest);
    for (const file of adapterFiles) assert.ok(existsSync(path.join(f.root, canonical, "adapters", file)), file);
  } finally { f.clean(); }
});

test("modified shared adapter settings require a reviewed override and retain unrelated configuration", () => {
  const f = fixture();
  try {
    const selected = Object.keys(ROOT_ADAPTER_FIXTURES).join(",");
    applyProposal(f.save(createProposal(f.root, { locale: "en", adapters: selected })));
    const changed = Object.values(ROOT_ADAPTER_FIXTURES).filter((file) => file !== ".codex/hooks.json");
    const originals: Record<string, string> = {};
    const overrides: Record<string, string> = {};
    for (const file of changed) {
      const installed = readFileSync(path.join(f.root, file), "utf8");
      const userValue = file.endsWith(".json")
        ? JSON.stringify({ ...JSON.parse(installed), userPreference: "keep me" })
        : installed + "\n// User-maintained integration\n";
      writeFileSync(path.join(f.root, file), userValue);
      originals[file] = userValue;
      overrides[file] = Buffer.from(file.endsWith(".json") ? '{"userPreference":"keep me"}\n' : "export default { userIntegration: true };\n").toString("base64");
    }
    const p = createProposal(f.root, { locale: "en", adapters: "codex" });
    for (const file of changed) {
      assert.equal(p.operations.find((op) => op.path === file)?.action, "conflict");
      assert.ok(p.warnings.some((warning) => warning.includes(file) && warning.includes("preserves")));
    }
    assert.throws(() => applyProposal(f.save(p)), /conflicts/);
    for (const file of changed) assert.equal(readFileSync(path.join(f.root, file), "utf8"), originals[file]);
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.root, ".lumine/project.json"), "utf8")).selectedAdapters, selected.split(","));
    const reviewed = createProposal(f.root, { locale: "en", adapters: "codex", overrides });
    assert.equal(reviewed.operations.some((op) => op.action === "conflict"), false);
    applyProposal(f.save(reviewed));
    const managed = JSON.parse(readFileSync(path.join(f.root, ".lumine/managed.json"), "utf8")).files;
    for (const file of changed) {
      assert.equal(readFileSync(path.join(f.root, file), "utf8"), Buffer.from(overrides[file], "base64").toString());
      assert.equal(managed[file], undefined, "reviewed user content must not become installer-owned");
    }
    const next = createProposal(f.root, { locale: "en", adapters: "codex" });
    for (const file of changed) assert.equal(next.operations.some((op) => op.path === file), false);
  } finally { f.clean(); }
});

test("deselection requires ownership metadata and does not touch unrelated unselected host files", () => {
  const f = fixture();
  try {
    applyProposal(f.save(createProposal(f.root, { locale: "zh-CN", adapters: "codex,trae" })));
    const managedFile = path.join(f.root, ".lumine/managed.json");
    const managed = JSON.parse(readFileSync(managedFile, "utf8"));
    managed.files[".trae/hooks.json"].source = "user";
    writeFileSync(managedFile, JSON.stringify(managed));
    mkdirSync(path.join(f.root, ".qoder"));
    writeFileSync(path.join(f.root, ".qoder/settings.json"), '{"userOnly":true}');
    const p = createProposal(f.root, { locale: "zh-CN", adapters: "codex" });
    assert.equal(p.operations.find((op) => op.path === ".trae/hooks.json")?.action, "conflict");
    assert.ok(p.warnings.some((warning) => warning.includes(".trae/hooks.json") && warning.includes("所有权")));
    assert.equal(p.operations.some((op) => op.path === ".qoder/settings.json"), false);
    assert.throws(() => applyProposal(f.save(p)), /conflicts/);
    assert.ok(existsSync(path.join(f.root, ".trae/hooks.json")));
    assert.equal(readFileSync(path.join(f.root, ".qoder/settings.json"), "utf8"), '{"userOnly":true}');
  } finally { f.clean(); }
});
