import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveWiki } from '../wiki/server.ts';
import { hash } from '../wiki/files.ts';
import { recordSourceDisposition } from '../wiki/dispositions.ts';
import { scanWiki, showKnowledge } from '../wiki/engine.ts';
import { validationDocumentId } from '../wiki/validation-documents.ts';
import { loadProjectConfig } from '../core/project-config.ts';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-search-page-'));
  const write = (file: string, text: string) => { const absolute = path.join(root, file); mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, text); };
  write('.lumine/root.json', JSON.stringify({ schemaVersion: 2, kind: 'lumine-root', projectId: 'project-search-test' }));
  write('.lumine/project.json', JSON.stringify({ schemaVersion: 2, workflowVersion: 2, locale: 'en', displayName: 'Sample Project', repositories: [{ id: 'root', path: '.' }], wiki: { root: 'docs/repo-wiki', maxCards: 6, watchScopes: [{ repoId: 'root', path: 'src' }] } }));
  write('.lumine/wiki-state/coverage.json', JSON.stringify({ schemaVersion: 1, topics: [{ id: 'alpha', title: 'Alpha', questions: ['How does alpha work?'], sourceScopes: [{ repoId: 'root', path: 'src' }], documentRefs: ['alpha-1'], status: 'covered' }] }));
  write('reader/index.html', '<html>Reader</html>');
  write('src/known.ts', 'export const known = true;\n');
  write('src/new.ts', 'export const newItem = true;\n');
  for (let index = 1; index <= 3; index++) write(`docs/repo-wiki/alpha-${index}.md`, `---\nid: alpha-${index}\ntitle: Alpha ${index}\nsummary: Alpha mechanism ${index}.\ntype: mechanism\nstatus: current\nlocale: en\n${index === 1 ? 'sources:\n  - id: known\n    repoId: root\n    path: src/known.ts\n' : ''}---\n# Alpha ${index}\n\n<a id="detail-${index}"></a>\n## Detail\n\nAlpha behavior ${index}.\n`);
  write('docs/product-specs/alpha-spec.md', '---\nid: alpha-spec\ntype: product-spec\nstatus: active\n---\n# Alpha spec\n\nAlpha requirement.\n');
  write('docs/exec-plans/active/alpha-plan.md', '---\nid: alpha-plan\ntype: exec-plan\nstatus: active\n---\n# Alpha plan\n\nAlpha execution.\n');
  return { root, write, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('Wiki CLI treats explicit --root as an exact project root', () => {
  const data = fixture();
  try {
    const extension = import.meta.url.endsWith('.mjs') ? 'mjs' : 'ts';
    const cli = fileURLToPath(new URL(`../wiki.${extension}`, import.meta.url));
    const loader = extension === 'ts' ? ['--import', 'tsx'] : [];
    const valid = spawnSync(process.execPath, [...loader, cli, 'map', '--root', data.root, '--json'], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    const nested = spawnSync(process.execPath, [...loader, cli, 'map', '--root', path.join(data.root, 'src'), '--json'], { encoding: 'utf8' });
    assert.equal(nested.status, 1, 'an explicit nested directory cannot silently select its ancestor project');
  } finally { data.close(); }
});

test('reader search paginates complete Wiki matches, isolates Agent query budget and restarts after an index change', async () => {
  const data = fixture(); let reader: Awaited<ReturnType<typeof serveWiki>> | undefined;
  try {
    reader = await serveWiki(data.root, { port: 0, assetsRoot: path.join(data.root, 'reader') });
    const get = async (url: string) => { const response = await fetch(`${reader!.url}${url}`); return { status: response.status, body: await response.json() as any }; };
    const config = await get('/api/config');
    assert.equal(config.body.projectId, 'project-search-test'); assert.equal(config.body.displayName, 'Sample Project');
    const first = await get('/api/search?q=Alpha&limit=1');
    assert.equal(first.status, 200); assert.equal(first.body.total, 3); assert.equal(first.body.cards.length, 1); assert.equal(first.body.hasMore, true);
    assert.ok(first.body.cards[0].matches[0].reference.startsWith('alpha-'));
    const second = await get(`/api/search?q=Alpha&limit=1&cursor=${first.body.nextCursor}`);
    assert.equal(second.body.cards.length, 1); assert.notEqual(second.body.cards[0].id, first.body.cards[0].id);
    const all = await get('/api/search?q=Alpha&scope=all&limit=20');
    assert.equal(all.body.total, 5); assert.equal(all.body.hasMore, false);
    const agent = await get('/api/query?q=Alpha&limit=6');
    assert.equal(agent.body.cards.length, 3); assert.ok(agent.body.contextChars <= 12000);
    data.write('docs/repo-wiki/alpha-1.md', readFileSync(path.join(data.root, 'docs/repo-wiki/alpha-1.md'), 'utf8').replace('Alpha behavior 1.', 'Alpha behavior 1 changed.'));
    const stale = await get(`/api/search?q=Alpha&limit=1&cursor=${first.body.nextCursor}`);
    assert.equal(stale.status, 400); assert.equal(stale.body.code, 'SEARCH_CURSOR_STALE');
    assert.equal((await get('/api/search?q=Alpha&scope=private')).body.code, 'SEARCH_SCOPE_INVALID');
  } finally { await reader?.close(); data.close(); }
});

test('source dispositions are scoped, versioned and re-open after source or topic changes', () => {
  const data = fixture();
  try {
    const first = scanWiki(data.root);
    const source = first.sourceDispositions.find((item) => item.file === 'root:src/new.ts')!;
    assert.equal(source.status, 'pending'); assert.ok(first.unclassifiedFiles.includes(source.file));
    assert.throws(() => recordSourceDisposition(data.root, { file: source.file, topicId: 'alpha', scope: { repoId: 'root', path: 'src' }, action: 'covered', reason: 'The existing topic explains this behavior.', expectedFingerprint: hash('old') }), /FINGERPRINT_CHANGED/);
    const decision = recordSourceDisposition(data.root, { file: source.file, topicId: 'alpha', scope: { repoId: 'root', path: 'src' }, action: 'covered', reason: 'The existing topic explains this behavior.', expectedFingerprint: source.fingerprint });
    assert.equal(decision.fingerprint, hash('export const newItem = true;\n'));
    assert.equal(scanWiki(data.root).sourceDispositions.find((item) => item.file === source.file)?.status, 'current');
    assert.ok(!scanWiki(data.root).unclassifiedFiles.includes(source.file));
    const wikiPath = 'docs/repo-wiki/alpha-1.md';
    data.write(wikiPath, readFileSync(path.join(data.root, wikiPath), 'utf8').replace('Alpha behavior 1.', 'Alpha behavior has changed.'));
    assert.equal(scanWiki(data.root).sourceDispositions.find((item) => item.file === source.file)?.status, 'stale', 'a linked explanation changed');
    recordSourceDisposition(data.root, { file: source.file, topicId: 'alpha', scope: { repoId: 'root', path: 'src' }, action: 'covered', reason: 'Rechecked the revised topic explanation.', expectedFingerprint: source.fingerprint });
    assert.equal(scanWiki(data.root).sourceDispositions.find((item) => item.file === source.file)?.status, 'current');
    data.write('src/new.ts', 'export const newItem = false;\n');
    assert.equal(scanWiki(data.root).sourceDispositions.find((item) => item.file === source.file)?.status, 'stale');
    const changed = scanWiki(data.root).sourceDispositions.find((item) => item.file === source.file)!;
    recordSourceDisposition(data.root, { file: source.file, topicId: 'alpha', scope: { repoId: 'root', path: 'src' }, action: 'needs-explanation', reason: 'Behavior changed and requires a revised explanation.', expectedFingerprint: changed.fingerprint });
    const coverage = JSON.parse(readFileSync(path.join(data.root, '.lumine/wiki-state/coverage.json'), 'utf8'));
    coverage.topics[0].questions.push('What changed?'); data.write('.lumine/wiki-state/coverage.json', JSON.stringify(coverage));
    assert.equal(scanWiki(data.root).sourceDispositions.find((item) => item.file === source.file)?.status, 'stale');
  } finally { data.close(); }
});

test('a damaged coverage map leaves the source observation scan available and reopens classifications', () => {
  const data = fixture();
  try {
    data.write('.lumine/wiki-state/coverage.json', '{broken');
    const scan = scanWiki(data.root);
    assert.equal(scan.documents.length, 3);
    assert.ok(scan.classificationIssues.some((issue) => issue.code === 'COVERAGE_INVALID'));
    assert.ok(scan.unclassifiedFiles.includes('root:src/new.ts'));
    assert.equal(scan.sourceDispositions.find((item) => item.file === 'root:src/new.ts')?.status, 'pending');
    assert.equal(showKnowledge(data.root, 'alpha-1').checkedAt, scan.checkedAt, 'source observation remains durable even when coverage is damaged');
  } finally { data.close(); }
});

test('validation search reads only individually registered Markdown and invalidates a changed page cursor', async () => {
  const data = fixture(); let reader: Awaited<ReturnType<typeof serveWiki>> | undefined;
  try {
    const registered = 'docs/validation/registered.md', unlisted = 'docs/validation/unlisted.md';
    data.write(registered, '# Registered evidence\n\nProofUnique explanation.\n');
    data.write(unlisted, '# Unlisted evidence\n\nProofUnique private detail.\n');
    const configFile = path.join(data.root, '.lumine/project.json'), config = JSON.parse(readFileSync(configFile, 'utf8'));
    config.wiki.searchValidationFiles = [registered]; data.write('.lumine/project.json', JSON.stringify(config));
    reader = await serveWiki(data.root, { port: 0, assetsRoot: path.join(data.root, 'reader') });
    const get = async (url: string) => { const response = await fetch(`${reader!.url}${url}`); return { status: response.status, body: await response.json() as any }; };
    const first = await get('/api/search?q=ProofUnique&scope=all&limit=1');
    assert.equal(first.body.total, 1); assert.equal(first.body.cards[0].id, validationDocumentId(registered));
    assert.equal(first.body.cards[0].collection, 'validation');
    const document = await get(`/api/document?id=${encodeURIComponent(validationDocumentId(registered))}`);
    assert.equal(document.status, 200); assert.match(document.body.body, /ProofUnique explanation/);
    assert.equal((await get(`/api/document?id=${encodeURIComponent(validationDocumentId(unlisted))}`)).status, 404);
    assert.ok(!(await get('/api/catalog')).body.documents.some((item: any) => item.path === unlisted));
    const page = await get('/api/search?q=Alpha&scope=all&limit=1');
    data.write(registered, '# Registered evidence\n\nProofUnique explanation, revised.\n');
    assert.equal((await get(`/api/search?q=Alpha&scope=all&limit=1&cursor=${page.body.nextCursor}`)).body.code, 'SEARCH_CURSOR_STALE');
  } finally { await reader?.close(); data.close(); }
});

test('validation registration rejects traversal, glob, directories and outside paths', () => {
  const data = fixture();
  try {
    const configFile = path.join(data.root, '.lumine/project.json'), base = JSON.parse(readFileSync(configFile, 'utf8'));
    for (const bad of ['docs/validation/../secret.md', 'docs/validation/**/*.md', 'docs/validation', '../elsewhere.md']) {
      data.write('.lumine/project.json', JSON.stringify({ ...base, wiki: { ...base.wiki, searchValidationFiles: [bad] } }));
      assert.throws(() => loadProjectConfig(data.root), /searchValidationFiles|escapes/, bad);
    }
    mkdirSync(path.join(data.root, 'docs/validation/folder.md'), { recursive: true });
    data.write('.lumine/project.json', JSON.stringify({ ...base, wiki: { ...base.wiki, searchValidationFiles: ['docs/validation/folder.md'] } }));
    assert.throws(() => loadProjectConfig(data.root), /must be files/);
  } finally { data.close(); }
});

test('validation namespace preserves real Wiki IDs and suppresses a synthetic identity collision', async () => {
  const data = fixture(); let reader: Awaited<ReturnType<typeof serveWiki>> | undefined;
  try {
    data.write('docs/repo-wiki/named-validation.md', '---\nid: validation:overview\ntitle: Validation named Wiki\nsummary: This is a Wiki page.\ntype: mechanism\nstatus: current\n---\n# Validation named Wiki\n\nWiki namespace behavior.\n');
    const registered = 'docs/validation/colliding.md', syntheticId = validationDocumentId(registered);
    data.write(registered, '# Registered evidence\n\nSynthetic collision evidence.\n');
    data.write('docs/repo-wiki/collision.md', `---\nid: ${syntheticId}\ntitle: Collision owner\nsummary: Managed Wiki identity wins.\ntype: mechanism\nstatus: current\n---\n# Collision owner\n\nManaged Wiki content.\n`);
    const config = JSON.parse(readFileSync(path.join(data.root, '.lumine/project.json'), 'utf8'));
    config.wiki.searchValidationFiles = [registered]; data.write('.lumine/project.json', JSON.stringify(config));
    reader = await serveWiki(data.root, { port: 0, assetsRoot: path.join(data.root, 'reader') });
    const get = async (url: string) => { const response = await fetch(`${reader!.url}${url}`); return { status: response.status, body: await response.json() as any }; };
    const named = await get('/api/document?id=validation%3Aoverview');
    assert.equal(named.status, 200); assert.equal(named.body.collection, 'wiki');
    const collision = await get(`/api/document?id=${encodeURIComponent(syntheticId)}`);
    assert.equal(collision.status, 200); assert.equal(collision.body.collection, 'wiki'); assert.match(collision.body.body, /Managed Wiki content/);
    const catalog = await get('/api/catalog');
    assert.equal(catalog.body.documents.filter((item: any) => item.id === syntheticId).length, 1);
    assert.ok(catalog.body.issues.some((item: any) => item.code === 'VALIDATION_ID_COLLISION'));
    const search = await get('/api/search?q=collision&scope=all');
    assert.ok(search.body.cards.some((item: any) => item.id === syntheticId && item.collection === 'wiki'));
    assert.ok(!search.body.cards.some((item: any) => item.id === syntheticId && item.collection === 'validation'));
  } finally { await reader?.close(); data.close(); }
});
