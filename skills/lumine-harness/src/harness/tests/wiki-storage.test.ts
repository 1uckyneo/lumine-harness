import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyUpdate, prepareUpdate, recordSemanticReview, recordUpdateDecision, recoverWiki, scanWiki, showKnowledge, sourceFingerprint } from '../wiki/engine.ts';
import { migrateWikiDocumentFormat } from '../wiki/format-migration.ts';
import { baselineFor, formatWikiDocument } from '../wiki/documents.ts';
import { configFingerprint, hash, snapshotSources } from '../wiki/files.ts';
import { applyTransaction, diskText, statePath, visibleJson, type WikiTransaction } from '../wiki/transactions.ts';
import { collectStorageReferences, decodeStorageRecord, encodeStorageRecord, assertStorageWritable, gcStorageObjects, inspectStorageObjects, objectPath, persistStorageObjects, readStorageRecord, storageRecordText, writeStorageRecord } from '../wiki/storage.ts';
import type { Baseline, ObservationRecord, ReviewRecord, UpdatePacket } from '../wiki/types.ts';

function fixture(schemaVersion = 3) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-storage-'));
  for (const dir of ['.lumine', 'docs/repo-wiki', 'src']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, '.lumine/root.json'), JSON.stringify({ schemaVersion: 2, kind: 'lumine-root' }));
  const config = { schemaVersion, workflowVersion: 2, locale: 'zh-CN', repositories: [{ id: 'root', path: '.' }], wiki: { root: 'docs/repo-wiki', watchScopes: [{ repoId: 'root', path: 'src' }], maxCards: 6, maxContextChars: 12000 } };
  writeFileSync(path.join(root, '.lumine/project.json'), JSON.stringify(config));
  writeFileSync(path.join(root, 'src/session.ts'), 'export const session = true;\n');
  const source = { id: 'source', repoId: 'root', path: 'src/session.ts' }, scopes = [{ repoId: 'root', path: 'src/session.ts' }];
  const file = 'docs/repo-wiki/会话.md', id = 'session';
  const content = (body = '第一段。\n\n第二段。') => formatWikiDocument(`---\n${JSON.stringify({ id, title: '会话', summary: '说明会话规则。', type: 'mechanism', status: 'current', locale: 'zh-CN', sources: [source], watchScopes: scopes, relations: [] })}\n---\n\n# 会话\n\n## 规则\n\n${body}\n`, file);
  const create = () => { const packet = prepareUpdate(root, [], { schemaVersion: 1, changes: [{ kind: 'create', id, path: file, sourceRefs: [source], watchScopes: scopes }] }); assert.equal(applyUpdate(root, packet.id, [{ id, markdown: content() }]).status, 'applied'); return packet; };
  return { root, id, file, source, scopes, config, content, create, close: () => rmSync(root, { recursive: true, force: true }) };
}
function inventory(root: string, directory = '.lumine/wiki-state'): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (relative: string) => { if (!existsSync(path.join(root, relative))) return; for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) { const next = `${relative}/${entry.name}`; if (entry.isDirectory()) visit(next); else result[next] = hash(readFileSync(path.join(root, next))); } };
  visit(directory); return Object.fromEntries(Object.entries(result).sort());
}
const packetPath = (id: string) => `.lumine/wiki-state/updates/${id}/packet.json`;

test('codec is pure, shares text and source objects, dual reads, and validates content identity', () => {
  const f = fixture(); try {
    const source = snapshotSources(f.root, [f.source], f.scopes);
    const value = { generatedMarkdown: '共同正文中文', currentMarkdown: '共同正文中文', sources: source, nested: { sources: source } };
    const encoded = encodeStorageRecord(value);
    assert.equal(encoded.objects.size, 2); assert.deepEqual(inventory(f.root), {});
    persistStorageObjects(f.root, encoded.objects);
    assert.deepEqual(decodeStorageRecord(f.root, encoded.record), value);
    assert.deepEqual(decodeStorageRecord(f.root, value), value);
    const ref = collectStorageReferences(encoded.record)[0];
    writeFileSync(path.join(f.root, objectPath(ref)), '损坏');
    assert.throws(() => decodeStorageRecord(f.root, encoded.record), /STORAGE_OBJECT_CORRUPT/);
    assert.throws(() => objectPath({ ...ref, $lumineObject: '../bad' }), /STORAGE_REFERENCE_INVALID/);
  } finally { f.close(); }
});
test('complete packets and transactions become idempotent receipts and candidates have no duplicate markdown', () => {
  const f = fixture(); try {
    const packet = prepareUpdate(f.root, [], { schemaVersion: 1, changes: [{ kind: 'create', id: f.id, path: f.file, sourceRefs: [f.source], watchScopes: f.scopes }] });
    writeFileSync(path.join(f.root, 'src/session.ts'), 'source drift');
    const failed = applyUpdate(f.root, packet.id, [{ id: f.id, markdown: f.content() }]);
    assert.equal(failed.results[0].status, 'source-drift');
    assert.ok(failed.results[0].candidatePath?.endsWith('.json'));
    const candidate = `.lumine/wiki-state/updates/${packet.id}/candidates/${hash(f.id)}`;
    assert.ok(existsSync(path.join(f.root, candidate + '.json'))); assert.ok(!existsSync(path.join(f.root, candidate + '.md')));
    writeFileSync(path.join(f.root, 'src/session.ts'), 'export const session = true;\n');
    assert.equal(applyUpdate(f.root, packet.id, []).status, 'applied');
    assert.ok(!existsSync(path.join(f.root, candidate + '.json')));
    const receipt = readStorageRecord<any>(f.root, packetPath(packet.id), null);
    assert.equal(receipt.storageReceipt, true); assert.equal(receipt.units[0].currentMarkdown, undefined);
    assert.deepEqual(encodeStorageRecord(receipt, { receipt: true }).record, JSON.parse(readFileSync(path.join(f.root, packetPath(packet.id)), 'utf8')));
    const txFile = `.lumine/wiki-state/transactions/${packet.id}-${hash(f.id).slice(0, 12)}.json`;
    const tx = readStorageRecord<any>(f.root, txFile, null);
    assert.equal(tx.storageReceipt, true); assert.deepEqual(tx.mutations, []); assert.ok(tx.mutationHashes.length);
    assert.deepEqual(collectStorageReferences(tx), []); assert.deepEqual(collectStorageReferences(receipt), []);
    assert.deepEqual(inspectStorageObjects(f.root).unreferenced, []);
    assert.equal(baselineFor(f.root, f.id)?.generatedMarkdown, f.content());
  } finally { f.close(); }
});
test('100 scan, same-packet apply and recovery calls leave every shared byte unchanged', () => {
  const f = fixture(); try {
    const packet = f.create(); scanWiki(f.root); const before = inventory(f.root);
    for (let i = 0; i < 100; i++) { scanWiki(f.root); applyUpdate(f.root, packet.id, []); recoverWiki(f.root); }
    assert.deepEqual(inventory(f.root), before);
    const noChange = prepareUpdate(f.root, [f.id]), generation = baselineFor(f.root, f.id)?.generation;
    applyUpdate(f.root, noChange.id, [{ id: f.id, markdown: f.content() }]);
    assert.equal(baselineFor(f.root, f.id)?.generation, generation);
  } finally { f.close(); }
});
test('generated baseline and human edits survive three-way merge and subsequent GC', () => {
  const f = fixture(); try {
    f.create(); const generated = f.content(), human = generated.replace('第一段。', '人工第一段。');
    writeFileSync(path.join(f.root, f.file), human);
    const packet = prepareUpdate(f.root, [f.id]); const candidate = generated.replace('第二段。', '生成第二段。');
    assert.equal(applyUpdate(f.root, packet.id, [{ id: f.id, markdown: candidate }]).status, 'applied');
    assert.equal(baselineFor(f.root, f.id)?.generatedMarkdown, candidate);
    assert.match(readFileSync(path.join(f.root, f.file), 'utf8'), /人工第一段/);
    assert.notEqual(baselineFor(f.root, f.id)?.generatedMarkdown, readFileSync(path.join(f.root, f.file), 'utf8'));
    assert.deepEqual(inspectStorageObjects(f.root).unreferenced, []);
  } finally { f.close(); }
});
test('partial, conflict and explicit decisions pin original baselines and candidates', () => {
  const f = fixture(); try {
    f.create(); const packet = prepareUpdate(f.root, [f.id]);
    writeFileSync(path.join(f.root, f.file), f.content().replace('第一段。', '人工冲突。'));
    const candidate = f.content().replace('第一段。', '候选冲突。');
    assert.equal(applyUpdate(f.root, packet.id, [{ id: f.id, markdown: candidate }]).results[0].status, 'conflict');
    for (const action of ['defer', 'keep-current'] as const) {
      recordUpdateDecision(f.root, packet.id, f.id, action, '等待人工判断'); recoverWiki(f.root); scanWiki(f.root);
      const saved = readStorageRecord<UpdatePacket>(f.root, packetPath(packet.id), null!);
      assert.equal(saved.units[0].currentMarkdown, f.content());
      assert.equal(saved.units[0].baseline?.generatedMarkdown, f.content());
      assert.equal(readStorageRecord<any>(f.root, `.lumine/wiki-state/updates/${packet.id}/candidates/${hash(f.id)}.json`, null).markdown, candidate);
    }
    assert.deepEqual(inspectStorageObjects(f.root).issues, []);
  } finally { f.close(); }
});
test('interrupted transaction retains exact disk bytes and nested references through GC and recovery', () => {
  const f = fixture(); try {
    f.create(); const baselinePath = statePath('documents', f.id), before = diskText(f.root, baselinePath)!;
    const prior = baselineFor(f.root, f.id)!;
    const after = storageRecordText(f.root, { ...prior, generatedMarkdown: prior.generatedMarkdown + '\nnext\n' });
    const transaction: WikiTransaction = { schemaVersion: 1, id: 'interrupted', status: 'pending', mutations: [{ path: baselinePath, before, after }, { path: f.file, before: diskText(f.root, f.file), after: f.content().replace('第一段。', '完成。') }] };
    assert.throws(() => applyTransaction(f.root, transaction, 1), /TRANSACTION_INJECTED_INTERRUPTION/);
    assert.equal(diskText(f.root, baselinePath), after);
    assert.deepEqual(visibleJson<Baseline>(f.root, baselinePath, null!), prior);
    assert.deepEqual(gcStorageObjects(f.root, { dryRun: false }).issues, []);
    assert.equal(readStorageRecord<WikiTransaction>(f.root, '.lumine/wiki-state/transactions/interrupted.json', null!).mutations[0].before, before);
    recoverWiki(f.root);
    assert.equal(baselineFor(f.root, f.id)?.generatedMarkdown, prior.generatedMarkdown + '\nnext\n');
    assert.deepEqual(inspectStorageObjects(f.root).unreferenced, []);
  } finally { f.close(); }
});
test('GC refuses missing objects, corrupt objects, unknown envelopes and symlinks without deleting orphan data', () => {
  const f = fixture(); try {
    const orphan = encodeStorageRecord({ markdown: 'orphan' }); persistStorageObjects(f.root, orphan.objects);
    const record = encodeStorageRecord({ id: 'required', markdown: 'required' }); persistStorageObjects(f.root, record.objects);
    const recordFile = path.join(f.root, `.lumine/wiki-state/updates/test/candidates/${hash('required')}.json`); mkdirSync(path.dirname(recordFile), { recursive: true }); writeFileSync(recordFile, JSON.stringify(record.record));
    const ref = collectStorageReferences(record.record)[0], objectFile = path.join(f.root, objectPath(ref));
    rmSync(objectFile); assert.throws(() => gcStorageObjects(f.root, { dryRun: false }), /STORAGE_GC_BLOCKED/);
    assert.ok(existsSync(path.join(f.root, [...orphan.objects.keys()][0])));
    persistStorageObjects(f.root, record.objects); writeFileSync(objectFile, 'corrupt');
    assert.throws(() => gcStorageObjects(f.root, { dryRun: false }), /STORAGE_GC_BLOCKED/);
    rmSync(objectFile); symlinkSync(path.join(f.root, 'src/session.ts'), objectFile);
    assert.throws(() => gcStorageObjects(f.root, { dryRun: false }), /STORAGE_GC_BLOCKED/);
    rmSync(objectFile); persistStorageObjects(f.root, record.objects);
    writeFileSync(path.join(f.root, '.lumine/wiki-state/future-format.json'), JSON.stringify({ schemaVersion: 42, recoveryPayloadHash: [...orphan.objects.keys()][0] }));
    assert.throws(() => gcStorageObjects(f.root, { dryRun: false }), /STORAGE_RECORD_UNKNOWN/);
    assert.ok(existsSync(path.join(f.root, [...orphan.objects.keys()][0])));
  } finally { f.close(); }
});
test('schema2 reads remain untouched and schema3 activation preserves configuration fingerprint', () => {
  const f = fixture(2); try {
    const packet = f.create(); const before = inventory(f.root); const fingerprint = configFingerprint(f.root);
    showKnowledge(f.root, f.id); assert.deepEqual(inventory(f.root), before);
    const active = prepareUpdate(f.root, [f.id]);
    writeFileSync(path.join(f.root, '.lumine/project.json'), JSON.stringify({ ...f.config, schemaVersion: 3 }));
    assert.equal(configFingerprint(f.root), fingerprint);
    assert.equal(applyUpdate(f.root, active.id, [{ id: f.id, markdown: f.content() }]).status, 'applied');
    assert.equal(readStorageRecord<UpdatePacket>(f.root, packetPath(packet.id), null!).status, 'applied');
  } finally { f.close(); }
});
test('identical review is idempotent while a new review preserves fresh evidence', () => {
  const f = fixture(); try {
    f.create(); const document = showKnowledge(f.root, f.id);
    const review: ReviewRecord = { documentId: f.id, revision: document.revision, sourceFingerprint: sourceFingerprint(snapshotSources(f.root, [f.source], f.scopes)), reviewedAt: new Date().toISOString(), reviewer: { kind: 'human', role: 'independent' }, outcome: 'reviewed', scope: ['正文'], findings: [], limitations: [] };
    recordSemanticReview(f.root, review); const before = inventory(f.root);
    recordSemanticReview(f.root, review); assert.deepEqual(inventory(f.root), before);
    const next = { ...review, findings: ['新复核记录'], reviewedAt: new Date(Date.now() + 1).toISOString() };
    recordSemanticReview(f.root, next); assert.notDeepEqual(inventory(f.root), before);
    assert.deepEqual(showKnowledge(f.root, f.id).semanticReview.findings, next.findings);
  } finally { f.close(); }
});

test('recovery preserves a candidate edited after its transaction consumed the original', () => {
  const f = fixture(); try {
    const packet = prepareUpdate(f.root, [], { schemaVersion: 1, changes: [{ kind: 'create', id: f.id, path: f.file, sourceRefs: [f.source], watchScopes: f.scopes }] });
    assert.throws(() => applyUpdate(f.root, packet.id, [{ id: f.id, markdown: f.content() }], { failAfterWrites: 1 }), /TRANSACTION_INJECTED_INTERRUPTION/);
    const candidatePath = `.lumine/wiki-state/updates/${packet.id}/candidates/${hash(f.id)}.json`;
    const edited = { id: f.id, markdown: f.content().replace('第一段。', '事后人工新稿。') };
    writeStorageRecord(f.root, candidatePath, edited);
    recoverWiki(f.root);
    assert.equal(readStorageRecord<UpdatePacket>(f.root, packetPath(packet.id), null!).status, 'applied');
    assert.deepEqual(readStorageRecord(f.root, candidatePath, null), edited);
    assert.equal(readStorageRecord<UpdatePacket>(f.root, packetPath(packet.id), null!).retainedCandidates?.[0].path, candidatePath);
    assert.deepEqual(inspectStorageObjects(f.root).issues, []);
    assert.equal(baselineFor(f.root, f.id)?.generatedMarkdown, f.content());
    const receipt = readStorageRecord<any>(f.root, packetPath(packet.id), null);
    receipt.retainedCandidates = [{ id: f.id, path: candidatePath, contentHash: hash(edited.markdown), reason: 'consumption-not-proven' }];
    writeStorageRecord(f.root, packetPath(packet.id), receipt, { receipt: true });
    const before = inventory(f.root); recoverWiki(f.root);
    assert.deepEqual(inventory(f.root), before);
  } finally { f.close(); }
});
test('unfinished compaction blocks ordinary writes and GC until explicit recovery completes', () => {
  const f = fixture(); try {
    f.create(); const before = inventory(f.root);
    const directory = path.join(f.root, '.lumine-migrations/wiki-storage-interrupted'); mkdirSync(directory, { recursive: true });
    const journal = { schemaVersion: 1, kind: 'lumine-wiki-storage-recovery', operationId: 'wiki-storage-interrupted', status: 'applying' };
    writeFileSync(path.join(directory, 'journal.json'), JSON.stringify(journal));
    assert.throws(() => scanWiki(f.root), /STORAGE_RECOVERY_REQUIRED/);
    assert.throws(() => recoverWiki(f.root), /STORAGE_RECOVERY_REQUIRED/);
    assert.throws(() => gcStorageObjects(f.root, { dryRun: false }), /STORAGE_RECOVERY_REQUIRED/);
    assert.deepEqual(inventory(f.root), before);
    writeFileSync(path.join(directory, 'journal.json'), JSON.stringify({ ...journal, status: 'complete' }));
    assert.doesNotThrow(() => assertStorageWritable(f.root)); scanWiki(f.root);
    assert.deepEqual(inventory(f.root), before);
  } finally { f.close(); }
});

test('missing or malformed generated baseline never falls back to the current human text', () => {
  for (const schema of [2, 3]) {
    const f = fixture(schema); try {
      f.create(); const packet = prepareUpdate(f.root, [f.id]);
      const human = f.content().replace('第一段。', '必须保留的人工稿。'); writeFileSync(path.join(f.root, f.file), human);
      const baseline = baselineFor(f.root, f.id)!;
      const { generatedMarkdown: _generated, ...damaged } = baseline;
      writeStorageRecord(f.root, statePath('documents', f.id), damaged);
      assert.throws(() => baselineFor(f.root, f.id), /STORAGE_RECORD_UNKNOWN/);
      const result = applyUpdate(f.root, packet.id, [{ id: f.id, markdown: f.content().replace('第一段。', '生成稿。') }]);
      assert.notEqual(result.status, 'applied');
      assert.equal(readFileSync(path.join(f.root, f.file), 'utf8'), human);
    } catch (error) {
      // New-format GC also refuses to continue on the damaged root; neither path may publish text.
      if (schema !== 3 || !(error instanceof Error) || !error.message.includes('STORAGE_GC_BLOCKED')) throw error;
      assert.match(readFileSync(path.join(f.root, f.file), 'utf8'), /必须保留的人工稿/);
    } finally { f.close(); }
  }
});

test('document format migration reads referenced baselines and keeps human edits under schema3', () => {
  const f = fixture(); try {
    const markdown = `---\n${JSON.stringify({ id: f.id, title: '会话', summary: '说明会话规则。', type: 'mechanism', status: 'current', locale: 'zh-CN', sources: [f.source], watchScopes: f.scopes, relations: [] })}\n---\n\n# 会话\n\n## 规则\n\n第一段。\n`;
    writeFileSync(path.join(f.root, f.file), markdown);
    const packet = prepareUpdate(f.root, [f.id]);
    assert.equal(applyUpdate(f.root, packet.id, [{ id: f.id, markdown }]).status, 'applied');
    const baseline = baselineFor(f.root, f.id)!;
    writeFileSync(path.join(f.root, f.file), markdown.replace('第一段。', '人工补充。'));
    assert.equal(migrateWikiDocumentFormat(f.root, f.id).status, 'converted');
    assert.equal(baselineFor(f.root, f.id)?.generatedMarkdown, formatWikiDocument(markdown, f.file));
    assert.equal(baselineFor(f.root, f.id)?.updatedAt, baseline.updatedAt);
    assert.match(readFileSync(path.join(f.root, f.file), 'utf8'), /人工补充/);
    assert.deepEqual(inspectStorageObjects(f.root).issues, []);
    assert.deepEqual(inspectStorageObjects(f.root).unreferenced, []);
  } finally { f.close(); }
});

test('deleted source persists null fingerprints and missing-source state without invalidating legacy baselines', () => {
  const f = fixture(); try {
    f.create(); const original = baselineFor(f.root, f.id)!;
    rmSync(path.join(f.root, 'src/session.ts'));
    const scanned = scanWiki(f.root);
    assert.equal(scanned.documents[0].freshness, 'missing-source');
    const observation = readStorageRecord<ObservationRecord>(f.root, statePath('observations', f.id), null!);
    assert.equal(observation.sources.fingerprints['root:src/session.ts'], null);
    assert.equal(showKnowledge(f.root, f.id).freshness, 'missing-source');
    assert.deepEqual(inspectStorageObjects(f.root).issues, []);
    const before = inventory(f.root); scanWiki(f.root); recoverWiki(f.root);
    assert.deepEqual(inventory(f.root), before);
    // Earlier valid baselines use the same nullable fingerprint contract.
    writeStorageRecord(f.root, statePath('documents', f.id), { ...original, sources: observation.sources });
    assert.equal(baselineFor(f.root, f.id)?.sources.fingerprints['root:src/session.ts'], null);
    assert.deepEqual(inspectStorageObjects(f.root).issues, []);
    for (const key of ['scopeFingerprints', 'files']) {
      writeStorageRecord(f.root, statePath('documents', f.id), { ...original, sources: { ...observation.sources, [key]: { 'root:src/session.ts': null } } });
      assert.throws(() => baselineFor(f.root, f.id), /STORAGE_RECORD_UNKNOWN/);
    }
  } finally { f.close(); }
});
