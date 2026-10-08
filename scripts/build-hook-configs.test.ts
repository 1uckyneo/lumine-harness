import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHookConfigContents, hookConfigTemplates } from "./build-hook-configs.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contents = await buildHookConfigContents(repoRoot);

function commands(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(commands);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => key === "command" ? [String(item)] : commands(item));
}
function withoutCommands(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCommands);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "command" ? "<shared-dispatcher>" : withoutCommands(item)]));
}
function shell(command: string, node: string, cwd: string, args = "", options: NodeJS.ProcessEnv = {}) {
  return spawnSync("/bin/sh", ["-c", `${command}${args ? ` ${args}` : ""}`], {
    cwd, input: '{"text":"保留 stdin"}', encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "", PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH}`, ...options }
  });
}

test("generated Hook configs preserve host protocol metadata and embed one shared preflight", () => {
  for (const { template, destination } of hookConfigTemplates) {
    const expected = JSON.parse(readFileSync(path.join(repoRoot, "skills/lumine-harness/src/adapter-launchers", template), "utf8"));
    const generated = JSON.parse(contents.get(destination)!);
    assert.deepEqual(withoutCommands(generated), withoutCommands(expected));
    for (const command of commands(generated)) {
      assert.match(command, /Generated from src\/adapter-launchers\/root-dispatcher\.ts/);
      assert.match(command, /UNSUPPORTED_NODE_RUNTIME/);
      assert.ok(command.indexOf("UNSUPPORTED_NODE_RUNTIME") < command.indexOf(".lumine\/root.json"));
    }
  }
});

test("supported native Node dispatch preserves space paths, stdin, arguments and child exit status", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-hook-launcher-"));
  const workspace = path.join(root, "项目 root with space's");
  const runtime = "runtime with space's";
  mkdirSync(path.join(workspace, ".lumine"), { recursive: true });
  writeFileSync(path.join(workspace, ".lumine/root.json"), JSON.stringify({ runtime }));
  try {
    for (const serialized of contents.values()) {
      for (const command of commands(JSON.parse(serialized))) {
        const entry = /'(adapters\/[a-z-]+\/hooks\/[a-z-]+\.mjs)'$/.exec(command)?.[1];
        assert.ok(entry);
        const hook = path.join(workspace, runtime, entry);
        mkdirSync(path.dirname(hook), { recursive: true });
        writeFileSync(hook, 'let raw="";for await(const part of process.stdin)raw+=part;process.stdout.write(JSON.stringify({raw,args:process.argv.slice(2),node:process.versions.node}));process.exitCode=7;\n');
        const result = shell(command, process.execPath, workspace, "--json --locale en --sentinel");
        assert.equal(result.status, 7, result.stderr);
        const output = JSON.parse(result.stdout);
        assert.equal(output.raw, '{"text":"保留 stdin"}');
        assert.deepEqual(output.args, ["--json", "--locale", "en", "--sentinel"]);
        assert.equal(output.node, process.versions.node);
      }
    }
    const absent = mkdtempSync(path.join(root, "missing-root-"));
    const command = commands(JSON.parse(contents.values().next().value!))[0];
    const missing = shell(command, process.execPath, absent);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /Lumine root not found/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const unsupportedNodes: string[] = JSON.parse(process.env.LUMINE_TEST_UNSUPPORTED_NODE_BINARIES || "[]");
test("actual unsupported Node rejects every config before project access or stdin consumption", { skip: unsupportedNodes.length === 0 }, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-hook-launcher-old-node-"));
  mkdirSync(path.join(root, ".lumine"));
  writeFileSync(path.join(root, ".lumine/root.json"), "intentionally invalid marker");
  const guard = path.join(root, "read-guard.cjs");
  writeFileSync(guard, `const fs=require("node:fs");for(const method of ["existsSync","readFileSync","statSync","lstatSync","accessSync","readdirSync"]){const original=fs[method];fs[method]=function(file,...rest){if(String(file).includes(".lumine"))throw new Error("PROJECT_ACCESS_BEFORE_PREFLIGHT");return original.call(this,file,...rest)}}Object.defineProperty(process,"stdin",{get(){throw new Error("STDIN_READ_BEFORE_PREFLIGHT")}});\n`);
  try {
    for (const node of unsupportedNodes) for (const serialized of contents.values()) for (const command of commands(JSON.parse(serialized))) {
      const result = shell(command, node, root, "--json --locale en", { NODE_OPTIONS: `--require ${JSON.stringify(guard)}` });
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
      const diagnostic = JSON.parse(result.stderr);
      assert.equal(diagnostic.code, "UNSUPPORTED_NODE_RUNTIME");
      assert.match(diagnostic.message, /Node.js/);
      assert.doesNotMatch(result.stderr, /PROJECT_ACCESS_BEFORE_PREFLIGHT|STDIN_READ_BEFORE_PREFLIGHT/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
