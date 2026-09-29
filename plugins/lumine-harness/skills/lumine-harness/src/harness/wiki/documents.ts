import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { containedPath, hash, readJson, slash, wikiConfig } from './files.ts';
import { parseSections } from './sections.ts';
import { resolveAliasReference } from './references.ts';
import { visibleText, visibleJson, statePath } from './transactions.ts';
import type { Baseline, CheckIssue, Collection, Diagram, KnowledgeDocument, KnowledgeMeta, SourceRef } from './types.ts';

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const SAFE_ID = /^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,159}$/u;
export function assertId(id: string): string { if (!SAFE_ID.test(id)) throw new Error('DOCUMENT_ID_INVALID'); return id; }
export function stateFile(root: string, id: string): string { return containedPath(root, `.lumine/wiki-state/documents/${hash(assertId(id))}.json`, false); }
export function baselineFor(root: string, id: string): Baseline | null { return visibleJson<Baseline | null>(root, statePath('documents', assertId(id)), null); }
export function parseDocument(markdown: string, relative: string, collection: Collection = 'wiki'): KnowledgeDocument {
  if (markdown.length > 2_000_000) throw new Error('DOCUMENT_TOO_LARGE');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  const value = match ? parseYaml(match[1], { maxAliasCount: 0, uniqueKeys: true }) as Record<string, unknown> : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DOCUMENT_METADATA_INVALID');
  const body = match ? markdown.slice(match[0].length) : markdown;
  const id = text(value.id, collection === 'wiki' ? '' : `${collection}-${hash(relative).slice(0, 16)}`);
  assertId(id);
  const title = text(value.title, /^#\s+(.+)$/m.exec(body)?.[1] ?? path.basename(relative, '.md'));
  const issues: string[] = [];
  const meta: KnowledgeMeta = {
    id, title, summary: text(value.summary), type: text(value.type, collection === 'wiki' ? 'architecture' : collection),
    status: text(value.status, 'current'), locale: value.locale === 'en' ? 'en' : 'zh-CN',
    tags: strings(value.tags), aliases: strings(value.aliases), repositories: strings(value.repositories),
    relations: [], sources: [], diagrams: [], watchScopes: []
  };
  for (const relation of Array.isArray(value.relations) ? value.relations : []) {
    if (!relation || typeof relation !== 'object' || typeof relation.target !== 'string' || !['depends_on', 'decision', 'related'].includes(relation.kind)) throw new Error('RELATION_INVALID');
    meta.relations.push({ target: relation.target, kind: relation.kind, ...(typeof relation.note === 'string' ? { note: relation.note } : {}) });
  }
  for (const item of Array.isArray(value.sources) ? value.sources : []) {
    if (!item || typeof item !== 'object') throw new Error('SOURCE_METADATA_INVALID');
    const source = item as Record<string, unknown>;
    if (typeof source.repoId !== 'string' || typeof source.path !== 'string') throw new Error('SOURCE_METADATA_INVALID');
    const ref: SourceRef = { id: text(source.id, `source-${hash(`${source.repoId}:${source.path}`).slice(0, 12)}`), repoId: source.repoId, path: source.path };
    if (typeof source.startLine === 'number') ref.startLine = source.startLine;
    if (typeof source.endLine === 'number') ref.endLine = source.endLine;
    if (['source', 'runtime', 'decision'].includes(String(source.kind))) ref.kind = source.kind as SourceRef['kind'];
    if (typeof source.note === 'string') ref.note = source.note;
    if (meta.sources.some((existing) => existing.id === ref.id)) throw new Error('SOURCE_ID_DUPLICATE');
    meta.sources.push(ref);
  }
  if (!meta.repositories.length) meta.repositories = [...new Set(meta.sources.map((source) => source.repoId))];
  for (const scope of Array.isArray(value.watchScopes) ? value.watchScopes : []) {
    if (!scope || typeof scope.repoId !== 'string' || typeof scope.path !== 'string') throw new Error('WATCH_SCOPE_INVALID');
    meta.watchScopes.push({ repoId: scope.repoId, path: scope.path });
  }
  const sections = parseSections(body);
  for (const entry of Array.isArray(value.sections) ? value.sections : []) {
    const section = sections.find((item) => item.id === entry?.id);
    if (!section || !Array.isArray(entry.sources)) throw new Error('SECTION_METADATA_INVALID');
    section.sources = strings(entry.sources);
    if (section.sources.some((id) => !meta.sources.some((source) => source.id === id))) throw new Error('SECTION_SOURCE_UNKNOWN');
  }
  const rawDiagrams = Array.isArray(value.diagrams) ? value.diagrams : [];
  const codes = [...body.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```\s*$/gm)].map((item) => item[1].trim());
  const diagrams: Diagram[] = codes.map((code, index) => {
    const entry = rawDiagrams[index] as Record<string, unknown> | undefined;
    const diagramId = text(entry?.id, `diagram-${index + 1}`);
    if (!entry?.id) issues.push(`DIAGRAM_ID_MISSING:${index + 1}`);
    assertId(diagramId);
    return { id: diagramId, title: text(entry?.title, `${title} · ${index + 1}`), caption: text(entry?.caption), sources: strings(entry?.sources), code };
  });
  if (diagrams.some((diagram) => sections.some((section) => section.id === diagram.id))) throw new Error('FRAGMENT_ID_DUPLICATE');
  if (new Set(diagrams.map((diagram) => diagram.id)).size !== diagrams.length) throw new Error('DIAGRAM_ID_DUPLICATE');
  if (rawDiagrams.length !== diagrams.length) issues.push('DIAGRAM_METADATA_COUNT_MISMATCH');
  for (const diagram of diagrams) {
    if (!diagram.caption) issues.push(`DIAGRAM_CAPTION_MISSING:${diagram.id}`);
    if (!diagram.sources.length) issues.push(`DIAGRAM_SOURCES_MISSING:${diagram.id}`);
    for (const source of diagram.sources) if (!meta.sources.some((entry) => entry.id === source)) issues.push(`DIAGRAM_SOURCE_UNKNOWN:${diagram.id}:${source}`);
    if (diagram.code.length > 50000 || (diagram.code.match(/-->|--\)|==>|->>|-->>/g)?.length ?? 0) > 300) issues.push(`DIAGRAM_TOO_LARGE:${diagram.id}`);
    if (/%%\{|^---\s*$|\bclick\s|<\/?(?:script|iframe)|javascript:|https?:\/\//mi.test(diagram.code)) issues.push(`DIAGRAM_UNSAFE:${diagram.id}`);
  }
  if (collection === 'wiki') {
    if (!meta.summary) issues.push('SUMMARY_MISSING');
    if (!meta.sources.length) issues.push('SOURCES_MISSING');
    if (!['current', 'proposed', 'historical'].includes(meta.status)) issues.push('KNOWLEDGE_STATUS_INVALID');
  }
  return { ...meta, diagrams, sections, path: relative, collection, body, markdown, revision: hash(markdown), freshness: 'unverified', issues, checkedAt: null, sourceObservation: { status: 'not_observed', checkedAt: null, sourceFingerprint: null }, semanticReview: { status: 'unreviewed' } };
}
export function listDocuments(root: string, collections: Collection[] = ['wiki'], options: { includeHistorical?: boolean; issues?: CheckIssue[] } = {}): KnowledgeDocument[] {
  const config = wikiConfig(root), result: KnowledgeDocument[] = [];
  const roots: Record<Collection, string> = { wiki: config.root, spec: 'docs/product-specs', plan: 'docs/exec-plans' };
  for (const collection of collections) {
    const relativeRoot = roots[collection];
    const directory = containedPath(root, relativeRoot, false);
    if (!existsSync(directory)) continue;
    const visit = (directoryPath: string): void => {
      for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
        const file = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          if (collection === 'plan' && !options.includeHistorical && /^(completed|archived|history|historical)$/i.test(entry.name)) continue;
          visit(file); continue;
        }
        if (!entry.name.endsWith('.md') || !statSync(file).isFile()) continue;
        const relative = slash(path.relative(root, file));
        const markdown = visibleText(root, relative);
        if (markdown === null) continue;
        // Navigation-only index pages have no knowledge identity and are not cards.
        if (collection === 'wiki' && !/^---\r?\n/.test(markdown) && /^(?:index|README)\.md$/i.test(entry.name)) continue;
        try {
          const document = parseDocument(markdown, relative, collection);
          if (!['historical', 'archived', 'completed'].includes(document.status) || options.includeHistorical) result.push(document);
        } catch (error) {
          if (!options.issues) throw error;
          options.issues.push({ code: 'DOCUMENT_INVALID', severity: 'error', document: relative, message: error instanceof Error ? error.message : 'DOCUMENT_INVALID' });
        }
      }
    };
    visit(directory);
  }
  const ids = new Map<string, number>(), paths = new Map<string, number>();
  for (const document of result) { ids.set(document.id, (ids.get(document.id) ?? 0) + 1); const normalized = document.path.normalize('NFC').toLocaleLowerCase('en'); paths.set(normalized, (paths.get(normalized) ?? 0) + 1); }
  const valid = result.filter((document) => {
    const code = (ids.get(document.id) ?? 0) > 1 ? 'DOCUMENT_ID_DUPLICATE' : (paths.get(document.path.normalize('NFC').toLocaleLowerCase('en')) ?? 0) > 1 ? 'DOCUMENT_PATH_COLLISION' : null;
    if (!code) return true;
    if (!options.issues) throw new Error(`${code}:${document.id}`);
    options.issues.push({ code, severity: 'error', document: document.path, message: document.id }); return false;
  });
  return valid.sort((a, b) => a.title.localeCompare(b.title));
}
export function findDocument(root: string, reference: string, collections: Collection[] = ['wiki', 'spec', 'plan']): KnowledgeDocument {
  const issues: CheckIssue[] = [];
  const documents = listDocuments(root, collections, { includeHistorical: true, issues });
  const aliases = visibleJson<Record<string, string>>(root, '.lumine/wiki-state/document-aliases.json', {});
  const target = resolveAliasReference(reference, aliases).split('#')[0];
  const exact = documents.filter((document) => document.id === target || document.path === target);
  if (exact.length === 1) return exact[0];
  const names = documents.filter((document) => document.title === target || path.basename(document.path, '.md') === target);
  if (names.length === 1) return names[0];
  if (names.length > 1) throw new Error(`DOCUMENT_AMBIGUOUS:${names.map((document) => document.id).join(',')}`);
  throw new Error('DOCUMENT_NOT_FOUND');
}
