import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { hash, snapshotSources } from '../wiki/files.ts';
import { prepareUpdate, scanWiki } from '../wiki/engine.ts';
import type { SourceSnapshot } from '../wiki/types.ts';

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lumine-wiki-scopes-')));
  const write = (file: string, body: string) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), body); };
  write('.lumine/project.json', JSON.stringify({ schemaVersion: 2, repositories: [{ id: 'root', path: '.' }, { id: 'api', path: 'api' }], wiki: { watchScopes: [{ repoId: 'root', path: 'src' }] } }));
  write('src/deep/a.ts', 'nested'); write('src/b.ts', 'parent'); write('README.md', 'exact outside scopes'); write('api/source.ts', 'other repository');
  return { root, write, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function countSourceIO(context: TestContext, root: string) {
  const reads = new Map<string, number>(), directories = new Map<string, number>();
  const read = fs.readFileSync, list = fs.readdirSync;
  context.mock.method(fs, 'readFileSync', ((file: fs.PathOrFileDescriptor, options?: any) => { if (typeof file === 'string') { const relative = path.relative(root, file); reads.set(relative, (reads.get(relative) ?? 0) + 1); } return read(file, options); }) as typeof fs.readFileSync);
  context.mock.method(fs, 'readdirSync', ((file: fs.PathLike, options?: any) => { if (typeof file === 'string') { const relative = path.relative(root, file); directories.set(relative, (directories.get(relative) ?? 0) + 1); } return list(file, options); }) as typeof fs.readdirSync);
  syncBuiltinESMExports();
  return { reads, directories, restore: () => { context.mock.restoreAll(); syncBuiltinESMExports(); } };
}

test('source snapshots reuse parent ranges and exact bytes within one operation', context => {
  const data = fixture(), io = countSourceIO(context, data.root);
  try {
    const cache = new Map<string, SourceSnapshot>();
    const parent = snapshotSources(data.root, [], [{ repoId: 'root', path: 'src' }], cache);
    const child = snapshotSources(data.root, [{ id: 'a', repoId: 'root', path: 'src/deep/a.ts' }, { id: 'readme', repoId: 'root', path: 'README.md' }], [{ repoId: 'root', path: 'src/deep' }, { repoId: 'root', path: 'src/lost' }], cache);
    assert.equal(io.reads.get('src/deep/a.ts'), 1); assert.equal(io.directories.get('src/deep'), 1); assert.equal(io.reads.get('README.md'), 1);
    assert.deepEqual(child.files, { 'root:src/deep/a.ts': hash('nested') });
    assert.equal(child.fingerprints['root:README.md'], hash('exact outside scopes')); assert.deepEqual(child.missing, ['root:src/lost']);
    assert.equal(parent.files['root:src/b.ts'], hash('parent'));
    io.restore();
    assert.deepEqual(child, snapshotSources(data.root, [{ id: 'a', repoId: 'root', path: 'src/deep/a.ts' }, { id: 'readme', repoId: 'root', path: 'README.md' }], [{ repoId: 'root', path: 'src/deep' }, { repoId: 'root', path: 'src/lost' }]));
  } finally { io.restore(); data.close(); }
});

test('a later parent snapshot reuses already captured descendant subtrees without fingerprint drift', context => {
  const data = fixture(), io = countSourceIO(context, data.root);
  try {
    const cache = new Map<string, SourceSnapshot>();
    snapshotSources(data.root, [], [{ repoId: 'root', path: 'src/deep' }], cache);
    const parent = snapshotSources(data.root, [], [{ repoId: 'root', path: './src' }, { repoId: 'root', path: 'src/deep' }], cache);
    assert.equal(io.reads.get('src/deep/a.ts'), 1); assert.equal(io.directories.get('src/deep'), 1); assert.equal(io.reads.get('src/b.ts'), 1);
    io.restore();
    assert.deepEqual(parent, snapshotSources(data.root, [], [{ repoId: 'root', path: './src' }, { repoId: 'root', path: 'src/deep' }]));
  } finally { io.restore(); data.close(); }
});

test('cache reuse preserves repository, ignore and missing boundaries and new operations see additions/deletions', () => {
  const data = fixture();
  try {
    data.write('.gitignore', 'src/ignored\n'); data.write('src/ignored/hidden.ts', 'ignored');
    const scopes = [{ repoId: 'root', path: '.' }, { repoId: 'root', path: 'src/ignored' }, { repoId: 'root', path: 'absent' }, { repoId: 'api', path: '.' }];
    const before = snapshotSources(data.root, [], scopes);
    assert.ok(!('root:api/source.ts' in before.files)); assert.equal(before.files['api:source.ts'], hash('other repository'));
    assert.ok(!('root:src/ignored/hidden.ts' in before.files)); assert.deepEqual(before.missing, ['root:src/ignored', 'root:absent']);
    data.write('src/deep/new.ts', 'new'); fs.unlinkSync(path.join(data.root, 'src/deep/a.ts'));
    const after = snapshotSources(data.root, [{ id: 'missing', repoId: 'root', path: 'src/deep/a.ts' }], scopes);
    assert.equal(after.files['root:src/deep/new.ts'], hash('new')); assert.ok(!('root:src/deep/a.ts' in after.files));
    assert.equal(after.fingerprints['root:src/deep/a.ts'], null); assert.ok(after.missing.includes('root:src/deep/a.ts'));
    assert.notEqual(before.scopeFingerprints['root:.'], after.scopeFingerprints['root:.']);
  } finally { data.close(); }
});

test('scan and prepare share overlap snapshots only within that operation', context => {
  const data = fixture();
  try {
    const metadata = { id: 'nested', title: 'Nested source', summary: 'Nested source', sources: [{ id: 'a', repoId: 'root', path: 'src/deep/a.ts' }], watchScopes: [{ repoId: 'root', path: 'src/deep' }], relations: [] };
    data.write('docs/repo-wiki/nested.md', `---\n${JSON.stringify(metadata)}\n---\n# Nested\n`);
    let io = countSourceIO(context, data.root);
    try { scanWiki(data.root); assert.equal(io.reads.get('src/deep/a.ts'), 1); assert.equal(io.directories.get('src/deep'), 1); }
    finally { io.restore(); }
    data.write('src/deep/new.ts', 'created after scan');
    assert.ok(scanWiki(data.root).unclassifiedFiles.includes('root:src/deep/new.ts'));
    io = countSourceIO(context, data.root);
    let packet;
    try {
      packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'nested' }, { kind: 'create', id: 'parent', path: 'docs/repo-wiki/parent.md', sourceRefs: [{ id: 'b', repoId: 'root', path: 'src/b.ts' }], watchScopes: [{ repoId: 'root', path: 'src' }] }] });
      assert.equal(io.reads.get('src/deep/a.ts'), 1); assert.equal(io.directories.get('src/deep'), 1); assert.equal(io.reads.get('src/b.ts'), 1);
    } finally { io.restore(); }
    assert.equal(packet!.units[1].sources.files['root:src/deep/new.ts'], hash('created after scan'));
    data.write('src/deep/a.ts', 'changed after prepare');
    const later = prepareUpdate(data.root, ['nested']);
    assert.equal(later.units[0].sources.fingerprints['root:src/deep/a.ts'], hash('changed after prepare'));
  } finally { data.close(); }
});
