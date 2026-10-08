import { containedPath, hash, readJson, snapshotSources, wikiConfig, withWikiLock, writeJson } from './files.ts';
import { listDocuments } from './documents.ts';
import { readCoverage } from './coverage.ts';
import type { CheckIssue, CoverageTopic, WatchScope } from './types.ts';

const STATE_PATH = '.lumine/wiki-state/source-dispositions.json';
export type SourceDispositionAction = 'needs-explanation' | 'covered' | 'deferred';
export interface SourceDisposition {
  file: string;
  topicId: string;
  scope: WatchScope;
  fingerprint: string;
  topicFingerprint: string;
  scopeFingerprint: string;
  action: SourceDispositionAction;
  reason: string;
  decidedAt: string;
}
interface DispositionState { schemaVersion: 1; entries: Record<string, SourceDisposition> }
export interface SourceDispositionStatus { file: string; action: SourceDispositionAction | null; topicId: string | null; status: 'current' | 'stale' | 'pending'; reason?: string; fingerprint: string }

function state(root: string): DispositionState {
  const saved = readJson<DispositionState | null>(containedPath(root, STATE_PATH, false), null);
  if (!saved) return { schemaVersion: 1, entries: {} };
  if (saved.schemaVersion !== 1 || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)) throw new Error('SOURCE_DISPOSITIONS_INVALID');
  return saved;
}
function includes(parent: string, child: string): boolean { return parent === '.' || parent === child || child.startsWith(`${parent}/`); }
function within(scope: WatchScope, file: string): boolean {
  const divider = file.indexOf(':');
  return divider > 0 && scope.repoId === file.slice(0, divider) && includes(scope.path, file.slice(divider + 1));
}
function topicHash(topic: CoverageTopic, revisions: Map<string, string>): string {
  return hash(JSON.stringify({ id: topic.id, title: topic.title, status: topic.status, questions: topic.questions, sourceScopes: topic.sourceScopes, documentRefs: topic.documentRefs, reason: topic.reason ?? null, documents: topic.documentRefs.map((ref) => [ref, revisions.get(ref.split('#')[0]) ?? null]) }));
}
function scopesHash(scopes: WatchScope[]): string { return hash(JSON.stringify(scopes)); }

/** A decision remains visible but returns to the pending list when its source, topic or watched range changes. */
export function sourceDispositionStatuses(root: string, files: Record<string, string>): { statuses: SourceDispositionStatus[]; issues: CheckIssue[] } {
  const issues: CheckIssue[] = [];
  let entries: Record<string, SourceDisposition> = {};
  try { entries = state(root).entries; }
  catch { issues.push({ code: 'SOURCE_DISPOSITIONS_INVALID', severity: 'error', message: 'Saved source classifications could not be read; all unreferenced files need review.' }); }
  let topics = new Map<string, CoverageTopic>();
  try { topics = new Map(readCoverage(root).topics.map((topic) => [topic.id, topic])); }
  catch { issues.push({ code: 'COVERAGE_INVALID', severity: 'error', message: 'The knowledge map could not be read; source classifications need review.' }); }
  let revisions = new Map<string, string>();
  try { revisions = new Map(listDocuments(root, ['wiki']).map((document) => [document.id, document.revision])); }
  catch { issues.push({ code: 'WIKI_DOCUMENTS_INVALID', severity: 'error', message: 'The Wiki documents could not be read; source classifications need review.' }); }
  const scopes = wikiConfig(root).watchScopes, scopeFingerprint = scopesHash(scopes);
  const statuses = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([file, fingerprint]): SourceDispositionStatus => {
    if (issues.length) return { file, fingerprint, topicId: null, action: null, status: 'pending', reason: issues.map((issue) => issue.code).join(',') };
    const saved = entries[file];
    if (!saved) return { file, fingerprint, topicId: null, action: null, status: 'pending' };
    const topic = topics.get(saved.topicId);
    const current = saved.fingerprint === fingerprint && topic && saved.topicFingerprint === topicHash(topic, revisions)
      && saved.scopeFingerprint === scopeFingerprint
      && scopes.some((scope) => scope.repoId === saved.scope.repoId && scope.path === saved.scope.path)
      && within(saved.scope, file)
      && (!topic.sourceScopes.length || topic.sourceScopes.some((scope) => within(scope, file)));
    return { file, fingerprint, topicId: saved.topicId, action: saved.action, status: current ? 'current' : 'stale', reason: saved.reason };
  });
  return { statuses, issues };
}

export function recordSourceDisposition(root: string, input: { file: string; topicId: string; scope: WatchScope; action: SourceDispositionAction; reason: string; expectedFingerprint: string }): SourceDisposition {
  return withWikiLock(root, () => {
    if (!input.reason?.trim() || input.reason.length > 2000 || !['needs-explanation', 'covered', 'deferred'].includes(input.action)) throw new Error('SOURCE_DISPOSITION_INVALID');
    const config = wikiConfig(root), scope = config.watchScopes.find((item) => item.repoId === input.scope.repoId && item.path === input.scope.path);
    if (!scope || !within(scope, input.file)) throw new Error('SOURCE_DISPOSITION_SCOPE_INVALID');
    const topic = readCoverage(root).topics.find((item) => item.id === input.topicId);
    if (!topic || (topic.sourceScopes.length && !topic.sourceScopes.some((item) => within(item, input.file)))) throw new Error('SOURCE_DISPOSITION_TOPIC_INVALID');
    const documents = listDocuments(root, ['wiki']);
    const referenced = new Set(documents.flatMap((document) => document.sources.map((source) => `${source.repoId}:${source.path}`)));
    if (referenced.has(input.file)) throw new Error('SOURCE_ALREADY_REFERENCED');
    const snapshot = snapshotSources(root, [], [scope]);
    const fingerprint = snapshot.files[input.file];
    if (!fingerprint || fingerprint !== input.expectedFingerprint) throw new Error('SOURCE_DISPOSITION_FINGERPRINT_CHANGED');
    const revisions = new Map(documents.map((document) => [document.id, document.revision]));
    const entry: SourceDisposition = { file: input.file, topicId: topic.id, scope, fingerprint, topicFingerprint: topicHash(topic, revisions), scopeFingerprint: scopesHash(config.watchScopes), action: input.action, reason: input.reason.trim(), decidedAt: new Date().toISOString() };
    const saved = state(root); saved.entries[input.file] = entry;
    writeJson(containedPath(root, STATE_PATH, false), saved);
    return entry;
  });
}
