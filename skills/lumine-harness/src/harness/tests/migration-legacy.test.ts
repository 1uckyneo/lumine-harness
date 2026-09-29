import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupLegacy, convertLegacySessions, finishLegacy, legacyRetirements, legacyRetirementConflicts, legacyTransition, restoreLegacy } from '../../migration/legacy.ts';
import { getSessionStatePath } from '../core/work-status.ts';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-legacy-'));
  const write = (relative: string, body: string) => { const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, body); return file; };
  const managed = (files: Record<string, string>) => write('.harness/managed.json', JSON.stringify({ files: Object.fromEntries(Object.entries(files).map(([relative, body]) => [relative, { hash: createHash('sha256').update(body).digest('hex') }])) }));
  return { root, write, managed, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test('legacy hook bridge executes a guarded entry and forwards stdin, arguments and exit status', () => {
  const f = fixture();
  try {
    const relative = '.harness/adapters/codebuddy/hooks/dispatch.mjs';
    f.write(relative, 'old hook'); f.managed({ [relative]: 'old hook' });
    f.write('.lumine/adapters/codebuddy/hooks/dispatch.mjs', `import { readFileSync } from 'node:fs';\nimport { fileURLToPath } from 'node:url';\nif (fileURLToPath(import.meta.url) === process.argv[1]) { process.stdout.write(JSON.stringify({ body: readFileSync(0, 'utf8'), args: process.argv.slice(2) })); process.exit(7); }\n`);
    const transition = legacyTransition(f.root, ['codebuddy']);
    f.write(relative, transition.bridges[relative]);
    const result = spawnSync(process.execPath, [path.join(f.root, relative), 'stop', 'argument with spaces'], { input: '{"session":"test"}', encoding: 'utf8' });
    assert.equal(result.status, 7);
    assert.deepEqual(JSON.parse(result.stdout), { body: '{"session":"test"}', args: ['stop', 'argument with spaces'] });
  } finally { f.clean(); }
});

test('private trees, embedded repositories and symlinks stay outside cleanup even with reviewed paths', () => {
  const f = fixture();
  try {
    f.write('.harness/project.json', '{}');
    f.write('.harness/local/only-copy.txt', 'private');
    f.write('.harness/archive/worktree/.git', 'gitdir: metadata');
    f.write('.harness/archive/worktree/source.txt', 'business');
    f.write('outside.txt', 'outside');
    symlinkSync(path.join(f.root, 'outside.txt'), path.join(f.root, '.harness/link'));
    const transition = legacyTransition(f.root, [], ['.harness/local/only-copy.txt', '.harness/archive/worktree/source.txt', '.harness/link']);
    assert.deepEqual(transition.protectedPaths, ['.harness/archive/worktree', '.harness/link', '.harness/local']);
    assert.deepEqual(Object.keys(transition.before), ['.harness/project.json']);
    const recovery = path.join(f.root, 'recovery');
    backupLegacy(f.root, recovery, transition.before);
    assert.throws(() => finishLegacy(f.root, recovery, transition.before, transition.bridges, transition.protectedPaths), /Protected legacy content/);
    assert.ok(existsSync(path.join(f.root, '.harness/project.json')), 'validate every protected path before deleting any runtime file');
    assert.equal(readFileSync(path.join(f.root, '.harness/local/only-copy.txt'), 'utf8'), 'private');
  } finally { f.clean(); }
});

test('unclassified and newly appearing files stop finalization before cleanup', () => {
  const f = fixture();
  try {
    f.write('.harness/project.json', '{}'); f.write('.harness/custom/rule.txt', 'custom');
    assert.deepEqual(legacyTransition(f.root, []).protectedPaths, ['.harness/custom/rule.txt']);
    const reviewed = legacyTransition(f.root, [], ['.harness/custom/rule.txt']);
    const recovery = path.join(f.root, 'recovery'); backupLegacy(f.root, recovery, reviewed.before);
    f.write('.harness/new.txt', 'later');
    assert.throws(() => finishLegacy(f.root, recovery, reviewed.before, reviewed.bridges), /new.txt/);
    assert.equal(readFileSync(path.join(f.root, '.harness/custom/rule.txt'), 'utf8'), 'custom');
  } finally { f.clean(); }
});

test('verified cleanup can resume after an individual deletion and rollback restores verified originals', () => {
  const f = fixture();
  try {
    f.write('.harness/project.json', '{}'); f.write('.harness/cli', 'old cli'); f.managed({ '.harness/cli': 'old cli' });
    const transition = legacyTransition(f.root, []), recovery = path.join(f.root, 'recovery');
    backupLegacy(f.root, recovery, transition.before);
    f.write('.harness/cli', transition.bridges['.harness/cli']);
    rmSync(path.join(f.root, '.harness/project.json'));
    finishLegacy(f.root, recovery, transition.before, transition.bridges);
    assert.equal(existsSync(path.join(f.root, '.harness')), false);
    assert.deepEqual(restoreLegacy(f.root, recovery, transition.before, transition.bridges), []);
    assert.equal(readFileSync(path.join(f.root, '.harness/cli'), 'utf8'), 'old cli');
  } finally { f.clean(); }
});

test('retired templates and Skills require an unchanged baseline or an explicit reviewed file', () => {
  const f = fixture();
  try {
    const plain = 'docs/templates/draft.md', changed = 'docs/templates/handoff.md', skill = '.agents/skills/lumine-harness-run/SKILL.md';
    f.write(plain, 'template'); f.write(changed, 'human edit'); f.write(skill, 'custom rules');
    f.managed({ [plain]: 'template', [changed]: 'old template', [skill]: 'old skill' });
    assert.deepEqual(legacyRetirements(f.root), [plain]);
    assert.deepEqual(legacyRetirementConflicts(f.root), [skill, changed]);
    assert.deepEqual(legacyRetirements(f.root, [skill, changed]), [skill, plain, changed]);
    assert.deepEqual(legacyRetirementConflicts(f.root, [skill, changed]), []);
    assert.equal(readFileSync(path.join(f.root, changed), 'utf8'), 'human edit');
  } finally { f.clean(); }
});

test('session migration uses the Core identity path and archives old probes and ambiguous data', () => {
  const f = fixture();
  try {
    const original = { product: 'codex', sessionId: 'session/with space', taskId: 'work', progressRevision: 9, expectedSkill: 'lumine-harness-run', expectedSkillRead: true, expectedSkills: ['old'], usedSkills: ['old'], requestedActivity: 'implement', taskUserTurnRevision: 3, pendingContinuationRequestId: 'old-request' };
    f.write('.harness/runtime/sessions/old.json', JSON.stringify(original));
    f.write('.harness/runtime/sessions/no-product.json', JSON.stringify({ sessionId: 'unidentified' }));
    f.write('.harness/runtime/current/codex.json', JSON.stringify({ product: 'codex', sessionId: original.sessionId }));
    f.write('.harness/runtime/probe.json', JSON.stringify({ product: 'codex', sessionId: original.sessionId, schemaVersion: 1 }));
    f.write('.harness/runtime/broken.json', '{broken');
    const converted = convertLegacySessions(f.root);
    const target = path.relative(f.root, getSessionStatePath(f.root, 'codex', original.sessionId)).split(path.sep).join('/');
    const value = JSON.parse(converted.get(target)!);
    assert.equal(value.taskId, 'work'); assert.equal(value.progressRevision, 9);
    assert.deepEqual(value.expectedSkills, []); assert.deepEqual(value.usedSkills, []);
    assert.equal(value.expectedSkill, undefined); assert.equal(value.expectedSkillRead, false);
    assert.equal(value.taskUserTurnRevision, undefined); assert.equal(value.requestedActivity, null);
    assert.equal(value.pendingContinuationRequestId, null);
    assert.equal([...converted.keys()].filter((key) => key.startsWith('.lumine/local/runtime/')).length, 1);
    assert.equal(converted.get('.lumine/local/migration-history/runtime/broken.json'), '{broken');
    assert.ok(converted.has('.lumine/local/migration-history/runtime/current/codex.json'));
    assert.ok(converted.has('.lumine/local/migration-history/runtime/probe.json'));
  } finally { f.clean(); }
});

test('duplicate session identities are preserved as history instead of overwriting each other', () => {
  const f = fixture();
  try {
    f.write('.harness/runtime/sessions/a.json', JSON.stringify({ product: 'codex', sessionId: 'duplicate', progressRevision: 1 }));
    f.write('.harness/runtime/sessions/b.json', JSON.stringify({ product: 'codex', sessionId: 'duplicate', progressRevision: 2 }));
    const converted = convertLegacySessions(f.root);
    assert.equal(converted.size, 2);
    assert.ok([...converted.keys()].every((key) => key.startsWith('.lumine/local/migration-history/')));
  } finally { f.clean(); }
});


test('opaque runtime files remain protected rather than being converted through lossy UTF-8', () => {
  const f = fixture();
  try {
    f.write('.harness/project.json', '{}');
    const opaque = f.write('.harness/runtime/opaque.json', '');
    writeFileSync(opaque, Buffer.from([255, 0, 128]));
    assert.deepEqual(legacyTransition(f.root, []).protectedPaths, ['.harness/runtime/opaque.json']);
    assert.equal(convertLegacySessions(f.root).size, 0);
    assert.deepEqual(readFileSync(opaque), Buffer.from([255, 0, 128]));
  } finally { f.clean(); }
});
