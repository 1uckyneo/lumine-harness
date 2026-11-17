import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { decodeStorageRecord, validateStorageRecord, writeStorageRecord } from './storage.ts';
import { atomicWrite, containedPath, hash, wikiConfig } from './files.ts';

export interface Mutation { path: string; before: string | null; after: string | null }
export interface WikiTransaction { schemaVersion: 1; id: string; status: 'pending' | 'complete' | 'conflict'; mutations: Mutation[]; candidateHashes?: Record<string, string>; error?: string }
const JOURNALS = '.lumine/wiki-state/transactions';
const journalCache = new Map<string, { version: string; entries: { file: string; value: WikiTransaction }[] }>();
interface JournalSnapshot { directory: string; names: string[]; version: string }
interface ReadScope { snapshot: JournalSnapshot; journals?: { file: string; value: WikiTransaction }[]; texts: Map<string, string | null> }
const readScopes = new Map<string, ReadScope>();
function journalSnapshot(root: string): JournalSnapshot {
  const directory = containedPath(root, JOURNALS, false);
  if (!existsSync(directory)) return { directory, names: [], version: 'absent' };
  const directoryStat = statSync(directory, { bigint: true });
  const names = readdirSync(directory).filter(name => name.endsWith('.json')).sort();
  const records = names.map(name => {
    const stat = statSync(path.join(directory, name), { bigint: true });
    return `${name}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.ino}:${stat.size}`;
  });
  return { directory, names, version: `${directoryStat.ino}:${directoryStat.mtimeNs}:${directoryStat.ctimeNs}|${records.join('|')}` };
}
/** Synchronous, side-effect-free read callbacks may repeat. A changed transaction view is never returned. */
export function withWikiReadScope<T>(root: string, read: () => T): T {
  const key = path.resolve(root);
  if (readScopes.has(key)) return read();
  for (let attempt = 0; attempt < 3; attempt++) {
    let snapshot: JournalSnapshot;
    try { snapshot = journalSnapshot(root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    let value: T | undefined, failure: unknown, failed = false;
    readScopes.set(key, { snapshot, texts: new Map() });
    try { value = read(); }
    catch (error) { failure = error; failed = true; }
    finally { readScopes.delete(key); }
    let stable = false;
    try { stable = snapshot.version === journalSnapshot(root).version; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!stable) { journalCache.delete(snapshot.directory); continue; }
    if (failed) throw failure;
    return value as T;
  }
  throw new Error('WIKI_READ_CONCURRENT_MODIFICATION');
}
export function diskText(root: string, relative: string): string | null { const file = containedPath(root, relative, false); return existsSync(file) ? readFileSync(file, 'utf8') : null; }
function journals(root: string): { file: string; value: WikiTransaction }[] {
  const scope = readScopes.get(path.resolve(root));
  if (scope?.journals) return scope.journals;
  const { directory, names, version } = scope?.snapshot ?? journalSnapshot(root);
  const cached = journalCache.get(directory); if (cached?.version === version) { if (scope) scope.journals = cached.entries; return cached.entries; }
  const entries = names.flatMap((name) => {
    const file = path.join(directory, name), raw = JSON.parse(readFileSync(file, 'utf8'));
    // A completed receipt is audit history. Its old objects are not part of the current read view.
    const header = raw?.kind === 'lumine-wiki-state' && raw.schemaVersion === 3 ? raw.value : raw;
    if (header?.schemaVersion === 1 && header.status === 'complete') {
      validateStorageRecord(`${JOURNALS}/${name}`, header);
      return [];
    }
    const value = decodeStorageRecord<WikiTransaction>(root, raw);
    // The pre-transaction format has a single document receipt rather than
    // mutations. Accept only the legacy shape already recognized by storage;
    // completed history must never be replayed or treated as an active journal.
    if (value?.schemaVersion === undefined && value?.status === 'complete') {
      validateStorageRecord(`${JOURNALS}/${name}`, value);
      return [];
    }
    if (value?.schemaVersion !== 1 || !['pending', 'conflict'].includes(value.status) || !Array.isArray(value.mutations)) throw new Error('TRANSACTION_RECORD_INVALID');
    return [{ file, value }];
  });
  if (scope) scope.journals = entries;
  journalCache.set(directory, { version, entries }); return entries;
}
/** Readers see the previous complete group, including after a process stops between writes. */
export function visibleText(root: string, relative: string): string | null {
  const scope = readScopes.get(path.resolve(root));
  if (scope?.texts.has(relative)) return scope.texts.get(relative)!;
  for (const { value } of journals(root)) {
    const mutation = value.mutations.find((entry) => entry.path === relative);
    if (mutation) { scope?.texts.set(relative, mutation.before); return mutation.before; }
  }
  const text = diskText(root, relative); scope?.texts.set(relative, text); return text;
}
export function visibleJson<T>(root: string, relative: string, fallback: T): T { const source = visibleText(root, relative); return source === null ? fallback : decodeStorageRecord<T>(root, JSON.parse(source)); }
/** Include old paths removed during a pending group when enumerating its previous complete view. */
export function pendingDocumentPaths(root: string): string[] {
  const prefix = `${wikiConfig(root).root}/`;
  return [...new Set(journals(root).flatMap(({ value }) => value.mutations
    .filter(mutation => mutation.before !== null && mutation.path.startsWith(prefix) && mutation.path.endsWith('.md'))
    .map(mutation => mutation.path)))];
}
function allowed(root: string, relative: string): boolean {
  const wikiRoot = wikiConfig(root).root;
  return (relative.startsWith(`${wikiRoot}/`) && relative.endsWith('.md')) || /^\.lumine\/wiki-state\/(?:documents|observations|reviews)\/[a-f0-9]{64}\.json$/.test(relative) || ['.lumine/wiki-state/coverage.json', '.lumine/wiki-state/document-aliases.json', '.lumine/wiki-state/navigation.json'].includes(relative);
}
export function applyTransaction(root: string, transaction: WikiTransaction, failAfter?: number): void {
  if (readScopes.has(path.resolve(root))) throw new Error('WIKI_READ_SCOPE_WRITE_FORBIDDEN');
  const journal = containedPath(root, `${JOURNALS}/${transaction.id}.json`, false);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(transaction.id)) throw new Error('TRANSACTION_ID_INVALID');
  const paths = new Set<string>();
  for (const mutation of transaction.mutations) {
    if (!allowed(root, mutation.path) || paths.has(mutation.path)) throw new Error('TRANSACTION_PATH_INVALID');
    paths.add(mutation.path);
    const current = diskText(root, mutation.path);
    if (current !== mutation.before && current !== mutation.after) {
      transaction.status = 'conflict'; transaction.error = `TRANSACTION_DOCUMENT_CONFLICT:${mutation.path}`; writeStorageRecord(root, journal, transaction); throw new Error(transaction.error);
    }
  }
  writeStorageRecord(root, journal, transaction);
  let writes = 0;
  for (const mutation of transaction.mutations) {
    if (diskText(root, mutation.path) !== mutation.after) {
      if (mutation.after === null) { const target = containedPath(root, mutation.path, false); if (existsSync(target)) unlinkSync(target); }
      else atomicWrite(containedPath(root, mutation.path, false), mutation.after);
      if (++writes === failAfter) throw new Error('TRANSACTION_INJECTED_INTERRUPTION');
    }
  }
  transaction.status = 'complete'; delete transaction.error; writeStorageRecord(root, journal, transaction, { receipt: true });
}
export function recoverTransactions(root: string): string[] {
  const recovered: string[] = [];
  for (const { value } of journals(root)) {
    applyTransaction(root, value); recovered.push(value.id);
  }
  return recovered;
}
export function pendingTransactions(root: string): string[] { return journals(root).map(({ value }) => value.id); }
export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
export const statePath = (kind: 'documents' | 'observations' | 'reviews', id: string): string => `.lumine/wiki-state/${kind}/${hash(id)}.json`;
