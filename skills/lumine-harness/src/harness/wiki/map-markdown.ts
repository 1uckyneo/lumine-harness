import path from 'node:path';
import { splitReference, topicTree, type TopicNode } from './reader-model.ts';
import type { CheckIssue, CoverageMap, KnowledgeDocument, Locale } from './types.ts';

const labels = {
  'zh-CN': { title: '仓库知识地图', derived: '目录由知识地图生成；层级和顺序以持久知识地图为准。', relative: '链接相对于', covered: '已整理', partial: '待完善', planned: '待整理', deferred: '已延后', missing: '引用内容暂缺', questions: '回答', reason: '原因', unmapped: '尚未编入目录', unresolved: '目录关系待修复', errors: '部分内容暂不可读', empty: '知识目录尚未建立；已有文档仍可阅读。', note: '整理状态不代表语义审阅、运行验证或产品交付已通过。' },
  en: { title: 'Repository knowledge map', derived: 'Derived from the persistent knowledge map, which owns hierarchy and ordering.', relative: 'Links are relative to', covered: 'Documented', partial: 'In progress', planned: 'To write', deferred: 'Deferred', missing: 'Referenced content is missing', questions: 'Answers', reason: 'Reason', unmapped: 'Outside the knowledge tree', unresolved: 'Tree relationships need repair', errors: 'Some content could not be read', empty: 'The knowledge tree has not been created; existing documents remain readable.', note: 'Writing status does not establish semantic review, runtime validation or product delivery.' }
};
const text = (value: string): string => value.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/([`*_[\]])/g, '\\$1').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const code = (value: string): string => `\`${value.replaceAll('`', '').replace(/[\r\n]+/g, ' ')}\``;

/** No source scan, model call or stored index: resolve stable identities at export time. */
export function renderKnowledgeMapMarkdown(map: CoverageMap, resolve: (reference: string) => KnowledgeDocument, options: { locale: Locale; wikiRoot: string; issues?: CheckIssue[] }): string {
  const t = labels[options.locale], lines = [`# ${t.title}`, '', t.derived, '', `${t.relative} ${code(options.wikiRoot)}. ${t.note}`, ''];
  const link = (reference: string): string => {
    try {
      const document = resolve(reference), requested = splitReference(reference);
      const fragment = document.selection?.id ?? requested.fragment;
      const title = document.selection?.kind === 'section' ? document.sections.find((section) => section.id === fragment)?.title : document.selection?.kind === 'diagram' ? document.diagrams.find((diagram) => diagram.id === fragment)?.title : undefined;
      const target = path.posix.relative(options.wikiRoot, document.path).split('/').map(encodeURIComponent).join('/') + (fragment ? `#${encodeURIComponent(fragment)}` : '');
      return `[${text(document.title)}${title ? ` — ${text(title)}` : ''}](<${target}>) · ${code(`${document.id}${fragment ? `#${fragment}` : ''}`)}`;
    } catch { return `${code(reference)} · ${t.missing}`; }
  };
  const render = ({ topic, children }: TopicNode, depth: number): void => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- **${text(topic.title)}** · ${t[topic.status]}`);
    for (const question of topic.questions) lines.push(`${indent}  - ${t.questions}：${text(question)}`);
    if (topic.reason) lines.push(`${indent}  - ${t.reason}：${text(topic.reason)}`);
    for (const reference of topic.documentRefs) lines.push(`${indent}  - ${link(reference)}`);
    for (const child of children) render(child, depth + 1);
  };
  const { roots, unresolved } = topicTree(map);
  if (!roots.length) lines.push(t.empty);
  for (const root of roots) render(root, 0);
  if (map.unmappedDocumentIds.length) lines.push('', `## ${t.unmapped}`, '', ...map.unmappedDocumentIds.map((id) => `- ${link(id)}`));
  if (unresolved.length) lines.push('', `## ${t.unresolved}`, '', ...unresolved.map((topic) => `- ${text(topic.title)} · ${code(topic.id)}`));
  if (options.issues?.length) lines.push('', `## ${t.errors}`, '', ...options.issues.map((issue) => `- ${code(issue.document ?? issue.code)} · ${code(issue.code)}`));
  return `${lines.join('\n').trimEnd()}\n`;
}
