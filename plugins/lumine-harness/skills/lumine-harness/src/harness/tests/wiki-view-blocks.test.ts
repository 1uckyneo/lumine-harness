import test from 'node:test';
import assert from 'node:assert/strict';
import { parseViewBlock, viewBlockText, viewFences, viewMarkdownText } from '../wiki/view-blocks.ts';

test('explicit view blocks retain paragraph, code and line-reference text exactly', () => {
  const value = parseViewBlock(`version: 1
type: steps
id: request-path
title: 请求如何通过系统
diagram: request-diagram
items:
  - id: authenticate
    title: 核实登录状态
    body: "中间件只负责会话解析。（s2:22-32、s18）https://example.test:443"
    nodes: [auth]
    code:
      language: ts
      code: "const a = ':'; // 中文：说明\\nreturn a;"
      source: auth-source
`);
  assert.equal(value.type, 'steps');
  if (value.type !== 'steps') return;
  assert.equal(value.items[0].body, '中间件只负责会话解析。（s2:22-32、s18）https://example.test:443');
  assert.equal(value.items[0].code?.code, "const a = ':'; // 中文：说明\nreturn a;");
  assert.match(viewBlockText(value), /s2:22-32、s18/);
  assert.match(viewBlockText(value), /1\. 核实登录状态/);
});

test('comparison requires matching rows and supports an equivalent reading order', () => {
  const value = parseViewBlock(`version: 1
type: comparison
id: version-comparison
columns: [{id: draft, title: 草稿}, {id: published, title: 已发布}]
rows:
  - label: 谁会使用
    values: [流程维护者, 新发起的实例]
  - label: 能否修改
    values: [可以修改, 保留发布时快照]
`);
  assert.equal(viewBlockText(value), '谁会使用\n草稿：流程维护者\n已发布：新发起的实例\n\n能否修改\n草稿：可以修改\n已发布：保留发布时快照');
  assert.throws(() => parseViewBlock('version: 1\ntype: comparison\nid: compare\ncolumns: [{id: a, title: A}]\nrows: [{label: row, values: [a,b]}]'), /correspond/);
});

test('view grammar rejects executable properties, unknown types, URL assets, aliases and oversized input', () => {
  for (const value of [
    'version: 1\ntype: html\nid: arbitrary\nbody: "<script>doAnything()</script>"',
    'version: 1\ntype: term\nid: term\nterm: 术语\nmeaning: 解释\nonClick: malicious',
    'version: 1\ntype: explainer\nid: test\nasset: https://example.test/\ntext: 解释',
    'version: 1\ntype: explainer\nid: test\nasset: example\ntext: 解释\ninput: {code: {nested: true}}',
    'version: 1\ntype: term\nid: test\nterm: &value foo\nmeaning: *value',
    'version: 1\ntype: term\nid: test\nterm: foo\nterm: bar\nmeaning: baz',
    'version: 2\ntype: term\nid: test\nterm: foo\nmeaning: bar',
  ]) assert.throws(() => parseViewBlock(value), value);
  assert.throws(() => parseViewBlock('x'.repeat(150001)), /exceeds/);
});

test('static explainers require complete text and stable registered resource identity', () => {
  const value = parseViewBlock('version: 1\ntype: explainer\nid: publication\nasset: version-explainer\ntext: 发布保留快照，修改草稿不改变正在运行的实例。\ninput: {version: 2, enabled: true}\nheight: 420');
  assert.equal(value.type, 'explainer');
  assert.match(viewBlockText(value), /修改草稿不改变/);
  assert.throws(() => parseViewBlock('version: 1\ntype: explainer\nid: publication\nasset: example'), /text/);
  assert.throws(() => parseViewBlock('version: 1\ntype: steps\nid: steps\nitems: [{id: same, title: A, body: A}, {id: same, title: B, body: B}]'), /duplicate/);
});

test('search projection recognizes only explicit complete fences, preserving other code and ordinary colons', () => {
  const valid = '```lumine-view\nversion: 1\ntype: term\nid: invariant\nterm: 发布版本\nmeaning: 发布时固定的内容。\n```';
  const code = '````md\n' + valid + '\n````';
  const markdown = `普通（s2:22-32、s18）\n\n${code}\n\n${valid}`;
  assert.equal(viewFences(markdown).length, 1);
  assert.equal(viewMarkdownText(markdown), `普通（s2:22-32、s18）\n\n${code}\n\n发布版本：发布时固定的内容。`);
  assert.equal(viewMarkdownText('```lumine-view\ninvalid'), '```lumine-view\ninvalid');
});
