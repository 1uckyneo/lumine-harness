#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { requireHarnessRoot } from "./root-resolver.ts";
import { contentHash, resolveDocument, acceptanceSections } from "./documents.ts";
import { bindTask, checkTask, readTaskRecord, saveTaskRecord, taskRecordPath, type TaskMode } from "./task-contract.ts";
import { resolveCurrentDocument, archivePlan, restorePlan, renameDocument, recoverDocumentOperation, listDocumentOperations } from "./document-operations.ts";
import { commandLocale, formatCommandError, formatHumanIssue } from "./messages.ts";
import type { HarnessProduct } from "./contracts.ts";

export function runTaskCommand(args: string[]): unknown {
  const option = (name: string): string | undefined => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const root = requireHarnessRoot({ root: option("--root") });
  const [command, target] = args;
  if (command === "doc-operations") return listDocumentOperations(root);
  if (!target) throw new Error("Usage: task record <file> [--expect sha256] | bind <taskId> --product host --session-id id [--mode mode] | show/check <taskId> | acceptance <specId>; doc-resolve/doc-rename/doc-archive/doc-restore/doc-recover <ref> | doc-operations; all accept --root");
  if (command === "doc-resolve") { const doc = resolveCurrentDocument(root, target); return { ...doc, sha256: contentHash(doc.source) }; }
  if (command === "doc-rename") { if (!args[2]) throw new Error("doc-rename requires a new project-relative Markdown path"); const result = renameDocument(root, target, args[2], option("--expect") ?? ""); return { operationId: result.operationId, documentId: result.documentId, from: result.from, to: result.to, status: result.status }; }
  if (command === "doc-archive" || command === "doc-restore") { const result = (command === "doc-archive" ? archivePlan : restorePlan)(root, target, option("--expect") ?? ""); return { operationId: result.operationId, documentId: result.documentId, from: result.from, to: result.to, status: result.status }; }
  if (command === "doc-recover") { const result = recoverDocumentOperation(root, target, args.includes("--rollback")); return { operationId: result.operationId, status: result.status }; }
  if (command === "record") {
    const task = saveTaskRecord(root, JSON.parse(readFileSync(path.resolve(target), "utf8")), option("--expect"));
    return { taskId: task.taskId, record: path.relative(root, taskRecordPath(root, task.taskId)), sha256: contentHash(readFileSync(taskRecordPath(root, task.taskId))) };
  }
  if (command === "show") return { ...readTaskRecord(root, target), recordHash: contentHash(readFileSync(taskRecordPath(root, target))) };
  if (command === "acceptance") return acceptanceSections(resolveDocument(root, target));
  if (command === "check") return checkTask(root, target);
  if (command === "bind") {
    const product = option("--product"); const sessionId = option("--session-id");
    if (!product || !["codex", "qoder", "trae", "kimi", "cursor", "opencode", "zcode", "codebuddy", "deepseek-harness"].includes(product) || !sessionId) throw new Error("Binding requires a valid --product and --session-id");
    return bindTask(root, product as HarnessProduct, sessionId, target, option("--mode") as TaskMode | undefined);
  }
  throw new Error(`Unknown task command: ${command}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = runTaskCommand(process.argv.slice(2));
    if (result && typeof result === "object" && "issues" in result && Array.isArray(result.issues) && !process.argv.includes("--json")) {
      const locale = commandLocale(process.argv.slice(2));
      console.log(locale === "zh-CN" ? `任务检查：${"ok" in result && result.ok ? "通过" : "未通过"}` : `Task check: ${"ok" in result && result.ok ? "passed" : "failed"}`);
      for (const issue of result.issues) console.log(formatHumanIssue(issue, locale));
    } else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result && typeof result === "object" && "ok" in result && result.ok === false) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${formatCommandError(error, commandLocale(process.argv.slice(2)))}\n`); process.exitCode = 2; }
}
