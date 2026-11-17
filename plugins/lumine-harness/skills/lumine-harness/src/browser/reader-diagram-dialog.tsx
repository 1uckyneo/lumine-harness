import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Expand, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { Diagram, KnowledgeDocument, Locale } from '../harness/wiki/types.ts';
import { download, translate } from './reader-common.ts';
import { drawMermaid, exportedSvg } from './reader-diagrams.tsx';

export default function DiagramDialog({ diagram, document: wikiDocument, locale, onClose, onCopy, onText }: {
  diagram: Diagram; document: KnowledgeDocument; locale: Locale; onClose: () => void;
  onCopy: (value: string) => void; onText: (title: string, content: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const transform = useRef<ReactZoomPanPinchRef>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState({ width: 800, height: 400 });
  const [ready, setReady] = useState(false);
  const [fitted, setFitted] = useState(false);
  const [scale, setScale] = useState(1);
  const t = (key: string) => translate(locale, key);
  const fit = (initial = false) => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const next = Math.max(initial ? .9 : .05, Math.min((bounds.width - 48) / box.width, (bounds.height - 48) / box.height, 1.5));
    transform.current?.setTransform(initial ? Math.max(24, (bounds.width - box.width * next) / 2) : (bounds.width - box.width * next) / 2, (bounds.height - box.height * next) / 2, next, 0);
    setFitted(true);
  };
  useEffect(() => {
    let alive = true;
    const target = canvas.current;
    if (!target) return;
    setReady(false); setFitted(false); target.textContent = t('loading');
    void drawMermaid(target, diagram, locale).then((result) => {
      if (!alive || !result) return;
      svg.current = result;
      setBox({ width: result.viewBox.baseVal.width || 800, height: result.viewBox.baseVal.height || 400 });
      setReady(true);
    });
    return () => { alive = false; };
  }, [diagram, locale]);
  useEffect(() => { if (ready) fit(true); }, [box, ready]);
  return <ModalOverlay className="reader-overlay" isOpen isDismissable onOpenChange={(open) => { if (!open) onClose(); }}><Modal className="diagram-dialog"><Dialog aria-labelledby="diagram-dialog-title">
    <header className="dialog-header"><Heading slot="title" id="diagram-dialog-title">{diagram.title}</Heading><Button className="icon-button" aria-label={t('close')} onPress={onClose}><X size={20} /></Button></header>
    <div className="dialog-tools diagram-controls">
      <Button aria-label={t('zoomIn')} onPress={() => transform.current?.zoomIn(.15, 120)}><ZoomIn size={18} /></Button><Button aria-label={t('zoomOut')} onPress={() => transform.current?.zoomOut(.15, 120)}><ZoomOut size={18} /></Button>
      <span className="zoom-level" aria-live="polite">{Math.round(scale * 100)}%</span>
      <Button onPress={() => fit()}><Expand size={16} />{t('fit')}</Button><Button onPress={() => transform.current?.centerView(1, 0)}><RotateCcw size={16} />{t('reset')}</Button>
      <details className="diagram-export"><summary>{locale === 'zh-CN' ? '图示与来源' : 'Diagram and source'}</summary><div>
        <button onClick={() => onCopy(`${wikiDocument.id}#${diagram.id}`)}>{t('copiedReference')}</button>
        <button onClick={() => onText(diagram.title, diagram.code)}>{t('viewMermaid')}</button>
        <button onClick={() => onCopy(diagram.code)}>{t('copyMermaid')}</button>
        <button onClick={() => download(`${diagram.title}.mmd`, diagram.code)}>{t('exportMermaid')}</button>
        <button disabled={!ready} onClick={() => svg.current && download(`${diagram.title}.svg`, exportedSvg(svg.current, diagram, wikiDocument), 'image/svg+xml;charset=utf-8')}>{t('exportSvg')}</button>
      </div></details>
    </div>
    <p className="diagram-shortcuts" id="diagram-shortcuts">{locale === 'zh-CN' ? '拖动平移 · 滚轮缩放 · 方向键移动 · + / − 缩放 · 0 适配' : 'Drag to pan · scroll to zoom · arrow keys to move · + / − to zoom · 0 to fit'}</p>
    <div ref={viewport} className="diagram-viewport" role="region" tabIndex={0} aria-busy={!ready || !fitted} data-ready={ready && fitted} aria-label={diagram.title} aria-describedby="diagram-shortcuts" onKeyDown={(event) => {
      const controls = transform.current;
      if (!controls || !ready || !fitted) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); controls.zoomIn(.15, 120); }
      else if (event.key === '-') { event.preventDefault(); controls.zoomOut(.15, 120); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const { positionX, positionY, scale: currentScale } = controls.state;
        controls.setTransform(positionX + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0), positionY + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0), currentScale, 0);
      }
    }}>
      <TransformWrapper ref={transform} minScale={.05} maxScale={8} limitToBounds={false} centerOnInit onTransform={(_, state) => setScale(state.scale)} doubleClick={{ disabled: true }}>
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: box.width, height: box.height }}><div ref={canvas} className="diagram-zoom-content" /></TransformComponent>
      </TransformWrapper>
    </div>
    {diagram.caption && <p className="dialog-caption">{diagram.caption}</p>}
  </Dialog></Modal></ModalOverlay>;
}
