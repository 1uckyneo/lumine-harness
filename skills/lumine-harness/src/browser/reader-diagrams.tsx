import { lazy, Suspense } from 'react';
import DOMPurify from 'dompurify';
import type { Diagram, KnowledgeDocument, Locale } from '../harness/wiki/types.ts';
import { translate } from './reader-common.ts';

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
          primaryColor: '#FFFFFF', primaryTextColor: '#25231F', primaryBorderColor: '#CFCAC1',
          lineColor: '#8A857D', fontFamily: 'Noto Sans SC Variable, Noto Sans SC, sans-serif', fontSize: '16px', secondaryColor: '#F8EEE8',
          tertiaryColor: '#FAF9F6', clusterBkg: '#FAF9F6', clusterBorder: '#E2DED5', edgeLabelBackground: '#FFFFFF',
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
    element?.setAttribute('role', 'img');
    if (element) {
      const box = element.viewBox.baseVal;
      if (box.width && box.height) {
        element.setAttribute('width', String(Math.ceil(box.width)));
        element.setAttribute('height', String(Math.ceil(box.height)));
        element.style.width = Math.ceil(box.width) + 'px';
        element.style.height = Math.ceil(box.height) + 'px';
        element.style.maxWidth = 'none';
      }
      for (const node of element.querySelectorAll('g.node')) {
        const id = node.getAttribute('data-id') || node.id.match(/(?:^|-)flowchart-(.+)-\d+$/)?.[1];
        if (id) node.setAttribute('data-node-id', id);
      }
    }
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

export function exportedSvg(svg: SVGSVGElement, diagram: Diagram, wikiDocument: KnowledgeDocument): string {
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

const ZoomDialog = lazy(() => import('./reader-diagram-dialog.tsx'));

export function DiagramDialog(props: {
  diagram: Diagram; document: KnowledgeDocument; locale: Locale; onClose: () => void;
  onCopy: (value: string) => void; onText: (title: string, content: string) => void;
}) {
  return <Suspense fallback={<div className="diagram-loading" role="status">{translate(props.locale, 'loading')}<button onClick={props.onClose}>{translate(props.locale, 'close')}</button></div>}><ZoomDialog {...props} /></Suspense>;
}
