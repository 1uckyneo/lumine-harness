import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { containedPath, hash, readJson, withWikiLock } from './files.ts';
import { baselineFor, findDocument, formatWikiDocument, isStructuredWikiDocument, listDocuments, parseDocument } from './documents.ts';
import { applyTransaction, diskText, jsonText, pendingTransactions, recoverTransactions, statePath } from './transactions.ts';
import type { Baseline, ObservationRecord, ReviewRecord, UpdatePacket } from './types.ts';

export interface WikiFormatMigrationItem { id: string; path: string; status: 'eligible' | 'current' | 'blocked' | 'converted'; reason?: string; beforeRevision: string; afterRevision?: string }

function unresolvedPacketIds(root: string): Set<string> {
  const directory = containedPath(root, '.lumine/wiki-state/updates', false), unresolved = new Set<string>();
  if (!existsSync(directory)) return unresolved;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const packet = readJson<UpdatePacket | null>(containedPath(root, `.lumine/wiki-state/updates/${entry.name}/packet.json`, false), null);
    if (!packet || packet.schemaVersion !== 2) throw new Error(`UPDATE_PACKET_INVALID:${entry.name}`);
    if (packet.status === 'applied') continue;
    for (const unit of packet.units) {
      const applied = packet.results.find((result) => result.id === unit.id)?.status === 'applied';
      const decided = packet.decisions?.some((decision) => decision.id === unit.id && ['keep-current', 'defer'].includes(decision.action));
      if (!applied && !decided) unresolved.add(unit.id);
    }
  }
  return unresolved;
}

function inspect(root: string, id: string, pending: Set<string>, transactionsPending: boolean): WikiFormatMigrationItem {
  const document = findDocument(root, id, ['wiki']);
  const initial = { id: document.id, path: document.path, beforeRevision: document.revision };
  if (isStructuredWikiDocument(document.markdown)) return { ...initial, status: 'current' };
  if (transactionsPending) return { ...initial, status: 'blocked', reason: 'PENDING_TRANSACTION' };
  if (pending.has(id)) return { ...initial, status: 'blocked', reason: 'UNRESOLVED_UPDATE_PACKET' };
  const baseline = baselineFor(root, id);
  if (!baseline || baseline.id !== id || baseline.path !== document.path) return { ...initial, status: 'blocked', reason: 'BASELINE_MISSING_OR_MISMATCH' };
  try {
    const converted = formatWikiDocument(document.markdown, document.path);
    formatWikiDocument(baseline.generatedMarkdown, document.path);
    return { ...initial, status: 'eligible', afterRevision: hash(converted) };
  } catch (error) {
    return { ...initial, status: 'blocked', reason: error instanceof Error ? error.message : 'DOCUMENT_FORMAT_INVALID' };
  }
}

/** Read-only per-document conversion plan. Partial packets only block their unapplied units. */
export function planWikiDocumentFormat(root: string): WikiFormatMigrationItem[] {
  const pending = unresolvedPacketIds(root), transactionsPending = pendingTransactions(root).length > 0;
  return listDocuments(root, ['wiki'], { includeHistorical: true }).map((document) => inspect(root, document.id, pending, transactionsPending));
}

/** Converts one document and its durable state as a single recoverable transaction. */
export function migrateWikiDocumentFormat(root: string, id: string): WikiFormatMigrationItem {
  return withWikiLock(root, () => {
    recoverTransactions(root);
    const pending = unresolvedPacketIds(root);
    const planned = inspect(root, id, pending, pendingTransactions(root).length > 0);
    if (planned.status !== 'eligible') return planned;
    const current = diskText(root, planned.path);
    if (current === null || hash(current) !== planned.beforeRevision) return { ...planned, status: 'blocked', reason: 'DOCUMENT_CHANGED' };
    const baselinePath = statePath('documents', id), beforeBaseline = diskText(root, baselinePath);
    if (beforeBaseline === null) return { ...planned, status: 'blocked', reason: 'BASELINE_MISSING' };
    const baseline = JSON.parse(beforeBaseline) as Baseline;
    const next = formatWikiDocument(current, planned.path);
    const generated = formatWikiDocument(baseline.generatedMarkdown, planned.path);
    const beforeGenerated = parseDocument(baseline.generatedMarkdown, planned.path);
    const afterGenerated = parseDocument(generated, planned.path);
    if (beforeGenerated.id !== id || afterGenerated.id !== id || beforeGenerated.body !== afterGenerated.body) return { ...planned, status: 'blocked', reason: 'BASELINE_FORMAT_NOT_LOSSLESS' };
    const appliedRevision = baseline.appliedRevision === hash(current) ? hash(next)
      : baseline.appliedRevision === hash(baseline.generatedMarkdown) ? hash(generated)
        : baseline.appliedRevision;
    const afterBaseline: Baseline = { ...baseline, generatedMarkdown: generated, appliedRevision };
    const mutations = [
      { path: planned.path, before: current, after: next },
      { path: baselinePath, before: beforeBaseline, after: jsonText(afterBaseline) }
    ];
    const observationPath = statePath('observations', id), beforeObservation = diskText(root, observationPath);
    if (beforeObservation !== null) {
      const observation = JSON.parse(beforeObservation) as ObservationRecord;
      if (observation.id !== id) return { ...planned, status: 'blocked', reason: 'OBSERVATION_ID_MISMATCH' };
      if (observation.revision === planned.beforeRevision) mutations.push({ path: observationPath, before: beforeObservation, after: jsonText({ ...observation, revision: hash(next) }) });
    }
    const reviewPath = statePath('reviews', id), beforeReview = diskText(root, reviewPath);
    if (beforeReview !== null) {
      const review = JSON.parse(beforeReview) as ReviewRecord;
      if (review.documentId !== id) return { ...planned, status: 'blocked', reason: 'REVIEW_ID_MISMATCH' };
      if (review.revision === planned.beforeRevision) mutations.push({ path: reviewPath, before: beforeReview, after: jsonText({ ...review, revision: hash(next) }) });
    }
    applyTransaction(root, { schemaVersion: 1, id: `wiki-format-${randomUUID()}`, status: 'pending', mutations });
    return { ...planned, status: 'converted', afterRevision: hash(next) };
  });
}
