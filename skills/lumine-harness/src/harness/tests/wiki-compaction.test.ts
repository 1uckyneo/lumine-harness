import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyCompaction, checkStorage, compactionPlanHash, inspectStorage, planCompaction, recoverCompaction } from '../wiki/compaction.ts';
import { decodeStorageRecord, readStorageRecord } from '../wiki/storage.ts';
import { hash } from '../wiki/files.ts';
import { recoverTransactions } from '../wiki/transactions.ts';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function put(root: string, relative: string, value: unknown) { const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : json(value)); }
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-compact-'));
  put(root, '.lumine/root.json', { schemaVersion: 2, kind: 'lumine-root', projectId: 'storage-fixture' });
  put(root, '.lumine/project.json', { schemaVersion: 2, workflowVersion: 2, repositories: [{ id: 'project', path: '.' }], wiki: { root: 'docs/repo-wiki' } });
  const markdown = '---\nid: guide\ntitle: 指南\n---\n# 指南\n\n生成正文。\n' + '稳定知识。\n'.repeat(1000);
  const sources = { fingerprints: {}, scopeFingerprints: {}, files: {}, missing: [] };
  const baseline = { schemaVersion: 2, id: 'guide', path: 'docs/repo-wiki/指南.md', generation: 4, generatedMarkdown: markdown, appliedRevision: hash(markdown), sources, updatedAt: '2026-01-01T00:00:00Z' };
  put(root, 'docs/repo-wiki/指南.md', markdown + '\n人工补充，不能替代生成基线。\n');
  put(root, `.lumine/wiki-state/documents/${hash('guide')}.json`, baseline);
  const unit = { id: 'guide', path: baseline.path, currentMarkdown: markdown, currentRevision: hash(markdown), baseline, sources, sourceRefs: [], watchScopes: [], group: 'guide-group' };
  for (const status of ['prepared', 'partial', 'applied']) {
    const id = `packet-${status}`;
    put(root, `.lumine/wiki-state/updates/${id}/packet.json`, { schemaVersion: 2, id, createdAt: '2026-01-01T00:00:00Z', configFingerprint: 'original', scope: ['guide'], units: [unit], status, results: status === 'prepared' ? [] : [{ id: 'guide', status: status === 'applied' ? 'applied' : 'conflict', reason: 'retained', candidatePath: `.lumine/wiki-state/updates/${id}/candidates/${hash('guide')}.md` }], ...(status === 'partial' ? { decisions: [{ id: 'guide', action: 'defer', reason: '需审阅', at: '2026-01-01T00:00:00Z' }] } : {}) });
    if (status !== 'prepared') { const stem = `.lumine/wiki-state/updates/${id}/candidates/${hash('guide')}`; put(root, stem + '.json', { id: 'guide', markdown }); put(root, stem + '.md', markdown); }
  }
  const transactionId = 'packet-applied-' + hash('guide-group').slice(0,12);
  put(root, `.lumine/wiki-state/transactions/${transactionId}.json`, { schemaVersion: 1, id: transactionId, status: 'complete', mutations: [{ path: `.lumine/wiki-state/documents/${hash('guide')}.json`, before: json(baseline), after: json(baseline) }] });
  put(root, '.lumine/wiki-state/document-operations/rename.json', { schemaVersion: 1, id: 'rename', before: markdown, after: markdown });
  return { root, markdown, baseline, close: () => rmSync(root, { recursive: true, force: true }) };
}
function state(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (directory: string) => { if (!existsSync(path.join(root, directory))) return; for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) { const relative = `${directory}/${entry.name}`; if (entry.isDirectory()) visit(relative); else result[relative] = hash(readFileSync(path.join(root, relative))); } };
  visit('.lumine/wiki-state'); return result;
}

test('explicit compaction deduplicates completed payloads and preserves active candidates, generated baseline and document rollback bytes', () => {
  const f = fixture(); try {
    const before = state(f.root), body = readFileSync(path.join(f.root, f.baseline.path), 'utf8'), plan = planCompaction(f.root);
    assert.deepEqual(state(f.root), before); assert.ok(plan.savedBytes > 0); assert.equal(plan.protected.filter((item) => item.reason === 'unfinished-or-decided-packet').length, 2);
    const raw = json(plan); assert.throws(() => applyCompaction(f.root, raw, '0'.repeat(64)), /PLAN_HASH_MISMATCH/);
    applyCompaction(f.root, raw, hash(raw));
    assert.equal(checkStorage(f.root).ok, true); assert.equal(JSON.parse(readFileSync(path.join(f.root, '.lumine/project.json'), 'utf8')).schemaVersion, 3);
    assert.equal(JSON.parse(readFileSync(path.join(f.root, '.lumine/project.json'), 'utf8')).workflowVersion, 2);
    assert.equal(readFileSync(path.join(f.root, f.baseline.path), 'utf8'), body);
    const baseline = readStorageRecord<any>(f.root, `.lumine/wiki-state/documents/${hash('guide')}.json`, null);
    assert.equal(baseline.generatedMarkdown, f.markdown); assert.equal(baseline.generation, 4);
    assert.equal(state(f.root)['.lumine/wiki-state/document-operations/rename.json'], before['.lumine/wiki-state/document-operations/rename.json']);
    const partial = readStorageRecord<any>(f.root, '.lumine/wiki-state/updates/packet-partial/packet.json', null);
    assert.equal(partial.status, 'partial'); assert.equal(partial.decisions[0].action, 'defer');
    assert.equal(readStorageRecord<any>(f.root, `.lumine/wiki-state/updates/packet-partial/candidates/${hash('guide')}.json`, null).markdown, f.markdown);
    assert.equal(existsSync(path.join(f.root, `.lumine/wiki-state/updates/packet-partial/candidates/${hash('guide')}.md`)), false);
    assert.equal(existsSync(path.join(f.root, `.lumine/wiki-state/updates/packet-applied/candidates/${hash('guide')}.json`)), false);
    const applied = readStorageRecord<any>(f.root, '.lumine/wiki-state/updates/packet-applied/packet.json', null);
    assert.equal(applied.storageReceipt, true); assert.equal(applied.units[0].group, 'guide-group');
    const compacted = state(f.root); for (let i = 0; i < 100; i++) recoverCompaction(f.root, plan.operationId);
    assert.deepEqual(state(f.root), compacted); assert.equal(planCompaction(f.root).changes.length, 0);
    const sizes = inspectStorage(f.root); assert.ok(sizes.recoveryBytes > sizes.bytes); assert.equal(sizes.gitHistoryBytes, null);
    recoverCompaction(f.root, plan.operationId, { rollback: true }); assert.deepEqual(state(f.root), before);
    assert.equal(JSON.parse(readFileSync(path.join(f.root, '.lumine/project.json'), 'utf8')).schemaVersion, 2);
    assert.match(readFileSync(path.join(f.root, '.gitignore'), 'utf8'), /lumine-migrations/);
    recoverCompaction(f.root, plan.operationId, { rollback: true }); assert.deepEqual(state(f.root), before);
  } finally { f.close(); }
});

test('all persistent migration steps resume or roll back without Git', () => {
  const probe = fixture(); let total = 0;
  try { const p = planCompaction(probe.root); applyCompaction(probe.root, p, compactionPlanHash(p), { onStep: () => total++ }); } finally { probe.close(); }
  assert.ok(total > 10);
  for (let point = 1; point <= total; point++) {
    const f = fixture(); try {
      const before = state(f.root), plan = planCompaction(f.root);
      assert.throws(() => applyCompaction(f.root, plan, compactionPlanHash(plan), { interruptAfterStep: point }), /INJECTED_INTERRUPTION/);
      if (point % 2) { recoverCompaction(f.root, plan.operationId); assert.equal(checkStorage(f.root).ok, true); }
      recoverCompaction(f.root, plan.operationId, { rollback: true });
      assert.deepEqual(state(f.root), before, `rollback after durable step ${point}`);
      assert.equal(JSON.parse(readFileSync(path.join(f.root, '.lumine/project.json'), 'utf8')).schemaVersion, 2);
    } finally { f.close(); }
  }
});

test('CAS rejects a new packet, edited wiki, corrupt object and later manual state before destructive writes', () => {
  const f = fixture(); try {
    let plan = planCompaction(f.root); put(f.root, '.lumine/wiki-state/updates/new/packet.json', { schemaVersion: 2, id: 'new', status: 'prepared', units: [], results: [] });
    assert.throws(() => applyCompaction(f.root, plan, compactionPlanHash(plan)), /INPUT_CHANGED/); rmSync(path.join(f.root, '.lumine/wiki-state/updates/new'), { recursive: true });
    plan = planCompaction(f.root); put(f.root, f.baseline.path, 'later human edit'); assert.throws(() => applyCompaction(f.root, plan, compactionPlanHash(plan)), /INPUT_CHANGED/);
    plan = planCompaction(f.root); applyCompaction(f.root, plan, compactionPlanHash(plan));
    const before = state(f.root); put(f.root, f.baseline.path, 'later edit after compaction');
    assert.throws(() => recoverCompaction(f.root, plan.operationId, { rollback: true }), /INPUT_CHANGED/); assert.deepEqual(state(f.root), before);
    const object = Object.keys(before).find((file) => file.includes('/objects/'))!; put(f.root, object, 'corrupt');
    assert.equal(checkStorage(f.root).ok, false); assert.throws(() => planCompaction(f.root), /CHECK_FAILED/);
  } finally { f.close(); }
});

test('unknown formats and divergent duplicate candidates are explicit protected failures', () => {
  const f = fixture(); try {
    put(f.root, '.lumine/wiki-state/new-format.json', { schemaVersion: 42 }); assert.equal(checkStorage(f.root).ok, false); assert.throws(() => planCompaction(f.root), /CHECK_FAILED/);
    rmSync(path.join(f.root, '.lumine/wiki-state/new-format.json'));
    put(f.root, `.lumine/wiki-state/updates/packet-partial/candidates/${hash('guide')}.md`, 'unique human candidate');
    assert.ok(checkStorage(f.root).issues.some((issue) => issue.message.includes('DIVERGED')));
    assert.throws(() => planCompaction(f.root), /CHECK_FAILED/);
  } finally { f.close(); }
});

test('known legacy single-document receipts and Markdown-only active candidates convert without losing their meaning', () => {
  const f = fixture(); try {
    rmSync(path.join(f.root, `.lumine/wiki-state/updates/packet-partial/candidates/${hash('guide')}.json`));
    put(f.root, '.lumine/wiki-state/transactions/legacy.json', { id: 'legacy', status: 'complete', path: f.baseline.path, previousRevision: hash(f.markdown), content: f.markdown, baseline: f.baseline });
    const plan = planCompaction(f.root); applyCompaction(f.root, plan, compactionPlanHash(plan));
    const receipt = readStorageRecord<any>(f.root, '.lumine/wiki-state/transactions/legacy.json', null);
    assert.equal(receipt.legacyAudit.contentHash, hash(f.markdown)); assert.equal(receipt.storageReceipt, true);
    assert.equal(readStorageRecord<any>(f.root, `.lumine/wiki-state/updates/packet-partial/candidates/${hash('guide')}.json`, null).markdown, f.markdown);
  } finally { f.close(); }
});

test('an unfinished transaction keeps the byte baseline required by its existing CAS and can recover after migration', () => {
  const f = fixture(); try {
    const relative = `.lumine/wiki-state/documents/${hash('guide')}.json`;
    put(f.root, '.lumine/wiki-state/transactions/inflight.json', { schemaVersion: 1, id: 'inflight', status: 'pending', mutations: [{ path: relative, before: json(f.baseline), after: json({ ...f.baseline, generation: 5 }) }] });
    const plan = planCompaction(f.root); assert.ok(plan.protected.some((entry) => entry.reason === 'inflight-transaction-byte-baseline'));
    applyCompaction(f.root, plan, compactionPlanHash(plan));
    assert.deepEqual(recoverTransactions(f.root), ['inflight']);
    assert.equal(readStorageRecord<any>(f.root, relative, null).generation, 5);
  } finally { f.close(); }
});

test('Git recovery bytes are excluded before source bytes are saved', () => {
  const f = fixture(); try {
    execFileSync('git', ['init', '-q'], { cwd: f.root });
    const plan = planCompaction(f.root); applyCompaction(f.root, plan, compactionPlanHash(plan));
    execFileSync('git', ['check-ignore', '-q', `.lumine-migrations/${plan.operationId}/journal.json`], { cwd: f.root });
    assert.ok(inspectStorage(f.root).gitHistoryBytes !== null);
  } finally { f.close(); }
});

test('completed status never deletes a later edited candidate or an unproven lone Markdown candidate', () => {
  for (const onlyMarkdown of [false, true]) {
    const f = fixture(); try {
      const stem = `.lumine/wiki-state/updates/packet-applied/candidates/${hash('guide')}`, edited = f.markdown + '\n尚未应用的人工候选。\n';
      put(f.root, stem + '.md', edited);
      if (onlyMarkdown) rmSync(path.join(f.root, stem + '.json')); else put(f.root, stem + '.json', { id: 'guide', markdown: edited });
      const plan = planCompaction(f.root); assert.ok(plan.protected.some((entry) => entry.reason.includes('consumption-not-proven')));
      applyCompaction(f.root, plan, compactionPlanHash(plan));
      assert.equal(readStorageRecord<any>(f.root, stem + '.json', null).markdown, edited);
      const receipt = readStorageRecord<any>(f.root, '.lumine/wiki-state/updates/packet-applied/packet.json', null);
      assert.equal(receipt.status, 'applied'); assert.equal(receipt.results[0].candidatePath, stem + '.json'); assert.equal(receipt.results[0].previousCandidatePath, stem + '.md');
      assert.equal(receipt.retainedCandidates[0].contentHash, hash(edited));
      assert.equal(planCompaction(f.root).changes.length, 0);
    } finally { f.close(); }
  }
});

test('all rollback writes can be interrupted and recovery never lowers the version fence before old bytes are restored', () => {
  const probe = fixture(); let total = 0;
  try { const plan = planCompaction(probe.root); applyCompaction(probe.root, plan, compactionPlanHash(plan)); recoverCompaction(probe.root, plan.operationId, { rollback: true, onStep: () => total++ }); } finally { probe.close(); }
  for (let point = 1; point <= total; point++) {
    const f = fixture(); try {
      const before = state(f.root), plan = planCompaction(f.root); applyCompaction(f.root, plan, compactionPlanHash(plan));
      assert.throws(() => recoverCompaction(f.root, plan.operationId, { rollback: true, interruptAfterStep: point }), /INJECTED_INTERRUPTION/);
      if (JSON.parse(readFileSync(path.join(f.root, '.lumine/project.json'), 'utf8')).schemaVersion === 2) assert.deepEqual(state(f.root), before);
      recoverCompaction(f.root, plan.operationId, { rollback: true }); assert.deepEqual(state(f.root), before);
    } finally { f.close(); }
  }
});

test('corrupt recovery bytes and competing locks fail before state mutation', () => {
  const f = fixture(); try {
    const before = state(f.root), plan = planCompaction(f.root);
    put(f.root, '.lumine/local/wiki/write.lock', 'another writer'); assert.throws(() => applyCompaction(f.root, plan, compactionPlanHash(plan)), /WRITE_LOCKED/); rmSync(path.join(f.root, '.lumine/local/wiki/write.lock'));
    assert.throws(() => applyCompaction(f.root, plan, compactionPlanHash(plan), { onStep: (step) => { if (step === 'recovery-ready') throw new Error('pause'); } }), /pause/);
    const digest = plan.changes.find((change) => change.path.startsWith('.lumine/wiki-state/') && change.before)!.before!;
    put(f.root, `.lumine-migrations/${plan.operationId}/objects/${digest}`, 'corrupt original backup');
    assert.throws(() => recoverCompaction(f.root, plan.operationId), /BACKUP_CORRUPT/); assert.deepEqual(state(f.root), before);
  } finally { f.close(); }
});

test('metadata bytes survive compaction and an existing document rename can still roll back its exact alias CAS', async () => {
  const { prepareDocumentRename, applyDocumentOperation, recoverDocumentOperation } = await import('../core/document-operations.ts');
  const f = fixture(); try {
    const aliasPath = '.lumine/wiki-state/document-aliases.json', originalAliases = '{"历史名称":"guide"}\n';
    put(f.root, aliasPath, originalAliases);
    const beforeBody = readFileSync(path.join(f.root, f.baseline.path), 'utf8');
    const operation = prepareDocumentRename(f.root, 'guide', 'docs/repo-wiki/改名指南.md', hash(beforeBody));
    const aliasMutation = operation.mutations.find((entry) => entry.path === aliasPath)!;
    // A historical writer may have used a different valid JSON serialization.
    aliasMutation.after = JSON.stringify(JSON.parse(aliasMutation.after!), null, 4) + '\r\n';
    applyDocumentOperation(f.root, operation);
    const metadata = new Map<string, string>([
      [aliasPath, aliasMutation.after!],
      ['.lumine/wiki-state/coverage.json', '{ "schemaVersion":1,"topics":[] }\r\n'],
      ['.lumine/wiki-state/format.json', '{"knowledgeFormat":3,"schemaVersion":1}\n'],
      ['.lumine/wiki-state/source-dispositions.json', '{ "schemaVersion":1,"entries":[] }\n'],
      [`.lumine/wiki-state/reviews/${hash('guide')}.json`, '{"documentId":"guide","reviewedAt":"2026-01-01T00:00:00Z"}\n']
    ]);
    for (const [relative, content] of metadata) put(f.root, relative, content);
    const journalPath = `.lumine/wiki-state/document-operations/${operation.operationId}.json`;
    const originalJournal = readFileSync(path.join(f.root, journalPath), 'utf8');
    const plan = planCompaction(f.root);
    assert.ok(plan.changes.every((change) => !metadata.has(change.path)));
    applyCompaction(f.root, plan, compactionPlanHash(plan));
    for (const [relative, content] of metadata) assert.equal(readFileSync(path.join(f.root, relative), 'utf8'), content);
    assert.equal(readFileSync(path.join(f.root, journalPath), 'utf8'), originalJournal);
    assert.equal(recoverDocumentOperation(f.root, operation.operationId, true).status, 'rolled_back');
    assert.equal(readFileSync(path.join(f.root, aliasPath), 'utf8'), originalAliases);
    assert.equal(readFileSync(path.join(f.root, f.baseline.path), 'utf8'), beforeBody);
    assert.equal(existsSync(path.join(f.root, 'docs/repo-wiki/改名指南.md')), false);
  } finally { f.close(); }
});
