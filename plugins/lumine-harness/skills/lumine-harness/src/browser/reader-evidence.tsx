import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Copy, Maximize, Minimize, X } from 'lucide-react';
import type { Locale } from '../harness/wiki/types.ts';
import { api, copyText, download, evidenceHref, formatDate, sourceTitle, translate, type CatalogDocument, type EvidencePanel, type ReferenceResult, type SourceResult } from './reader-common.ts';
import { CodeLines, CodeReadingContext, type CodeReading } from './reader-code.tsx';
import { markdownFrontmatter, ReferenceMarkdown } from './reader-markdown.tsx';

export type ReaderPanel = EvidencePanel | { kind: 'text'; title: string; content: string } | { kind: 'code'; reading: CodeReading };
type Anchor = { line: number; offset: number } | { top: number };

function visibleLines(body: HTMLElement) {
  return Array.from(body.querySelectorAll<HTMLElement>('[data-reading-line]')).filter((line) => line.getClientRects().length);
}

function currentAnchor(body: HTMLElement): Anchor {
  const viewport = body.getBoundingClientRect();
  const element = visibleLines(body).find((line) => {
    const rect = line.getBoundingClientRect();
    return rect.bottom > viewport.top && rect.top < viewport.bottom;
  });
  return element
    ? { line: Number(element.dataset.readingLine), offset: element.getBoundingClientRect().top - viewport.top }
    : { top: body.scrollTop };
}

function restoreAnchor(body: HTMLElement, anchor: Anchor) {
  if ('top' in anchor) { body.scrollTop = anchor.top; return; }
  let preceding: HTMLElement | undefined;
  for (const line of visibleLines(body)) {
    if (Number(line.dataset.readingLine) > anchor.line) break;
    preceding = line;
  }
  if (!preceding) { body.scrollTop = 0; return; }
  const rect = preceding.getBoundingClientRect();
  // A wrapped line can become shorter; retain a visible part of the same logical line.
  const offset = Math.max(anchor.offset, -Math.max(0, rect.height - 1));
  body.scrollTop += rect.top - body.getBoundingClientRect().top - offset;
}

function frontmatterLines(markdown: string) {
  return (markdown.match(markdownFrontmatter)?.[0].split('\n').length ?? 1) - 1;
}

export function EvidenceDialog({ panel, catalog, locale, onClose, onDocument, onSource, onReference }: {
  panel: ReaderPanel; catalog: CatalogDocument[]; locale: Locale; onClose: () => void;
  onDocument: (id: string, fragment?: string) => void;
  onSource: (documentId: string, sourceId: string, focusStartLine?: number, focusEndLine?: number, replace?: boolean) => void;
  onReference: (from: string, target: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const panelIdentity = panel.kind === 'source' || panel.kind === 'reference' ? evidenceHref(panel, '/') : panel;
  const previousPanel = useRef(panelIdentity);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const nextAnchor = useRef<Anchor | null>(null);
  const returnFromCode = useRef<{ anchor: Anchor; trigger: HTMLButtonElement } | null>(null);
  const returnFocusFrame = useRef(0);
  const copyRevision = useRef(0);
  const [source, setSource] = useState<SourceResult | null>(null);
  const [reference, setReference] = useState<ReferenceResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [raw, setRaw] = useState(panel.kind === 'source' && panel.focusStartLine !== undefined);
  const [wrap, setWrap] = useState(true);
  const [fullWindow, setFullWindow] = useState(false);
  const [nestedCode, setNestedCode] = useState<CodeReading | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopy, setManualCopy] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (previousPanel.current !== panelIdentity) {
      previousPanel.current = panelIdentity;
      nextAnchor.current = null;
      returnFromCode.current = null;
      setNestedCode(null);
      setCopyStatus('');
      setManualCopy(null);
      setRaw(panel.kind === 'source' && panel.focusStartLine !== undefined);
      closeButton.current?.focus({ preventScroll: true });
    }
    return () => {
      cancelAnimationFrame(returnFocusFrame.current);
      copyRevision.current++;
    };
  }, [panelIdentity]);

  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setReference(null); setError(''); setPending(false);
    if (panel.kind === 'text' || panel.kind === 'code') return;
    setPending(true);
    const endpoint = panel.kind === 'source'
      ? `/api/source?${new URLSearchParams({ document: panel.documentId, id: panel.sourceId })}`
      : `/api/reference?${new URLSearchParams({ from: panel.from, target: panel.target })}`;
    void api<SourceResult | ReferenceResult>(endpoint, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (panel.kind === 'source') setSource(result as SourceResult);
      else {
        const resolved = result as ReferenceResult;
        if (resolved.kind === 'document' && resolved.id) { onDocument(resolved.id, resolved.fragment); return; }
        if (resolved.kind === 'source' && resolved.documentId && resolved.sourceId) {
          onSource(resolved.documentId, resolved.sourceId, resolved.focusStartLine, resolved.focusEndLine, true);
          return;
        }
        setReference(resolved);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError(t(panel.kind === 'source' ? 'sourceUnavailable' : 'referenceError'));
    }).finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [panelIdentity, retry]);

  useLayoutEffect(() => {
    if (!body.current) return;
    body.current.scrollTop = 0;
    if (source && panel.kind === 'source' && panel.focusStartLine !== undefined) {
      body.current.querySelector(`[data-source-line="${panel.focusStartLine}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    } else if (reference?.fragment) {
      body.current.querySelector(`[id="${CSS.escape(reference.fragment)}"]`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [source, reference]);

  useLayoutEffect(() => {
    if (!body.current || !nextAnchor.current) return;
    restoreAnchor(body.current, nextAnchor.current);
    nextAnchor.current = null;
  }, [fullWindow, wrap, raw, nestedCode]);

  const keepPosition = (change: () => void, changeView = false) => {
    if (body.current) {
      nextAnchor.current = currentAnchor(body.current);
      if (changeView && 'line' in nextAnchor.current) nextAnchor.current.offset = 0;
    }
    change();
  };

  const readNestedCode = useCallback((reading: CodeReading, trigger: HTMLButtonElement) => {
    if (body.current) returnFromCode.current = { anchor: currentAnchor(body.current), trigger };
    nextAnchor.current = { top: 0 };
    cancelAnimationFrame(returnFocusFrame.current);
    copyRevision.current++;
    setCopyStatus('');
    setManualCopy(null);
    setNestedCode(reading);
    closeButton.current?.focus({ preventScroll: true });
  }, []);
  const close = () => {
    if (!nestedCode) { onClose(); return; }
    const original = returnFromCode.current;
    returnFromCode.current = null;
    nextAnchor.current = original?.anchor ?? { top: 0 };
    setNestedCode(null);
    copyRevision.current++;
    setCopyStatus('');
    setManualCopy(null);
    returnFocusFrame.current = requestAnimationFrame(() => original?.trigger.focus({ preventScroll: true }));
  };

  const copy = (value: string) => {
    const revision = ++copyRevision.current;
    void copyText(value).then((copied) => {
      if (revision !== copyRevision.current) return;
      setCopyStatus(t(copied ? 'copied' : 'copyUnavailable'));
      setManualCopy(copied ? null : value);
    });
  };

  const readingCode = nestedCode ?? (panel.kind === 'code' ? panel.reading : null);
  const documentBody = source?.markdown ?? (reference?.kind === 'markdown' ? {
    body: (reference.markdown ?? '').replace(markdownFrontmatter, ''),
    sections: reference.sections ?? [],
    path: reference.path,
    referenceFrom: reference.referenceFrom,
  } : null);
  const location = source ? `${source.source.repoId}:${source.source.path}#L${source.startLine}-L${source.endLine}` : '';
  const comparison = source ? !source.baselineFingerprint ? 'sourceUnknown' : source.baselineFingerprint === source.fingerprint ? 'sourceSame' : 'sourceDrift' : '';
  const title = readingCode?.title ?? (panel.kind === 'source'
    ? source ? sourceTitle(source.source, catalog, locale, source.title) : t('sources')
    : panel.kind === 'text' ? panel.title : reference?.title ?? t('relatedDocuments'));
  const addressable = panel.kind === 'source' || panel.kind === 'reference';
  const codeVisible = readingCode || (source && (!documentBody || raw)) || (reference?.kind === 'markdown' && raw);

  return <ModalOverlay className="reader-overlay evidence-overlay" data-full-window={fullWindow} isOpen isDismissable onOpenChange={(open) => { if (!open) close(); }}>
    <Modal className="evidence-dialog" data-full-window={fullWindow}>
      <Dialog aria-labelledby="evidence-dialog-title">
        <header className="dialog-header">
          <Heading slot="title" id="evidence-dialog-title">{title}</Heading>
          <div className="evidence-header-actions">
            <Button onPress={() => keepPosition(() => setFullWindow(!fullWindow))}>
              {fullWindow ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
              {t(fullWindow ? 'restoreSize' : 'fullWindow')}
            </Button>
            <Button ref={closeButton} className="icon-button" aria-label={t('close')} onPress={close}><X size={20} aria-hidden="true" /></Button>
          </div>
        </header>
        {(source || reference || readingCode) && <div className="dialog-tools evidence-tools">
          {documentBody && !readingCode && <div className="reading-modes" role="group" aria-label={t('sourceDetails')}>
            <button aria-pressed={!raw} onClick={() => raw && keepPosition(() => setRaw(false), true)}>{t('readingView')}</button>
            <button aria-pressed={raw} onClick={() => !raw && keepPosition(() => setRaw(true), true)}>{t('rawView')}</button>
          </div>}
          {codeVisible && <div className="reading-modes" role="group" aria-label={t('codeLayout')}>
            <button aria-pressed={wrap} onClick={() => !wrap && keepPosition(() => setWrap(true))}>{t('wrapCode')}</button>
            <button aria-pressed={!wrap} onClick={() => wrap && keepPosition(() => setWrap(false))}>{t('originalLines')}</button>
          </div>}
          {addressable && !readingCode && <button onClick={() => copy(window.location.href)}>{t('copyLink')}</button>}
          {readingCode && <button onClick={() => copy(readingCode.code)}><Copy size={15} aria-hidden="true" />{t('copyCode')}</button>}
          {source && !readingCode && <button onClick={() => copy(source.text)}><Copy size={15} aria-hidden="true" />{t('copySource')}</button>}
          {reference?.kind === 'markdown' && !readingCode && <button onClick={() => download(`${reference.title ?? 'reference'}.md`, reference.markdown ?? '', 'text/markdown;charset=utf-8')}>{t('exportMarkdown')}</button>}
          <span className="evidence-copy-status" role="status">{copyStatus}</span>
        </div>}
        <div ref={body} className="evidence-body">
          {manualCopy !== null && <div className="dialog-message"><textarea aria-label={t('copyManually')} readOnly value={manualCopy} onFocus={(event) => event.currentTarget.select()} /></div>}
          {pending && <p className="dialog-message" role="status">{t('loading')}</p>}
          {error && <div className="status-panel error" role="alert"><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>{t('retry')}</button></div>}
          {readingCode && <CodeLines code={readingCode.code} language={readingCode.language} highlighted={readingCode.highlighted} locale={locale} wrap={wrap} />}
          {panel.kind === 'text' && <pre className="text-content" tabIndex={0}>{panel.content}</pre>}
          <div hidden={Boolean(readingCode)}>
            {source && panel.kind === 'source' && <>
              <p className={`source-comparison ${comparison === 'sourceDrift' ? 'warning' : ''}`}>{t(comparison)}</p>
              {(!documentBody || raw) && <>
                <p className="source-location"><code>{source.source.path}</code><span> : {source.startLine}–{source.endLine}</span></p>
                {(source.startLine > 1 || source.endLine < source.totalLines) && <p className="dialog-message subtle-note">{t('sourceScope')}</p>}
                <CodeLines code={source.text} start={source.startLine} highlighted={source.highlighted} focusStart={panel.focusStartLine} focusEnd={panel.focusEndLine} locale={locale} wrap={wrap} />
              </>}
            </>}
            {documentBody && !raw && <CodeReadingContext.Provider value={readNestedCode}>
              <ReferenceMarkdown markdown={documentBody.body} sections={documentBody.sections} path={documentBody.referenceFrom ?? documentBody.path} locale={locale} lineOffset={frontmatterLines(source?.text ?? reference?.markdown ?? '')} onReference={onReference} />
            </CodeReadingContext.Provider>}
            {source && panel.kind === 'source' && <details className="evidence-metadata"><summary>{t('evidenceDetails')}</summary><p className="dialog-path">{location}</p>
                <div className="dialog-tools"><button onClick={() => copy(location)}>{t('copyLocation')}</button><button onClick={() => copy(`${panel.documentId}#source:${panel.sourceId}`)}>{t('copiedReference')}</button></div>
                <dl className="source-versions"><div><dt>{t('sourceVersion')}</dt><dd><code>{source.fingerprint}</code></dd></div><div><dt>{t('baselineVersion')}</dt><dd><code>{source.baselineFingerprint ?? '—'}</code></dd></div><div><dt>{t('checkedAt')}</dt><dd>{formatDate(locale, source.observedAt)}</dd></div><div><dt>{t('readAt')}</dt><dd>{formatDate(locale, source.readAt)}</dd></div></dl>
              </details>}
            {reference?.kind === 'markdown' && <>
              {raw && <CodeLines code={reference.markdown ?? ''} locale={locale} wrap={wrap} />}
              <details className="evidence-metadata"><summary>{t('evidenceDetails')}</summary><p className="dialog-path">{reference.path} · {reference.revision}</p></details>
            </>}
            {reference?.kind === 'attachment' && <div className="dialog-message"><p>{t('attachment')}</p><code>{reference.path}</code></div>}
          </div>
        </div>
      </Dialog>
    </Modal>
  </ModalOverlay>;
}
