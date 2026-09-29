import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite, containedPath, hash, readJson, wikiConfig, writeJson } from './files.ts';

export interface Mutation { path: string; before: string | null; after: string | null }
export interface WikiTransaction { schemaVersion: 1; id: string; status: 'pending' | 'complete' | 'conflict'; mutations: Mutation[]; error?: string }
const JOURNALS = '.lumine/wiki-state/transactions';
const journalCache = new Map<string, { version: string; entries: { file: string; value: WikiTransaction }[] }>();
export function diskText(root: string, relative: string): string | null { const file = containedPath(root, relative, false); return existsSync(file) ? readFileSync(file, 'utf8') : null; }
function journals(root: string): { file: string; value: WikiTransaction }[] {
  const directory = containedPath(root, JOURNALS, false);
  if (!existsSync(directory)) return [];
  const version = statSync(directory, { bigint: true }).mtimeNs.toString();
  const cached = journalCache.get(directory); if (cached?.version === version) return cached.entries;
  const entries = readdirSync(directory).filter((name) => name.endsWith('.json')).map((name) => ({ file: path.join(directory, name), value: readJson<WikiTransaction>(path.join(directory, name), null as never) })).filter((entry) => entry.value?.schemaVersion === 1 && entry.value.status !== 'complete');
  journalCache.set(directory, { version, entries }); return entries;
}
/** Readers see the previous complete group, including after a process stops between writes. */
export function visibleText(root: string, relative: string): string | null {
  for (const { value } of journals(root)) {
    const mutation = value.mutations.find((entry) => entry.path === relative);
    if (mutation) return mutation.before;
  }
  return diskText(root, relative);
}
export function visibleJson<T>(root: string, relative: string, fallback: T): T { const source = visibleText(root, relative); return source === null ? fallback : JSON.parse(source) as T; }
function allowed(root: string, relative: string): boolean {
  const wikiRoot = wikiConfig(root).root;
  return (relative.startsWith(`${wikiRoot}/`) && relative.endsWith('.md')) || /^\.lumine\/wiki-state\/(?:documents|observations|reviews)\/[a-f0-9]{64}\.json$/.test(relative) || ['.lumine/wiki-state/coverage.json', '.lumine/wiki-state/document-aliases.json'].includes(relative);
}
export function applyTransaction(root: string, transaction: WikiTransaction, failAfter?: number): void {
  const journal = containedPath(root, `${JOURNALS}/${transaction.id}.json`, false);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(transaction.id)) throw new Error('TRANSACTION_ID_INVALID');
  const paths = new Set<string>();
  for (const mutation of transaction.mutations) {
    if (!allowed(root, mutation.path) || paths.has(mutation.path)) throw new Error('TRANSACTION_PATH_INVALID');
    paths.add(mutation.path);
    const current = diskText(root, mutation.path);
    if (current !== mutation.before && current !== mutation.after) {
      transaction.status = 'conflict'; transaction.error = `TRANSACTION_DOCUMENT_CONFLICT:${mutation.path}`; writeJson(journal, transaction); throw new Error(transaction.error);
    }
  }
  writeJson(journal, transaction);
  let writes = 0;
  for (const mutation of transaction.mutations) {
    if (diskText(root, mutation.path) !== mutation.after) {
      if (mutation.after === null) { const target = containedPath(root, mutation.path, false); if (existsSync(target)) unlinkSync(target); }
      else atomicWrite(containedPath(root, mutation.path, false), mutation.after);
      if (++writes === failAfter) throw new Error('TRANSACTION_INJECTED_INTERRUPTION');
    }
  }
  transaction.status = 'complete'; delete transaction.error; writeJson(journal, transaction);
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
