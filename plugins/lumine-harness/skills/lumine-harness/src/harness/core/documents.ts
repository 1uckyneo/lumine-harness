import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolveProjectPath } from "./project-config.ts";

export interface ProjectDocument { root?: string; docId: string; type: string; status: string; file: string; metadata: Record<string, string | string[]>; source: string; }
export interface AcceptanceSection { acId: string; title: string; content: string; baselineHash: string; }
export interface ContractIssue { code: string; message: string; path?: string; remediation: string; }
export function contentHash(content: string | Buffer): string { return createHash("sha256").update(content).digest("hex"); }
export function parseDocumentMetadata(source: string): Record<string, string | string[]> {
  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const result: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (pair) {
      const [, key, value] = pair;
      listKey = value ? null : key;
      if (!value) { result[key] = []; continue; }
      if (value.startsWith("[") && value.endsWith("]")) {
        try { const parsed = JSON.parse(value); result[key] = Array.isArray(parsed) ? parsed.map(String) : value; }
        catch { result[key] = value.slice(1, -1).split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean); }
      } else result[key] = value.replace(/^['"]|['"]$/g, "");
    } else if (listKey) {
      const item = line.match(/^\s+-\s+(.+?)\s*$/);
      if (item) (result[listKey] as string[]).push(item[1].replace(/^['"]|['"]$/g, ""));
    }
  }
  return result;
}
export function readProjectDocument(root: string, file: string): ProjectDocument {
  const absolute = resolveProjectPath(root, file, "document");
  const source = readFileSync(absolute, "utf8");
  const metadata = parseDocumentMetadata(source);
  const document = { docId: String(metadata.id ?? ""), type: String(metadata.type ?? ""), status: String(metadata.status ?? ""), file: path.relative(root, absolute).replaceAll(path.sep, "/"), metadata, source };
  Object.defineProperty(document, "root", { value: root, enumerable: false });
  return document;
}
export function listProjectDocuments(root: string): ProjectDocument[] {
  const result: ProjectDocument[] = [];
  const visit = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (["history", "archive", "archived", "completed", "local"].includes(item.name)) continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) visit(file);
      else if (item.isFile() && item.name.endsWith(".md")) {
        const doc = readProjectDocument(root, path.relative(root, file));
        if (item.name !== "index.md" && !["archived", "historical"].includes(doc.status)) result.push(doc);
      }
    }
  };
  visit(path.join(root, "docs/product-specs"));
  visit(path.join(root, "docs/exec-plans/active"));
  return result;
}
/** Archived plans are loaded only for an explicit reference, never for the current-document list. */
export function listArchivedPlans(root: string): ProjectDocument[] {
  const result: ProjectDocument[] = [];
  const visit = (relative: string): void => {
    const directory = resolveProjectPath(root, relative, "archived plans");
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (["history", "archive", "archived", "local"].includes(item.name)) continue;
      const file = path.posix.join(relative, item.name);
      if (item.isDirectory()) visit(file);
      else if (item.isFile() && item.name.endsWith(".md") && item.name !== "index.md") {
        const doc = readProjectDocument(root, file);
        if (doc.docId && doc.type === "exec-plan" && doc.status !== "historical") result.push(doc);
      }
    }
  };
  visit("docs/exec-plans/completed");
  return result;
}
export function documentTitle(document: ProjectDocument): string {
  return String(document.metadata.title ?? document.source.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1] ?? path.basename(document.file, ".md"));
}
export function resolveDocument(root: string, reference: string, documents = listProjectDocuments(root)): ProjectDocument {
  const addressable = [...documents, ...listArchivedPlans(root).filter((doc) => !documents.some((current) => current.file === doc.file))];
  const byId = addressable.filter((doc) => doc.docId && doc.docId === reference);
  if (byId.length > 1) throw new Error(`Duplicate docId: ${reference}`);
  if (byId[0]) return byId[0];
  if (reference.endsWith(".md") && existsSync(resolveProjectPath(root, reference, "document reference"))) return readProjectDocument(root, reference);
  const aliasFile = resolveProjectPath(root, ".lumine/wiki-state/document-aliases.json", "document aliases");
  if (existsSync(aliasFile)) {
    const aliases = JSON.parse(readFileSync(aliasFile, "utf8")) as Record<string, string>;
    if (typeof aliases[reference] === "string") {
      const match = addressable.filter((doc) => doc.docId === aliases[reference]);
      if (match.length === 1) return match[0];
      throw new Error(`Document alias is missing or ambiguous: ${reference}`);
    }
  }
  const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en");
  const matched = documents.filter((doc) => [doc.file, path.basename(doc.file, ".md"), documentTitle(doc), ...(Array.isArray(doc.metadata.aliases) ? doc.metadata.aliases : [])].some((name) => normalized(name) === normalized(reference)));
  if (matched.length === 1) return matched[0];
  throw new Error(`Document reference is missing or ambiguous: ${reference}`);
}

function acceptanceBaseline(document: ProjectDocument, content: string): string {
  const destination = (value: string): string => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
    const suffixAt = value.search(/[?#]/);
    const pathname = suffixAt < 0 ? value : value.slice(0, suffixAt);
    const suffix = suffixAt < 0 ? "" : value.slice(suffixAt);
    let decoded: string;
    try { decoded = decodeURIComponent(pathname); } catch { return value; }
    const file = path.posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : path.posix.join(path.posix.dirname(document.file), decoded));
    let identity = file;
    if (document.root) {
      try {
        const aliasesFile = resolveProjectPath(document.root, ".lumine/wiki-state/document-aliases.json");
        const aliases = existsSync(aliasesFile) ? JSON.parse(readFileSync(aliasesFile, "utf8")) as Record<string, string> : {};
        if (aliases[file]) identity = `id:${aliases[file]}`;
        else if (file.endsWith(".md")) {
          const metadata = parseDocumentMetadata(readFileSync(resolveProjectPath(document.root, file), "utf8"));
          if (metadata.id) identity = `id:${metadata.id}`;
        }
      } catch { /* Missing source is separately diagnosed; retain its stable project-relative path. */ }
    }
    return `${identity}${suffix}`;
  };
  let fence: string | null = null;
  let prose = "";
  const chunks: string[] = [];
  const flush = () => { if (prose) { chunks.push(prose.replace(/\s+/g, " ").trim()); prose = ""; } };
  for (const line of content.split("\n")) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      flush(); chunks.push(line);
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) { chunks.push(line); continue; }
    prose += " " + line.replace(/(!?\[[^\]]*\]\()(<[^>]*>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?(\))/g, (_match, opening: string, value: string, title = "", ending: string) => `${opening}${destination(value.startsWith("<") ? value.slice(1, -1) : value)}${title}${ending}`);
  }
  flush();
  return contentHash(chunks.join("\n"));
}

export function acceptanceSections(document: ProjectDocument): AcceptanceSection[] {
  const lines = document.source.replaceAll("\r\n", "\n").split("\n");
  const sections: AcceptanceSection[] = [];
  const seen = new Set<string>();
  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*(```|~~~)/.test(lines[index])) fenced = !fenced;
    if (fenced) continue;
    const match = lines[index].match(/^(#{1,6})\s+(AC-[A-Za-z0-9_-]+)(?:\s*[:：]\s*|\s+)(.+)$/);
    if (!match) continue;
    const [, level, acId, title] = match;
    if (seen.has(acId)) throw new Error(`Duplicate acceptance ID ${acId} in ${document.docId}`);
    seen.add(acId);
    let end = index + 1;
    let sectionFence = false;
    for (; end < lines.length; end++) {
      if (/^\s*(```|~~~)/.test(lines[end])) sectionFence = !sectionFence;
      const heading = !sectionFence && lines[end].match(/^(#{1,6})\s+/);
      if (heading && heading[1].length <= level.length) break;
    }
    const content = lines.slice(index, end).join("\n").trim();
    sections.push({ acId, title, content, baselineHash: acceptanceBaseline(document, content) });
  }
  return sections;
}
export function checkDocumentContracts(root: string): ContractIssue[] {
  const docs = listProjectDocuments(root);
  const issues: ContractIssue[] = [];
  const ids = new Set<string>();
  for (const doc of docs) {
    const issue = (code: string, message: string) => issues.push({ code, message, path: doc.file, remediation: "Fix the document identity or relationship; visible headings may use either project language." });
    if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(doc.docId)) issue("INVALID_DOC_ID", "id must be a stable identifier");
    if (ids.has(doc.docId)) issue("DUPLICATE_DOC_ID", `Duplicate docId: ${doc.docId}`);
    ids.add(doc.docId);
    if (!["product-spec", "exec-plan"].includes(doc.type)) issue("INVALID_DOC_TYPE", `Unknown document type: ${doc.type}`);
    if (!doc.status) issue("MISSING_DOC_STATUS", "Document status is missing");
    try {
      if (doc.type === "product-spec") acceptanceSections(doc);
      const references = Array.isArray(doc.metadata.specIds) ? doc.metadata.specIds : doc.metadata.specId ? [String(doc.metadata.specId)] : [];
      for (const id of references) if (resolveDocument(root, id, docs).type !== "product-spec") issue("INVALID_SPEC_REF", `Expected product-spec: ${id}`);
    } catch (error) { issue("DOCUMENT_RELATIONSHIP", error instanceof Error ? error.message : String(error)); }
  }
  return issues;
}
