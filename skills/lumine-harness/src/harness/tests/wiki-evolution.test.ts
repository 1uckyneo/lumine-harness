import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contextKnowledge, impactKnowledge } from '../wiki/context.ts';
import { applyUpdate, checkWiki, mapKnowledge, prepareUpdate, queryKnowledge, recordUpdateDecision, showKnowledge } from '../wiki/engine.ts';
import { baselineFor, formatWikiDocument } from '../wiki/documents.ts';
import type { ChangeManifest, CoverageContent, NavigationContent, SourceRef } from '../wiki/types.ts';

// This exercises prepared editorial changes, not an LLM's writing ability. Each
// expected fact and candidate is deliberate; semantic quality is reviewed apart.
test('six successive knowledge changes preserve facts, identity and reader routes through public operations', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumine-evolution-'));
  const put = (file: string, text: string | object) => { const absolute = path.join(root, file); mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, typeof text === 'string' ? text : JSON.stringify(text)); };
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
  const sources: Record<string, SourceRef> = {
    auth: { id: 'authentication', repoId: 'library', path: 'src/auth.ts' },
    cache: { id: 'session-cache', repoId: 'library', path: 'src/cache.ts' },
    command: { id: 'command', repoId: 'cli', path: 'main.ts' },
    rule: { id: 'rule', repoId: 'library', path: 'rules/security.md', kind: 'decision' },
  };
  put('.lumine/root.json', { schemaVersion: 2, kind: 'lumine-root' });
  put('.lumine/project.json', { schemaVersion: 4, workflowVersion: 2, locale: 'zh-CN', repositories: [{ id: 'library', path: 'packages/library' }, { id: 'cli', path: 'packages/cli' }], wiki: { root: 'docs/repo-wiki', watchScopes: [{ repoId: 'library', path: 'src' }] } });
  put('AGENTS.md', '# 项目规则\n\n认证修改必须完整阅读 Wiki 的认证规范。\n');
  put('packages/library/src/auth.ts', 'export const authentication = { signed: true, rejectsExpired: true, leeway: 0 };\n');
  put('packages/library/src/cache.ts', 'export const cache = { ttl: 60, recheckExpiry: true };\n');
  put('packages/cli/main.ts', 'export const authentication = "library";\n');
  put('packages/library/rules/security.md', '未配置密钥时拒绝请求；不得采用默认密钥。\n');
  const page = (id: string, title: string, body: string, refs: SourceRef[], extra: Record<string, unknown> = {}) => formatWikiDocument(`---\n${JSON.stringify({ id, title, summary: title, type: 'mechanism', status: 'current', locale: 'zh-CN', sources: refs, watchScopes: refs.map(({ repoId, path }) => ({ repoId, path })), reading: { question: `${title}如何工作？` }, ...extra })}\n---\n\n# ${title}\n\n${body}\n`, `docs/repo-wiki/${id}.md`);
  const behavior = '<a id="behavior"></a>\n## 行为与限制\n\n';
  let authBody = behavior + '仅当签名有效且未过期时，允许请求继续；缓存命中也不能跳过过期检查。\n\n<a id="operations"></a>\n## 运行提示\n\n请核实服务端时间。';
  let auth = page('auth', '令牌认证', authBody, [sources.auth], { aliases: ['访问认证'], relations: [{ target: 'security#behavior', kind: 'decision' }] });
  let command = page('command', '命令行访问', behavior + '命令行把令牌交给库验证，拒绝后不重试。', [sources.command], { relations: [{ target: 'auth#behavior', kind: 'depends_on' }] });
  let cache = '';
  let security = page('security', '认证规范', behavior + '未配置密钥时拒绝请求；不得采用默认密钥。', [sources.rule], { type: 'engineering-standard' });
  let navigation: NavigationContent = { schemaVersion: 1, overview: 'home', groups: [{ id: 'understand', sections: [{ id: 'capabilities', title: '使用与机制', documents: ['auth', 'command'] }] }, { id: 'operate', sections: [{ id: 'standards', title: '工程规范', documents: ['security'] }] }, { id: 'reference', sections: [] }], unlisted: [], norms: [{ id: 'security', scope: '认证与会话修改' }] };
  let coverage: CoverageContent = { schemaVersion: 1, topics: [{ id: 'access', title: '访问边界', questions: ['什么请求可以通过？'], sourceScopes: [{ repoId: 'library', path: 'src/auth.ts' }], documentRefs: ['auth', 'command'], status: 'covered' }] };
  const home = page('home', '库与命令行', '通过命令行调用库，共享身份验证边界。', [sources.auth, sources.command], { type: 'overview' });
  const apply = (manifest: ChangeManifest, candidates: { id: string; markdown: string }[]) => {
    const packet = prepareUpdate(root, [], { ...manifest, changes: manifest.changes.map(change => change.kind === 'create' ? { ...change, watchScopes: change.sourceRefs?.map(({ repoId, path }) => ({ repoId, path })) } : change) });
    const result = applyUpdate(root, packet.id, candidates);
    assert.equal(result.status, 'applied', JSON.stringify(result));
    const checked = checkWiki(root);
    assert.equal(checked.status, 'passed', JSON.stringify(checked.issues));
    return packet;
  };
  try {
    apply({ schemaVersion: 1, changes: ['home', 'auth', 'command', 'security'].map(id => ({ kind: 'create', id, path: `docs/repo-wiki/${id}.md`, sourceRefs: id === 'home' ? [sources.auth, sources.command] : [id === 'auth' ? sources.auth : id === 'command' ? sources.command : sources.rule] })), navigation, coverage, normativeChanges: [{ id: 'security', reason: '记录已存在的项目认证规范及适用范围。' }] }, [{ id: 'home', markdown: home }, { id: 'auth', markdown: auth }, { id: 'command', markdown: command }, { id: 'security', markdown: security }]);

    await t.test('新增能力进入现有问题地图，跨仓上下文保留完整规范入口', () => {
      const context = contextKnowledge(root, '令牌认证', { reference: 'auth#behavior' });
      assert.ok(context.requiredReading.some(rule => rule.id === 'security' && rule.readFull));
      assert.ok(context.related.some(item => item.id === 'command') || context.cards.some(item => item.id === 'command'));
      cache = page('cache', '会话缓存', behavior + '缓存只减少读取；每次命中仍验证令牌是否过期。缓存有效期为六十秒。', [sources.cache], { relations: [{ target: 'auth#behavior', kind: 'depends_on' }] });
      navigation = structuredClone(navigation); navigation.groups[0].sections[0].documents.push('cache');
      coverage = structuredClone(coverage); coverage.topics[0].documentRefs.push('cache');
      apply({ schemaVersion: 1, changes: [{ kind: 'create', id: 'cache', path: 'docs/repo-wiki/cache.md', sourceRefs: [sources.cache] }], navigation, coverage, briefing: { question: '缓存是否改变认证条件？', preserve: ['缓存命中仍检查过期'] } }, [{ id: 'cache', markdown: cache }]);
      assert.equal(showKnowledge(root, 'cache').id, 'cache');
      assert.ok(mapKnowledge(root).navigation.groups[0].sections[0].documents.includes('cache'));
      assert.ok(queryKnowledge(root, '会话缓存').cards.some(card => card.id === 'cache'));
    });

    await t.test('机制改变保留非重叠人工纠正与原身份，不把现有正文当生成基线', () => {
      put('docs/repo-wiki/auth.md', read('docs/repo-wiki/auth.md').replace('请核实服务端时间。', '人工纠正：以服务端时间为准，不使用浏览器时间。'));
      put('packages/library/src/auth.ts', 'export const authentication = { signed: true, rejectsExpired: true, leeway: 5 };\n');
      const impact = impactKnowledge(root, [{ repoId: 'library', path: 'src/auth.ts' }]);
      assert.equal(impact.candidateOnly, true);
      assert.ok(impact.candidates.some(item => item.id === 'cache' && item.reasons.some(reason => reason.kind === 'topic' || reason.kind === 'relation')));
      authBody = authBody.replace('允许请求继续', '按服务端五秒时钟容差判断后允许请求继续');
      auth = page('auth', '令牌认证', authBody, [sources.auth], { aliases: ['访问认证'], relations: [{ target: 'security#behavior', kind: 'decision' }] });
      const packet = apply({ schemaVersion: 1, changes: [{ kind: 'update', id: 'auth' }], briefing: { question: '时钟容差改变了哪些条件？', preserve: ['不得跳过有效期检查', '人工时间说明'] } }, [{ id: 'auth', markdown: auth }]);
      assert.equal(packet.units[0].briefing?.humanEdits, true);
      assert.equal(queryKnowledge(root, '访问认证').cards[0].id, 'auth');
      assert.match(showKnowledge(root, 'auth').body, /人工纠正：以服务端时间为准/);
      assert.match(showKnowledge(root, 'auth#behavior').body, /仅当签名有效且未过期.*缓存命中也不能跳过/);
      assert.doesNotMatch(baselineFor(root, 'auth')!.generatedMarkdown, /人工纠正/);
    });

    await t.test('跨模块变化同步调用方与被调用方，并准确保留未变化的约束', () => {
      put('packages/library/src/cache.ts', 'export const cache = { ttl: 30, recheckExpiry: true, miss: "reload" };\n');
      put('packages/cli/main.ts', 'export const authentication = { provider: "library", expired: "ask-login", retry: false };\n');
      const impact = impactKnowledge(root, [{ repoId: 'library', path: 'src/cache.ts' }, { repoId: 'cli', path: 'main.ts' }]);
      assert.ok(impact.candidates.some(item => item.id === 'cache' && item.direct));
      assert.ok(impact.candidates.some(item => item.id === 'command' && item.direct));
      assert.ok(impact.candidates.some(item => item.id === 'auth'));
      cache = cache.replace('缓存有效期为六十秒。', '缓存有效期为三十秒；未命中则重新读取。');
      command = command.replace('拒绝后不重试。', '过期时提示重新登录，不自动重试；缓存未命中由库重新读取。');
      apply({ schemaVersion: 1, changes: [{ kind: 'update', id: 'cache', group: 'access' }, { kind: 'update', id: 'command', group: 'access' }] }, [{ id: 'cache', markdown: cache }, { id: 'command', markdown: command }]);
      assert.match(showKnowledge(root, 'cache').body, /每次命中仍验证令牌是否过期/);
      assert.match(showKnowledge(root, 'command').body, /提示重新登录，不自动重试/);
    });

    await t.test('拆页明确迁移旧章节，正文关系与导航共同指向同一新位置', () => {
      const detail = page('clock', '时钟与有效期', behavior + '仅当签名有效且未过期时，按服务端五秒时钟容差判断后允许请求继续；缓存命中也不能跳过过期检查。', [sources.auth], { relations: [{ target: 'security#behavior', kind: 'decision' }] });
      auth = auth.replace(`${behavior}${authBody.split('\n\n<a id="operations">')[0].slice(behavior.length)}`, '认证边界见[时钟与有效期](clock.md#behavior)。');
      navigation = structuredClone(navigation); navigation.groups[0].sections[0].documents.push('clock');
      coverage = structuredClone(coverage); coverage.topics[0].documentRefs.push('clock');
      apply({ schemaVersion: 1, changes: [{ kind: 'update', id: 'auth' }, { kind: 'create', id: 'clock', path: 'docs/repo-wiki/clock.md', sourceRefs: [sources.auth] }], navigation, coverage, referenceMoves: [{ from: 'auth#behavior', to: 'clock#behavior' }] }, [{ id: 'auth', markdown: auth }, { id: 'clock', markdown: detail }]);
      assert.equal(showKnowledge(root, 'auth').id, 'auth');
      assert.equal(showKnowledge(root, 'auth#behavior').id, 'clock');
      assert.match(showKnowledge(root, 'auth').body, /人工纠正/);
      assert.match(showKnowledge(root, 'auth#behavior').body, /缓存命中也不能跳过过期检查/);
      assert.ok(contextKnowledge(root, '时钟与有效期', { reference: 'auth#behavior' }).requiredReading.some(rule => rule.id === 'security'));
    });

    await t.test('规则修订必须显式说明依据，保留条件与否定的完整文字', () => {
      const changed = security.replace('不得采用默认密钥。', '不得采用默认密钥。密钥轮换期间可以同时验证当前和上一个密钥，但不得延长令牌原有效期。');
      const unapproved = prepareUpdate(root, ['security']);
      const denied = applyUpdate(root, unapproved.id, [{ id: 'security', markdown: changed }]);
      assert.equal(denied.status, 'partial'); assert.match(denied.results[0].reason, /NORMATIVE_CHANGE_REQUIRED/);
      assert.doesNotMatch(showKnowledge(root, 'security').body, /轮换期间/);
      // Superseding a proposal is an explicit decision; a newer successful
      // update must never silently erase an unresolved protected candidate.
      recordUpdateDecision(root, unapproved.id, 'security', 'keep-current', '普通维护候选不生效；通过明确规范修订重新准备。');
      put('packages/library/rules/security.md', '未配置密钥时拒绝请求；不得采用默认密钥。密钥轮换期间可以同时验证当前和上一个密钥，但不得延长令牌原有效期。\n');
      security = changed;
      apply({ schemaVersion: 1, changes: [{ kind: 'update', id: 'security' }], normativeChanges: [{ id: 'security', reason: '已批准轮换窗口；保留缺失配置拒绝及原有效期约束。' }] }, [{ id: 'security', markdown: security }]);
      assert.equal(showKnowledge(root, 'security').normativeScope, '认证与会话修改');
      assert.match(showKnowledge(root, 'security').body, /未配置密钥时拒绝请求；不得采用默认密钥/);
      assert.match(showKnowledge(root, 'security').body, /轮换期间可以同时验证当前和上一个密钥，但不得延长令牌原有效期/);
    });

    await t.test('旧能力退出日常知识，不用错误重定向丢掉历史依据', () => {
      cache = cache.replace('status: "current"', 'status: "historical"').replace('缓存只减少读取', '旧缓存已退出使用，历史行为：缓存只减少读取');
      command = command.replace('；缓存未命中由库重新读取。', '；身份验证始终由库执行。');
      navigation = structuredClone(navigation); navigation.groups[0].sections[0].documents = navigation.groups[0].sections[0].documents.filter(id => id !== 'cache');
      navigation.unlisted.push({ id: 'cache', reason: '历史缓存行为，按明确引用核实。' });
      coverage = structuredClone(coverage); coverage.topics[0].documentRefs = coverage.topics[0].documentRefs.filter(id => id !== 'cache');
      apply({ schemaVersion: 1, changes: [{ kind: 'update', id: 'cache' }, { kind: 'update', id: 'command' }], navigation, coverage }, [{ id: 'cache', markdown: cache }, { id: 'command', markdown: command }]);
      assert.equal(showKnowledge(root, 'cache').status, 'historical');
      assert.ok(!queryKnowledge(root, '会话缓存').cards.some(card => card.id === 'cache'));
      assert.ok(queryKnowledge(root, '会话缓存', { includeHistory: true }).cards.some(card => card.id === 'cache'));
      assert.ok(!impactKnowledge(root, [{ repoId: 'library', path: 'src/cache.ts' }]).candidates.some(item => item.id === 'cache'));
      assert.match(showKnowledge(root, 'cache').body, /每次命中仍验证令牌是否过期/);
      assert.deepEqual(showKnowledge(root, 'cache').sources, [sources.cache]);
      assert.match(showKnowledge(root, 'auth').body, /人工纠正/);
      assert.deepEqual(checkWiki(root).notVerified, ['semantic accuracy', 'runtime behavior', 'human acceptance']);
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
