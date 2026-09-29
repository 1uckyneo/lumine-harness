import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyUpdate, prepareUpdate, queryKnowledge, showKnowledge, outlineKnowledge, mapKnowledge, relatedKnowledge, inspectKnowledge, scanWiki, recoverWiki, recordSemanticReview, recordUpdateDecision, sourceFingerprint, checkWiki } from '../wiki/engine.ts';
import { parseSections } from '../wiki/sections.ts';
import { baselineFor, parseDocument } from '../wiki/documents.ts';
import { searchKnowledge } from '../wiki/search.ts';
import { hash, snapshotSources } from '../wiki/files.ts';
import type { ChangeManifest, CoverageContent, ReviewRecord } from '../wiki/types.ts';
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-agentic-'));
  mkdirSync(path.join(root, '.lumine'), { recursive: true }); mkdirSync(path.join(root, 'docs/repo-wiki'), { recursive: true }); mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, '.lumine/root.json'), JSON.stringify({ schemaVersion: 2, kind: 'lumine-root' }));
  writeFileSync(path.join(root, '.lumine/project.json'), JSON.stringify({ schemaVersion: 2, workflowVersion: 2, locale: 'zh-CN', repositories: [{ id: 'root', path: '.' }], wiki: { root: 'docs/repo-wiki', watchScopes: [{ repoId: 'root', path: 'src' }], maxCards: 6, maxContextChars: 12000 } }));
  writeFileSync(path.join(root, 'src/session.ts'), 'export function recoverSession() { return true; }\n');
  const source = { id: 'session-source', repoId: 'root', path: 'src/session.ts' }, scopes = [{ repoId: 'root', path: 'src/session.ts' }];
  const content = (id = 'session', title = '登录与会话', extra: Record<string, unknown> = {}) => `---\n${JSON.stringify({ id, title, summary: '解释登录、权限与会话恢复的边界。', type: 'mechanism', status: 'current', locale: 'zh-CN', aliases: ['authentication', 'session recovery', 'recoverSession'], sources: [source], watchScopes: scopes, relations: [], ...extra }, null, 2)}\n---\n\n# ${title}\n\n<a id="login"></a>\n\n## 登录\n\n登录成功后创建令牌。\n\n<a id="recovery"></a>\n\n## 会话恢复\n\nrecoverSession 会复用已有会话，不重新提交请求；令牌过期则要求登录。\n`;
  const create = (id = 'session', title = '登录与会话', text = content(id, title)) => { const packet = prepareUpdate(root, [], { schemaVersion: 1, changes: [{ kind: 'create', id, path: `docs/repo-wiki/${title}.md`, sourceRefs: [source], watchScopes: scopes }] }); const result = applyUpdate(root, packet.id, [{ id, markdown: text }]); assert.equal(result.status, 'applied', JSON.stringify(result)); return packet; };
  return { root, source, scopes, content, create, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('new text pages are created through prepared sources, with no prior document or model service', () => {
  const data = fixture(); try { data.create(); const doc = showKnowledge(data.root, 'session'); assert.equal(doc.sections.find((section) => section.id === 'recovery')?.stable, true); assert.equal(doc.freshness, 'current'); assert.ok(doc.checkedAt); assert.equal(doc.semanticReview.status, 'unreviewed'); assert.equal(baselineFor(data.root, 'session')?.generatedMarkdown, data.content()); assert.equal(checkWiki(data.root).status, 'passed'); } finally { data.close(); }
});
test('source discovery must be prepared; new scopes can be added without bypassing protection', () => {
  const data = fixture(); try {
    data.create(); writeFileSync(path.join(data.root, 'src/permissions.ts'), 'export const permissions = [];');
    const source = { id: 'permission-source', repoId: 'root', path: 'src/permissions.ts' };
    const text = data.content('session', '登录与会话', { sources: [data.source, source], watchScopes: [...data.scopes, { repoId: 'root', path: 'src/permissions.ts' }] });
    let packet = prepareUpdate(data.root, ['session']); assert.equal(applyUpdate(data.root, packet.id, [{ id: 'session', markdown: text }]).results[0].status, 'source-drift');
    packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'session', sourceRefs: [source], watchScopes: [{ repoId: 'root', path: 'src/permissions.ts' }] }] });
    assert.equal(applyUpdate(data.root, packet.id, [{ id: 'session', markdown: text }]).status, 'applied');
  } finally { data.close(); }
});
test('creation protects another writer and source drift retains candidate text', () => {
  const data = fixture(); try {
    const manifest: ChangeManifest = { schemaVersion: 1, changes: [{ kind: 'create', id: 'session', path: 'docs/repo-wiki/登录与会话.md', sourceRefs: [data.source], watchScopes: data.scopes }] };
    let packet = prepareUpdate(data.root, [], manifest); writeFileSync(path.join(data.root, 'src/session.ts'), 'changed source');
    const drift = applyUpdate(data.root, packet.id, [{ id: 'session', markdown: data.content() }]); assert.equal(drift.results[0].status, 'source-drift'); assert.ok(existsSync(path.join(data.root, drift.results[0].candidatePath!)));
    packet = prepareUpdate(data.root, [], manifest); writeFileSync(path.join(data.root, 'docs/repo-wiki/登录与会话.md'), data.content() + '\n人工补充。');
    assert.equal(applyUpdate(data.root, packet.id, [{ id: 'session', markdown: data.content() }]).results[0].status, 'conflict'); assert.match(readFileSync(path.join(data.root, 'docs/repo-wiki/登录与会话.md'), 'utf8'), /人工补充/);
  } finally { data.close(); }
});
test('section identity survives title edits; code fences are not headings; fragments and outline are bounded', () => {
  const sections = parseSections('# 总览\n\n<a id="mechanism"></a>\n\n## 中文机制\n解释\n```md\n## 伪标题\n```\n\n### 边界\n限制');
  assert.deepEqual(sections.map((section) => section.id), ['总览', 'mechanism', '边界']); assert.equal(sections[2].parentId, 'mechanism');
  assert.equal(parseSections('<a id="mechanism"></a>\n## Renamed mechanism')[0].id, 'mechanism');
  assert.throws(() => parseSections('<a id="x"></a>\n## A\n<a id="x"></a>\n## B'), /DUPLICATE/);
  const data = fixture(); try { data.create(); const fragment = showKnowledge(data.root, 'session#recovery'); assert.match(fragment.markdown, /recoverSession/); assert.doesNotMatch(fragment.markdown, /创建令牌/); assert.throws(() => showKnowledge(data.root, 'session#absent'), /FRAGMENT_NOT_FOUND/); const outline = outlineKnowledge(data.root, 'session'); assert.ok(outline.documents[0].sections.some((section) => section.id === 'login')); assert.ok(outline.documents[0].sections.every((section) => !('body' in section))); } finally { data.close(); }
});
test('query uses meaningful Chinese, inflected English and code symbols and declines unrelated questions', () => {
  const data = fixture(); try { data.create(); for (const query of ['会话如何恢复', 'recoverSession', 'recover_session', 'recovering sessions']) { const result = queryKnowledge(data.root, query); assert.equal(result.cards[0]?.id, 'session', query); assert.ok(result.cards[0].matches.some((match) => match.reference.includes('#'))); } assert.equal(queryKnowledge(data.root, '余额不足会如何提示').noAnswer, true); assert.equal(queryKnowledge(data.root, '这个功能如何使用').cards.length, 0); } finally { data.close(); }
});
test('query does not rescan source repositories and explicit scan updates observed freshness', () => {
  const data = fixture(); try { data.create(); const before = showKnowledge(data.root, 'session').checkedAt; rmSync(path.join(data.root, 'src'), { recursive: true }); const result = queryKnowledge(data.root, '会话'); assert.equal(result.cards[0].freshness, 'current'); assert.equal(result.cards[0].checkedAt, before); assert.equal(result.cards[0].sourceObservation.status, 'observed'); scanWiki(data.root); assert.equal(queryKnowledge(data.root, '会话').cards[0].freshness, 'missing-source'); } finally { data.close(); }
});
test('query obeys six-card and total-character budgets without image payloads', () => {
  const data = fixture(); try { for (let index = 0; index < 8; index++) data.create(`session-${index}`, `会话恢复 ${index}`); assert.equal(queryKnowledge(data.root, '会话').cards.length, 6); const result = queryKnowledge(data.root, '会话', { maxChars: 2200 }); assert.ok(result.contextChars <= 2200); assert.ok(result.cards.length > 0); assert.doesNotMatch(JSON.stringify(result), /<svg|data:image|base64/); } finally { data.close(); }
});
test('directory and split pages publish as one recoverable group and retain old fragment identities', () => {
  const data = fixture(); try {
    data.create();
    const coverage: CoverageContent = { schemaVersion: 1, topics: [{ id: 'overview', title: '系统总览', questions: ['如何登录'], documentRefs: ['session'], sourceScopes: data.scopes, status: 'covered' }, { id: 'recovery-topic', title: '恢复机制', parentId: 'overview', questions: ['如何恢复'], documentRefs: ['recovery'], sourceScopes: data.scopes, status: 'covered' }] };
    const manifest: ChangeManifest = { schemaVersion: 1, changes: [{ kind: 'update', id: 'session' }, { kind: 'create', id: 'recovery', path: 'docs/repo-wiki/会话恢复专题.md', sourceRefs: [data.source], watchScopes: data.scopes }], coverage, referenceMoves: [{ from: 'session#recovery', to: 'recovery#recovery' }] };
    const packet = prepareUpdate(data.root, [], manifest), parent = data.content().split('<a id="recovery">')[0] + '\n恢复细节见专题。\n', child = data.content('recovery', '会话恢复专题');
    assert.throws(() => applyUpdate(data.root, packet.id, [{ id: 'session', markdown: parent }, { id: 'recovery', markdown: child }], { failAfterWrites: 1 }), /INTERRUPTION/);
    assert.match(showKnowledge(data.root, 'session').body, /recoverSession/); assert.equal(mapKnowledge(data.root).topics.length, 0); assert.throws(() => showKnowledge(data.root, 'recovery'), /NOT_FOUND/);
    assert.equal(recoverWiki(data.root).recovered.length, 1); const retry = applyUpdate(data.root, packet.id, []); assert.equal(retry.status, 'applied'); assert.equal(mapKnowledge(data.root).topics.length, 2); assert.equal(showKnowledge(data.root, 'session#recovery').id, 'recovery'); assert.equal(relatedKnowledge(data.root, 'recovery').relations[0].kind, 'part_of');
  } finally { data.close(); }
});
test('dependent candidates wait together and an external directory edit is protected', () => {
  const data = fixture(); try {
    data.create(); const coverage: CoverageContent = { schemaVersion: 1, topics: [{ id: 'all', title: '系统', questions: [], sourceScopes: [], documentRefs: ['session', 'new'], status: 'covered' }] };
    const packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'session' }, { kind: 'create', id: 'new', path: 'docs/repo-wiki/新增.md', sourceRefs: [data.source], watchScopes: data.scopes }], coverage });
    const candidate = data.content().replace('令牌。', '受保护令牌。'); assert.equal(applyUpdate(data.root, packet.id, [{ id: 'session', markdown: candidate }]).status, 'partial'); assert.equal(readFileSync(path.join(data.root, 'docs/repo-wiki/登录与会话.md'), 'utf8'), data.content());
    writeFileSync(path.join(data.root, '.lumine/wiki-state/coverage.json'), JSON.stringify({ schemaVersion: 1, topics: [] }));
    const result = applyUpdate(data.root, packet.id, [{ id: 'new', markdown: data.content('new', '新增') }]); assert.equal(result.results[0].status, 'conflict'); assert.equal(existsSync(path.join(data.root, 'docs/repo-wiki/新增.md')), false);
  } finally { data.close(); }
});
test('semantic review is separately recorded against exact text and source, then becomes outdated', () => {
  const data = fixture(); try {
    data.create(); const document = showKnowledge(data.root, 'session'); const review: ReviewRecord = { documentId: document.id, revision: document.revision, sourceFingerprint: sourceFingerprint(snapshotSources(data.root, document.sources, document.watchScopes)), reviewedAt: new Date().toISOString(), reviewer: { kind: 'agent', role: 'author' }, outcome: 'reviewed', scope: ['正常恢复与令牌过期边界'], findings: [], limitations: ['未验证部署状态'] };
    recordSemanticReview(data.root, review); assert.equal(showKnowledge(data.root, 'session').semanticReview.status, 'reviewed'); assert.equal(readFileSync(path.join(data.root, document.path), 'utf8'), data.content());
    writeFileSync(path.join(data.root, document.path), data.content() + '\n人工修订。'); assert.equal(showKnowledge(data.root, 'session').semanticReview.status, 'outdated'); assert.throws(() => recordSemanticReview(data.root, review), /BASELINE_MISMATCH/);
  } finally { data.close(); }
});
test('a malformed page is isolated from catalog, query and healthy documents, but check reports it', () => {
  const data = fixture(); try { data.create(); writeFileSync(path.join(data.root, 'docs/repo-wiki/损坏.md'), '---\nid: [wrong]\n---\n# 坏页面'); const inspected = inspectKnowledge(data.root); assert.equal(inspected.documents.length, 1); assert.equal(inspected.issues.length, 1); assert.equal(queryKnowledge(data.root, '会话').cards.length, 1); assert.equal(checkWiki(data.root).status, 'failed'); } finally { data.close(); }
});
test('hierarchy cycles and duplicate normalized creation paths are rejected before writes', () => {
  const data = fixture(); try { assert.throws(() => prepareUpdate(data.root, [], { schemaVersion: 1, changes: [], coverage: { schemaVersion: 1, topics: [{ id: 'a', parentId: 'b', title: 'A', questions: [], sourceScopes: [], documentRefs: [], status: 'planned' }, { id: 'b', parentId: 'a', title: 'B', questions: [], sourceScopes: [], documentRefs: [], status: 'planned' }] } }), /CYCLE/); assert.throws(() => prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'create', id: 'a', path: 'docs/repo-wiki/Test.md', sourceRefs: [data.source], watchScopes: data.scopes }, { kind: 'create', id: 'b', path: 'docs/repo-wiki/test.md', sourceRefs: [data.source], watchScopes: data.scopes }] }), /COLLISION/); } finally { data.close(); }
});

test('merged identity and new human watch scopes cannot silently change a prepared baseline', () => {
  for (const change of ['identity', 'scope']) {
    const data = fixture(); try {
      data.create(); const packet = prepareUpdate(data.root, ['session']), filename = path.join(data.root, 'docs/repo-wiki/登录与会话.md');
      const current = change === 'identity' ? data.content().replace('"id": "session"', '"id": "different"') : data.content('session', '登录与会话', { watchScopes: [...data.scopes, { repoId: 'root', path: 'src' }] });
      writeFileSync(filename, current);
      const result = applyUpdate(data.root, packet.id, [{ id: 'session', markdown: data.content().replace('令牌。', '安全令牌。') }]);
      assert.equal(result.results[0].status, 'conflict', change); assert.equal(readFileSync(filename, 'utf8'), current); assert.equal(baselineFor(data.root, 'session')?.generatedMarkdown, data.content());
    } finally { data.close(); }
  }
});
test('removing a fragment protects incoming relations and unchanged directory references', () => {
  for (const kind of ['relation', 'coverage']) {
    const data = fixture(); try {
      data.create();
      if (kind === 'relation') data.create('consumer', '消费者', data.content('consumer', '消费者', { relations: [{ target: 'session#recovery', kind: 'depends_on' }] }));
      else { const packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [], coverage: { schemaVersion: 1, topics: [{ id: 'recovery', title: '恢复', questions: [], sourceScopes: [], documentRefs: ['session#recovery'], status: 'covered' }] } }); applyUpdate(data.root, packet.id, []); }
      const packet = prepareUpdate(data.root, ['session']); const result = applyUpdate(data.root, packet.id, [{ id: 'session', markdown: data.content().replace('id="recovery"', 'id="new-recovery"') }]);
      assert.equal(result.results[0].status, 'conflict', kind); assert.equal(showKnowledge(data.root, 'session#recovery').selection?.id, 'recovery');
    } finally { data.close(); }
  }
});
test('prospective reference moves preserve inbound links and related navigation through aliases', () => {
  const data = fixture(); try {
    data.create(); data.create('consumer', '消费者', data.content('consumer', '消费者', { relations: [{ target: 'session#recovery', kind: 'depends_on' }] }));
    const packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'session' }, { kind: 'create', id: 'details', path: 'docs/repo-wiki/详情.md', sourceRefs: [data.source], watchScopes: data.scopes }], referenceMoves: [{ from: 'session#recovery', to: 'details#recovery' }] });
    assert.equal(applyUpdate(data.root, packet.id, [{ id: 'session', markdown: data.content().split('<a id="recovery">')[0] }, { id: 'details', markdown: data.content('details', '详情') }]).status, 'applied');
    assert.equal(showKnowledge(data.root, 'session#recovery').id, 'details'); assert.ok(relatedKnowledge(data.root, 'details', { direction: 'in' }).relations.some((edge) => edge.target === 'consumer')); assert.equal(checkWiki(data.root).status, 'passed');
    const next = prepareUpdate(data.root, ['consumer']); assert.equal(applyUpdate(data.root, next.id, [{ id: 'consumer', markdown: data.content('consumer', '消费者', { relations: [{ target: 'session#recovery', kind: 'depends_on' }] }) + '\n更多说明。' }]).status, 'applied');
  } finally { data.close(); }
});
test('document fallback aliases reject fragment cycles before publishing and resolve valid fragments once', () => {
  const data = fixture(); try {
    data.create(); data.create('other', '其他');
    const cycle = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [], referenceMoves: [{ from: 'session', to: 'other#recovery' }, { from: 'other', to: 'session#recovery' }] });
    assert.throws(() => applyUpdate(data.root, cycle.id, []), /REFERENCE_ALIAS_CYCLE/); assert.equal(showKnowledge(data.root, 'session').id, 'session');
    const valid = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [], referenceMoves: [{ from: 'old', to: 'session' }, { from: 'old-overview', to: 'session#login' }] });
    applyUpdate(data.root, valid.id, []); assert.equal(showKnowledge(data.root, 'old#recovery').selection?.id, 'recovery'); assert.equal(showKnowledge(data.root, 'old-overview#unused').selection?.id, 'login');
  } finally { data.close(); }
});
test('latest explicit update decisions protect candidates and their dependent group', () => {
  for (const action of ['keep-current', 'defer'] as const) {
    const data = fixture(); try {
      data.create(); data.create('other', '其他');
      const packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'update', id: 'session', group: 'together' }, { kind: 'update', id: 'other', group: 'together' }] });
      recordUpdateDecision(data.root, packet.id, 'session', action, '人工选择暂不使用候选');
      const result = applyUpdate(data.root, packet.id, [{ id: 'session', markdown: data.content() + '\n候选。' }, { id: 'other', markdown: data.content('other', '其他') + '\n候选。' }]);
      assert.equal(result.status, 'partial'); assert.equal(readFileSync(path.join(data.root, 'docs/repo-wiki/登录与会话.md'), 'utf8'), data.content()); assert.equal(readFileSync(path.join(data.root, 'docs/repo-wiki/其他.md'), 'utf8'), data.content('other', '其他'));
      assert.ok(existsSync(path.join(data.root, `.lumine/wiki-state/updates/${packet.id}/candidates/${hash('session')}.md`)));
      if (action === 'keep-current') { assert.notEqual(showKnowledge(data.root, 'session').freshness, 'conflict'); recordUpdateDecision(data.root, packet.id, 'session', 'defer', '重新评估，仍待处理'); assert.equal(showKnowledge(data.root, 'session').freshness, 'conflict'); }
    } finally { data.close(); }
  }
});


test('search excerpts render labels as text and preserve identifiers and negative conditions', () => {
  const metadata = { id: 'excerpt', title: '恢复窗口', summary: '恢复窗口的适用条件。', sources: [{ id: 'source', repoId: 'root', path: 'task.go' }], diagrams: [{ id: 'flow', title: '恢复循环', caption: '读取已有任务，不重新提交。', sources: ['source'] }] };
  const body = '# 恢复窗口\n\n<a id="recovery"></a>\n## 恢复机制\n\n`recover_window` 与 `task_id` 是不同字段，恢复窗口并不等于重新提交。依据：[恢复循环](../../server/recovery.go#L30)。\n\n| 状态 | 恢复条件 |\n| --- | :---: |\n| 超时 | 不重提任务 |\n\n```mermaid\nflowchart LR\n A[恢复] --> B[不重新提交]\n```\n';
  const doc = parseDocument(`---\n${JSON.stringify(metadata)}\n---\n${body}`, 'docs/repo-wiki/恢复.md');
  const result = searchKnowledge([doc], '恢复窗口', 6, 12000), excerpt = result.cards[0].matches.map(match => match.excerpt).join(' ');
  assert.match(excerpt, /recover_window/); assert.match(excerpt, /task_id/); assert.match(excerpt, /并不等于重新提交/); assert.match(excerpt, /依据：恢复循环/); assert.match(excerpt, /超时；不重提任务/);
  assert.doesNotMatch(excerpt, /recovery\.go|<a |flowchart|--> |\|\s*---|\]\(/);
});

test('bounded excerpts keep the complete matching sentence instead of dropping a leading negation', () => {
  const denial = '不允许' + '在尚未确认原请求终止时'.repeat(18) + '重提 recover_window 对应的任务。';
  const metadata = { id: 'bounded-excerpt', title: '恢复规则', summary: '先检查原任务，不能重复提交。', sources: [{ id: 'source', repoId: 'root', path: 'task.go' }] };
  const document = (body: string) => parseDocument(`---\n${JSON.stringify(metadata)}\n---\n# 恢复规则\n\n${body}`, 'docs/repo-wiki/规则.md');
  const result = searchKnowledge([document('背景说明'.repeat(180) + '。' + denial + '后续说明。')], 'recover_window', 6, 12000);
  assert.ok(result.cards[0].matches.some(match => match.excerpt.includes(denial)));
  assert.ok(result.cards[0].matches.every(match => !match.excerpt || !match.excerpt.includes('recover_window') || match.excerpt.includes('不允许')));
  const overlong = searchKnowledge([document('不允许' + '尚未确认'.repeat(160) + '重提 recover_window。')], 'recover_window', 6, 12000);
  assert.equal(overlong.cards[0].matches[0].excerpt, ''); assert.equal(overlong.cards[0].summary, metadata.summary);
});

test('clearing local receipts removes current freshness without losing semantic review or knowledge', () => {
  const data = fixture(); try {
    data.create(); const document = showKnowledge(data.root, 'session');
    recordSemanticReview(data.root, { documentId: document.id, revision: document.revision, sourceFingerprint: document.sourceObservation.sourceFingerprint!, reviewedAt: new Date().toISOString(), reviewer: { kind: 'agent', role: 'author' }, outcome: 'reviewed', scope: ['源码会话恢复边界'], findings: [], limitations: ['未核实部署'] });
    const checkedAt = showKnowledge(data.root, 'session').checkedAt, baseline = baselineFor(data.root, 'session');
    rmSync(path.join(data.root, '.lumine/local/wiki'), { recursive: true });
    const cold = queryKnowledge(data.root, '会话').cards[0];
    assert.equal(cold.freshness, 'unverified'); assert.equal(cold.checkedAt, checkedAt); assert.equal(cold.semanticReview.status, 'reviewed');
    assert.deepEqual(baselineFor(data.root, 'session'), baseline);
    scanWiki(data.root); assert.equal(queryKnowledge(data.root, '会话').cards[0].freshness, 'current');
  } finally { data.close(); }
});

test('copied local receipts do not establish source freshness in another checkout', () => {
  const data = fixture(), clone = mkdtempSync(path.join(os.tmpdir(), 'lumine-wiki-clone-'));
  try {
    data.create(); cpSync(data.root, clone, { recursive: true });
    assert.equal(showKnowledge(data.root, 'session').freshness, 'current');
    assert.equal(queryKnowledge(clone, '会话').cards[0].freshness, 'unverified');
    assert.match(showKnowledge(clone, 'session#recovery').body, /recoverSession/);
    scanWiki(clone); assert.equal(showKnowledge(clone, 'session').freshness, 'current');
  } finally { data.close(); rmSync(clone, { recursive: true, force: true }); }
});

test('a missing registered repository is reported by query without walking or hashing sources', () => {
  const data = fixture(); try {
    const configPath = path.join(data.root, '.lumine/project.json'), config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.repositories.push({ id: 'api', path: 'api' }); writeFileSync(configPath, JSON.stringify(config));
    mkdirSync(path.join(data.root, 'api')); writeFileSync(path.join(data.root, 'api/session.ts'), 'serverSession();');
    const source = { id: 'api-source', repoId: 'api', path: 'session.ts' }, scopes = [{ repoId: 'api', path: '.' }];
    const packet = prepareUpdate(data.root, [], { schemaVersion: 1, changes: [{ kind: 'create', id: 'server-session', path: 'docs/repo-wiki/服务端会话.md', sourceRefs: [source], watchScopes: scopes }] });
    assert.equal(applyUpdate(data.root, packet.id, [{ id: 'server-session', markdown: data.content('server-session', '服务端会话', { sources: [source], watchScopes: scopes, repositories: ['api'] }) }]).status, 'applied');
    const checkedAt = showKnowledge(data.root, 'server-session').checkedAt;
    rmSync(path.join(data.root, 'api'), { recursive: true });
    const card = queryKnowledge(data.root, '服务端会话').cards[0]; assert.equal(card.freshness, 'missing-source'); assert.equal(card.checkedAt, checkedAt);
    assert.ok(card.matches.length); assert.equal(existsSync(path.join(data.root, '.lumine/wiki-state/observations')), true);
  } finally { data.close(); }
});

test('receipt cache failure cannot undo a durable content transaction', () => {
  const data = fixture(); try {
    const receiptPath = path.join(data.root, '.lumine/local/wiki/observation-receipts.json'); mkdirSync(receiptPath, { recursive: true });
    data.create(); assert.equal(showKnowledge(data.root, 'session').freshness, 'unverified'); assert.equal(baselineFor(data.root, 'session')?.generatedMarkdown, data.content());
    rmSync(receiptPath, { recursive: true }); scanWiki(data.root); assert.equal(showKnowledge(data.root, 'session').freshness, 'current');
  } finally { data.close(); }
});
