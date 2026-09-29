import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderKnowledgeMapMarkdown } from '../wiki/map-markdown.ts';
import { parseDocument } from '../wiki/documents.ts';
import { runWikiCli } from '../wiki.ts';
import type { CoverageMap } from '../wiki/types.ts';

const map: CoverageMap = { schemaVersion: 1, revision: 'version', unmappedDocumentIds: ['extra'], topics: [
  { id: 'overview', title: '结构与边界', status: 'covered', questions: ['怎样找到当前实现？'], sourceScopes: [], documentRefs: [] },
  { id: 'session', parentId: 'overview', title: '会话', status: 'partial', questions: [], sourceScopes: [], documentRefs: ['old#old-section'] },
  { id: 'later', title: '稍后处理', status: 'deferred', reason: '尚无运行环境', questions: [], sourceScopes: [], documentRefs: ['missing'] },
] };
const doc = parseDocument('---\nid: session\ntitle: 会话机制\nsummary: 恢复规则\ntype: mechanism\nstatus: current\n---\n# 会话机制\n\n<a id="restore"></a>\n## 恢复\n\n当前约束。', 'docs/repo-wiki/机制/会话 更新.md');

test('Markdown navigation reuses hierarchy and current document/section identities with encoded paths', () => {
  const render = (locale: 'en' | 'zh-CN') => renderKnowledgeMapMarkdown(map, (reference) => { if (reference === 'missing') throw new Error('DOCUMENT_NOT_FOUND'); return reference === 'old#old-section' ? { ...doc, selection: { kind: 'section', id: 'restore' } } : { ...doc, id: 'extra', title: '<Extra> [topic]' }; }, { locale, wikiRoot: 'docs/repo-wiki' });
  const zh = render('zh-CN'), en = render('en');
  assert.match(zh, /^# 仓库知识地图/);
  assert.match(zh, /  - \*\*会话\*\* · 待完善/);
  assert.match(zh, /%E6%9C%BA%E5%88%B6\/%E4%BC%9A%E8%AF%9D%20%E6%9B%B4%E6%96%B0\.md#restore/);
  assert.match(zh, /`session#restore`/); assert.doesNotMatch(zh, /old-section/);
  assert.match(zh, /`missing` · 引用内容暂缺/); assert.doesNotMatch(zh, /\]\(<missing/);
  assert.ok(zh.indexOf('结构与边界') < zh.indexOf('会话\*\*')); assert.ok(zh.indexOf('会话\*\*') < zh.indexOf('稍后处理'));
  assert.match(zh, /&lt;Extra&gt; \\\[topic\\\]/); assert.match(en, /In progress/); assert.match(en, /Deferred/); assert.match(en, /Referenced content is missing/);
  assert.match(zh, /尚未编入目录/); assert.match(zh, /原因：尚无运行环境/);
});

test('map --markdown emits plain bilingual Markdown without writing another directory source; JSON stays unchanged', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-map-markdown-'));
  const previousWrite = process.stdout.write, previousExit = process.exitCode;
  let captured = '';
  try {
    for (const name of ['.lumine/wiki-state', 'docs/repo-wiki']) mkdirSync(path.join(root, name), { recursive: true });
    writeFileSync(path.join(root, '.lumine/root.json'), JSON.stringify({ schemaVersion: 2, kind: 'lumine-root' }));
    writeFileSync(path.join(root, '.lumine/project.json'), JSON.stringify({ schemaVersion: 2, workflowVersion: 2, locale: 'zh-CN', wiki: { root: 'docs/repo-wiki' } }));
    writeFileSync(path.join(root, '.lumine/wiki-state/coverage.json'), JSON.stringify({ schemaVersion: 1, topics: [{ id: 'topic', title: '当前主题', status: 'covered', sourceScopes: [], questions: [], documentRefs: ['session#restore'] }] }));
    writeFileSync(path.join(root, 'docs/repo-wiki/改名后的会话.md'), doc.markdown);
    const before = readdirSync(path.join(root, 'docs/repo-wiki'));
    process.stdout.write = ((chunk: string | Uint8Array) => { captured += chunk.toString(); return true; }) as typeof process.stdout.write;
    await runWikiCli(['map', '--markdown', '--root', root]);
    assert.match(captured, /^# 仓库知识地图\n/); assert.match(captured, /#restore/); assert.doesNotMatch(captured, /^"|\\n/);
    assert.deepEqual(readdirSync(path.join(root, 'docs/repo-wiki')), before);
    captured = ''; await runWikiCli(['map', '--json', '--root', root]);
    const value = JSON.parse(captured); assert.equal(value.schemaVersion, 1); assert.equal(value.topics[0].id, 'topic'); assert.equal(value.markdown, undefined);
    assert.ok(value.revision); assert.deepEqual(value.unmappedDocumentIds, []);
    assert.equal(process.exitCode, previousExit);
  } finally { process.stdout.write = previousWrite; process.exitCode = previousExit; rmSync(root, { recursive: true, force: true }); }
});
