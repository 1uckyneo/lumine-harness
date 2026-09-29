import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite, configFingerprint, containedPath, hash, readJson, snapshotSources, wikiConfig, withWikiLock, writeJson } from './files.ts';
import { assertId, baselineFor, findDocument, listDocuments, parseDocument, stateFile } from './documents.ts';
import { threeWayMerge } from './merge.ts';
import type { ApplyResult, Baseline, Candidate, CheckIssue, Collection, Freshness, KnowledgeCard, KnowledgeDocument, SourceSnapshot, UpdatePacket, UpdateUnit, WatchScope } from './types.ts';

export interface QueryOptions { limit?: number; maxChars?: number; repoId?: string; type?: string; freshness?: Freshness; collection?: Collection }
export const loadWikiConfig = wikiConfig;

function explanation(root: string, english: string): string {
  if (wikiConfig(root).locale !== 'zh-CN') return english;
  const translations: Record<string, string> = {
    'Configuration changed after preparation.': '工作包准备后配置已变化，请重新准备。',
    'Identity or path changed; rename the document separately.': '文档身份或路径已变化，请单独执行文档重命名。',
    'Sources changed after preparation; keep the candidate and prepare again.': '工作包准备后来源已变化；候选已保留，请重新准备。',
    'A new watch scope was not included in the prepared snapshot.': '新增监控范围不在本次来源快照中，请重新准备。',
    'Another update changed the generation baseline.': '另一次更新已改变生成基线，请重新核对。',
    'Document is outside the configured Wiki root.': '文档不在配置的知识正文目录内。',
    'Existing document has no generation baseline; preserve it and explicitly review the current content first.': '已有文档没有生成基线；已保护原文，请先核实当前正文并建立基线。',
    'Human changes overlap the candidate. Both versions are preserved.': '人工修改与候选内容重叠，两个版本均已保留。',
    'Human edits reference missing sources; keep both versions for review.': '人工修改引用了缺失来源；保留两个版本等待核实。',
    'Text and generation baseline saved together.': '正文与生成基线已一致保存。',
    'Review the text against current sources before relying on it.': '使用前请依据当前来源核实正文。'
  };
  const prefixes: Record<string, string> = { 'Missing sources: ': '缺失来源：', 'New source was outside the prepared snapshot: ': '新增来源不在工作包快照内：', 'Merged document needs review: ': '合并后的文档需要核实：', 'Human source change needs a new prepared snapshot: ': '人工调整来源后需要重新准备快照：' };
  for (const [prefix, translated] of Object.entries(prefixes)) if (english.startsWith(prefix)) return translated + english.slice(prefix.length);
  return translations[english] ?? english;
}

const snapshotEqual = (a: SourceSnapshot, b: SourceSnapshot): boolean => JSON.stringify(a) === JSON.stringify(b);
const scopesFor = (root: string, document: KnowledgeDocument): WatchScope[] => {
  const all = document.watchScopes.length ? document.watchScopes : wikiConfig(root).watchScopes;
  return [...new Map(all.filter((scope) => !document.repositories.length || document.repositories.includes(scope.repoId)).map((scope) => [`${scope.repoId}:${scope.path}`, scope])).values()];
};
function conflictIds(root: string): Set<string> {
  const folder = containedPath(root, '.lumine/wiki-state/updates', false), ids = new Set<string>();
  if (!existsSync(folder)) return ids;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const packet = readJson<UpdatePacket | null>(containedPath(root, `.lumine/wiki-state/updates/${entry.name}/packet.json`, false), null);
    if (packet?.status !== 'applied') for (const result of packet?.results ?? []) if (['conflict', 'protected', 'source-drift', 'config-drift'].includes(result.status) && !packet?.decisions?.some((decision) => decision.id === result.id && decision.action === 'keep-current')) ids.add(result.id);
  }
  return ids;
}
function fresh(root: string, document: KnowledgeDocument, conflicts: Set<string>): KnowledgeDocument {
  if (document.collection !== 'wiki') return { ...document, freshness: 'unverified' };
  if (conflicts.has(document.id)) return { ...document, freshness: 'conflict' };
  const baseline = baselineFor(root, document.id), current = snapshotSources(root, document.sources, scopesFor(root, document));
  const freshness: Freshness = current.missing.length ? 'missing-source' : !baseline ? 'unverified' : !snapshotEqual(baseline.sources, current) ? 'stale' : baseline.appliedRevision !== document.revision ? 'unverified' : 'current';
  return { ...document, freshness };
}
export function listKnowledge(root: string, collections: Collection[] = ['wiki']): KnowledgeDocument[] {
  const conflicts = conflictIds(root);
  return listDocuments(root, collections).map((document) => fresh(root, document, conflicts));
}
function card(document: KnowledgeDocument, reason = ''): KnowledgeCard {
  return { id: document.id, title: document.title, summary: document.summary, type: document.type, status: document.status, collection: document.collection, locale: document.locale, path: document.path, revision: document.revision, freshness: document.freshness, repositories: document.repositories, tags: document.tags, sources: document.sources, relations: document.relations, diagramIds: document.diagrams.map((diagram) => diagram.id), diagramTypes: [...new Set(document.diagrams.map((diagram) => diagram.code.split(/\s+/)[0]))], reason };
}
function queryTokens(query: string): string[] {
  const lower = query.normalize('NFKC').toLocaleLowerCase();
  const tokens = lower.match(/[a-z0-9_.:/-]+|[\p{Script=Han}]+/gu) ?? [];
  return [...new Set(tokens.flatMap((token) => /\p{Script=Han}/u.test(token) && token.length > 2 ? [token, ...Array.from({ length: token.length - 1 }, (_, index) => token.slice(index, index + 2))] : [token]))];
}
export function queryKnowledge(root: string, query: string, options: QueryOptions = {}): { query: string; cards: KnowledgeCard[]; total: number; contextChars: number } {
  for (const [name, value] of Object.entries({ limit: options.limit, maxChars: options.maxChars })) if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error(`QUERY_BUDGET_INVALID:${name}`);
  const config = wikiConfig(root), tokens = queryTokens(query), documents = listKnowledge(root, [options.collection ?? 'wiki']);
  const ranked = documents.filter((document) => (!options.repoId || document.repositories.includes(options.repoId)) && (!options.type || document.type === options.type) && (!options.freshness || document.freshness === options.freshness)).map((document) => {
    const title = `${document.title} ${document.aliases.join(' ')} ${document.tags.join(' ')}`.normalize('NFKC').toLowerCase();
    const body = `${document.summary} ${document.body} ${document.diagrams.map((diagram) => `${diagram.title} ${diagram.caption} ${diagram.code}`).join(' ')} ${document.relations.join(' ')} ${document.sources.map((source) => `${source.path} ${source.note ?? ''}`).join(' ')}`.normalize('NFKC').toLowerCase();
    const matched = tokens.filter((token) => title.includes(token) || body.includes(token));
    const score = matched.reduce((sum, token) => sum + (title.includes(token) ? 8 : 1), 0);
    return { document, score, matched };
  }).filter((entry) => !tokens.length || entry.score > 0).sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title));
  const cards: KnowledgeCard[] = [], limit = Math.min(options.limit ?? config.maxCards, 30), budget = Math.min(options.maxChars ?? config.maxContextChars, 200000);
  for (const entry of ranked) {
    if (cards.length >= limit) break;
    const item = card(entry.document, entry.matched.join(', '));
    const length = JSON.stringify([...cards, item]).length;
    if (length > budget) continue;
    cards.push(item);
  }
  return { query, cards, total: ranked.length, contextChars: JSON.stringify(cards).length };
}
export function showKnowledge(root: string, reference: string): KnowledgeDocument { return fresh(root, findDocument(root, reference), conflictIds(root)); }
export function scanWiki(root: string): { documents: { id: string; path: string; freshness: Freshness; changedSources: string[]; newFiles: string[]; removedFiles: string[] }[]; unclassifiedFiles: string[]; missingScopes: string[] } {
  const config = wikiConfig(root), documents = listKnowledge(root), referenced = new Set(documents.flatMap((document) => document.sources.map((source) => `${source.repoId}:${source.path}`)));
  const all = snapshotSources(root, [], config.watchScopes);
  return {
    documents: documents.map((document) => {
      const baseline = baselineFor(root, document.id), current = snapshotSources(root, document.sources, scopesFor(root, document));
      return { id: document.id, path: document.path, freshness: document.freshness,
        changedSources: Object.keys(current.fingerprints).filter((key) => current.fingerprints[key] !== baseline?.sources.fingerprints[key]),
        newFiles: Object.keys(current.files).filter((key) => !baseline?.sources.files[key]),
        removedFiles: Object.keys(baseline?.sources.files ?? {}).filter((key) => !Object.hasOwn(current.files, key)) };
    }),
    unclassifiedFiles: Object.keys(all.files).filter((key) => !referenced.has(key)), missingScopes: all.missing
  };
}
export function prepareUpdate(root: string, references: string[] = []): UpdatePacket {
  return withWikiLock(root, () => {
    recoverTransactionsUnlocked(root);
    const documents = references.length ? references.map((reference) => findDocument(root, reference, ['wiki'])) : listDocuments(root);
    const packet: UpdatePacket = { schemaVersion: 2, id: randomUUID(), createdAt: new Date().toISOString(), configFingerprint: configFingerprint(root), scope: documents.map((document) => document.id), units: documents.map((document) => ({ id: document.id, path: document.path, currentMarkdown: document.markdown, currentRevision: document.revision, baseline: baselineFor(root, document.id), sources: snapshotSources(root, document.sources, scopesFor(root, document)), sourceRefs: document.sources, watchScopes: scopesFor(root, document) })), status: 'prepared', results: [] };
    writeJson(packetFile(root, packet.id), packet); return packet;
  });
}
function packetFile(root: string, id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new Error('UPDATE_ID_INVALID');
  return containedPath(root, `.lumine/wiki-state/updates/${id}/packet.json`, false);
}
interface Transaction { id: string; status: 'pending' | 'complete' | 'conflict'; path: string; previousRevision: string; content: string; baseline: Baseline; previousBaseline: Baseline | null }
function applyTransaction(root: string, file: string, transaction: Transaction): void {
  const wikiRoot = wikiConfig(root).root;
  if (!transaction.path.startsWith(`${wikiRoot}/`) || !transaction.path.endsWith('.md')) throw new Error('TRANSACTION_OUTSIDE_WIKI');
  const target = containedPath(root, transaction.path), current = hash(readFileSync(target, 'utf8'));
  if (current !== transaction.previousRevision && current !== hash(transaction.content)) { transaction.status = 'conflict'; writeJson(file, transaction); throw new Error('TRANSACTION_DOCUMENT_CONFLICT'); }
  const existing = baselineFor(root, transaction.baseline.id);
  if (JSON.stringify(existing) !== JSON.stringify(transaction.previousBaseline) && JSON.stringify(existing) !== JSON.stringify(transaction.baseline)) { transaction.status = 'conflict'; writeJson(file, transaction); throw new Error('TRANSACTION_STATE_CONFLICT'); }
  if (current !== hash(transaction.content)) atomicWrite(target, transaction.content);
  writeJson(stateFile(root, transaction.baseline.id), transaction.baseline);
  transaction.status = 'complete'; writeJson(file, transaction);
}
function recoverTransactionsUnlocked(root: string): string[] {
  const directory = containedPath(root, '.lumine/wiki-state/transactions', false), recovered: string[] = [];
  if (!existsSync(directory)) return recovered;
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue;
    const file = containedPath(root, `.lumine/wiki-state/transactions/${entry}`), transaction = readJson<Transaction | null>(file, null);
    if (transaction?.status !== 'pending') continue;
    applyTransaction(root, file, transaction); recovered.push(transaction.id);
  }
  return recovered;
}
export function recoverWiki(root: string): { recovered: string[] } { return withWikiLock(root, () => ({ recovered: recoverTransactionsUnlocked(root) })); }
export function applyUpdate(root: string, packetId: string, candidates: Candidate[]): { packetId: string; status: UpdatePacket['status']; results: ApplyResult[] } {
  return withWikiLock(root, () => {
    recoverTransactionsUnlocked(root);
    const file = packetFile(root, packetId), packet = readJson<UpdatePacket | null>(file, null);
    if (!packet || packet.schemaVersion !== 2) throw new Error('UPDATE_NOT_FOUND');
    const results: ApplyResult[] = [...packet.results];
    for (const candidate of candidates) {
      assertId(candidate.id);
      if (results.some((result) => result.id === candidate.id && result.status === 'applied')) continue;
      const unit = packet.units.find((entry) => entry.id === candidate.id);
      if (!unit) throw new Error(`UPDATE_OUTSIDE_SCOPE:${candidate.id}`);
      const candidatePath = `.lumine/wiki-state/updates/${packetId}/candidates/${hash(candidate.id)}.md`;
      atomicWrite(containedPath(root, candidatePath, false), candidate.markdown);
      let result: ApplyResult = { id: candidate.id, status: 'invalid', reason: '', candidatePath };
      try {
        if (packet.configFingerprint !== configFingerprint(root)) result = { ...result, status: 'config-drift', reason: explanation(root, 'Configuration changed after preparation.') };
        else result = applyCandidate(root, unit, candidate, candidatePath);
      } catch (error) { result.reason = error instanceof Error ? error.message : 'UPDATE_INVALID'; }
      const index = results.findIndex((item) => item.id === candidate.id);
      if (index < 0) results.push(result); else results[index] = result;
      packet.results = results;
      packet.status = packet.units.every((entry) => results.some((item) => item.id === entry.id && item.status === 'applied')) ? 'applied' : 'partial';
      writeJson(file, packet);
    }
    return { packetId, status: packet.status, results };
  });
}
function applyCandidate(root: string, unit: UpdateUnit, candidate: Candidate, candidatePath: string): ApplyResult {
  const result = (status: ApplyResult['status'], reason: string): ApplyResult => ({ id: unit.id, status, reason: explanation(root, reason), candidatePath });
  const parsed = parseDocument(candidate.markdown, unit.path);
  if (parsed.id !== unit.id || (candidate.path && candidate.path !== unit.path)) return result('invalid', 'Identity or path changed; rename the document separately.');
  if (parsed.issues.length) return result('invalid', parsed.issues.join(', '));
  const current = snapshotSources(root, unit.sourceRefs, unit.watchScopes);
  if (!snapshotEqual(unit.sources, current)) return result('source-drift', 'Sources changed after preparation; keep the candidate and prepare again.');
  const proposedScopes = scopesFor(root, parsed);
  for (const scope of proposedScopes) if (!unit.watchScopes.some((existing) => existing.repoId === scope.repoId && existing.path === scope.path)) return result('source-drift', 'A new watch scope was not included in the prepared snapshot.');
  const nextSources = snapshotSources(root, parsed.sources, proposedScopes);
  if (nextSources.missing.length) return result('invalid', `Missing sources: ${nextSources.missing.join(', ')}`);
  for (const [key, fingerprint] of Object.entries(nextSources.fingerprints)) {
    if ((unit.sources.fingerprints[key] ?? unit.sources.files[key]) !== fingerprint) return result('source-drift', `New source was outside the prepared snapshot: ${key}`);
  }
  const baseline = baselineFor(root, unit.id);
  if (JSON.stringify(baseline) !== JSON.stringify(unit.baseline)) return result('conflict', 'Another update changed the generation baseline.');
  const wikiRoot = wikiConfig(root).root;
  if (!unit.path.startsWith(`${wikiRoot}/`) || !unit.path.endsWith('.md')) return result('invalid', 'Document is outside the configured Wiki root.');
  const file = containedPath(root, unit.path), currentMarkdown = readFileSync(file, 'utf8');
  if (!baseline && candidate.markdown !== currentMarkdown) return result('protected', 'Existing document has no generation baseline; preserve it and explicitly review the current content first.');
  const merged = threeWayMerge(baseline?.generatedMarkdown ?? currentMarkdown, currentMarkdown, candidate.markdown);
  if (!merged.clean) return result('conflict', 'Human changes overlap the candidate. Both versions are preserved.');
  const applied = parseDocument(merged.content, unit.path);
  if (applied.issues.length) return result('conflict', `Merged document needs review: ${applied.issues.join(', ')}`);
  const mergedSources = snapshotSources(root, applied.sources, scopesFor(root, applied));
  if (mergedSources.missing.length) return result('conflict', 'Human edits reference missing sources; keep both versions for review.');
  for (const [key, fingerprint] of Object.entries(mergedSources.fingerprints)) if ((unit.sources.fingerprints[key] ?? unit.sources.files[key]) !== fingerprint) return result('conflict', `Human source change needs a new prepared snapshot: ${key}`);
  const baselineNext: Baseline = { schemaVersion: 2, id: unit.id, path: unit.path, generation: (baseline?.generation ?? 0) + 1, generatedMarkdown: candidate.markdown, appliedRevision: hash(merged.content), sources: mergedSources, updatedAt: new Date().toISOString() };
  const transaction: Transaction = { id: randomUUID(), status: 'pending', path: unit.path, previousRevision: hash(currentMarkdown), content: merged.content, baseline: baselineNext, previousBaseline: baseline };
  const journal = containedPath(root, `.lumine/wiki-state/transactions/${transaction.id}.json`, false);
  writeJson(journal, transaction); applyTransaction(root, journal, transaction);
  return result('applied', 'Text and generation baseline saved together.');
}
export function checkWiki(root: string): { status: 'passed' | 'failed'; issues: CheckIssue[]; verified: string[]; notVerified: string[] } {
  const issues: CheckIssue[] = [], verified: string[] = [];
  try {
    const documents = listKnowledge(root), ids = new Set(documents.map((document) => document.id));
    for (const document of documents) {
      verified.push(document.id);
      for (const issue of document.issues) issues.push({ code: issue.split(':')[0], severity: 'error', document: document.id, message: issue });
      for (const relation of document.relations) if (!ids.has(relation)) issues.push({ code: 'RELATION_NOT_FOUND', severity: 'error', document: document.id, message: relation });
      if (document.freshness !== 'current') issues.push({ code: `KNOWLEDGE_${document.freshness.replaceAll('-', '_').toUpperCase()}`, severity: document.freshness === 'conflict' ? 'error' : 'warning', document: document.id, message: explanation(root, 'Review the text against current sources before relying on it.') });
    }
  } catch (error) { issues.push({ code: 'WIKI_INVALID', severity: 'error', message: error instanceof Error ? error.message : 'Invalid wiki' }); }
  return { status: issues.some((issue) => issue.severity === 'error') ? 'failed' : 'passed', issues, verified, notVerified: ['semantic accuracy', 'runtime behavior', 'human acceptance'] };
}

export function recordUpdateDecision(root: string, packetId: string, id: string, action: 'keep-current' | 'defer', reason: string): UpdatePacket {
  if (!reason.trim()) throw new Error('DECISION_REASON_REQUIRED');
  return withWikiLock(root, () => {
    const file = packetFile(root, packetId), packet = readJson<UpdatePacket | null>(file, null);
    if (!packet || !packet.units.some((unit) => unit.id === id)) throw new Error('UPDATE_DOCUMENT_NOT_FOUND');
    packet.decisions = [...(packet.decisions ?? []), { id, action, reason, at: new Date().toISOString() }];
    writeJson(file, packet); return packet;
  });
}
