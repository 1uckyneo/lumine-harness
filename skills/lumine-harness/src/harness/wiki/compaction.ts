/** Explicit, recoverable storage conversion. Reads never migrate project assets. */
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { containedPath, hash, withWikiLock } from './files.ts';
import { collectStorageReferences, decodeStorageRecord, encodeStorageRecord, validateStorageRecord, type ObjectRef } from './storage.ts';

const STATE = '.lumine/wiki-state';
const CONFIG = '.lumine/project.json';
const MARKER = `${STATE}/storage.json`;
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const marker = json({ schemaVersion: 1, storageVersion: 3, objectAlgorithm: 'sha256' });
export interface StorageFile { path: string; sha256: string; bytes: number; mode: number }
export interface StorageIssue { path: string; code: string; message: string }
export interface StorageCheck { ok: boolean; issues: StorageIssue[]; files: number; objects: number; referencedObjects: number }
export interface StorageInspection extends StorageCheck {
  storageVersion: number; bytes: number; categories: Record<string, { files: number; bytes: number }>;
  packetStates: Record<string, number>; recoveryBytes: number; gitHistoryBytes: number | null;
}
export interface CompactionChange { path: string; before: string | null; after: string | null; bytesBefore: number; bytesAfter: number; mode: number; reason: string }
export interface ProtectedStorage { path: string; reason: string; status?: string; identity?: string; sha256: string }
export interface CompactionPlan {
  schemaVersion: 1; kind: 'lumine-wiki-storage-compaction'; operationId: string; projectIdentity: string; runtimeFingerprint: string;
  inputFingerprint: string; inventory: StorageFile[]; changes: CompactionChange[]; protected: ProtectedStorage[];
  beforeBytes: number; afterBytes: number; savedBytes: number; reduction: number; sourceStorageVersion: number; targetStorageVersion: 3;
}
export interface CompactionResult { operationId: string; status: 'complete' | 'rolled_back'; backupDirectory: string; beforeBytes: number; afterBytes: number; changedFiles: number }
export interface CompactionOptions { interruptAfterStep?: number; onStep?: (step: string) => void }
interface RecoveryJournal { schemaVersion: 1; kind: 'lumine-wiki-storage-recovery'; operationId: string; planHash: string; status: 'preparing' | 'ready' | 'applying' | 'complete' | 'rolling_back' | 'rolled_back' }

function safe(root: string, relative: string): string {
  const target = containedPath(root, relative, false);
  let current = path.resolve(root);
  for (const component of path.relative(current, target).split(path.sep)) {
    current = path.join(current, component);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`STORAGE_SYMLINK_REFUSED: ${relative}`);
  }
  return target;
}
function walk(root: string, relative: string): StorageFile[] {
  const file = safe(root, relative); if (!existsSync(file)) return [];
  const stat = lstatSync(file);
  if (stat.isFile()) { const bytes = readFileSync(file); return [{ path: relative, sha256: hash(bytes), bytes: bytes.length, mode: stat.mode & 0o777 }]; }
  if (!stat.isDirectory()) throw new Error(`STORAGE_FILE_TYPE_INVALID: ${relative}`);
  return readdirSync(file).sort().flatMap((name) => walk(root, `${relative}/${name}`));
}
function read(root: string, relative: string): string { const bytes = readFileSync(safe(root, relative)); const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) throw new Error(`STORAGE_ENCODING_INVALID: ${relative}`); return text; }
function readObject(root: string, ref: ObjectRef, virtual?: Map<string, string>): string {
  if (!/^[a-f0-9]{64}$/.test(ref.$lumineObject) || !['json', 'text'].includes(ref.kind) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) throw new Error('STORAGE_REFERENCE_INVALID');
  const relative = `${STATE}/objects/${ref.$lumineObject}.txt`;
  const content = virtual?.get(relative) ?? read(root, relative);
  if (!/^[a-f0-9]{64}$/.test(ref.$lumineObject) || !['json', 'text'].includes(ref.kind) || hash(content) !== ref.$lumineObject || Buffer.byteLength(content) !== ref.bytes) throw new Error(`STORAGE_OBJECT_CORRUPT: ${relative}`);
  return content;
}
function inventory(root: string): StorageFile[] {
  const config = JSON.parse(read(root, CONFIG));
  if (![2, 3].includes(config.schemaVersion) || config.workflowVersion !== 2) throw new Error('STORAGE_PROJECT_VERSION_UNSUPPORTED');
  const wikiRoot = config.wiki?.root ?? 'docs/repo-wiki';
  return [...walk(root, CONFIG), ...walk(root, '.lumine/root.json'), ...walk(root, '.gitignore'), ...walk(root, STATE), ...walk(root, wikiRoot)].sort((a, b) => a.path.localeCompare(b.path));
}
function identity(root: string): string {
  const manifest = JSON.parse(read(root, '.lumine/root.json'));
  return hash(json({ root: realpathSync(root), projectId: manifest.projectId ?? null }));
}
function runtimeFingerprint(): string {
  return hash(readFileSync(fileURLToPath(import.meta.url)).toString() + readFileSync(fileURLToPath(new URL('./storage' + path.extname(fileURLToPath(import.meta.url)), import.meta.url))).toString());
}
function isLegacyTransaction(value: any): boolean { return value?.schemaVersion === undefined && typeof value.id === 'string' && value.status === 'complete' && typeof value.path === 'string' && typeof value.content === 'string' && value.baseline?.schemaVersion === 2 && typeof value.previousRevision === 'string'; }
function referenceGraph(root: string, records: Map<string, string>, objects: Map<string, string>): Set<string> {
  const reachable = new Set<string>();
  const visit = (value: unknown): void => {
    for (const ref of collectStorageReferences(value)) {
      const relative = `${STATE}/objects/${ref.$lumineObject}.txt`;
      const content = readObject(root, ref, objects);
      if (reachable.has(relative)) continue;
      reachable.add(relative);
      // Transaction text objects may contain a stored baseline with further references.
      try { visit(JSON.parse(content)); } catch (error) { if (error instanceof SyntaxError) { if (ref.kind === 'json') throw error; } else throw error; }
    }
  };
  for (const [relative, content] of records) if (relative.endsWith('.json')) visit(JSON.parse(content));
  return reachable;
}
export function checkStorage(root: string): StorageCheck {
  const issues: StorageIssue[] = [], records = new Map<string, string>(), objects = new Map<string, string>();
  let files: StorageFile[] = [];
  try { files = walk(root, STATE); } catch (error) { return { ok: false, issues: [{ path: STATE, code: 'STORAGE_INVENTORY_INVALID', message: String(error) }], files: 0, objects: 0, referencedObjects: 0 }; }
  for (const file of files) {
    try {
      const content = read(root, file.path);
      if (file.path.startsWith(`${STATE}/objects/`)) {
        if (!/^\.lumine\/wiki-state\/objects\/[a-f0-9]{64}\.txt$/.test(file.path) || path.basename(file.path, '.txt') !== hash(content)) throw new Error('STORAGE_OBJECT_CORRUPT');
        objects.set(file.path, content); continue;
      }
      if (file.path.endsWith('.md') && /^\.lumine\/wiki-state\/updates\/[^/]+\/candidates\/[a-f0-9]{64}\.md$/.test(file.path)) continue;
      const raw = JSON.parse(content); const value = decodeStorageRecord<any>(root, raw);
      validateStorageRecord(file.path, value); records.set(file.path, content);
    } catch (error) { issues.push({ path: file.path, code: 'STORAGE_INVALID', message: error instanceof Error ? error.message : String(error) }); }
  }
  let referencedObjects = 0;
  try { referencedObjects = referenceGraph(root, records, objects).size; } catch (error) { issues.push({ path: STATE, code: 'STORAGE_REFERENCE_INVALID', message: error instanceof Error ? error.message : String(error) }); }
  // Every duplicate candidate must have a matching authoritative record. Unknown loose text is protected by refusal.
  for (const file of files.filter((item) => item.path.endsWith('.md'))) {
    try {
      const candidatePath = file.path.slice(0, -3) + '.json';
      if (!records.has(candidatePath)) {
        const packetPath = file.path.replace(/\/candidates\/[^/]+$/, '/packet.json');
        const packet = records.has(packetPath) ? decodeStorageRecord<any>(root, JSON.parse(records.get(packetPath)!)) : null;
        if (!packet?.units?.some((unit: any) => typeof unit.id === 'string' && hash(unit.id) === path.basename(file.path, '.md'))) throw new Error('STORAGE_CANDIDATE_RECORD_MISSING');
        continue;
      }
      const candidate = decodeStorageRecord<any>(root, JSON.parse(records.get(candidatePath)!));
      if (candidate.markdown !== read(root, file.path)) throw new Error('STORAGE_CANDIDATE_DUPLICATE_DIVERGED');
    } catch (error) { issues.push({ path: file.path, code: 'STORAGE_CANDIDATE_PROTECTED', message: String(error) }); }
  }
  return { ok: issues.length === 0, issues, files: files.length, objects: objects.size, referencedObjects };
}
function folderBytes(root: string, relative: string): number { return walk(root, relative).reduce((total, file) => total + file.bytes, 0); }
export function inspectStorage(root: string): StorageInspection {
  const check = checkStorage(root), files = walk(root, STATE), categories: StorageInspection['categories'] = {}, packetStates: Record<string, number> = {};
  for (const file of files) {
    const category = file.path.slice(STATE.length + 1).split('/')[0];
    const stats = categories[category] ??= { files: 0, bytes: 0 }; stats.files++; stats.bytes += file.bytes;
    if (file.path.endsWith('/packet.json')) { try { const packet = decodeStorageRecord<any>(root, JSON.parse(read(root, file.path))); packetStates[packet.status] = (packetStates[packet.status] ?? 0) + 1; } catch { /* reported by check */ } }
  }
  let gitHistoryBytes: number | null = null;
  try { const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const absolute = path.resolve(root, gitDir, 'objects');
    const count = (folder: string): number => existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).reduce((sum, entry) => { const file = path.join(folder, entry.name); return sum + (entry.isDirectory() ? count(file) : entry.isFile() ? lstatSync(file).size : 0); }, 0) : 0;
    gitHistoryBytes = count(absolute);
  } catch { /* Non-Git projects use the same independent recovery protocol. */ }
  return { ...check, storageVersion: existsSync(safe(root, MARKER)) ? 3 : 2, bytes: files.reduce((sum, file) => sum + file.bytes, 0), categories, packetStates, recoveryBytes: folderBytes(root, '.lumine-migrations'), gitHistoryBytes };
}
interface Conversion { plan: CompactionPlan; output: Map<string, string> }
function conversion(root: string, operationId = `wiki-storage-${randomUUID()}`): Conversion {
  const checked = checkStorage(root); if (!checked.ok) throw new Error(`STORAGE_CHECK_FAILED: ${json(checked.issues)}`);
  const inputs = inventory(root), pinned = new Set<string>(), output = new Map<string, string>(), objects = new Map<string, string>(), protectedEntries: ProtectedStorage[] = [], packets = new Map<string, any>(), transactions = new Map<string, any>(), retained = new Map<string, any[]>();
  for (const entry of inputs.filter((file) => file.path.startsWith(`${STATE}/`))) {
    if (entry.path.startsWith(`${STATE}/objects/`)) { objects.set(entry.path, read(root, entry.path)); continue; }
    if (entry.path.includes('/transactions/')) { const transaction = decodeStorageRecord<any>(root, JSON.parse(read(root, entry.path))); transactions.set(transaction.id, transaction); if (transaction.status !== 'complete') for (const mutation of transaction.mutations ?? []) pinned.add(mutation.path); }
    if (entry.path.endsWith('/packet.json')) packets.set(path.posix.dirname(entry.path), decodeStorageRecord<any>(root, JSON.parse(read(root, entry.path))));
  }
  const consumed = (packet: any, candidate: any): boolean => {
    if (packet.status !== 'applied' || packet.decisions?.some((decision: any) => ['defer', 'keep-current'].includes(decision.action))) return false;
    if (packet.retainedCandidates?.some((entry: any) => entry.id === candidate.id)) return false;
    const unit = packet.units.find((entry: any) => entry.id === candidate.id);
    if (!unit || !packet.results.some((entry: any) => entry.id === candidate.id && entry.status === 'applied')) return false;
    const applied = packet.results.find((entry: any) => entry.id === candidate.id && entry.status === 'applied');
    if (applied?.candidateHash === hash(JSON.stringify(candidate))) return true;
    const transaction = transactions.get(packet.id + '-' + hash(unit.group ?? unit.id).slice(0, 12));
    if (transaction?.status !== 'complete') return false;
    if (transaction.candidateHashes?.[candidate.id] === hash(JSON.stringify(candidate))) return true;
    if (candidate.review) return false;
    return transaction.mutations.some((mutation: any) => {
      if (!mutation.path.startsWith(STATE + '/documents/') || typeof mutation.after !== 'string') return false;
      try { const baseline = decodeStorageRecord<any>(root, JSON.parse(mutation.after)); return baseline.id === candidate.id && baseline.generatedMarkdown === candidate.markdown; } catch { return false; }
    });
  };
  const candidateData = new Map<string, { packet: any; candidate: any; keep: boolean; recordPath: string }>();
  for (const entry of inputs) {
    const match = /^(.*\/updates\/[^/]+)\/candidates\/([^/]+)\.(json|md)$/.exec(entry.path); if (!match) continue;
    const packet = packets.get(match[1]); if (!packet) throw new Error('STORAGE_CANDIDATE_PACKET_MISSING: ' + entry.path);
    const recordPath = match[1] + '/candidates/' + match[2] + '.json';
    const unit = packet.units.find((unit: any) => hash(unit.id) === match[2]);
    const candidate = existsSync(safe(root, recordPath)) ? decodeStorageRecord<any>(root, JSON.parse(read(root, recordPath))) : { id: unit?.id, markdown: read(root, entry.path) };
    if (!unit || candidate.id !== unit.id) throw new Error('STORAGE_CANDIDATE_IDENTITY_MISMATCH: ' + entry.path);
    const keep = !consumed(packet, candidate); candidateData.set(entry.path, { packet, candidate, keep, recordPath });
    if (keep && packet.status === 'applied') {
      const entries = retained.get(match[1]) ?? [];
      if (!entries.some((item: any) => item.id === candidate.id)) entries.push({ id: candidate.id, path: recordPath, contentHash: hash(candidate.markdown), reason: 'consumption-not-proven' });
      retained.set(match[1], entries);
    }
  }
  for (const entry of inputs.filter((file) => file.path.startsWith(`${STATE}/`))) {
    const relative = entry.path, original = read(root, relative);
    if (relative.startsWith(`${STATE}/objects/`)) continue;
    if (pinned.has(relative)) { output.set(relative, original); protectedEntries.push({path:relative,reason:'inflight-transaction-byte-baseline',sha256:entry.sha256}); continue; }
    if (relative.startsWith(`${STATE}/document-operations/`)) { output.set(relative, original); protectedEntries.push({ path: relative, reason: 'existing-document-rollback', sha256: entry.sha256 }); continue; }
    const candidateInfo = candidateData.get(relative);
    if (candidateInfo) {
      const { packet, candidate, keep, recordPath } = candidateInfo;
      if (!keep) continue;
      if (relative.endsWith('.md')) {
        if (!inputs.some((file) => file.path === recordPath)) {
          const encoded = encodeStorageRecord(candidate); output.set(recordPath, json(encoded.record));
          for (const [objectPath, content] of encoded.objects) objects.set(objectPath, content);
          protectedEntries.push({path:relative,reason:'legacy-candidate-consumption-not-proven',status:packet.status,identity:candidate.id,sha256:entry.sha256});
        }
        continue;
      }
      protectedEntries.push({path:relative,reason:packet.status === 'applied' ? 'candidate-consumption-not-proven' : 'active-candidate',status:packet.status,identity:candidate.id,sha256:entry.sha256});
    }
    const raw = JSON.parse(original); let value = decodeStorageRecord<any>(root, raw);
    if (isLegacyTransaction(value)) value = { schemaVersion:1, id:value.id, status:'complete', storageReceipt:true, mutations:[], legacyAudit:{ path:value.path, previousRevision:value.previousRevision, contentHash:hash(value.content), baselineHash:hash(JSON.stringify(value.baseline)), recordHash:hash(original) } };
    if (relative.endsWith('/packet.json') && value.status !== 'applied') value = { ...value, results:value.results.map((entry: any) => entry.candidatePath?.endsWith('.md') ? { ...entry, candidatePath:entry.candidatePath.slice(0,-3)+'.json', previousCandidatePath:entry.candidatePath } : entry) };
    if (relative.endsWith('/packet.json') && (value.status !== 'applied' || value.decisions?.length)) protectedEntries.push({ path: relative, reason: 'unfinished-or-decided-packet', status: value.status, identity: value.id, sha256: entry.sha256 });
    if (relative.startsWith(`${STATE}/documents/`)) protectedEntries.push({ path: relative, reason: 'current-generated-baseline', identity: value.id, sha256: entry.sha256 });
    if (relative.startsWith(`${STATE}/transactions/`) && value.status !== 'complete') protectedEntries.push({ path: relative, reason: 'unfinished-transaction', status: value.status, identity: value.id, sha256: entry.sha256 });
    // Metadata maps keep their existing contract; payload-bearing records use the common codec.
    const payloadRecord = /\/(?:documents|observations|updates|transactions)\//.test(relative);
    const encoded = payloadRecord ? encodeStorageRecord(value, { receipt: true }) : { record: value, objects: new Map<string, string>() };
    if (relative.endsWith('/packet.json') && retained.has(path.posix.dirname(relative))) {
      const envelope = encoded.record as { value: any }; const kept = retained.get(path.posix.dirname(relative))!;
      if (envelope.value?.storageReceipt) {
        envelope.value.retainedCandidates = kept;
        envelope.value.results = envelope.value.results.map((result: any) => {
          const candidate = kept.find((item: any) => item.id === result.id); if (!candidate) return result;
          const previous = value.results.find((entry: any) => entry.id === result.id)?.candidatePath;
          return { ...result, candidatePath: candidate.path, ...(previous && previous !== candidate.path ? { previousCandidatePath: previous } : {}) };
        });
      }
    }
    for (const [objectPath, content] of encoded.objects) { const previous = objects.get(objectPath); if (previous !== undefined && previous !== content) throw new Error(`STORAGE_OBJECT_COLLISION: ${objectPath}`); objects.set(objectPath, content); }
    // Existing document-operation journals compare exact alias bytes, not parsed JSON.
    output.set(relative, payloadRecord ? json(encoded.record) : original);
  }
  output.set(MARKER, marker);
  for (const relative of referenceGraph(root, output, objects)) output.set(relative, objects.get(relative) ?? read(root, relative));
  const config = JSON.parse(read(root, CONFIG));
  output.set(CONFIG, config.schemaVersion === 3 ? read(root, CONFIG) : json({ ...config, schemaVersion: 3 }));
  const oldIgnore = existsSync(safe(root, '.gitignore')) ? read(root, '.gitignore') : '';
  // Retaining this line on rollback protects the deliberately retained recovery bytes.
  const ignore = oldIgnore.split(/\r?\n/).some((line) => ['.lumine-migrations/', '/.lumine-migrations/'].includes(line.trim())) ? oldIgnore : oldIgnore + (oldIgnore && !oldIgnore.endsWith('\n') ? '\n' : '') + '.lumine-migrations/\n';
  output.set('.gitignore', ignore);
  const byPath = new Map(inputs.map((file) => [file.path, file]));
  const paths = [...new Set([...inputs.filter((file) => file.path.startsWith(`${STATE}/`)).map((file) => file.path), ...output.keys()])].sort();
  const changes: CompactionChange[] = [];
  for (const relative of paths) {
    const before = byPath.get(relative), content = output.get(relative), after = content === undefined ? null : hash(content);
    if ((before?.sha256 ?? null) === after) continue;
    changes.push({ path: relative, before: before?.sha256 ?? null, after, bytesBefore: before?.bytes ?? 0, bytesAfter: content === undefined ? 0 : Buffer.byteLength(content), mode: before?.mode ?? 0o600,
      reason: relative === CONFIG ? 'old-writer-version-fence' : relative === '.gitignore' ? 'protect-recovery-backups' : content === undefined ? 'redundant-or-unreferenced-payload' : relative.includes('/objects/') ? 'shared-content-object' : 'versioned-record-or-receipt' });
  }
  const beforeBytes = inputs.filter((file) => file.path.startsWith(`${STATE}/`)).reduce((sum, file) => sum + file.bytes, 0);
  const afterBytes = [...output].filter(([relative]) => relative.startsWith(`${STATE}/`)).reduce((sum, [, content]) => sum + Buffer.byteLength(content), 0);
  return { output, plan: { schemaVersion: 1, kind: 'lumine-wiki-storage-compaction', operationId, projectIdentity: identity(root), runtimeFingerprint: runtimeFingerprint(), inputFingerprint: hash(json(inputs)), inventory: inputs, changes, protected: protectedEntries, beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes, reduction: beforeBytes ? (beforeBytes - afterBytes) / beforeBytes : 0, sourceStorageVersion: existsSync(safe(root, MARKER)) ? 3 : 2, targetStorageVersion: 3 } };
}
export function planCompaction(root: string): CompactionPlan { return withWikiLock(root, () => conversion(root).plan); }
export function compactionPlanHash(plan: CompactionPlan | string): string { return hash(typeof plan === 'string' ? plan : json(plan)); }
function validatePlan(root: string, plan: CompactionPlan, checkRuntime = true): void {
  if (plan.schemaVersion !== 1 || plan.kind !== 'lumine-wiki-storage-compaction' || !/^wiki-storage-[a-zA-Z0-9_-]+$/.test(plan.operationId) || plan.projectIdentity !== identity(root) || (checkRuntime && plan.runtimeFingerprint !== runtimeFingerprint())) throw new Error('STORAGE_PLAN_IDENTITY_OR_RUNTIME_CHANGED');
  if (plan.targetStorageVersion !== 3 || hash(json(plan.inventory)) !== plan.inputFingerprint) throw new Error('STORAGE_PLAN_INVALID');
  const seen = new Set<string>();
  for (const change of plan.changes) {
    safe(root, change.path);
    if (!(change.path.startsWith(`${STATE}/`) || [CONFIG, '.gitignore'].includes(change.path)) || seen.has(change.path)) throw new Error('STORAGE_PLAN_PATH_INVALID');
    seen.add(change.path);
  }
}
function atomicBytes(root: string, relative: string, bytes: Buffer, mode = 0o600): void {
  const file = safe(root, relative); mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`; writeFileSync(temp, bytes, { mode }); renameSync(temp, file); chmodSync(file, mode);
}
function fingerprint(root: string, relative: string): string | null { const file = safe(root, relative); return existsSync(file) ? hash(readFileSync(file)) : null; }
function operationDirectory(operationId: string): string { if (!/^wiki-storage-[a-zA-Z0-9_-]+$/.test(operationId)) throw new Error('STORAGE_OPERATION_ID_INVALID'); return `.lumine-migrations/${operationId}`; }
function verifyCurrent(root: string, plan: CompactionPlan, mode: 'initial' | 'mixed' | 'after' | 'before'): void {
  const current = inventory(root), originals = new Map(plan.inventory.map((entry) => [entry.path, entry.sha256])), changes = new Map(plan.changes.map((change) => [change.path, change]));
  const actual = new Map(current.map((entry) => [entry.path, entry.sha256]));
  for (const relative of new Set([...originals.keys(), ...actual.keys(), ...changes.keys()])) {
    const change = changes.get(relative), before = originals.get(relative) ?? null, value = actual.get(relative) ?? null;
    let allowed = change ? mode === 'mixed' ? [change.before, change.after] : mode === 'after' ? [change.after] : [change.before] : [before];
    if (relative === '.gitignore' && change && mode === 'before') allowed = [change.before, change.after];
    if (!allowed.includes(value)) throw new Error(`STORAGE_INPUT_CHANGED: ${relative}`);
  }
  if (mode === 'initial' && hash(json(current)) !== plan.inputFingerprint) throw new Error('STORAGE_INPUT_INVENTORY_CHANGED');
}
function assertRecoveryIgnored(root: string, directory: string): void {
  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: 'ignore' }); }
  catch { return; }
  try { execFileSync('git', ['check-ignore', '-q', `${directory}/objects/protected`], { cwd: root, stdio: 'ignore' }); }
  catch { throw new Error('STORAGE_RECOVERY_NOT_IGNORED'); }
}
function steps(options: CompactionOptions): (step: string) => void {
  let count = 0; return (step) => { options.onStep?.(step); if (++count === options.interruptAfterStep) throw new Error(`STORAGE_INJECTED_INTERRUPTION: ${step}`); };
}
function saveJournal(root: string, directory: string, journal: RecoveryJournal): void { atomicBytes(root, `${directory}/journal.json`, Buffer.from(json(journal))); }
function readBackup(root: string, directory: string, digest: string): Buffer { const content = readFileSync(safe(root, `${directory}/objects/${digest}`)); if (hash(content) !== digest) throw new Error(`STORAGE_BACKUP_CORRUPT: ${digest}`); return content; }
function result(plan: CompactionPlan, status: 'complete' | 'rolled_back'): CompactionResult { return { operationId: plan.operationId, status, backupDirectory: operationDirectory(plan.operationId), beforeBytes: plan.beforeBytes, afterBytes: plan.afterBytes, changedFiles: plan.changes.length }; }
function prepare(root: string, plan: CompactionPlan, output: Map<string, string>, step: (step: string) => void): RecoveryJournal {
  const directory = operationDirectory(plan.operationId), journal: RecoveryJournal = { schemaVersion: 1, kind: 'lumine-wiki-storage-recovery', operationId: plan.operationId, planHash: compactionPlanHash(plan), status: 'preparing' };
  atomicBytes(root, `${directory}/plan.json`, Buffer.from(json(plan))); step('recovery-plan');
  saveJournal(root, directory, journal); step('recovery-manifest');
  const ignore = plan.changes.find((change) => change.path === '.gitignore');
  // Only ignore-file bytes may be saved before Git confirms that recovery is excluded.
  if (ignore && fingerprint(root, '.gitignore') === ignore.before) {
    if (ignore.before) atomicBytes(root, `${directory}/objects/${ignore.before}`, readFileSync(safe(root, '.gitignore')));
    atomicBytes(root, '.gitignore', Buffer.from(output.get('.gitignore')!), ignore.mode);
  }
  assertRecoveryIgnored(root, directory);
  for (const change of plan.changes) {
    for (const digest of [change.before, change.after]) {
      if (!digest) continue;
      const target = `${directory}/objects/${digest}`;
      if (existsSync(safe(root, target))) { readBackup(root, directory, digest); continue; }
      const content = digest === change.after ? Buffer.from(output.get(change.path)!) : readFileSync(safe(root, change.path));
      if (hash(content) !== digest) throw new Error(`STORAGE_BACKUP_SOURCE_CHANGED: ${change.path}`);
      atomicBytes(root, target, content); step('recovery-object');
    }
  }
  journal.status = 'ready'; saveJournal(root, directory, journal); step('recovery-ready'); return journal;
}
function applyReady(root: string, plan: CompactionPlan, journal: RecoveryJournal, step: (step: string) => void): CompactionResult {
  const directory = operationDirectory(plan.operationId); verifyCurrent(root, plan, 'mixed');
  if (journal.status === 'complete') { verifyCurrent(root, plan, 'after'); return result(plan, 'complete'); }
  if (journal.status === 'rolled_back' || journal.status === 'rolling_back') throw new Error('STORAGE_OPERATION_ROLLED_BACK');
  // Verify every saved byte before the first state mutation; no-Git recovery is equally strong.
  for (const change of plan.changes) for (const digest of [change.before, change.after]) if (digest) readBackup(root, directory, digest);
  journal.status = 'applying'; saveJournal(root, directory, journal); step('applying');
  const changes = [...plan.changes].sort((a, b) => order(a) - order(b) || a.path.localeCompare(b.path));
  const write = (change: CompactionChange): void => {
    const current = fingerprint(root, change.path);
    if (current !== change.before && current !== change.after) throw new Error(`STORAGE_INPUT_CHANGED: ${change.path}`);
    if (current === change.after) return;
    if (change.after === null) unlinkSync(safe(root, change.path));
    else atomicBytes(root, change.path, readBackup(root, directory, change.after), change.mode);
    step(`target:${change.path}`);
  };
  for (const change of changes.filter((change) => change.after !== null)) write(change);
  const checked = checkStorage(root); if (!checked.ok) throw new Error(`STORAGE_POSTCHECK_FAILED: ${json(checked.issues)}`); step('references-verified');
  for (const change of changes.filter((change) => change.after === null)) write(change);
  verifyCurrent(root, plan, 'after');
  const final = checkStorage(root); if (!final.ok) throw new Error(`STORAGE_POSTCHECK_FAILED: ${json(final.issues)}`);
  journal.status = 'complete'; saveJournal(root, directory, journal); step('complete'); return result(plan, 'complete');
}
function order(change: CompactionChange): number { return change.path === '.gitignore' ? 0 : change.path === CONFIG ? 1 : change.path.includes('/objects/') ? 2 : change.path === MARKER ? 4 : change.after === null ? 5 : 3; }
export function applyCompaction(root: string, input: CompactionPlan | string, expectedSha256: string, options: CompactionOptions = {}): CompactionResult {
  if (compactionPlanHash(input) !== expectedSha256) throw new Error('STORAGE_PLAN_HASH_MISMATCH');
  const plan = typeof input === 'string' ? JSON.parse(input) as CompactionPlan : input;
  validatePlan(root, plan);
  return withWikiLock(root, () => {
    const directory = operationDirectory(plan.operationId);
    if (existsSync(safe(root, `${directory}/journal.json`))) {
      const savedPlan = JSON.parse(read(root, `${directory}/plan.json`)) as CompactionPlan;
      if (compactionPlanHash(savedPlan) !== compactionPlanHash(plan)) throw new Error('STORAGE_OPERATION_PLAN_CHANGED');
      return recoverUnlocked(root, plan.operationId, false, steps(options));
    }
    verifyCurrent(root, plan, 'initial');
    const rebuilt = conversion(root, plan.operationId);
    if (json(rebuilt.plan) !== json(plan)) throw new Error('STORAGE_PLAN_OUTPUT_CHANGED');
    const step = steps(options), journal = prepare(root, plan, rebuilt.output, step);
    return applyReady(root, plan, journal, step);
  });
}
function recoverUnlocked(root: string, operationId: string, rollback: boolean, step: (step: string) => void): CompactionResult {
  const directory = operationDirectory(operationId), plan = JSON.parse(read(root, `${directory}/plan.json`)) as CompactionPlan;
  validatePlan(root, plan, false);
  let journal: RecoveryJournal;
  if (!existsSync(safe(root, `${directory}/journal.json`))) {
    verifyCurrent(root, plan, 'before');
    journal = {schemaVersion:1,kind:'lumine-wiki-storage-recovery',operationId,planHash:compactionPlanHash(plan),status:'preparing'};
    saveJournal(root, directory, journal);
  } else journal = JSON.parse(read(root, `${directory}/journal.json`)) as RecoveryJournal;
  if (journal.schemaVersion !== 1 || journal.kind !== 'lumine-wiki-storage-recovery' || journal.operationId !== operationId || journal.planHash !== compactionPlanHash(plan)) throw new Error('STORAGE_RECOVERY_MANIFEST_INVALID');
  verifyCurrent(root, plan, 'mixed');
  if (rollback) {
    if (journal.status === 'rolled_back') { verifyCurrent(root, plan, 'before'); return result(plan, 'rolled_back'); }
    if (journal.status === 'preparing') { verifyCurrent(root, plan, 'before'); journal.status = 'rolled_back'; saveJournal(root, directory, journal); step('rolled-back'); return result(plan, 'rolled_back'); }
    // Preflight all changes, including later human writes to untouched Wiki files, before restoring anything.
    for (const change of plan.changes) if (change.before && change.path !== '.gitignore') readBackup(root, directory, change.before);
    journal.status = 'rolling_back'; saveJournal(root, directory, journal); step('rolling-back');
    const ordered = [...plan.changes].filter((change) => change.path !== '.gitignore').sort((a, b) => Number(a.path === CONFIG) - Number(b.path === CONFIG) || order(b) - order(a));
    for (const change of ordered) {
      if (fingerprint(root, change.path) === change.before) continue;
      if (change.before === null) { if (existsSync(safe(root, change.path))) unlinkSync(safe(root, change.path)); }
      else atomicBytes(root, change.path, readBackup(root, directory, change.before), change.mode);
      step(`rollback:${change.path}`);
    }
    verifyCurrent(root, plan, 'before'); journal.status = 'rolled_back'; saveJournal(root, directory, journal); step('rolled-back'); return result(plan, 'rolled_back');
  }
  if (journal.status === 'preparing') {
    if (plan.runtimeFingerprint !== runtimeFingerprint()) throw new Error('STORAGE_RECOVERY_RUNTIME_CHANGED: restore the planning Runtime or roll back this unstarted operation');
    // At this stage only .gitignore may differ. Reconstruct pure outputs from original state.
    const rebuilt = conversion(root, operationId);
    const filtered = (changes: CompactionChange[]) => changes.filter((change) => change.path !== '.gitignore');
    if (json(filtered(rebuilt.plan.changes)) !== json(filtered(plan.changes))) throw new Error('STORAGE_RECOVERY_INPUT_CHANGED');
    journal = prepare(root, plan, rebuilt.output, step);
  }
  return applyReady(root, plan, journal, step);
}
export function recoverCompaction(root: string, operationId: string, options: CompactionOptions & { rollback?: boolean } = {}): CompactionResult { return withWikiLock(root, () => recoverUnlocked(root, operationId, Boolean(options.rollback), steps(options))); }
