import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectConfig } from '../core/project-config.ts';
import { applyDocumentOperation, archivePlan, prepareDocumentRename, renameDocument } from '../core/document-operations.ts';
import { applyCompaction, checkStorage, compactionPlanHash, planCompaction, recoverCompaction } from '../wiki/compaction.ts';
import { applyUpdate, auditKnowledge, mapKnowledge, prepareUpdate, queryKnowledge, recoverWiki, showKnowledge } from '../wiki/engine.ts';
import { hash } from '../wiki/files.ts';
import { parseDocument } from '../wiki/documents.ts';
import { renderKnowledgeMapMarkdown } from '../wiki/map-markdown.ts';
import { NAVIGATION_PATH } from '../wiki/navigation-contract.ts';
import { searchKnowledge } from '../wiki/search.ts';
import { serveWiki } from '../wiki/server.ts';
import type { ChangeManifest, NavigationContent } from '../wiki/types.ts';

const projectPath = '.lumine/project.json';
const source = { id: 'main', repoId: 'library', path: 'src/api.ts' };
const scopes = [{ repoId: 'library', path: 'src' }];
const navigation: NavigationContent = {
  schemaVersion: 1, overview: 'home',
  groups: [
    { id: 'understand', sections: [{ id: 'read', title: 'Daily use', documents: ['feature'] }] },
    { id: 'operate', sections: [{ id: 'safe', title: 'Engineering', documents: ['security'] }] },
    { id: 'reference', sections: [{ id: 'old', title: 'Prior behavior', documents: ['archive'] }] },
  ],
  unlisted: [],
  norms: [{ id: 'security', scope: 'Authentication and identity changes' }],
};
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-editorial-'));
  const put = (relative: string, value: unknown) => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');
  put('.lumine/root.json', { schemaVersion: 2, kind: 'lumine-root', projectId: 'editorial-fixture' });
  put(projectPath, { schemaVersion: 3, workflowVersion: 2, locale: 'en', repositories: [{ id: 'library', path: 'packages/library' }, { id: 'cli', path: 'packages/cli' }], wiki: { root: 'docs/repo-wiki', watchScopes: scopes } });
  put('packages/library/src/api.ts', 'export function authentication() { return true; }\n');
  put('packages/cli/main.ts', 'export const interfaceName = "cli";\n');
  const pages = {
    home: { title: 'Project overview', type: 'overview', status: 'current', body: 'Use the library and its CLI together.' },
    feature: { title: 'Authentication usage', type: 'business', status: 'current', body: 'Pass the current token.' },
    security: { title: 'Authentication standard', type: 'engineering-standard', status: 'current', body: 'Verify token ownership.' },
    archive: { title: 'Prior authentication', type: 'mechanism', status: 'historical', body: 'Archived behavior uniquelegacytoken.' },
  };
  const candidate = (id: keyof typeof pages, body = pages[id].body) => {
    const { title, type, status } = pages[id];
    return { id, markdown: ['---', JSON.stringify({ id, title, summary: title, type, status, locale: 'en', sources: [source], watchScopes: scopes }), '---', '', '# ' + title, '', '<a id="key-rule"></a>', '## Details', '', body, ''].join('\n') };
  };
  const pageIds = Object.keys(pages) as Array<keyof typeof pages>;
  const seeded = prepareUpdate(root, [], { schemaVersion: 1, changes: pageIds.map((id) => ({ kind: 'create', id, path: `docs/repo-wiki/${id}.md`, sourceRefs: [source], watchScopes: scopes })) });
  assert.equal(applyUpdate(root, seeded.id, pageIds.map((id) => candidate(id))).status, 'applied');
  const activate = () => {
    const plan = planCompaction(root, { editorial: true });
    assert.equal(plan.targetProjectSchemaVersion, 4);
    applyCompaction(root, plan, compactionPlanHash(plan));
    return plan;
  };
  const install = (nav = navigation) => {
    const manifest: ChangeManifest = { schemaVersion: 1, changes: [], navigation: nav, normativeChanges: [{ id: 'security', reason: 'Preserve the project requirements' }] };
    return applyUpdate(root, prepareUpdate(root, [], manifest).id, []);
  };
  return { root, put, read, candidate, activate, install, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('editorial activation is explicit, recoverable and preserves the workflow version', () => {
  const f = fixture();
  try {
    const original = f.read(projectPath);
    assert.equal(mapKnowledge(f.root).navigation.mode, 'legacy');
    assert.equal(f.read(projectPath), original);
    assert.equal(existsSync(path.join(f.root, NAVIGATION_PATH)), false);
    assert.throws(() => f.install(), /NAVIGATION_MIGRATION_REQUIRED/);
    const paused = planCompaction(f.root, { editorial: true });
    assert.ok(paused.changes.some(({ path }) => path === projectPath));
    assert.throws(() => applyCompaction(f.root, paused, compactionPlanHash(paused), { onStep: (step) => { if (step === `target:${projectPath}`) throw new Error('test interruption'); } }), /test interruption/);
    assert.equal(loadProjectConfig(f.root).schemaVersion, 4);
    assert.equal(recoverCompaction(f.root, paused.operationId).status, 'complete');
    assert.equal(loadProjectConfig(f.root).workflowVersion, 2);
    assert.equal(mapKnowledge(f.root).navigation.issues[0].code, 'NAVIGATION_REQUIRED');
    assert.equal(recoverCompaction(f.root, paused.operationId, { rollback: true }).status, 'rolled_back');
    assert.equal(f.read(projectPath), original);
    const planned = f.activate();
    assert.equal(f.install().status, 'applied');
    assert.throws(() => recoverCompaction(f.root, planned.operationId, { rollback: true }), /STORAGE_INPUT_CHANGED/);
    assert.equal(checkStorage(f.root).ok, true);
    assert.ok(!planCompaction(f.root).changes.some(({ path }) => path === projectPath), 'ordinary compaction must not lower the writer fence');
  } finally { f.close(); }
});

test('ordinary and pre-activation candidates cannot change normative text; explicit revision preserves its reason', () => {
  const f = fixture();
  try {
    const oldPacket = prepareUpdate(f.root, ['security']);
    f.activate();
    f.install();
    const original = f.read('docs/repo-wiki/security.md');
    const changed = f.candidate('security', 'Verify token ownership and record permission checks.');
    const applied = applyUpdate(f.root, oldPacket.id, [changed]);
    assert.equal(applied.status, 'partial');
    assert.match(applied.results[0].reason, /NORMATIVE_CHANGE_REQUIRED/);
    assert.equal(f.read('docs/repo-wiki/security.md'), original);
    const changedScope = { ...navigation, norms: [{ id: 'security', scope: 'Operational changes' }] };
    const noReason = prepareUpdate(f.root, [], { schemaVersion: 1, changes: [], navigation: changedScope });
    assert.throws(() => applyUpdate(f.root, noReason.id, []), /NORMATIVE_CHANGE_REQUIRED/);

    const packet = prepareUpdate(f.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'security' }], navigation: changedScope, normativeChanges: [{ id: 'security', reason: 'Update the standard and explain the expanded scope.' }] });
    assert.equal(applyUpdate(f.root, packet.id, [changed]).status, 'applied');
    assert.equal(showKnowledge(f.root, 'security').normativeScope, 'Operational changes');
    assert.match(f.read(`.lumine/wiki-state/updates/${packet.id}/packet.json`), /expanded scope/);
    assert.match(f.read('docs/repo-wiki/security.md'), /record permission checks/);
    const cards = queryKnowledge(f.root, 'Authentication standard').cards;
    assert.equal(cards.find(({ id }) => id === 'security')?.normativeScope, 'Operational changes');
  } finally { f.close(); }
});

test('navigation and content use one recoverable transaction with editorial and coverage order independent', () => {
  const f = fixture();
  try {
    f.activate();
    f.install();
    const before = f.read(NAVIGATION_PATH), next = structuredClone(navigation);
    next.groups[0].sections[0].title = 'Integration';
    const coverage = { schemaVersion: 1 as const, topics: [{ id: 'old-tree', status: 'partial' as const, title: 'Coverage topic', documentRefs: ['security', 'feature'], questions: [], sourceScopes: scopes }] };
    const packet = prepareUpdate(f.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'feature' }], coverage, navigation: next });
    assert.throws(() => applyUpdate(f.root, packet.id, [f.candidate('feature', 'Pass the current signed token.')], { failAfterWrites: 1 }), /INTERRUPTION/);
    assert.match(showKnowledge(f.root, 'feature').body, /current token/);
    assert.equal(f.read(NAVIGATION_PATH), before);
    assert.equal(mapKnowledge(f.root).topics.length, 0);
    assert.equal(recoverWiki(f.root).recovered.length, 1);
    assert.equal(applyUpdate(f.root, packet.id, []).status, 'applied');
    const map = mapKnowledge(f.root);
    assert.equal(map.navigation.groups[0].sections[0].title, 'Integration');
    assert.equal(map.topics[0].title, 'Coverage topic');
    assert.match(showKnowledge(f.root, 'feature').body, /signed token/);
    assert.ok(auditKnowledge(f.root).issues.some(({ code }) => code === 'COVERAGE_OPEN'));
    const output = renderKnowledgeMapMarkdown(map, (id) => showKnowledge(f.root, id), { locale: 'en', wikiRoot: 'docs/repo-wiki' });
    assert.ok(output.indexOf('Integration') < output.indexOf('Coverage topic'));
    assert.match(output, /Required for.*Authentication and identity changes/);
    const missing = structuredClone(next);
    missing.groups[0].sections = [];
    const unfinished = prepareUpdate(f.root, [], { schemaVersion: 1, changes: [], navigation: missing });
    assert.throws(() => applyUpdate(f.root, unfinished.id, []), /NAVIGATION_UNPLACED|NAVIGATION_BUSINESS_HIDDEN/);
    assert.equal(mapKnowledge(f.root).navigation.revision, hash(f.read(NAVIGATION_PATH)));
  } finally { f.close(); }
});

test('reader returns the same editorial map, with archives retrievable on demand only', async () => {
  const f = fixture();
  let service: Awaited<ReturnType<typeof serveWiki>> | undefined;
  try {
    f.activate();
    f.install();
    f.put('reader/index.html', '<!doctype html><title>Fixture</title>');
    service = await serveWiki(f.root, { port: 0, assetsRoot: path.join(f.root, 'reader') });
    const get = async (endpoint: string) => { const response = await fetch(new URL(endpoint, service!.url)); assert.equal(response.status, 200); return response.json(); };
    assert.deepEqual(await get('api/navigation'), mapKnowledge(f.root).navigation);
    assert.deepEqual((await get('api/map')).navigation, mapKnowledge(f.root).navigation);
    const catalog = await get('api/catalog');
    assert.equal(catalog.documents.find(({ id }: { id: string }) => id === 'archive').editorialRole, 'history');
    assert.equal((await get('api/search?q=uniquelegacytoken')).total, 0);
    assert.equal((await get('api/search?q=uniquelegacytoken&scope=all')).cards[0].id, 'archive');
    assert.equal(queryKnowledge(f.root, 'uniquelegacytoken').total, 0);
    assert.equal(queryKnowledge(f.root, 'uniquelegacytoken', { includeHistory: true }).cards[0].id, 'archive');
  } finally { await service?.close(); f.close(); }
});

test('document moves cannot remove a Wiki standard from its collection or replace its requirements', () => {
  const f = fixture();
  try {
    f.activate();
    f.install();
    const original = 'docs/repo-wiki/security.md';
    const renamed = 'docs/repo-wiki/rules/Authentication.md';
    const before = hash(f.read(original));
    assert.throws(() => archivePlan(f.root, original, before), /current-protocol/);
    assert.throws(() => renameDocument(f.root, 'security', 'docs/product-specs/Authentication.md', before), /preserve its collection/);
    const operation = prepareDocumentRename(f.root, 'security', renamed, before);
    const destination = operation.mutations.find(({ path }) => path === renamed)!;
    destination.after += '\nAn unrelated rule.\n';
    assert.throws(() => applyDocumentOperation(f.root, operation), /only rebase links/);
    assert.equal(hash(f.read(original)), before);
    assert.equal(renameDocument(f.root, 'security', renamed, before).status, 'complete');
    assert.equal(showKnowledge(f.root, original).id, 'security');
    assert.equal(showKnowledge(f.root, 'security').normativeScope, navigation.norms[0].scope);
    assert.deepEqual(mapKnowledge(f.root).navigation.issues, []);
  } finally { f.close(); }
});

test('exact feature titles and aliases take precedence over incidental lexical matches', () => {
  const page = (id: string, title: string, body: string, aliases: string[] = []) =>
    parseDocument(`---\n${JSON.stringify({ id, title, aliases, status: 'current', type: 'mechanism' })}\n---\n${body}`, `docs/repo-wiki/${id}.md`);
  const overview = page('feature', '项目管理', '# 生命周期\n\n新建入口与验收条件。', ['用户项目']);
  const operations = page('operations', '管理仓库', '# 项目管理与群组\n\n项目管理和用户项目凭据的管理。');
  for (const name of ['项目管理', '用户项目']) {
    assert.equal(searchKnowledge([operations, overview], name, 6, 12000).cards[0].id, 'feature');
  }
});
