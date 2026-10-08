import { useEffect, useMemo, useRef } from 'react';
import type { Diagram, KnowledgeDocument, Locale, Section } from '../harness/wiki/types.ts';
import { headingSections } from '../harness/wiki/reader-model.ts';
import { decode, safeMarkdown, translate, type CatalogDocument } from './reader-common.ts';
import { drawMermaid } from './reader-diagrams.tsx';

function button(label: string, attribute: string, value: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.setAttribute(attribute, value);
  return element;
}

function sourcePills(sourceIds: string[], label: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'source-pills';
  for (const id of sourceIds) row.append(button(`${label} · ${id}`, 'data-source-id', id));
  return row;
}

function diagramFigure(diagram: Diagram, locale: Locale): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'diagram';
  figure.id = diagram.id;
  figure.tabIndex = -1;
  const header = document.createElement('div');
  header.className = 'diagram-header';
  const title = document.createElement('strong');
  title.textContent = diagram.title;
  header.append(title, button(translate(locale, 'openDiagram'), 'data-diagram-id', diagram.id), button(translate(locale, 'viewMermaid'), 'data-diagram-source', diagram.id));
  const canvas = document.createElement('div');
  canvas.className = 'diagram-canvas';
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', diagram.title);
  canvas.textContent = translate(locale, 'loading');
  const caption = document.createElement('figcaption');
  caption.textContent = diagram.caption;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = translate(locale, 'viewMermaid');
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = diagram.code;
  pre.append(code);
  details.append(summary, pre);
  figure.append(header, canvas, caption);
  if (diagram.sources.length) figure.append(sourcePills(diagram.sources, translate(locale, 'sources')));
  figure.append(details);
  return figure;
}

export function MarkdownBody({ doc, catalog, locale, fragment, onDocument, onFragment, onSource, onReference, onDiagram, onDiagramText, onMissing, onCurrentSection }: {
  doc: KnowledgeDocument; catalog: CatalogDocument[]; locale: Locale; fragment: string;
  onDocument: (id: string, fragment?: string) => void;
  onFragment: (fragment: string) => void;
  onSource: (documentId: string, sourceId: string) => void;
  onReference: (from: string, target: string) => void;
  onDiagram: (diagram: Diagram) => void;
  onDiagramText: (diagram: Diagram) => void;
  onMissing: () => void;
  onCurrentSection: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => safeMarkdown(doc.body), [doc.body]);
  const mountedFor = useRef('');

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    container.innerHTML = markup;
    const headings = [...container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')];
    for (const element of container.querySelectorAll('[id]')) element.removeAttribute('id');
    headingSections(doc.sections, headings.map((heading) => Number(heading.tagName.slice(1))))
      .forEach((section, index) => {
        if (!section) return;
        headings[index].id = section.id;
        headings[index].tabIndex = -1;
        if (section.sources.length) headings[index].after(sourcePills(section.sources, translate(locale, 'sectionSources')));
      });
    if (headings[0]?.textContent === doc.title) headings[0].classList.add('duplicate-title');

    const diagrams: { canvas: Element; diagram: Diagram }[] = [];
    let diagramIndex = 0;
    for (const code of container.querySelectorAll('pre > code.language-mermaid')) {
      const diagram = doc.diagrams[diagramIndex++];
      if (!diagram) continue;
      const figure = diagramFigure(diagram, locale);
      code.parentElement?.replaceWith(figure);
      diagrams.push({ canvas: figure.querySelector('.diagram-canvas')!, diagram });
    }
    const observers: IntersectionObserver[] = [];
    if ('IntersectionObserver' in window) {
      const drawing = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            drawing.unobserve(entry.target);
            const match = diagrams.find((item) => item.canvas === entry.target);
            if (match) void drawMermaid(match.canvas, match.diagram, locale);
          }
        }
      }, { rootMargin: '180px' });
      diagrams.forEach(({ canvas }) => drawing.observe(canvas));
      observers.push(drawing);
      const contents = new IntersectionObserver((entries) => {
        const entry = entries.find((item) => item.isIntersecting);
        if (entry) onCurrentSection(entry.target.id);
      }, { rootMargin: '-8% 0px -76% 0px' });
      for (const heading of container.querySelectorAll('h2[id],h3[id]')) contents.observe(heading);
      observers.push(contents);
    } else diagrams.forEach(({ canvas, diagram }) => { void drawMermaid(canvas, diagram, locale); });
    return () => { observers.forEach((item) => item.disconnect()); };
  }, [doc.id, doc.revision, locale, markup, onCurrentSection]);

  useEffect(() => {
    const identity = `${doc.id}@${doc.revision}:${locale}#${fragment}`;
    if (mountedFor.current === identity) return;
    mountedFor.current = identity;
    if (!fragment || fragment.startsWith('source:')) return;
    const target = [...(root.current?.querySelectorAll<HTMLElement>('[id]') ?? [])].find((item) => item.id === fragment);
    if (!target) { onMissing(); return; }
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
  }, [doc.id, doc.revision, locale, fragment, onMissing]);

  const clicked = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const source = target.closest<HTMLElement>('[data-source-id]');
    if (source) { onSource(doc.id, source.dataset.sourceId!); return; }
    const diagram = target.closest<HTMLElement>('[data-diagram-id]');
    if (diagram) { const found = doc.diagrams.find((item) => item.id === diagram.dataset.diagramId); if (found) onDiagram(found); return; }
    const diagramText = target.closest<HTMLElement>('[data-diagram-source]');
    if (diagramText) { const found = doc.diagrams.find((item) => item.id === diagramText.dataset.diagramSource); if (found) onDiagramText(found); return; }
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href) return;
    if (href.startsWith('#source:')) { event.preventDefault(); onSource(doc.id, decode(href.slice(8))); return; }
    if (href.startsWith('#')) { event.preventDefault(); onFragment(decode(href.slice(1))); return; }
    if (/^https?:\/\//i.test(href)) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return; }
    let url: URL;
    try { url = new URL(href, new URL(doc.path, location.origin + '/')); }
    catch { event.preventDefault(); return; }
    event.preventDefault();
    if (url.origin !== location.origin) return;
    const found = catalog.find((item) => item.path === decode(url.pathname).slice(1));
    if (found) onDocument(found.id, decode(url.hash.slice(1)));
    else onReference(doc.id, href);
  };

  return <div className="prose" ref={root} onClick={clicked} />;
}

export function ReferenceMarkdown({ markdown, sections, path, locale, fragment, onReference, onFragment }: {
  markdown: string; sections: Section[]; path: string; locale: Locale; fragment?: string;
  onReference: (from: string, target: string) => void; onFragment: (fragment: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    container.innerHTML = safeMarkdown(markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''));
    const headings = [...container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')];
    headingSections(sections, headings.map((heading) => Number(heading.tagName.slice(1))))
      .forEach((section, index) => { if (section) { headings[index].id = section.id; headings[index].tabIndex = -1; } });
    if (fragment) requestAnimationFrame(() => {
      const target = [...container.querySelectorAll<HTMLElement>('[id]')].find((item) => item.id === fragment);
      target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true });
    });
  }, [markdown, sections, locale, fragment]);
  return <div className="prose reference-prose" ref={root} onClick={(event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!anchor || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) { event.preventDefault(); onFragment(decode(href.slice(1))); }
    else if (!/^https?:\/\//i.test(href)) { event.preventDefault(); onReference(path, href); }
    else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  }} />;
}
