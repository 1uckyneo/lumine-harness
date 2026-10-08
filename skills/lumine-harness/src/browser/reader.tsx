import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CoverageMap, CoverageTopic, Diagram, KnowledgeDocument, Locale } from '../harness/wiki/types.ts';
import { coverageSummary, shouldResetProject, splitReference, topicForDocument, topicPath, topicTree, type TopicNode } from '../harness/wiki/reader-model.ts';
import {
  api, copyText, decode, documentHref, download, formatDate, safeRead, safeWrite, translate, type Catalog,
  type CatalogDocument, type ReaderConfig, type ReferenceResult, type RelatedResult, type SourceResult,
} from './reader-common.ts';
import { MarkdownBody, ReferenceMarkdown } from './reader-markdown.tsx';
import { DiagramDialog } from './reader-diagrams.tsx';
import { SearchView } from './reader-search.tsx';

type Route = { kind: 'home' } | { kind: 'search'; query: string; legacyCollection?: string } | { kind: 'topic'; id: string } | { kind: 'doc'; id: string; fragment: string };
type Bootstrap = { config: ReaderConfig; catalog: CatalogDocument[]; map: CoverageMap; issues: NonNullable<Catalog['issues']> };
type DocumentResponse = KnowledgeDocument & { canonicalReference?: string };
type Panel = { kind: 'source'; documentId: string; sourceId: string; focusStartLine?: number; focusEndLine?: number }
  | { kind: 'reference'; from: string; target: string }
  | { kind: 'text'; title: string; content: string };

function parseRoute(): Route {
  const params = new URL(location.href).searchParams;
  const id = params.get('doc');
  if (id) return { kind: 'doc', id, fragment: decode(location.hash.slice(1)) };
  const topic = params.get('topic');
  if (topic) return { kind: 'topic', id: topic };
  const legacyCollection = params.get('collection');
  if (params.has('search') || legacyCollection) return { kind: 'search', query: params.get('q') ?? '', legacyCollection: legacyCollection ?? undefined };
  return { kind: 'home' };
}

function projectKey(projectId: string | null, suffix: string): string | null {
  return projectId ? `lumine:${projectId}:${suffix}` : null;
}

function statusMessage(doc: KnowledgeDocument, locale: Locale): string | null {
  const t = (key: string) => translate(locale, key);
  if (doc.collection === 'validation') return null;
  if (doc.freshness === 'conflict' || doc.semanticReview.status === 'issues') return t('conflict');
  if (doc.freshness === 'missing-source') return t('missingSource');
  if (doc.freshness === 'stale') return t('sourceChanged');
  if (doc.freshness === 'unverified') return t('unverified');
  if (doc.semanticReview.status === 'outdated') return t('reviewOutdated');
  return null;
}

function TopicTree({ nodes, map, catalog, route, expanded, onToggle, onTopic, onDocument, locale }: {
  nodes: TopicNode[]; map: CoverageMap; catalog: CatalogDocument[]; route: Route; expanded: Set<string>;
  onToggle: (id: string, open: boolean) => void; onTopic: (id: string) => void; onDocument: (id: string, fragment?: string) => void; locale: Locale;
}) {
  const t = (key: string) => translate(locale, key);
  const selectedTopic = route.kind === 'topic' ? route.id : route.kind === 'doc' ? topicForDocument(map, route.id)?.id : undefined;
  const node = (item: TopicNode) => {
    const selected = selectedTopic === item.topic.id;
    return <li key={item.topic.id} className="tree-topic"><details open={expanded.has(item.topic.id) || selected} onToggle={(event) => onToggle(item.topic.id, event.currentTarget.open)}>
      <summary><span className="tree-chevron" aria-hidden="true">›</span><a href={`?topic=${encodeURIComponent(item.topic.id)}`} aria-current={selected ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onTopic(item.topic.id); }}>{item.topic.title}</a><span className={`topic-indicator ${item.topic.status}`} title={t(item.topic.status)} aria-label={t(item.topic.status)} /></summary>
      <ul>{item.topic.documentRefs.map((reference) => {
        const { id, fragment } = splitReference(reference);
        const doc = catalog.find((entry) => entry.id === id);
        return <li key={reference} className="tree-document"><a href={documentHref(id, fragment)} aria-current={route.kind === 'doc' && route.id === id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onDocument(id, fragment); }}>{doc?.title ?? id}</a></li>;
      })}{item.children.map(node)}</ul>
    </details></li>;
  };
  return <ul className="knowledge-tree">{nodes.map(node)}</ul>;
}

function HomeView({ data, projectId, locale, onSearch, onTopic, onDocument, onCopy }: {
  data: Bootstrap; projectId: string | null; locale: Locale;
  onSearch: () => void; onTopic: (id: string) => void; onDocument: (id: string, fragment?: string) => void; onCopy: (value: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const projectName = data.config.displayName?.trim() || t('unknownProject');
  const { roots } = topicTree(data.map);
  const overview = data.map.topics.flatMap((item) => item.documentRefs).map(splitReference).find(({ id }) => data.catalog.some((doc) => doc.id === id))
    ?? (data.catalog.find((doc) => doc.collection === 'wiki') ? { id: data.catalog.find((doc) => doc.collection === 'wiki')!.id, fragment: '' } : null);
  const lastKey = projectKey(projectId, 'last-document');
  const lastId = lastKey ? safeRead(lastKey) : '';
  const last = data.catalog.find((item) => item.id === lastId && item.collection === 'wiki');
  const progress = coverageSummary(data.map, new Set(data.catalog.map((item) => item.id)));
  return <div className="home-page">
    <section className="home-hero"><span className="eyebrow">{t('knowledge')}</span><h1>{projectName}</h1><p>{t('intro')}</p>
      <div className="hero-actions"><button className="primary" onClick={onSearch}>{t('search')}</button>{overview && <button onClick={() => onDocument(overview.id, overview.fragment)}>{t('overview')}</button>}</div>
    </section>
    {last && <section className="continue-reading"><span className="eyebrow">{t('continue')}</span><a href={documentHref(last.id)} onClick={(event) => { event.preventDefault(); onDocument(last.id); }}>{last.title} <span aria-hidden="true">→</span></a></section>}
    <section className="home-topics"><header><h2>{t('topics')}</h2><button className="text-button" onClick={onSearch}>{t('browse')} →</button></header>
      {roots.length ? <div className="topic-grid">{roots.map(({ topic }) => <a key={topic.id} href={`?topic=${encodeURIComponent(topic.id)}`} onClick={(event) => { event.preventDefault(); onTopic(topic.id); }}><span className="topic-status">{t(topic.status)}</span><strong>{topic.title}</strong><p>{topic.questions[0] ?? topic.reason ?? ''}</p></a>)}</div>
        : <div className="status-panel"><p>{data.catalog.some((doc) => doc.collection === 'wiki') ? t('noMap') : t('empty')}</p><button onClick={() => onCopy(locale === 'zh-CN' ? '请根据当前项目的真实源码和现有知识目录，继续整理 Repo Wiki，并保留人工修改、冲突及已有决定。' : 'Continue the Repo Wiki from current project sources and its knowledge map. Preserve human edits, conflicts and prior decisions.')}>{t('copyResume')}</button></div>}
      {!!progress.missing.length && <p className="subtle-note">{t('missing')} · {progress.missing.length}</p>}
    </section>
  </div>;
}

function TopicView({ data, id, locale, onDocument, onTopic, onCopy }: {
  data: Bootstrap; id: string; locale: Locale;
  onDocument: (id: string, fragment?: string) => void; onTopic: (id: string) => void; onCopy: (value: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const topic = data.map.topics.find((item) => item.id === id);
  if (!topic) return <div className="status-panel error"><p>{t('fragmentMissing')}</p><button onClick={() => onTopic(data.map.topics[0]?.id ?? '')}>{t('tree')}</button></div>;
  const children = data.map.topics.filter((item) => item.parentId === id);
  const docs = topic.documentRefs.map(splitReference).map(({ id, fragment }) => ({ doc: data.catalog.find((entry) => entry.id === id), fragment })).filter((entry): entry is { doc: CatalogDocument; fragment: string } => !!entry.doc);
  return <div className="topic-page"><header className="page-heading"><span className="eyebrow">{t('topics')} · {t(topic.status)}</span><h1>{topic.title}</h1>{topic.reason && <p>{topic.reason}</p>}</header>
    {!!topic.questions.length && <section className="topic-questions"><h2>{locale === 'zh-CN' ? '本主题回答' : 'Questions this topic answers'}</h2><ul>{topic.questions.map((question) => <li key={question}>{question}</li>)}</ul></section>}
    {!!children.length && <section className="topic-children"><h2>{t('topics')}</h2><div className="topic-grid">{children.map((child) => <a key={child.id} href={`?topic=${encodeURIComponent(child.id)}`} onClick={(event) => { event.preventDefault(); onTopic(child.id); }}><strong>{child.title}</strong><span>{t(child.status)} →</span></a>)}</div></section>}
    <section className="topic-documents"><h2>{t('knowledge')}</h2>{docs.length ? <div className="reading-list">{docs.map(({ doc, fragment }) => <a key={`${doc.id}#${fragment}`} href={documentHref(doc.id, fragment)} onClick={(event) => { event.preventDefault(); onDocument(doc.id, fragment); }}><strong>{doc.title}</strong><span>{doc.summary}</span></a>)}</div> : <p className="status-panel">{t('noTopicDocs')}</p>}</section>
    {topic.status !== 'covered' && <button onClick={() => onCopy(locale === 'zh-CN' ? `请从知识主题 ${topic.id} 继续整理；先核对现有正文、来源和缺口，保留人工修改。` : `Continue topic ${topic.id}. Check existing text, sources and gaps, and preserve human edits.`)}>{t('copyResume')}</button>}
  </div>;
}

function Related({ id, data, locale, onDocument, onTopic }: {
  id: string; data: Bootstrap; locale: Locale; onDocument: (id: string) => void; onTopic: (id: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const [result, setResult] = useState<RelatedResult | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(false);
    void api<RelatedResult>(`/api/related?id=${encodeURIComponent(id)}`, controller.signal).then(setResult).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id, retry]);
  return <section className="related-section"><h2>{t('relatedDocuments')}</h2>
    {error && <div className="status-panel error"><p>{t('loadError')}</p><button onClick={() => setRetry((current) => current + 1)}>{t('retry')}</button></div>}
    {!error && !result && <p role="status">{t('loading')}</p>}
    {result && (result.relations.length ? <div className="related-list">{result.relations.map((relation, index) => <div key={`${relation.target}-${index}`}>
      <small>{t(relation.direction === 'in' ? 'incoming' : 'outgoing')} · {t(relation.kind)}</small>
      {data.map.topics.some((item) => item.id === relation.target) ? <a href={`?topic=${encodeURIComponent(relation.target)}`} onClick={(event) => { event.preventDefault(); onTopic(relation.target); }}>{relation.title ?? relation.target}</a>
        : <a href={documentHref(relation.target)} onClick={(event) => { event.preventDefault(); onDocument(relation.target); }}>{relation.title ?? data.catalog.find((item) => item.id === relation.target)?.title ?? relation.target}</a>}
      {relation.note && <p>{relation.note}</p>}
    </div>)}</div> : <p className="subtle-note">{t('noRelated')}</p>)}
  </section>;
}

function DocumentView({ doc, data, locale, projectId, fragment, onDocument, onTopic, onSource, onReference, onDiagram, onText, onCopy, onMissing, onFragment }: {
  doc: KnowledgeDocument; data: Bootstrap; locale: Locale; projectId: string | null; fragment: string;
  onDocument: (id: string, fragment?: string) => void; onTopic: (id: string) => void;
  onSource: (documentId: string, sourceId: string) => void; onReference: (from: string, target: string) => void;
  onDiagram: (diagram: Diagram) => void; onText: (title: string, content: string) => void;
  onCopy: (value: string) => void; onMissing: () => void; onFragment: (fragment: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const [currentSection, setCurrentSection] = useState('');
  const [contentsOpen, setContentsOpen] = useState(() => window.matchMedia('(min-width: 1181px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1181px)');
    const sync = () => setContentsOpen(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const currentSectionChanged = useCallback((id: string) => setCurrentSection(id), []);
  const warning = statusMessage(doc, locale);
  const scrollKey = projectKey(projectId, `scroll:${doc.id}`);
  useEffect(() => {
    if (fragment || !scrollKey) return;
    const saved = Number(safeRead(scrollKey));
    requestAnimationFrame(() => window.scrollTo(0, Number.isFinite(saved) ? saved : 0));
  }, [doc.id, scrollKey]);
  const sections = doc.sections.filter((section) => !(section.level === 1 && section.title === doc.title));
  const review = doc.semanticReview;
  return <div className="document-layout"><article className="document">
    <header className="doc-header"><span className="eyebrow">{doc.collection === 'wiki' ? t('knowledge') : doc.collection === 'spec' ? t('specs') : doc.collection === 'plan' ? t('plans') : t('validation')}{doc.collection !== 'validation' && (doc.collection === 'wiki' || doc.status === 'proposed' || doc.status === 'historical') && ` · ${t(doc.status === 'proposed' || doc.status === 'historical' ? doc.status : 'implementation')}`}</span>
      <h1>{doc.title}</h1><p className="doc-summary">{doc.summary}</p>
      {doc.collection === 'validation' && <p className="validation-note">{t('validationLimit')}</p>}
      {warning && <div className={`document-warning ${doc.freshness === 'conflict' ? 'danger' : ''}`} role="status">{warning} <button onClick={() => document.getElementById('document-evidence')?.scrollIntoView({ block: 'start' })}>{t('sourceDetails')}</button></div>}
      <div className="doc-actions"><button onClick={() => onCopy(`${doc.id}${fragment ? `#${fragment}` : ''}`)}>{t('copiedReference')}</button><button onClick={() => onCopy(locale === 'zh-CN' ? `请结合知识 ${doc.id}（${doc.title}）及当前来源解释机制，指出证据和未覆盖范围。` : `Explain the mechanism using ${doc.id} (${doc.title}) and current sources. Identify evidence and limitations.`)}>{t('copyQuestion')}</button><button onClick={() => onCopy(locale === 'zh-CN' ? `请核实并更新知识 ${doc.id}（${doc.title}），保留人工修改，先核对当前来源。` : `Review and update knowledge ${doc.id} (${doc.title}). Verify current sources and preserve human edits.`)}>{t('copyEdit')}</button><button onClick={() => download(`${doc.title}.md`, doc.markdown, 'text/markdown;charset=utf-8')}>{t('exportMarkdown')}</button></div>
    </header>
    <MarkdownBody doc={doc} catalog={data.catalog} locale={locale} fragment={fragment} onDocument={onDocument} onFragment={onFragment} onSource={onSource} onReference={onReference} onDiagram={onDiagram} onDiagramText={(diagram) => onText(diagram.title, diagram.code)} onMissing={onMissing} onCurrentSection={currentSectionChanged} />
    <section id="document-evidence" className="document-evidence"><h2>{t('sources')}</h2>
      <p>{t('sourceLimit')}</p>
      <details><summary>{t('pageSources')} · {doc.sources.length}</summary><div className="page-source-list">{doc.sources.map((source) => <button key={source.id} onClick={() => onSource(doc.id, source.id)}><strong>{source.id}</strong><span>{source.repoId} / {source.path}</span>{source.startLine && <small>L{source.startLine}{source.endLine ? `–${source.endLine}` : ''}</small>}</button>)}</div></details>
      <details><summary>{t('review')} · {t(review.status)}</summary><dl className="review-data"><div><dt>{t('checkedAt')}</dt><dd>{formatDate(locale, doc.checkedAt)}</dd></div>{review.reviewedAt && <div><dt>{t('review')}</dt><dd>{formatDate(locale, review.reviewedAt)} · {review.reviewer?.kind} / {review.reviewer?.role}</dd></div>}{(['scope', 'limitations', 'findings'] as const).map((key) => review[key]?.length ? <div key={key}><dt>{t(key)}</dt><dd><ul>{review[key]!.map((item) => <li key={item}>{item}</li>)}</ul></dd></div> : null)}</dl></details>
    </section>
    <Related id={doc.id} data={data} locale={locale} onDocument={onDocument} onTopic={onTopic} />
  </article><aside className="doc-aside"><details open={contentsOpen} onToggle={(event) => setContentsOpen(event.currentTarget.open)}><summary>{t('contents')}</summary><nav aria-label={t('contents')}>{sections.length ? sections.map((section) => <a key={section.id} className={`toc-level-${Math.min(section.level, 4)}`} href={`#${encodeURIComponent(section.id)}`} aria-current={currentSection === section.id ? 'location' : undefined} onClick={(event) => { event.preventDefault(); onFragment(section.id); }}>{section.title}</a>) : <p>{t('noToc')}</p>}</nav></details></aside></div>;
}

function EvidenceDialog({ panel, locale, onClose, onDocument, onSource, onReference, onCopy }: {
  panel: Panel; locale: Locale; onClose: () => void; onDocument: (id: string, fragment?: string) => void;
  onSource: (documentId: string, sourceId: string, focusStartLine?: number, focusEndLine?: number) => void;
  onReference: (from: string, target: string) => void; onCopy: (value: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const dialog = useRef<HTMLDialogElement>(null);
  const originFocus = useRef<HTMLElement | null>(null);
  const [source, setSource] = useState<SourceResult | null>(null);
  const [reference, setReference] = useState<ReferenceResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    originFocus.current = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); originFocus.current?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setReference(null); setError('');
    if (panel.kind === 'text') return;
    setPending(true);
    const endpoint = panel.kind === 'source'
      ? `/api/source?${new URLSearchParams({ document: panel.documentId, id: panel.sourceId })}`
      : `/api/reference?${new URLSearchParams({ from: panel.from, target: panel.target })}`;
    void api<SourceResult | ReferenceResult>(endpoint, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (panel.kind === 'source') setSource(result as SourceResult);
      else {
        const resolved = result as ReferenceResult;
        if (resolved.kind === 'document' && resolved.id) { onClose(); onDocument(resolved.id, resolved.fragment); return; }
        if (resolved.kind === 'source' && resolved.documentId && resolved.sourceId) { onSource(resolved.documentId, resolved.sourceId, resolved.focusStartLine, resolved.focusEndLine); return; }
        setReference(resolved);
      }
    }).catch(() => { if (!controller.signal.aborted) setError(panel.kind === 'source' ? t('sourceUnavailable') : t('referenceError')); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [panel, retry]);
  useEffect(() => {
    if (source && panel.kind === 'source' && panel.focusStartLine) {
      dialog.current?.querySelector(`[data-source-line="${panel.focusStartLine}"]`)?.scrollIntoView({ block: 'center' });
    }
  }, [source, panel]);

  const location = source ? `${source.source.repoId}:${source.source.path}#L${source.startLine}-L${source.endLine}` : '';
  const comparison = source ? !source.baselineFingerprint ? 'sourceUnknown' : source.baselineFingerprint === source.fingerprint ? 'sourceSame' : 'sourceDrift' : '';
  return <dialog ref={dialog} className="evidence-dialog" aria-labelledby="evidence-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2 id="evidence-dialog-title">{panel.kind === 'source' ? source?.source.id ?? t('sources') : panel.kind === 'text' ? panel.title : reference?.title ?? t('relatedDocuments')}</h2><button onClick={onClose}>{t('close')} ×</button></header>
    {pending && <p className="dialog-message" role="status">{t('loading')}</p>}
    {error && <div className="status-panel error" role="alert"><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>{t('retry')}</button></div>}
    {panel.kind === 'text' && <pre className="text-content" tabIndex={0}>{panel.content}</pre>}
    {source && panel.kind === 'source' && <>
      <p className="dialog-path">{location}</p><div className="dialog-tools"><button onClick={() => onCopy(location)}>{t('copyLocation')}</button><button onClick={() => onCopy(`${panel.documentId}#source:${panel.sourceId}`)}>{t('copiedReference')}</button></div>
      <p className={`source-comparison ${comparison === 'sourceDrift' ? 'warning' : ''}`}>{t(comparison)}</p>
      <div className="source-lines" tabIndex={0}>{source.text.split('\n').map((line, index) => {
        const number = source.startLine + index;
        return <div key={number} data-source-line={number} className={panel.focusStartLine !== undefined && number >= panel.focusStartLine && number <= (panel.focusEndLine ?? panel.focusStartLine) ? 'source-line-target' : ''}><span className="line-number" aria-hidden="true">{number}</span><code>{line || ' '}</code></div>;
      })}</div>
      <dl className="source-versions"><div><dt>{t('sourceVersion')}</dt><dd><code>{source.fingerprint}</code></dd></div><div><dt>{t('baselineVersion')}</dt><dd><code>{source.baselineFingerprint ?? '—'}</code></dd></div><div><dt>{t('checkedAt')}</dt><dd>{formatDate(locale, source.observedAt)}</dd></div><div><dt>{t('readAt')}</dt><dd>{formatDate(locale, source.readAt)}</dd></div></dl>
    </>}
    {reference && reference.kind === 'markdown' && <><p className="dialog-path">{reference.path} · {reference.revision?.slice(0, 12)}</p><div className="dialog-tools"><button onClick={() => onCopy(reference.markdown ?? '')}>{t('originalMarkdown')}</button><button onClick={() => download(`${reference.title ?? 'reference'}.md`, reference.markdown ?? '', 'text/markdown;charset=utf-8')}>{t('exportMarkdown')}</button></div><ReferenceMarkdown markdown={reference.markdown ?? ''} sections={reference.sections ?? []} path={reference.path} locale={locale} fragment={reference.fragment} onReference={onReference} onFragment={(fragment) => dialog.current?.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView({ block: 'start' })} /></>}
    {reference && reference.kind === 'attachment' && <div className="dialog-message"><p>{t('attachment')}</p><code>{reference.path}</code></div>}
  </dialog>;
}

function ReaderApp() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [bootstrapError, setBootstrapError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [projectNotice, setProjectNotice] = useState('');
  const [docState, setDocState] = useState<{ value: KnowledgeDocument | null; pending: boolean; error: string }>({ value: null, pending: false, error: '' });
  const [docRetry, setDocRetry] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [toast, setToast] = useState('');
  const menuButton = useRef<HTMLButtonElement>(null);
  const dataRef = useRef<Bootstrap | null>(null);
  const bootstrapRevision = useRef(0);
  const t = (key: string) => translate(locale, key);
  const projectId = data?.config.projectId ?? null;

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3500); }, []);
  const onFragmentMissing = useCallback(() => notify(translate(locale, 'fragmentMissing')), [locale, notify]);
  const focusWorkspace = useCallback(() => requestAnimationFrame(() => document.getElementById('workspace')?.focus({ preventScroll: true })), []);
  const navigate = useCallback((url: string) => {
    history.pushState({}, '', url);
    const next = parseRoute();
    setRoute(next);
    setMenuOpen(false);
    window.scrollTo(0, 0);
    if (next.kind !== 'doc' || !next.fragment) focusWorkspace();
  }, [focusWorkspace]);
  const onDocument = useCallback((id: string, fragment = '') => navigate(documentHref(id, fragment)), [navigate]);
  const onTopic = useCallback((id: string) => { if (id) navigate(`?topic=${encodeURIComponent(id)}`); else navigate('/'); }, [navigate]);
  const onHome = useCallback(() => navigate('/'), [navigate]);
  const onSearch = useCallback(() => navigate('?search=1'), [navigate]);
  const onFragment = useCallback((fragment: string) => {
    const current = parseRoute();
    if (current.kind !== 'doc') return;
    const target = document.getElementById(fragment);
    if (!target && current.fragment === fragment) { notify(t('fragmentMissing')); return; }
    history.replaceState({}, '', documentHref(current.id, fragment));
    setRoute({ ...current, fragment });
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [locale, notify]);
  const onSource = useCallback((documentId: string, sourceId: string, focusStartLine?: number, focusEndLine?: number) => setPanel({ kind: 'source', documentId, sourceId, focusStartLine, focusEndLine }), []);
  const onReference = useCallback((from: string, target: string) => setPanel({ kind: 'reference', from, target }), []);
  const onText = useCallback((title: string, content: string) => setPanel({ kind: 'text', title, content }), []);
  const onCopy = useCallback((value: string) => { void copyText(value).then((copied) => { if (copied) notify(translate(locale, 'copied')); else { notify(translate(locale, 'copyUnavailable')); setPanel({ kind: 'text', title: translate(locale, 'copyManually'), content: value }); } }); }, [locale, notify]);

  const loadBootstrap = useCallback(async () => {
    setRefreshing(true); setBootstrapError('');
    try {
      const [config, catalog, map] = await Promise.all([api<ReaderConfig>('/api/config'), api<Catalog>('/api/catalog'), api<CoverageMap>('/api/map')]);
      const previousProject = dataRef.current ? dataRef.current.config.projectId : safeRead('lumine:active-project') || null;
      const changed = shouldResetProject(dataRef.current !== null, previousProject, config.projectId);
      const languageKey = projectKey(config.projectId, 'ui-locale');
      const savedLocale = languageKey ? safeRead(languageKey) : '';
      const nextLocale = savedLocale === 'zh-CN' || savedLocale === 'en' ? savedLocale : config.locale;
      if (changed) { setProjectNotice(translate(nextLocale, 'serviceChanged')); history.replaceState({}, '', '/'); setRoute({ kind: 'home' }); setDocState({ value: null, pending: false, error: '' }); setPanel(null); setDiagram(null); }
      safeWrite('lumine:active-project', config.projectId ?? '');
      setLocale(nextLocale);
      const treeKey = projectKey(config.projectId, 'tree');
      setExpanded(new Set(treeKey ? safeRead(treeKey).split('|').filter(Boolean) : []));
      const next = { config, catalog: catalog.documents, map, issues: catalog.issues ?? [] };
      bootstrapRevision.current++;
      dataRef.current = next; setData(next);
      setBootstrapError('');
    } catch { setBootstrapError(translate(locale, 'loadError')); }
    finally { setRefreshing(false); }
  }, [locale]);

  useEffect(() => { void loadBootstrap(); }, []);
  useEffect(() => {
    const changed = () => { setRoute(parseRoute()); focusWorkspace(); };
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, [focusWorkspace]);
  useEffect(() => {
    if (route.kind !== 'doc' || !data) return;
    const controller = new AbortController();
    const revision = bootstrapRevision.current;
    const requested = `${route.id}${route.fragment ? `#${route.fragment}` : ''}`;
    setDocState((previous) => ({ ...previous, pending: true, error: '' }));
    void api<DocumentResponse>(`/api/document?${new URLSearchParams({ id: route.id, fragment: route.fragment, full: '1' })}`, controller.signal)
      .then((value) => { if (!controller.signal.aborted && revision === bootstrapRevision.current) {
        const current = parseRoute();
        if (current.kind !== 'doc' || `${current.id}${current.fragment ? `#${current.fragment}` : ''}` !== requested) return;
        setDocState({ value, pending: false, error: '' });
        const key = projectKey(data.config.projectId, 'last-document');
        if (key && value.collection === 'wiki') safeWrite(key, value.id);
        const canonical = value.canonicalReference ?? `${value.id}${route.fragment ? `#${route.fragment}` : ''}`;
        if (canonical !== requested) {
          const { id, fragment } = splitReference(canonical);
          history.replaceState({}, '', documentHref(id, fragment));
          setRoute({ kind: 'doc', id, fragment });
        }
      } })
      .catch(() => { if (!controller.signal.aborted && revision === bootstrapRevision.current) setDocState((previous) => ({ ...previous, pending: false, error: translate(locale, 'loadError') })); });
    return () => controller.abort();
  }, [route.kind === 'doc' ? `${route.id}#${route.fragment}` : '', data, docRetry]);
  useEffect(() => {
    if (route.kind !== 'doc' || docState.value?.id !== route.id) return;
    const key = projectKey(projectId, `scroll:${route.id}`);
    if (!key) return;
    const save = () => safeWrite(key, String(window.scrollY));
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [route.kind === 'doc' ? route.id : '', docState.value?.id, projectId]);
  useEffect(() => {
    if (route.kind === 'doc' && docState.value?.id === route.id && route.fragment.startsWith('source:')) {
      setPanel({ kind: 'source', documentId: route.id, sourceId: route.fragment.slice(7) });
    }
  }, [route.kind === 'doc' ? route.id : '', route.kind === 'doc' ? route.fragment : '', docState.value?.id]);
  useEffect(() => {
    if (!menuOpen) return;
    document.querySelector<HTMLElement>('.mobile-close')?.focus();
  }, [menuOpen]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) { event.preventDefault(); setMenuOpen(false); menuButton.current?.focus(); }
      if (event.key === 'Tab' && menuOpen) {
        const items = [...document.querySelectorAll<HTMLElement>('.sidebar button,.sidebar a,.sidebar summary')].filter((item) => item.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !panel && !diagram && !(event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) {
        event.preventDefault(); onSearch(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#wiki-query')?.focus());
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [menuOpen, panel, diagram, onSearch]);
  useEffect(() => {
    if (!data) return;
    const current = route.kind === 'doc' ? data.catalog.find((item) => item.id === route.id)?.title
      : route.kind === 'topic' ? data.map.topics.find((item) => item.id === route.id)?.title
        : route.kind === 'search' ? t('search') : t('home');
    document.title = `${current ?? t('knowledge')} · ${data.config.displayName?.trim() || t('unknownProject')}`;
    document.documentElement.lang = locale;
  }, [data, route, locale]);

  if (!data) return <div className="boot-shell"><p role="status">{bootstrapError || t('loading')}</p>{bootstrapError && <button onClick={() => void loadBootstrap()}>{t('retry')}</button>}</div>;
  const projectName = data.config.displayName?.trim() || t('unknownProject');
  const { roots, unresolved } = topicTree(data.map);
  const topic = route.kind === 'topic' ? data.map.topics.find((item) => item.id === route.id)
    : route.kind === 'doc' ? topicForDocument(data.map, route.id) : undefined;
  const breadcrumbs = topic ? topicPath(data.map.topics, topic.id) : [];
  const selectedDoc = route.kind === 'doc' ? data.catalog.find((item) => item.id === route.id) : null;
  const updateTree = (id: string, open: boolean) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open) next.add(id); else next.delete(id);
      const key = projectKey(projectId, 'tree');
      if (key) safeWrite(key, [...next].join('|'));
      return next;
    });
  };
  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };
  const activeDoc = docState.value;
  const displayedDoc = route.kind === 'doc' && activeDoc?.id === route.id ? activeDoc : null;
  return <>
    <a className="skip-link" href="#workspace">{t('skip')}</a>
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      {menuOpen && <button className="nav-backdrop" aria-label={t('closeMenu')} onClick={closeMenu} />}
      <aside className="sidebar" aria-label={t('tree')}>
        <button className="mobile-close" onClick={closeMenu}>{t('closeMenu')} ×</button>
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onHome(); }}><span className="brand-mark" aria-hidden="true">L</span><span><strong>{projectName}</strong><small>{t('projectLibrary')}</small></span></a>
        <nav className="primary-nav" aria-label={t('knowledge')}><a href="/" aria-current={route.kind === 'home' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onHome(); }}>{t('home')}</a><a href="?search=1" aria-current={route.kind === 'search' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onSearch(); }}>{t('search')}</a></nav>
        <div className="tree-region"><h2>{t('tree')}</h2>{roots.length ? <TopicTree nodes={roots} map={data.map} catalog={data.catalog} route={route} expanded={expanded} onToggle={updateTree} onTopic={onTopic} onDocument={onDocument} locale={locale} /> : <p className="tree-note">{t('noMap')}</p>}
          {!!data.map.unmappedDocumentIds.length && <details className="unmapped"><summary>{t('unmapped')} · {data.map.unmappedDocumentIds.length}</summary><ul>{data.map.unmappedDocumentIds.map((id) => <li key={id}><a href={documentHref(id)} onClick={(event) => { event.preventDefault(); onDocument(id); }}>{data.catalog.find((item) => item.id === id)?.title ?? id}</a></li>)}</ul></details>}
          {!!unresolved.length && <p className="tree-note warning">{t('unresolved')} · {unresolved.length}</p>}
        </div>
        <details className="secondary-nav"><summary>{t('relatedDocuments')}</summary><button onClick={() => navigate('?collection=spec')}>{t('specs')}</button><button onClick={() => navigate('?collection=plan')}>{t('plans')}</button></details>
        <details className="secondary-nav"><summary>{t('maintenance')}</summary><p>{t('coverageNote')}</p><p>{t('coverage')} · {coverageSummary(data.map, new Set(data.catalog.map((item) => item.id))).covered} / {data.map.topics.length}</p>{!!data.issues.length && <p className="warning">{t('missing')} · {data.issues.length}</p>}<button onClick={() => onCopy(locale === 'zh-CN' ? '请核对当前项目知识目录、已有正文、来源及待处理缺口，保留人工修改和冲突，继续受影响主题。' : 'Check the current knowledge tree, text, sources and open gaps; preserve human edits and conflicts, then continue affected topics.')}>{t('copyResume')}</button></details>
        <p className="sidebar-foot">{locale === 'zh-CN' ? '本地只读 · 文本知识' : 'Local · Read only · Text knowledge'}</p>
      </aside>
      <div className="main"><header className="topbar"><button ref={menuButton} className="mobile-menu" aria-label={t('menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰</button><nav className="breadcrumb" aria-label={t('path')}><a href="/" onClick={(event) => { event.preventDefault(); onHome(); }}>{projectName}</a>{breadcrumbs.map((item) => <span key={item.id}><span aria-hidden="true">/</span><a href={`?topic=${encodeURIComponent(item.id)}`} onClick={(event) => { event.preventDefault(); onTopic(item.id); }}>{item.title}</a></span>)}{selectedDoc && <span><span aria-hidden="true">/</span><span aria-current="page">{selectedDoc.title}</span></span>}</nav><div className="top-actions"><button className="top-search" onClick={onSearch}>{t('search')}</button><button onClick={() => void loadBootstrap()} disabled={refreshing}>{refreshing ? t('loading') : t('refresh')}</button><button onClick={() => { const next = locale === 'en' ? 'zh-CN' : 'en'; setLocale(next); const key = projectKey(projectId, 'ui-locale'); if (key) safeWrite(key, next); }} aria-label={t('language')}>{locale === 'en' ? '中文' : 'English'}</button></div></header>
        <main className="workspace" id="workspace" tabIndex={-1}>
          {projectNotice && <div className="status-panel" role="status">{projectNotice}<button onClick={() => setProjectNotice('')}>{t('close')}</button></div>}
          {bootstrapError && <div className="status-panel error" role="alert">{bootstrapError}<button onClick={() => void loadBootstrap()}>{t('retry')}</button></div>}
          {route.kind === 'home' && <HomeView data={data} projectId={projectId} locale={locale} onSearch={onSearch} onTopic={onTopic} onDocument={onDocument} onCopy={onCopy} />}
          {route.kind === 'search' && <SearchView key={projectId ?? 'unregistered'} locale={locale} projectId={projectId} catalog={data.catalog} initialQuery={route.query} legacyCollection={route.legacyCollection} onDocument={onDocument} onCopy={onCopy} />}
          {route.kind === 'topic' && <TopicView data={data} id={route.id} locale={locale} onDocument={onDocument} onTopic={onTopic} onCopy={onCopy} />}
          {route.kind === 'doc' && <>
            {docState.pending && !displayedDoc && <p className="loading-state" role="status">{t('loading')}</p>}
            {docState.error && <div className="status-panel error" role="alert"><p>{docState.error}</p><button onClick={() => setDocRetry((value) => value + 1)}>{t('retry')}</button><button onClick={onHome}>{t('home')}</button></div>}
            {displayedDoc && <DocumentView key={displayedDoc.id} doc={displayedDoc} data={data} locale={locale} projectId={projectId} fragment={displayedDoc.id === route.id ? route.fragment : ''} onDocument={onDocument} onTopic={onTopic} onSource={onSource} onReference={onReference} onDiagram={setDiagram} onText={onText} onCopy={onCopy} onMissing={onFragmentMissing} onFragment={onFragment} />}
          </>}
        </main>
      </div>
    </div>
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    {panel && <EvidenceDialog panel={panel} locale={locale} onClose={() => setPanel(null)} onDocument={onDocument} onSource={onSource} onReference={onReference} onCopy={onCopy} />}
    {diagram && activeDoc && <DiagramDialog diagram={diagram} document={activeDoc} locale={locale} onClose={() => setDiagram(null)} onCopy={onCopy} onText={onText} />}
  </>;
}

const app = document.getElementById('app');
if (app) createRoot(app).render(<ReaderApp />);
