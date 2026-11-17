import { isValidElement, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { Components, ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Diagram, KnowledgeDocument, Locale, Section } from '../harness/wiki/types.ts';
import { decode, documentHref, evidenceHref, sourceTitle, translate, type CatalogDocument } from './reader-common.ts';
import { drawMermaid } from './reader-diagrams.tsx';
import { ArticleView, CodeSnippet } from './reader-article.tsx';

type AstNode = {
  type: string;
  name?: string;
  depth?: number;
  lang?: string;
  value?: string;
  children?: AstNode[];
  attributes?: Record<string, string | null>;
  position?: { start: { line: number } };
  data?: { hName?: string; hProperties?: Record<string, string> };
};

function editorialMarkup(sections: Section[], diagrams: Diagram[] = [], lineOffset?: number) {
  const sectionByLine = new Map(sections.map((section) => [section.startLine, section]));
  return () => (tree: AstNode) => {
    let nextDiagram = 0;
    const visit = (node: AstNode) => {
      if (node.type === 'heading') {
        const section = sectionByLine.get(node.position?.start.line ?? 0);
        if (section && section.level === node.depth) node.data = { hProperties: { 'data-section-id': section.id } };
      } else if (node.type === 'paragraph' && node.children?.length) {
        // A standalone author anchor contributes identity, never an empty paragraph's vertical spacing.
        const anchorOnly = node.children.every((child) => child.type === 'html' || (child.type === 'text' && !child.value?.trim()));
        const anchor = anchorOnly && /^\s*<a\s+id=["']([\p{L}\p{N}_.:-]+)["']\s*>\s*<\/a>\s*$/u.exec(node.children.map((child) => child.value ?? '').join(''));
        if (anchor) {
          node.data = { hName: 'span', hProperties: sections.some((section) => section.id === anchor[1]) ? { 'data-wiki-anchor': anchor[1] } : { id: anchor[1], 'data-wiki-anchor': anchor[1] } };
          node.type = 'lumineAnchor'; node.children = [];
        }
      } else if (node.type === 'code' && node.lang === 'mermaid') {
        const diagram = diagrams[nextDiagram];
        if (diagram && node.value?.trim() === diagram.code) {
          nextDiagram++;
          node.data = { hName: 'div', hProperties: { 'data-wiki-component': 'diagram', 'data-wiki-id': diagram.id } };
          node.type = 'containerDirective';
          delete node.value;
        }
      } else if (node.type === 'code' && node.lang === 'lumine-view') {
        node.data = { hName: 'div', hProperties: { 'data-wiki-component': 'view', 'data-wiki-value': node.value ?? '' } };
        node.type = 'lumineView';
        node.children = [];
        delete node.value;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
    if (lineOffset !== undefined) for (const block of tree.children ?? []) {
      const line = block.position?.start.line;
      if (line !== undefined && block.type !== 'html') {
        block.data ??= {};
        block.data.hProperties = { ...block.data.hProperties, 'data-reading-line': String(line + lineOffset) };
      }
    }
  };
}

function safeUrl(value: string): string {
  // URL parsers strip several ASCII controls, and HTML treats backslashes as slashes in web URLs.
  if (/[\x00-\x20\x7f\\]/.test(value) || value.startsWith('//')) return '';
  if (/^https?:\/\//i.test(value) || /^source:[\p{L}\p{N}_.:-]+$/u.test(value)) return value;
  return /^[^/?#]*:/.test(value) ? '' : value;
}

function ordinaryClick(event: React.MouseEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;
}

function SourceLinks({ ids, label, doc, catalog, locale, onSource }: { ids: string[]; label: string; doc: KnowledgeDocument; catalog: CatalogDocument[]; locale: Locale; onSource: (id: string) => void }) {
  if (!ids.length) return null;
  return <details className="source-disclosure"><summary>{label}<span aria-hidden="true"> · {ids.length}</span></summary><ul>{ids.map((id) => {
    const source = doc.sources.find((entry) => entry.id === id);
    return <li key={id}><a href={evidenceHref({ kind: 'source', documentId: doc.id, sourceId: id }, location.href)} onClick={(event) => { if (ordinaryClick(event)) { event.preventDefault(); onSource(id); } }}>
      {source ? sourceTitle(source, catalog, locale) : translate(locale, 'sourceUnavailable')}
    </a></li>;
  })}</ul></details>;
}

function DiagramFigure({ diagram, doc, catalog, locale, onOpen, onSource }: {
  diagram: Diagram; doc: KnowledgeDocument; catalog: CatalogDocument[]; locale: Locale; onOpen: () => void; onSource: (id: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const t = (key: string) => translate(locale, key);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let active = true;
    let highlighted: string[] = [];
    const mark = () => {
      for (const node of target.querySelectorAll<SVGGElement>('g.node')) {
        const id = node.dataset.nodeId || node.getAttribute('data-id') || node.id.replace(/^(?:.*-)?flowchart-(.+)-\d+$/, '$1');
        const selected = highlighted.includes(id);
        node.classList.toggle('is-explained', selected);
        node.setAttribute('data-explanation-muted', String(highlighted.length > 0 && !selected));
      }
    };
    const focus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.diagramId !== diagram.id || !Array.isArray(detail.nodeIds)) return;
      highlighted = detail.nodeIds.filter((id: unknown): id is string => typeof id === 'string');
      mark();
    };
    window.addEventListener('lumine:diagram-focus', focus);
    const render = () => { void drawMermaid(target, diagram, locale).then(() => { if (active) mark(); }); };
    if (!('IntersectionObserver' in window)) { render(); return () => { active = false; window.removeEventListener('lumine:diagram-focus', focus); }; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); render(); }
    }, { rootMargin: '220px' });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); window.removeEventListener('lumine:diagram-focus', focus); };
  }, [diagram, locale]);
  return <figure className="diagram" id={diagram.id} tabIndex={-1}>
    <header className="diagram-header"><strong>{diagram.title}</strong><button type="button" onClick={onOpen}>{t('openDiagram')}</button></header>
    <div className="diagram-canvas" role="group" tabIndex={0} aria-label={diagram.title} ref={canvas}>{t('loading')}</div>
    {diagram.caption && <figcaption>{diagram.caption}</figcaption>}
    <SourceLinks ids={diagram.sources} label={t('sources')} doc={doc} catalog={catalog} locale={locale} onSource={onSource} />
    <details><summary>{t('viewMermaid')}</summary><pre><code>{diagram.code}</code></pre></details>
  </figure>;
}

function proseHeadings(sections: Section[], titleId?: string): Components {
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => ({ node, children }: ExtraProps & { children?: ReactNode }) => {
    const id = node?.properties['data-section-id'] as string | undefined;
    return !id || id !== titleId ? <Tag id={id} data-reading-line={node?.properties['data-reading-line']} tabIndex={id ? -1 : undefined}>{children}</Tag> : null;
  };
  return { h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4'), h5: heading('h5'), h6: heading('h6') };
}

type ResolveLink = (href: string) => { href: string; open: () => void } | undefined;

function proseComponents(resolveLink: ResolveLink, locale: Locale, showDiagram?: (id: string) => ReactNode, showView?: (value: string) => ReactNode): Components {
  const link = (href: string | undefined, children: ReactNode) => {
    if (!href) return <>{children}</>;
    if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    const destination = resolveLink(href);
    if (!destination) return <>{children}</>;
    return <a href={destination.href} onClick={(event) => {
      if (ordinaryClick(event)) { event.preventDefault(); destination.open(); }
    }}>{children}</a>;
  };
  return {
    a: ({ href, children }) => link(href, children),
    img: ({ src, alt }) => link(src, alt || translate(locale, 'attachment')),
    div: ({ node, children }) => {
      const kind = node?.properties['data-wiki-component'];
      if (kind === 'diagram') return showDiagram?.(String(node?.properties['data-wiki-id'])) ?? null;
      if (kind === 'view') return showView?.(String(node?.properties['data-wiki-value'])) ?? <pre>{String(node?.properties['data-wiki-value'])}</pre>;
      return <div data-reading-line={node?.properties['data-reading-line']}>{children}</div>;
    },
    pre: ({ node, children }) => {
      const readingLine = node?.properties['data-reading-line'];
      const child = Array.isArray(children) ? children[0] : children;
      if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
        const blockLine = readingLine ?? (child.props as { 'data-reading-line'?: string })['data-reading-line'];
        const language = /(?:^|\s)language-([^\s]+)/.exec(child.props.className ?? '')?.[1] ?? 'text';
        const code = typeof child.props.children === 'string' ? child.props.children.replace(/\n$/, '') : undefined;
        if (code !== undefined) return <CodeSnippet code={code} language={language} locale={locale} readingLine={blockLine === undefined ? undefined : String(blockLine)} />;
      }
      return <pre data-reading-line={readingLine}>{children}</pre>;
    },
    table: ({ node, children }) => <div data-reading-line={node?.properties['data-reading-line']} className="table-scroll" tabIndex={0} role="region" aria-label={translate(locale, 'table')}><table>{children}</table></div>,
  };
}

export function MarkdownBody({ doc, catalog, locale, fragment, titleId, onDocument, onFragment, onSource, onReference, onDiagram, onMissing, onCurrentSection }: {
  doc: KnowledgeDocument; catalog: CatalogDocument[]; locale: Locale; fragment: string; titleId?: string;
  onDocument: (id: string, fragment?: string) => void;
  onFragment: (fragment: string) => void;
  onSource: (documentId: string, sourceId: string) => void;
  onReference: (from: string, target: string) => void;
  onDiagram: (diagram: Diagram) => void;
  onMissing: () => void;
  onCurrentSection: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const plugins = useMemo(() => [remarkGfm, editorialMarkup(doc.sections, doc.diagrams)], [doc.sections, doc.diagrams]);
  const components = useMemo(() => {
    const source = (id: string) => onSource(doc.id, id);
    const resolve: ResolveLink = (href) => {
      if (href.startsWith('source:')) {
        const id = decode(href.slice(7));
        return { href: evidenceHref({ kind: 'source', documentId: doc.id, sourceId: id }, location.href), open: () => source(id) };
      }
      if (href.startsWith('#')) {
        const fragment = decode(href.slice(1));
        return { href: documentHref(doc.id, fragment), open: () => onFragment(fragment) };
      }
      try {
        const url = new URL(href, new URL('/' + doc.path, location.origin));
        if (url.origin !== location.origin) return;
        const refId = href.match(/^([^/?#]+)(?:#|$)/)?.[1];
        const found = catalog.find((item) => item.path === decode(url.pathname).slice(1) || item.id === refId);
        if (found) {
          const fragment = decode(url.hash.slice(1));
          return { href: documentHref(found.id, fragment), open: () => onDocument(found.id, fragment) };
        }
        return { href: evidenceHref({ kind: 'reference', from: doc.id, target: href }, location.href), open: () => onReference(doc.id, href) };
      } catch { return; }
    };
    return {
      ...proseHeadings(doc.sections, titleId),
      ...proseComponents(resolve, locale, (id) => {
        const diagram = doc.diagrams.find((entry) => entry.id === id);
        return diagram && <DiagramFigure diagram={diagram} doc={doc} catalog={catalog} locale={locale} onOpen={() => onDiagram(diagram)} onSource={source} />;
      }, (value) => <ArticleView value={value} documentId={doc.id} locale={locale} onSource={source} prose={(text) => <Markdown skipHtml urlTransform={safeUrl} remarkPlugins={[remarkGfm]} components={proseComponents(resolve, locale)}>{text}</Markdown>} />),
    };
  }, [catalog, doc, locale, titleId, onDocument, onFragment, onSource, onReference, onDiagram]);

  useEffect(() => {
    if (!root.current || !('IntersectionObserver' in window)) return;
    const contents = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.isIntersecting);
      if (entry) onCurrentSection(entry.target.id);
    }, { rootMargin: '-8% 0px -76% 0px' });
    for (const heading of root.current.querySelectorAll('h2[id],h3[id]')) contents.observe(heading);
    return () => contents.disconnect();
  }, [doc.id, doc.revision, locale, onCurrentSection]);

  useEffect(() => {
    if (!fragment || fragment.startsWith('source:')) return;
    const target = titleId === fragment
      ? document.getElementById(titleId)
      : root.current?.querySelector<HTMLElement>('[id="' + CSS.escape(fragment) + '"]');
    if (!target) { onMissing(); return; }
    const detail = target.closest('details');
    if (detail) detail.open = true;
    let frame = 0;
    let active = true;
    let focused = false;
    const align = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active) return;
        target.scrollIntoView({ block: 'start' });
        if (!focused) { target.focus({ preventScroll: true }); focused = true; }
      });
    };
    const layout = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(align);
    const stop = () => { active = false; cancelAnimationFrame(frame); layout?.disconnect(); };
    const movedByKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) stop();
    };
    layout?.observe(root.current!);
    align();
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('pointerdown', stop, { passive: true });
    window.addEventListener('keydown', movedByKey);
    return () => {
      stop();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', movedByKey);
    };
  }, [doc.id, doc.revision, locale, fragment, titleId, onMissing]);

  return <div ref={root} className="prose">
    <Markdown skipHtml urlTransform={safeUrl} remarkPlugins={plugins} components={components}>{doc.body}</Markdown>
    {doc.sections.some((section) => section.sources.length > 0) && <details className="article-section-sources"><summary>{translate(locale, 'sources')}</summary>{doc.sections.filter((section) => section.sources.length > 0).map((section) => <div key={section.id}><strong>{section.title}</strong><SourceLinks ids={section.sources} label={translate(locale, 'sectionSources')} doc={doc} catalog={catalog} locale={locale} onSource={(id) => onSource(doc.id, id)} /></div>)}</details>}
  </div>;
}

export const markdownFrontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export function ReferenceMarkdown({ markdown, sections, path, locale, lineOffset, onReference }: {
  markdown: string; sections: Section[]; path: string; locale: Locale; lineOffset: number;
  onReference: (from: string, target: string) => void;
}) {
  const plugins = useMemo(() => [remarkGfm, editorialMarkup(sections, [], lineOffset)], [sections, lineOffset]);
  const components = useMemo(() => ({
    ...proseHeadings(sections),
    ...proseComponents((href) => ({ href: evidenceHref({ kind: 'reference', from: path, target: href }, location.href), open: () => onReference(path, href) }), locale),
  }), [sections, path, locale, onReference]);
  return <div className="prose reference-prose">
    <Markdown skipHtml urlTransform={safeUrl} remarkPlugins={plugins} components={components}>{markdown}</Markdown>
  </div>;
}
