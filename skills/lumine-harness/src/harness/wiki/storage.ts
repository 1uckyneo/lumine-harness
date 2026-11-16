import { existsSync, lstatSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { atomicWrite, containedPath, hash, relativePath } from './files.ts';
import { validateNavigation } from './navigation-contract.ts';

export interface ObjectRef { $lumineObject: string; kind: 'text' | 'json'; bytes: number }
export interface EncodedStorageRecord { record: unknown; objects: Map<string, string> }
export interface StorageOptions { receipt?: boolean }
const OBJECT_ROOT = '.lumine/wiki-state/objects';
const STATE_ROOT = '.lumine/wiki-state';
const OBJECT_HASH = /^[a-f0-9]{64}$/;
const FULL_TEXT_FIELDS = new Set(['generatedMarkdown', 'currentMarkdown', 'markdown', 'before', 'after']);
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function isObjectRef(value: unknown): value is ObjectRef {
  return object(value) && Object.hasOwn(value, '$lumineObject');
}
export function objectPath(ref: ObjectRef): string {
  if (!OBJECT_HASH.test(ref.$lumineObject) || !['text', 'json'].includes(ref.kind) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) throw new Error('STORAGE_REFERENCE_INVALID');
  return `${OBJECT_ROOT}/${ref.$lumineObject}.txt`;
}
function safeFile(root: string, relative: string): string {
  const file = containedPath(root, relative, false);
  for (let current = file; current !== path.resolve(root); current = path.dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('STORAGE_SYMLINK_REFUSED');
  }
  return file;
}
export function readStorageObject(root: string, ref: ObjectRef): string {
  const file = safeFile(root, objectPath(ref));
  if (!existsSync(file) || !lstatSync(file).isFile()) throw new Error(`STORAGE_OBJECT_MISSING:${ref.$lumineObject}`);
  const bytes = readFileSync(file);
  if (bytes.length !== ref.bytes || hash(bytes) !== ref.$lumineObject) throw new Error(`STORAGE_OBJECT_CORRUPT:${ref.$lumineObject}`);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('STORAGE_OBJECT_ENCODING_INVALID');
  return text;
}
export function storageEnabled(root: string): boolean {
  const file = containedPath(root, '.lumine/project.json', false);
  if (!existsSync(file)) return false;
  const config = JSON.parse(readFileSync(file, 'utf8')) as { schemaVersion?: number };
  if (config.schemaVersion !== undefined && ![2, 3, 4].includes(config.schemaVersion)) throw new Error('STORAGE_PROJECT_SCHEMA_UNSUPPORTED');
  return config.schemaVersion === 3 || config.schemaVersion === 4;
}
function receipt(value: unknown): unknown {
  if (!object(value)) return value;
  if (value.storageReceipt === true) {
    if (!((value.schemaVersion === 2 && value.status === 'applied') || (value.schemaVersion === 1 && value.status === 'complete'))) throw new Error('STORAGE_RECEIPT_INVALID');
    return value;
  }
  if (value.schemaVersion === 2 && value.status === 'applied' && Array.isArray(value.units) && typeof value.id === 'string') {
    const decisions = Array.isArray(value.decisions) ? value.decisions : [];
    if (decisions.some(entry => object(entry) && ['defer', 'keep-current'].includes(String(entry.action)))) return value;
    const results = Array.isArray(value.results) ? value.results : [];
    if (value.units.some(unit => !object(unit) || !results.some(result => object(result) && result.id === unit.id && result.status === 'applied'))) throw new Error('STORAGE_PACKET_COMPLETION_INVALID');
    return {
      schemaVersion: 2, id: value.id, createdAt: value.createdAt, configFingerprint: value.configFingerprint,
      scope: value.scope, status: 'applied', storageReceipt: true,
      units: value.units.map(unit => { const item = unit as Record<string, unknown>; return { id: item.id, kind: item.kind, group: item.group, path: item.path }; }),
      results: results.map(result => { const { candidatePath: _path, ...entry } = result as Record<string, unknown>; return entry; }),
      ...(decisions.length ? { decisions } : {}),
      ...(value.normativeChanges ? { normativeChanges: value.normativeChanges } : {}),
      ...(value.retainedCandidates ? { retainedCandidates: value.retainedCandidates } : {}),
      audit: { recordHash: hash(JSON.stringify(value)), unitHashes: value.units.map(unit => ({ id: (unit as Record<string, unknown>).id, sha256: hash(JSON.stringify(unit)) })) }
    };
  }
  if (value.schemaVersion === 1 && value.status === 'complete' && typeof value.id === 'string' && Array.isArray(value.mutations)) {
    return { schemaVersion: 1, id: value.id, status: 'complete', storageReceipt: true, mutations: [], ...(value.candidateHashes ? { candidateHashes: value.candidateHashes } : {}),
      mutationHashes: value.mutations.map(item => {
        const mutation = item as { path: string; before: string | null; after: string | null };
        return { path: mutation.path, beforeHash: mutation.before === null ? null : hash(mutation.before), afterHash: mutation.after === null ? null : hash(mutation.after) };
      }) };
  }
  return value;
}
/** Pure conversion: callers can inventory exact output bytes before authorizing a migration. */
export function encodeStorageRecord(value: unknown, options: StorageOptions = {}): EncodedStorageRecord {
  if (object(value) && value.schemaVersion === 3 && value.kind === 'lumine-wiki-state') throw new Error('STORAGE_ENCODE_ALREADY_STORED');
  const objects = new Map<string, string>();
  const put = (content: string, kind: ObjectRef['kind']): ObjectRef => {
    const ref: ObjectRef = { $lumineObject: hash(content), kind, bytes: Buffer.byteLength(content) };
    objects.set(objectPath(ref), content); return ref;
  };
  const visit = (entry: unknown, key = ''): unknown => {
    if (typeof entry === 'string' && FULL_TEXT_FIELDS.has(key)) return put(entry, 'text');
    if (Array.isArray(entry)) return entry.map(item => visit(item));
    if (!object(entry)) return entry;
    if (isObjectRef(entry)) throw new Error('STORAGE_UNRESOLVED_INPUT_REFERENCE');
    if (key === 'sources' && object(entry.fingerprints) && object(entry.scopeFingerprints) && object(entry.files) && Array.isArray(entry.missing)) return put(JSON.stringify(entry), 'json');
    return Object.fromEntries(Object.entries(entry).map(([name, item]) => [name, visit(item, name)]));
  };
  const prepared = options.receipt ? receipt(value) : value;
  return { record: { schemaVersion: 3, kind: 'lumine-wiki-state', value: visit(prepared) }, objects };
}
export function decodeStorageRecord<T>(root: string, value: unknown, resolve: (ref: ObjectRef) => string = ref => readStorageObject(root, ref)): T {
  if (!object(value) || value.kind !== 'lumine-wiki-state') return value as T;
  if (value.schemaVersion !== 3 || !Object.hasOwn(value, 'value')) throw new Error('STORAGE_RECORD_INVALID');
  const visit = (entry: unknown, depth: number): unknown => {
    if (depth > 100) throw new Error('STORAGE_REFERENCE_DEPTH');
    if (isObjectRef(entry)) {
      objectPath(entry);
      const content = resolve(entry);
      if (Buffer.byteLength(content) !== entry.bytes || hash(content) !== entry.$lumineObject) throw new Error('STORAGE_OBJECT_CORRUPT');
      return entry.kind === 'json' ? visit(JSON.parse(content), depth + 1) : content;
    }
    if (Array.isArray(entry)) return entry.map(item => visit(item, depth + 1));
    if (object(entry)) return Object.fromEntries(Object.entries(entry).map(([name, item]) => [name, visit(item, depth + 1)]));
    return entry;
  };
  return visit(value.value, 0) as T;
}
function relative(root: string, file: string): string { return relativePath(path.isAbsolute(file) ? path.relative(root, file).split(path.sep).join('/') : file); }
export function readStorageRecord<T>(root: string, file: string, fallback: T): T {
  const absolute = safeFile(root, relative(root, file));
  return existsSync(absolute) ? decodeStorageRecord<T>(root, JSON.parse(readFileSync(absolute, 'utf8'))) : fallback;
}
export function persistStorageObjects(root: string, objects: Map<string, string>): void {
  for (const [relative, content] of objects) {
    const expected = `${OBJECT_ROOT}/${hash(content)}.txt`;
    if (relative !== expected) throw new Error('STORAGE_OBJECT_PATH_INVALID');
    const file = safeFile(root, relative);
    if (existsSync(file)) { if (readFileSync(file, 'utf8') !== content) throw new Error('STORAGE_OBJECT_CORRUPT'); }
    else atomicWrite(file, content);
  }
}
/** An interrupted storage migration must be resumed or rolled back before normal writers. */
export function assertStorageWritable(root: string): void {
  const directory = safeFile(root, '.lumine-migrations');
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.name.startsWith('wiki-storage-')) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('STORAGE_RECOVERY_DIRECTORY_INVALID');
    const file = safeFile(root, `.lumine-migrations/${entry.name}/journal.json`);
    if (!existsSync(file)) throw new Error(`STORAGE_RECOVERY_REQUIRED:${entry.name}`);
    const journal = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (journal.schemaVersion !== 1 || journal.kind !== 'lumine-wiki-storage-recovery' || journal.operationId !== entry.name) throw new Error('STORAGE_RECOVERY_MANIFEST_INVALID');
    if (!['complete', 'rolled_back'].includes(String(journal.status))) throw new Error(`STORAGE_RECOVERY_REQUIRED:${entry.name}`);
  }
}

/** Objects are immutable and durable before a state pointer can be published. Caller holds the Wiki lock. */
export function storageRecordText(root: string, value: unknown, options: StorageOptions = {}): string {
  assertStorageWritable(root);
  if (!storageEnabled(root)) return json(value);
  const encoded = encodeStorageRecord(value, options);
  persistStorageObjects(root, encoded.objects); return json(encoded.record);
}
export function writeStorageRecord(root: string, file: string, value: unknown, options: StorageOptions = {}): void {
  const content = storageRecordText(root, value, options), target = safeFile(root, relative(root, file));
  if (!existsSync(target) || readFileSync(target, 'utf8') !== content) atomicWrite(target, content);
}
/** Return direct strong references only; audit hashes deliberately do not match this type. */
export function collectStorageReferences(value: unknown): ObjectRef[] {
  const result: ObjectRef[] = [];
  const visit = (entry: unknown, depth: number): void => {
    if (depth > 100) throw new Error('STORAGE_REFERENCE_DEPTH');
    if (isObjectRef(entry)) { objectPath(entry); result.push(entry); return; }
    if (Array.isArray(entry)) entry.forEach(item => visit(item, depth + 1));
    else if (object(entry)) Object.values(entry).forEach(item => visit(item, depth + 1));
    else if (typeof entry === 'string' && /^\s*[\[{]/.test(entry)) { try { const parsed: unknown = JSON.parse(entry); visit(parsed, depth + 1); } catch (error) { if (error instanceof Error && error.message.startsWith('STORAGE_')) throw error; } }
  };
  visit(value, 0); return result;
}
export interface StorageObjectInventory { objects: { path: string; bytes: number; sha256: string; reachable: boolean }[]; reachable: string[]; unreferenced: string[]; issues: string[] }
function isLegacyTransaction(value: any): boolean { return value?.schemaVersion === undefined && typeof value.id === 'string' && value.status === 'complete' && typeof value.path === 'string' && typeof value.content === 'string' && value.baseline?.schemaVersion === 2 && typeof value.previousRevision === 'string'; }
export function validateStorageRecord(relative: string, value: any): void {
  const fail = (): never => { throw new Error(`STORAGE_RECORD_UNKNOWN: ${relative}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const local = relative.slice(STATE_ROOT.length + 1);
  const name = path.posix.basename(local, '.json');
  if (/^(?:documents|observations|updates\/[^/]+\/candidates)\//.test(local) && (typeof value.id !== 'string' || name !== hash(value.id))) fail();
  if (local.startsWith('reviews/') && (typeof value.documentId !== 'string' || name !== hash(value.documentId))) fail();
  if (local.startsWith('transactions/') && name !== value.id) fail();
  if (/^updates\/[^/]+\/packet\.json$/.test(local) && local.split('/')[1] !== value.id) fail();
  const sourceSnapshot = (source: any): boolean => object(source) && ['fingerprints', 'scopeFingerprints', 'files'].every(key => object(source[key]) && Object.values(source[key]).every(item => typeof item === 'string' || (key === 'fingerprints' && item === null))) && Array.isArray(source.missing) && source.missing.every(item => typeof item === 'string');
  if (/^documents\/[a-f0-9]{64}\.json$/.test(local)) {
    if (value.schemaVersion !== 2 || typeof value.id !== 'string' || typeof value.generatedMarkdown !== 'string' || typeof value.path !== 'string' || !value.path.endsWith('.md') || relativePath(value.path) !== value.path || !Number.isSafeInteger(value.generation) || value.generation < 0 || typeof value.appliedRevision !== 'string' || !OBJECT_HASH.test(value.appliedRevision) || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) || !sourceSnapshot(value.sources)) fail();
  }
  else if (/^observations\/[a-f0-9]{64}\.json$/.test(local)) { if (value.schemaVersion !== undefined || typeof value.id !== 'string' || !value.sources || typeof value.checkedAt !== 'string') fail(); }
  else if (/^reviews\/[a-f0-9]{64}\.json$/.test(local)) { if (value.schemaVersion !== undefined || typeof value.documentId !== 'string' || typeof value.reviewedAt !== 'string') fail(); }
  else if (/^updates\/[a-zA-Z0-9_-]+\/packet\.json$/.test(local)) { if (value.schemaVersion !== 2 || typeof value.id !== 'string' || !['prepared', 'partial', 'applied'].includes(value.status) || !Array.isArray(value.units) || !Array.isArray(value.results)) fail(); }
  else if (/^updates\/[a-zA-Z0-9_-]+\/candidates\/[a-f0-9]{64}\.json$/.test(local)) { if (typeof value.id !== 'string' || typeof value.markdown !== 'string') fail(); }
  else if (/^transactions\/[a-zA-Z0-9_-]+\.json$/.test(local)) { if (!isLegacyTransaction(value) && (value.schemaVersion !== 1 || typeof value.id !== 'string' || !['pending', 'conflict', 'complete'].includes(value.status) || !Array.isArray(value.mutations))) fail(); }
  else if (/^document-operations\/[a-zA-Z0-9_-]+\.json$/.test(local)) { if (value.schemaVersion !== 1) fail(); }
  else if (local === 'format.json') { if (value.schemaVersion !== 1 || value.knowledgeFormat !== 3) fail(); }
  else if (local === 'storage.json') { if (value.schemaVersion !== 1 || value.storageVersion !== 3 || value.objectAlgorithm !== 'sha256') fail(); }
  else if (local === 'coverage.json') { if (value.schemaVersion !== 1 || !Array.isArray(value.topics)) fail(); }
  else if (local === 'navigation.json') validateNavigation(value);
  else if (local === 'source-dispositions.json') { if (value.schemaVersion !== 1) fail(); }
  else if (local === 'document-aliases.json') { if (value.schemaVersion !== undefined && ![1, 2].includes(value.schemaVersion)) fail(); }
  else fail();
}

/** Read-only mark phase. Malformed records and missing objects prevent any sweep. */
export function inspectStorageObjects(root: string, records?: unknown[]): StorageObjectInventory {
  const issues: string[] = [], roots = records ? [...records] : [], objects: StorageObjectInventory['objects'] = [];
  const directory = containedPath(root, STATE_ROOT, false);
  const walk = (folder: string): void => {
    if (!existsSync(folder)) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name), rel = path.relative(root, file).split(path.sep).join('/');
      if (entry.isSymbolicLink()) { issues.push(`STORAGE_SYMLINK_REFUSED:${rel}`); continue; }
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile()) { issues.push(`STORAGE_FILE_TYPE_INVALID:${rel}`); continue; }
      if (rel.startsWith(OBJECT_ROOT + '/')) {
        const body = readFileSync(file), sha256 = hash(body);
        if (rel !== `${OBJECT_ROOT}/${sha256}.txt`) issues.push(`STORAGE_OBJECT_CORRUPT:${rel}`);
        objects.push({ path: rel, bytes: body.length, sha256, reachable: false });
      } else if (!records && entry.name.endsWith('.json')) {
        try { const raw: unknown = JSON.parse(readFileSync(file, 'utf8')); validateStorageRecord(rel, decodeStorageRecord(root, raw)); roots.push(raw); } catch (error) { issues.push(`${error instanceof Error ? error.message : 'STORAGE_RECORD_INVALID'}:${rel}`); }
      } else if (!records && !/^\.lumine\/wiki-state\/updates\/[^/]+\/candidates\/[a-f0-9]{64}\.md$/.test(rel)) issues.push(`STORAGE_RECORD_UNKNOWN:${rel}`);
    }
  };
  walk(directory);
  const visited = new Set<string>(), reach = new Set<string>();
  const trace = (value: unknown): void => {
    for (const ref of collectStorageReferences(value)) {
      const p = objectPath(ref); reach.add(p);
      // Both kind and bytes are validated, even if another reference has the same digest.
      const content = readStorageObject(root, ref);
      const key = `${ref.$lumineObject}:${ref.kind}:${ref.bytes}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (ref.kind === 'json') trace(JSON.parse(content));
      else if (/^\s*[\[{]/.test(content)) { try { trace(JSON.parse(content)); } catch (error) { if (error instanceof Error && error.message.startsWith('STORAGE_')) throw error; } }
    }
  };
  for (const value of roots) try { trace(value); } catch (error) { issues.push(error instanceof Error ? error.message : 'STORAGE_REFERENCE_INVALID'); }
  for (const item of objects) item.reachable = reach.has(item.path);
  return { objects, reachable: [...reach].sort(), unreferenced: objects.filter(item => !item.reachable).map(item => item.path).sort(), issues: [...new Set(issues)] };
}
/** Caller must hold the shared writer lock; GC is a no-op unless explicitly applied. */
export function gcStorageObjects(root: string, options: { dryRun?: boolean } = {}): StorageObjectInventory {
  if (options.dryRun === false) assertStorageWritable(root);
  const result = inspectStorageObjects(root);
  if (result.issues.length) throw new Error(`STORAGE_GC_BLOCKED:${result.issues.join(',')}`);
  if (options.dryRun === false) {
    if (!storageEnabled(root)) throw new Error('STORAGE_NOT_ENABLED');
    for (const relative of result.unreferenced) unlinkSync(safeFile(root, relative));
  }
  return result;
}
