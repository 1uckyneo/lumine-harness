import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { Diagram, KnowledgeDocument, Locale } from '../harness/wiki/types.ts';
import { download, translate } from './reader-common.ts';

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
let renderCount = 0;

function allowedDiagram(code: string): boolean {
  return code.length <= 50_000
    && (code.match(/-->|--\)|==>|->>|-->>/g)?.length ?? 0) <= 300
    && !/%%\{|^---\s*$|\bclick\s|<\/?(?:script|iframe)|javascript:|https?:\/\//mi.test(code);
}

function showDiagramAssetError(target: Element, locale: Locale): void {
  const message = target.ownerDocument.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = translate(locale, 'diagramAssetError');
  const reload = target.ownerDocument.createElement('button');
  reload.type = 'button';
  reload.textContent = translate(locale, 'reloadReader');
  reload.onclick = () => target.ownerDocument.defaultView?.location.reload();
  target.replaceChildren(message, reload);
  target.classList.add('diagram-error');
}

function failedModuleLoad(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch dynamically imported module|importing a module script failed|failed to load module script|error loading dynamically imported module|loading chunk .+ failed/i.test(message);
}

export async function drawMermaid(
  target: Element, diagram: Diagram, locale: Locale,
  loadMermaid: () => Promise<typeof import('mermaid')> = () => import('mermaid'),
): Promise<SVGSVGElement | null> {
  if (!allowedDiagram(diagram.code)) {
    target.textContent = translate(locale, 'diagramError');
    target.classList.add('diagram-error');
    return null;
  }
  let mermaid: typeof import('mermaid').default;
  try {
    mermaidPromise ??= loadMermaid().then((module) => {
      module.default.initialize({
        startOnLoad: false, securityLevel: 'strict', theme: 'base', htmlLabels: false,
        flowchart: { htmlLabels: false }, maxTextSize: 50_000, maxEdges: 300,
        themeVariables: {
          primaryColor: '#EAF3ED', primaryTextColor: '#24302D', primaryBorderColor: '#91A99A',
          lineColor: '#527662', fontFamily: 'system-ui, sans-serif', secondaryColor: '#F7F8F5',
          tertiaryColor: '#FFFFFF',
        },
      });
      return module;
    });
    ({ default: mermaid } = await mermaidPromise);
  } catch {
    mermaidPromise = null;
    showDiagramAssetError(target, locale);
    return null;
  }
  try {
    const { svg } = await mermaid.render(`lumine-diagram-${++renderCount}`, diagram.code, target);
    target.innerHTML = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject', 'script', 'image'],
      FORBID_ATTR: ['onload', 'onclick'],
    });
    const element = target.querySelector('svg');
    element?.setAttribute('aria-label', diagram.title);
    target.classList.remove('diagram-error');
    return element;
  } catch (error) {
    if (failedModuleLoad(error)) showDiagramAssetError(target, locale);
    else {
      target.textContent = translate(locale, 'diagramError');
      target.classList.add('diagram-error');
    }
    return null;
  }
}

function exportedSvg(svg: SVGSVGElement, diagram: Diagram, wikiDocument: KnowledgeDocument): string {
  const clean = svg.cloneNode(true) as SVGSVGElement;
  for (const element of clean.querySelectorAll('script,foreignObject,image,a')) element.remove();
  for (const element of [clean, ...clean.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || /href$/i.test(attribute.name) || /url\(\s*["']?(?:https?:|data:|file:)/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  clean.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const metadata = document.createElementNS('http://www.w3.org/2000/svg', 'metadata');
  metadata.textContent = JSON.stringify({
    title: diagram.title, status: wikiDocument.status, revision: wikiDocument.revision,
    documentId: wikiDocument.id, diagramId: diagram.id,
  });
  clean.prepend(metadata);
  return new XMLSerializer().serializeToString(clean);
}

export function DiagramDialog({ diagram, document: wikiDocument, locale, onClose, onCopy, onText }: {
  diagram: Diagram; document: KnowledgeDocument; locale: Locale; onClose: () => void;
  onCopy: (value: string) => void; onText: (title: string, content: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const originFocus = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState({ width: 900, height: 500 });
  const [position, setPosition] = useState({ scale: 1, x: 0, y: 0 });
  const gesture = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const t = (key: string) => translate(locale, key);

  useEffect(() => {
    const element = dialog.current;
    originFocus.current = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); originFocus.current?.focus(); };
  }, []);
  useEffect(() => {
    let alive = true;
    const target = canvas.current;
    if (!target) return;
    target.textContent = t('loading');
    void drawMermaid(target, diagram, locale).then((result) => {
      if (!alive || !result) return;
      svg.current = result;
      const next = { width: result.viewBox.baseVal.width || 900, height: result.viewBox.baseVal.height || 500 };
      setBox(next);
      const bounds = viewport.current?.getBoundingClientRect();
      if (bounds) {
        const scale = Math.max(.05, Math.min((bounds.width - 40) / next.width, (bounds.height - 40) / next.height, 2));
        setPosition({ scale, x: (bounds.width - next.width * scale) / 2, y: (bounds.height - next.height * scale) / 2 });
      }
    });
    return () => { alive = false; };
  }, [diagram, locale]);

  const zoom = (factor: number) => setPosition((current) => {
    const scale = Math.max(.05, Math.min(8, current.scale * factor));
    const bounds = viewport.current?.getBoundingClientRect();
    const cx = (bounds?.width ?? 0) / 2, cy = (bounds?.height ?? 0) / 2;
    return { scale, x: cx - (cx - current.x) * scale / current.scale, y: cy - (cy - current.y) * scale / current.scale };
  });
  const fit = () => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const scale = Math.max(.05, Math.min((bounds.width - 40) / box.width, (bounds.height - 40) / box.height, 2));
    setPosition({ scale, x: (bounds.width - box.width * scale) / 2, y: (bounds.height - box.height * scale) / 2 });
  };
  const reset = () => {
    const bounds = viewport.current?.getBoundingClientRect();
    setPosition({ scale: 1, x: ((bounds?.width ?? box.width) - box.width) / 2, y: ((bounds?.height ?? box.height) - box.height) / 2 });
  };
  const arrow = (key: string) => setPosition((current) => ({
    ...current, x: current.x + (key === 'ArrowLeft' ? 25 : key === 'ArrowRight' ? -25 : 0),
    y: current.y + (key === 'ArrowUp' ? 25 : key === 'ArrowDown' ? -25 : 0),
  }));

  return <dialog ref={dialog} className="diagram-dialog" aria-labelledby="diagram-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2 id="diagram-dialog-title">{diagram.title}</h2><button onClick={onClose}>{t('close')} ×</button></header>
    <div className="dialog-tools">
      <button onClick={() => zoom(1.2)}>{t('zoomIn')}</button><button onClick={() => zoom(.8)}>{t('zoomOut')}</button>
      <button onClick={fit}>{t('fit')}</button><button onClick={reset}>{t('reset')}</button>
      <button onClick={() => onCopy(`${wikiDocument.id}#${diagram.id}`)}>{t('copiedReference')}</button>
      <button onClick={() => onText(diagram.title, diagram.code)}>{t('viewMermaid')}</button>
      <button onClick={() => onCopy(diagram.code)}>{t('copyMermaid')}</button>
      <button onClick={() => download(`${diagram.title}.mmd`, diagram.code)}>{t('exportMermaid')}</button>
      <button disabled={!svg.current} onClick={() => svg.current && download(`${diagram.title}.svg`, exportedSvg(svg.current, diagram, wikiDocument), 'image/svg+xml;charset=utf-8')}>{t('exportSvg')}</button>
    </div>
    <div ref={viewport} className="diagram-viewport" role="region" tabIndex={0} aria-label={diagram.title}
      onWheel={(event) => { event.preventDefault(); zoom(event.deltaY > 0 ? .9 : 1.1); }}
      onPointerDown={(event) => { if ((event.target as Element).closest('button')) return; gesture.current = { x: position.x, y: position.y, px: event.clientX, py: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = gesture.current; if (start) setPosition((current) => ({ ...current, x: start.x + event.clientX - start.px, y: start.y + event.clientY - start.py })); }}
      onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}
      onKeyDown={(event) => { if (event.key === '+' || event.key === '=') zoom(1.2); else if (event.key === '-') zoom(.8); else if (event.key === '0') fit(); else if (event.key.startsWith('Arrow')) { event.preventDefault(); arrow(event.key); } }}>
      <div ref={canvas} className="diagram-zoom-layer" style={{ width: box.width, height: box.height, transform: `translate(${position.x}px, ${position.y}px) scale(${position.scale})` }} />
    </div>
  </dialog>;
}
