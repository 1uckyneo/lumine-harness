import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { Components, ExtraProps } from 'react-markdown';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import type { Diagram, KnowledgeDocument, Locale, Section } from '../harness/wiki/types.ts';
import { decode, documentHref, translate, type CatalogDocument } from './reader-common.ts';
import { drawMermaid } from './reader-diagrams.tsx';

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

function editorialMarkup(sections: Section[], diagrams: Diagram[] = []) {
  const sectionByLine = new Map(sections.map((section) => [section.startLine, section]));
  return () => (tree: AstNode) => {
    let nextDiagram = 0;
    const visit = (node: AstNode) => {
      if (node.type === 'heading') {
        const section = sectionByLine.get(node.position?.start.line ?? 0);
        if (section && section.level === node.depth) node.data = { hProperties: { 'data-section-id': section.id } };
      } else if (node.type === 'code' && node.lang === 'mermaid') {
        const diagram = diagrams[nextDiagram];
        if (diagram && node.value?.trim() === diagram.code) {
          nextDiagram++;
          node.data = { hName: 'div', hProperties: { 'data-wiki-component': 'diagram', 'data-wiki-id': diagram.id } };
          node.type = 'containerDirective';
          delete node.value;
        }
      } else if (node.type === 'containerDirective' && ['steps', 'comparison', 'details'].includes(node.name ?? '')) {
        node.data = {
          hName: 'div',
          hProperties: {
            'data-wiki-component': node.name!,
            'data-wiki-title': node.attributes?.title?.trim().slice(0, 100) ?? '',
          },
        };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
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

function SourcePills({ ids, label, onSource }: { ids: string[]; label: string; onSource: (id: string) => void }) {
  if (!ids.length) return null;
  return <div className="source-pills">{ids.map((id) => <button type="button" key={id} onClick={() => onSource(id)}>{label} · {id}</button>)}</div>;
}

function DiagramFigure({ diagram, locale, onOpen, onSource }: {
  diagram: Diagram; locale: Locale; onOpen: () => void; onSource: (id: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const t = (key: string) => translate(locale, key);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const render = () => { void drawMermaid(target, diagram, locale); };
    if (!('IntersectionObserver' in window)) { render(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); render(); }
    }, { rootMargin: '220px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [diagram, locale]);
  return <figure className="diagram" id={diagram.id} tabIndex={-1}>
    <header className="diagram-header"><strong>{diagram.title}</strong><button type="button" onClick={onOpen}>{t('openDiagram')}</button></header>
    <div className="diagram-canvas" role="group" aria-label={diagram.title} ref={canvas}>{t('loading')}</div>
    {diagram.caption && <figcaption>{diagram.caption}</figcaption>}
    <SourcePills ids={diagram.sources} label={t('source')} onSource={onSource} />
    <details><summary>{t('viewMermaid')}</summary><pre><code>{diagram.code}</code></pre></details>
  </figure>;
}

function proseHeadings(sections: Section[], onSource?: (id: string) => void, sourceLabel = '', titleId?: string): Components {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => ({ node, children }: ExtraProps & { children?: ReactNode }) => {
    const id = node?.properties['data-section-id'] as string | undefined;
    const section = id ? byId.get(id) : undefined;
    return <>{!id || id !== titleId ? <Tag id={id} tabIndex={id ? -1 : undefined}>{children}</Tag> : null}
      {section && onSource && <SourcePills ids={section.sources} label={sourceLabel} onSource={onSource} />}
    </>;
  };
  return { h1: heading('h1'), h2: heading('h2'), h3: heading('h3'), h4: heading('h4'), h5: heading('h5'), h6: heading('h6') };
}

type ResolveLink = (href: string) => { href: string; open: () => void } | undefined;

function proseComponents(resolveLink: ResolveLink, locale: Locale, showDiagram?: (id: string) => ReactNode): Components {
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
      const title = node?.properties['data-wiki-title'];
      if (kind === 'diagram') return showDiagram?.(String(node?.properties['data-wiki-id'])) ?? null;
      if (kind === 'details') return <details className="prose-details"><summary>{title || translate(locale, 'moreDetail')}</summary>{children}</details>;
      if (kind === 'steps' || kind === 'comparison') return <section className={'prose-' + kind}>{title && <strong>{title}</strong>}{children}</section>;
      return <div>{children}</div>;
    },
    table: ({ children }) => <div className="table-scroll" tabIndex={0} role="region" aria-label={translate(locale, 'table')}><table>{children}</table></div>,
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
  const plugins = useMemo(() => [remarkGfm, remarkDirective, editorialMarkup(doc.sections, doc.diagrams)], [doc.sections, doc.diagrams]);
  const components = useMemo(() => {
    const source = (id: string) => onSource(doc.id, id);
    const resolve: ResolveLink = (href) => {
      if (href.startsWith('source:')) {
        const id = decode(href.slice(7));
        return { href: documentHref(doc.id, 'source:' + id), open: () => source(id) };
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
        return { href: documentHref(doc.id), open: () => onReference(doc.id, href) };
      } catch { return; }
    };
    return {
      ...proseHeadings(doc.sections, source, translate(locale, 'sectionSources'), titleId),
      ...proseComponents(resolve, locale, (id) => {
        const diagram = doc.diagrams.find((entry) => entry.id === id);
        return diagram && <DiagramFigure diagram={diagram} locale={locale} onOpen={() => onDiagram(diagram)} onSource={source} />;
      }),
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
  </div>;
}

export function ReferenceMarkdown({ markdown, sections, path, locale, fragment, onReference, onFragment }: {
  markdown: string; sections: Section[]; path: string; locale: Locale; fragment?: string;
  onReference: (from: string, target: string) => void; onFragment: (fragment: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fragment) return;
    const frame = requestAnimationFrame(() => {
      const target = root.current?.querySelector<HTMLElement>('[id="' + CSS.escape(fragment) + '"]');
      target?.scrollIntoView({ block: 'start' });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [markdown, sections, fragment]);
  const components = {
    ...proseHeadings(sections),
    ...proseComponents((href) => href.startsWith('#') ? {
      href, open: () => onFragment(decode(href.slice(1))),
    } : { href: '#', open: () => onReference(path, href) }, locale),
  };
  return <div className="prose reference-prose" ref={root}>
    <Markdown skipHtml urlTransform={safeUrl} remarkPlugins={[remarkGfm, remarkDirective, editorialMarkup(sections)]} components={components}>
      {markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')}
    </Markdown>
  </div>;
}
