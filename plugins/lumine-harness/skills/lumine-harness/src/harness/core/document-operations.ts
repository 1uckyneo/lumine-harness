import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { contentHash, parseDocumentMetadata, readProjectDocument, resolveDocument, type ProjectDocument } from "./documents.ts";
import { loadProjectConfig, resolveProjectPath } from "./project-config.ts";

const ALIASES = ".lumine/wiki-state/document-aliases.json";
const OPERATIONS = ".lumine/wiki-state/document-operations";
interface Mutation { path: string; before: string | null; after: string | null; }
export interface DocumentOperation { schemaVersion: 1; kind: "document-rename" | "document-archive" | "document-restore"; operationId: string; documentId: string; from: string; to: string; status: "prepared" | "applying" | "complete" | "rolled_back" | "conflict"; mutations: Mutation[]; error?: string; }
function normalized(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("en"); }
function scanMarkdown(root: string, directory: string): string[] {
  const absolute = resolveProjectPath(root, directory);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const item of readdirSync(absolute, { withFileTypes: true })) {
    if (["history", "archive", "archived", "completed", "validation", "local"].includes(item.name)) continue;
    const relative = path.posix.join(directory, item.name);
    if (item.isDirectory()) files.push(...scanMarkdown(root, relative));
    else if (item.isFile() && item.name.endsWith(".md")) files.push(relative);
  }
  return files;
}
function roots(root: string): string[] { return [...new Set(["docs/product-specs", "docs/exec-plans/active", loadProjectConfig(root).wiki.root])]; }
export function allCurrentDocuments(root: string): ProjectDocument[] {
  const files = new Set(roots(root).flatMap((dir) => scanMarkdown(root, dir)));
  return [...files].map((file) => readProjectDocument(root, file)).filter((doc) => doc.docId && !["historical", "archived"].includes(doc.status));
}
export function resolveCurrentDocument(root: string, reference: string): ProjectDocument {
  const doc = resolveDocument(root, reference, allCurrentDocuments(root));
  if (!doc.docId) throw new Error("Document requires a stable id");
  return doc;
}
function currentText(root: string, relative: string): string | null { const file = resolveProjectPath(root, relative); return existsSync(file) ? readFileSync(file, "utf8") : null; }
function writeAtomic(root: string, relative: string, text: string): void {
  const file = resolveProjectPath(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, text, { encoding: "utf8", flag: "wx" });
  renameSync(temp, file);
}
function operationFile(operationId: string): string {
  if (!/^[a-z0-9-]+$/i.test(operationId)) throw new Error("Invalid document operation ID");
  return `${OPERATIONS}/${operationId}.json`;
}
function saveOperation(root: string, operation: DocumentOperation): void { writeAtomic(root, operationFile(operation.operationId), `${JSON.stringify(operation, null, 2)}\n`); }
function allowedMutation(root: string, file: string): boolean {
  if (path.posix.normalize(file) !== file || path.posix.isAbsolute(file) || file.includes("\\")) return false;
  if (file === ALIASES || ["README.md", "AGENTS.md", "ARCHITECTURE.md"].includes(file)) return true;
  return roots(root).some((dir) => file.startsWith(`${dir}/`)) && file.endsWith(".md") && !/(?:^|\/)(?:history|archive|archived|completed|validation|local)(?:\/|$)/.test(file);
}
/** Rewrites Markdown destinations while retaining anchors and keeping literal code untouched. */
export function rewriteDocumentLinks(source: string, sourceFile: string, destinationFile: string, oldPath: string, newPath: string): string {
  const link = (destination: string): string => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(destination)) return destination;
    const suffixAt = destination.search(/[?#]/);
    const pathname = suffixAt < 0 ? destination : destination.slice(0, suffixAt);
    const suffix = suffixAt < 0 ? "" : destination.slice(suffixAt);
    if (!pathname) return destination;
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return destination; }
    const rooted = decoded.startsWith("/");
    const target = path.posix.normalize(rooted ? decoded.slice(1) : path.posix.join(path.posix.dirname(sourceFile), decoded));
    const next = normalized(target) === normalized(oldPath) ? newPath : target;
    if (next === target && sourceFile === destinationFile) return destination;
    const relative = rooted ? `/${next}` : path.posix.relative(path.posix.dirname(destinationFile), next) || path.posix.basename(next);
    if (relative === decoded) return destination;
    return encodeURI(relative).replaceAll("#", "%23").replaceAll("?", "%3F") + suffix;
  };
  let fence: string | null = null;
  return source.split(/(\r?\n)/).map((line) => {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) { if (!fence) fence = delimiter[1]; else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null; return line; }
    if (fence) return line;
    // Inline code may contain examples of links that are not document references.
    return line.split(/(`+[^`]*`+)/g).map((part) => {
      if (part.startsWith("`")) return part;
      return part.replace(/(!?\[[^\]]*\]\()(<[^>]*>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?(\))/g, (_all, prefix: string, target: string, title = "", ending: string) => {
        const angle = target.startsWith("<");
        const rewritten = link(angle ? target.slice(1, -1) : target);
        return `${prefix}${angle ? `<${rewritten}>` : rewritten}${title}${ending}`;
      }).replace(/^(\s{0,3}\[[^\]]+\]:\s*)(<[^>]*>|\S+)/, (_all, prefix: string, target: string) => {
        const angle = target.startsWith("<"); const rewritten = link(angle ? target.slice(1, -1) : target);
        return `${prefix}${angle ? `<${rewritten}>` : rewritten}`;
      });
    }).join("");
  }).join("");
}
export function prepareDocumentRename(root: string, reference: string, target: string, expectedHash: string): DocumentOperation {
  const doc = resolveCurrentDocument(root, reference);
  if (["historical", "archived"].includes(doc.status) || !allowedMutation(root, doc.file)) throw new Error("Historical evidence is immutable; use doc-restore for a current-protocol archived plan");
  return prepareDocumentMove(root, doc, target, expectedHash, "document-rename");
}
const ACTIVE_PLANS = "docs/exec-plans/active/";
const COMPLETED_PLANS = "docs/exec-plans/completed/";
function lifecyclePaths(kind: DocumentOperation["kind"], from: string, to: string): boolean {
  const source = kind === "document-archive" ? ACTIVE_PLANS : COMPLETED_PLANS;
  const destination = kind === "document-archive" ? COMPLETED_PLANS : ACTIVE_PLANS;
  const suffix = from.slice(source.length);
  return kind !== "document-rename" && from.startsWith(source) && to === destination + suffix &&
    suffix.endsWith(".md") && !suffix.split("/").some((part) => ["", ".", "..", "history", "archive", "archived", "completed", "validation", "local"].includes(part));
}
export function preparePlanLifecycle(root: string, reference: string, expectedHash: string, action: "archive" | "restore"): DocumentOperation {
  const doc = resolveDocument(root, reference);
  if (!doc.docId || doc.type !== "exec-plan" || doc.status === "historical") throw new Error("Only current-protocol plans with a stable id can be archived or restored");
  const from = action === "archive" ? ACTIVE_PLANS : COMPLETED_PLANS;
  const to = action === "archive" ? COMPLETED_PLANS : ACTIVE_PLANS;
  if (!doc.file.startsWith(from)) throw new Error(`Plan must be inside ${from}`);
  return prepareDocumentMove(root, doc, to + doc.file.slice(from.length), expectedHash, action === "archive" ? "document-archive" : "document-restore");
}
function movedDocumentText(source: string, from: string, to: string, kind: DocumentOperation["kind"]): string {
  const rewritten = rewriteDocumentLinks(source, from, to, from, to);
  if (kind === "document-rename") return rewritten;
  const status = kind === "document-archive" ? "completed" : "active";
  // Only the lifecycle metadata changes; requirements, approvals and evidence remain untouched.
  return rewritten.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_all, start: string, body: string, end: string) => {
    const updated = /^status:.*$/m.test(body) ? body.replace(/^status:.*$/m, `status: ${status}`) : `${body}\nstatus: ${status}`;
    return start + updated + end;
  });
}
function prepareDocumentMove(root: string, doc: ProjectDocument, target: string, expectedHash: string, kind: DocumentOperation["kind"]): DocumentOperation {
  if (!expectedHash || contentHash(doc.source) !== expectedHash) throw new Error("Document changed; provide --expect with the current content sha256");
  const destination = path.relative(root, resolveProjectPath(root, target, "new document path")).split(path.sep).join("/");
  if (!destination.endsWith(".md") || (kind === "document-rename" ? !allowedMutation(root, destination) : !lifecyclePaths(kind, doc.file, destination))) throw new Error(kind === "document-rename" ? "New document path must be inside a current document collection" : "Plan lifecycle target must be inside the matching plan collection");
  if (destination.split("/").some((part) => /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Document path is not portable across filesystems");
  if (normalized(destination) === normalized(doc.file)) throw new Error("The new path collides with the current path after Unicode/case normalization; choose a distinct name");
  const existing = [...new Set([...roots(root), "docs/exec-plans/completed"].flatMap((dir) => scanMarkdown(root, dir)))];
  if (existing.some((file) => normalized(file) === normalized(destination)) || existsSync(resolveProjectPath(root, destination))) throw new Error("Destination collides with an existing document");
  const aliasesText = currentText(root, ALIASES);
  const aliases = aliasesText ? JSON.parse(aliasesText) as Record<string, string> : {};
  if (aliases[doc.file] && aliases[doc.file] !== doc.docId) throw new Error("The old path already aliases another document");
  aliases[doc.file] = doc.docId;
  const candidates = new Set([...existing, ...["README.md", "AGENTS.md", "ARCHITECTURE.md"].filter((file) => existsSync(resolveProjectPath(root, file)))]);
  const mutations: Mutation[] = [{ path: destination, before: null, after: movedDocumentText(doc.source, doc.file, destination, kind) }];
  for (const file of candidates) {
    if (file === doc.file || !allowedMutation(root, file)) continue;
    const source = currentText(root, file)!;
    if (["historical", "archived"].includes(readProjectDocument(root, file).status)) continue;
    const updated = rewriteDocumentLinks(source, file, file, doc.file, destination);
    if (updated !== source) mutations.push({ path: file, before: source, after: updated });
  }
  mutations.push({ path: ALIASES, before: aliasesText, after: `${JSON.stringify(aliases, null, 2)}\n` });
  mutations.push({ path: doc.file, before: doc.source, after: null });
  return { schemaVersion: 1, kind, operationId: randomUUID(), documentId: doc.docId, from: doc.file, to: destination, status: "prepared", mutations };
}
function withOperationLock<T>(root: string, action: () => T): T {
  const lock = resolveProjectPath(root, ".lumine/local/runtime/document-operation.lock");
  mkdirSync(path.dirname(lock), { recursive: true });
  let fd: number;
  try { fd = openSync(lock, "wx"); }
  catch { throw new Error("A document operation is running; inspect the local lock if a previous process was interrupted"); }
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); return action(); }
  finally { closeSync(fd); unlinkSync(lock); }
}
/** Every application or rollback checks the exact current bytes before writing. */
export function applyDocumentOperation(root: string, operation: DocumentOperation, rollback = false): DocumentOperation {
  return withOperationLock(root, () => {
    if (!["document-rename", "document-archive", "document-restore"].includes(operation.kind) || operation.schemaVersion !== 1 || !Array.isArray(operation.mutations)) throw new Error("Invalid document operation");
    if (new Set(operation.mutations.map((mutation) => mutation.path)).size !== operation.mutations.length) throw new Error("Duplicate document operation target");
    if (operation.kind !== "document-rename") {
      if (!lifecyclePaths(operation.kind, operation.from, operation.to)) throw new Error("Invalid plan lifecycle paths");
      const source = operation.mutations.find((item) => item.path === operation.from);
      const destination = operation.mutations.find((item) => item.path === operation.to);
      if (!source?.before || source.after !== null || destination?.before !== null ||
          destination.after !== movedDocumentText(source.before, operation.from, operation.to, operation.kind)) throw new Error("Plan lifecycle must preserve the document and only rebase links and lifecycle metadata");
      const metadata = parseDocumentMetadata(source.before);
      if (!metadata.id || metadata.id !== operation.documentId || metadata.type !== "exec-plan" || metadata.status === "historical") throw new Error("Plan lifecycle requires a current-protocol plan identity");
    }
    for (const mutation of operation.mutations) {
      const lifecycleEndpoint = operation.kind !== "document-rename" && [operation.from, operation.to].includes(mutation.path);
      if (!allowedMutation(root, mutation.path) && !lifecycleEndpoint) throw new Error(`Invalid document operation target: ${mutation.path}`);
    }
    if ((!rollback && operation.status === "complete") || (rollback && operation.status === "rolled_back")) return operation;
    operation.status = "applying"; delete operation.error; saveOperation(root, operation);
    try {
      for (const mutation of rollback ? [...operation.mutations].reverse() : operation.mutations) {
        const before = rollback ? mutation.after : mutation.before;
        const after = rollback ? mutation.before : mutation.after;
        const current = currentText(root, mutation.path);
        if (current === after) continue;
        if (current !== before) throw new Error(`Document operation conflict: ${mutation.path}; preserve the newer edit and review before recovery`);
        if (after === null) { if (current !== null) unlinkSync(resolveProjectPath(root, mutation.path)); }
        else writeAtomic(root, mutation.path, after);
      }
      operation.status = rollback ? "rolled_back" : "complete";
      saveOperation(root, operation);
      return operation;
    } catch (error) {
      operation.status = "conflict"; operation.error = error instanceof Error ? error.message : String(error); saveOperation(root, operation); throw new Error(`${operation.error} (operation ${operation.operationId}; use task doc-recover)`);
    }
  });
}
export function renameDocument(root: string, reference: string, target: string, expectedHash: string): DocumentOperation {
  const operation = prepareDocumentRename(root, reference, target, expectedHash);
  return applyDocumentOperation(root, operation);
}
export function archivePlan(root: string, reference: string, expectedHash: string): DocumentOperation {
  return applyDocumentOperation(root, preparePlanLifecycle(root, reference, expectedHash, "archive"));
}
export function restorePlan(root: string, reference: string, expectedHash: string): DocumentOperation {
  return applyDocumentOperation(root, preparePlanLifecycle(root, reference, expectedHash, "restore"));
}
export function recoverDocumentOperation(root: string, operationId: string, rollback = false): DocumentOperation {
  const operation = JSON.parse(readFileSync(resolveProjectPath(root, operationFile(operationId)), "utf8")) as DocumentOperation;
  if (operation.operationId !== operationId) throw new Error("Document operation identity mismatch");
  return applyDocumentOperation(root, operation, rollback);
}

export function listDocumentOperations(root: string): Array<Pick<DocumentOperation, "operationId" | "documentId" | "from" | "to" | "status" | "error">> {
  const directory = resolveProjectPath(root, OPERATIONS);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((file) => file.endsWith(".json")).sort().map((file) => {
    const operation = JSON.parse(readFileSync(resolveProjectPath(root, `${OPERATIONS}/${file}`), "utf8")) as DocumentOperation;
    return { operationId: operation.operationId, documentId: operation.documentId, from: operation.from, to: operation.to, status: operation.status, error: operation.error };
  });
}
