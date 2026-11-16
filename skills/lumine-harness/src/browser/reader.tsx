import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CoverageMap, Diagram, EditorialNavigation, KnowledgeDocument, KnowledgeMap, Locale } from '../harness/wiki/types.ts';
import { coverageSummary, shouldResetProject, splitReference } from '../harness/wiki/reader-model.ts';
import {
  api, copyText, decode, documentHref, download, evidenceHref, parseEvidence, withoutEvidence, sourceTitle, formatDate, safeRead, safeWrite, translate, documentLabel, type Catalog,
  type CatalogDocument, type ReaderConfig, type ReferenceResult, type RelatedResult, type SourceResult, type EvidencePanel,
} from './reader-common.ts';
import { MarkdownBody, ReferenceMarkdown } from './reader-markdown.tsx';
import { DiagramDialog } from './reader-diagrams.tsx';
import { SearchView } from './reader-search.tsx';

type Route = { kind: 'home' } | { kind: 'search'; query: string; legacyCollection?: string } | { kind: 'topic'; id: string } | { kind: 'section'; id: string } | { kind: 'doc'; id: string; fragment: string };
type Bootstrap = { config: ReaderConfig; catalog: CatalogDocument[]; map: CoverageMap; navigation: EditorialNavigation; issues: NonNullable<Catalog['issues']> };
type DocumentResponse = KnowledgeDocument & { canonicalReference?: string };
type Panel = EvidencePanel | { kind: 'text'; title: string; content: string };

function parseRoute(): Route {
  const params = new URL(location.href).searchParams;
  const id = params.get('doc');
  if (id) return { kind: 'doc', id, fragment: decode(location.hash.slice(1)) };
  const section = params.get('section');
  if (section) return { kind: 'section', id: section };
  const topic = params.get('topic');
  if (topic) return { kind: 'topic', id: topic };
  const legacyCollection = params.get('collection');
  if (params.has('search') || legacyCollection) return { kind: 'search', query: params.get('q') ?? '', legacyCollection: legacyCollection ?? undefined };
  return { kind: 'home' };
}

function projectKey(projectId: string | null, suffix: string): string | null {
  return projectId ? `lumine:${projectId}:${suffix}` : null;
}

function projectTitle(data: Bootstrap): string | undefined {
  const configured = data.config.displayName?.trim();
  if (configured) return configured;
  if (data.navigation.mode !== 'editorial') return;
  return data.catalog.find((doc) =>
    doc.collection === 'wiki' && doc.id === data.navigation.overview && doc.type === 'overview' && doc.status === 'current',
  )?.title.trim() || undefined;
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

type EditorialSection = EditorialNavigation['groups'][number]['sections'][number];

function sectionHref(id: string) { return `?section=${encodeURIComponent(id)}`; }

function documentsFor(section: EditorialSection, catalog: CatalogDocument[]) {
  const byId = new Map(catalog.map((doc) => [doc.id, doc]));
  return section.documents.flatMap((id) => {
    const doc = byId.get(id);
    return doc ? [doc] : [];
  });
}

function EditorialSidebar({ data, route, locale, onSection, onDocument }: {
  data: Bootstrap; route: Route; locale: Locale;
  onSection: (id: string) => void; onDocument: (id: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const firstSection = data.navigation.groups.find((group) => group.id === 'understand')?.sections[0]?.id;
  return <nav className="editorial-nav" aria-label={t('tree')}>
    {data.navigation.groups.map((group) => !!group.sections.length && <section key={group.id} aria-label={t(group.id)}>
      <h2>{t(group.id)}</h2>
      {group.sections.map((section) => {
        const docs = documentsFor(section, data.catalog);
        const active = route.kind === 'section' && route.id === section.id;
        const expand = expanded[section.id] ?? (active || route.kind === 'doc' && section.documents.includes(route.id) || section.id === firstSection && route.kind === 'home');
        const preview = route.kind === 'home' && section.id === firstSection && expanded[section.id] === undefined;
        return <div className="nav-section" key={section.id}>
          <div className="nav-section-heading"><a className="nav-section-link" href={sectionHref(section.id)} aria-current={active ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onSection(section.id); }}>{section.title}</a>{!!docs.length && <button className="nav-section-toggle" aria-label={`${t('sectionToggle')} · ${section.title}`} aria-expanded={expand} onClick={() => setExpanded((previous) => ({ ...previous, [section.id]: !expand }))}><span aria-hidden="true">{expand ? '−' : '+'}</span></button>}</div>
          {expand && !!docs.length && <ul>{(preview ? docs.slice(0, 5) : docs).map((doc) => <li key={doc.id}><a href={documentHref(doc.id)} aria-current={route.kind === 'doc' && route.id === doc.id ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onDocument(doc.id); }}>{doc.title}</a></li>)}{preview && docs.length > 5 && <li><a href={sectionHref(section.id)} onClick={(event) => { event.preventDefault(); onSection(section.id); }}>{t('browse')} →</a></li>}</ul>}
          {!expand && group.id === 'operate' && docs.some((doc) => doc.normativeScope) && <ul>
            {docs.filter((doc) => doc.normativeScope).slice(0, 2).map((doc) => <li key={doc.id}><a href={documentHref(doc.id)} onClick={(event) => { event.preventDefault(); onDocument(doc.id); }}>{doc.title}</a></li>)}
          </ul>}
        </div>;
      })}
    </section>)}
  </nav>;
}

function DocumentEntries({ docs, locale, onDocument }: {
  docs: CatalogDocument[]; locale: Locale; onDocument: (id: string) => void;
}) {
  return <ul className="reading-entries">{docs.map((doc) => <li key={doc.id}>
    <a href={documentHref(doc.id)} onClick={(event) => { event.preventDefault(); onDocument(doc.id); }}>
      <div><strong>{doc.title}</strong>{doc.status === 'historical' || doc.status === 'proposed' ? <small>{translate(locale, doc.status)}</small> : null}</div>
      <span className="entry-arrow" aria-hidden="true">↗</span>
      {doc.summary && <p>{doc.summary}</p>}
    </a>
  </li>)}</ul>;
}

function HomeView({ data, projectId, locale, onSearch, onSection, onDocument, onCopy }: {
  data: Bootstrap; projectId: string | null; locale: Locale;
  onSearch: () => void; onSection: (id: string) => void; onDocument: (id: string) => void; onCopy: (value: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const projectName = projectTitle(data) || t('unknownProject');
  const overview = data.catalog.find((doc) => doc.id === data.navigation.overview);
  const lastKey = projectKey(projectId, 'last-document');
  const lastId = lastKey ? safeRead(lastKey) : '';
  const last = data.catalog.find((item) => item.id === lastId && item.collection === 'wiki' && item.status === 'current');
  const understand = data.navigation.groups.find((group) => group.id === 'understand')?.sections ?? [];
  const visibleSections = understand.filter((section) => documentsFor(section, data.catalog).some((doc) => doc.id !== overview?.id));
  const featured = visibleSections.filter((section, index) => index === 0 || documentsFor(section, data.catalog).some((doc) => doc.editorialRole === 'scenario'));
  const further = visibleSections.filter((section) => !featured.includes(section));
  return <div className="home-page">
    <section className="home-hero">
      <h1>{projectName}</h1>
      {overview?.summary && <p>{overview.summary}</p>}
      <div className="hero-actions">
        {overview && <a className="primary" href={documentHref(overview.id)} onClick={(event) => { event.preventDefault(); onDocument(overview.id); }}>{t('overview')} <span aria-hidden="true">→</span></a>}
        <button onClick={onSearch}>{t('search')} <kbd aria-hidden="true">/</kbd></button>
      </div>
    </section>
    {featured.map((section) => {
      const docs = documentsFor(section, data.catalog).filter((doc) => doc.id !== overview?.id);
      return <section className="home-reading-section" key={section.id}>
        <header><div><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div>
          {docs.length > 6 && <a href={sectionHref(section.id)} onClick={(event) => { event.preventDefault(); onSection(section.id); }}>{t('browse')} <span aria-hidden="true">→</span></a>}
        </header>
        <DocumentEntries docs={docs.slice(0, 6)} locale={locale} onDocument={onDocument} />
      </section>;
    })}
    {!overview && !visibleSections.length && <section className="status-panel"><p>{data.catalog.length ? t('noMap') : t('empty')}</p><button onClick={() => onCopy(locale === 'zh-CN' ? '请根据当前项目的真实源码和已有文档整理 Repo Wiki，建立项目总览和业务入口。保留人工修改和已确认决定。' : 'Organize the Repo Wiki from the current project and its docs. Add an overview and capability entrances. Preserve human edits and decisions.')}>{t('copyResume')}</button></section>}
    <div className="home-secondary">{data.navigation.groups.filter((group) => group.id !== 'understand' && group.sections.length).map((group) => <section key={group.id}>
      <h2>{t(group.id)}</h2>
      <ul>{group.sections.map((section) => <li key={section.id}><a href={sectionHref(section.id)} onClick={(event) => { event.preventDefault(); onSection(section.id); }}>{section.title} <span aria-hidden="true">→</span></a></li>)}</ul>
    </section>)}</div>
    {!!further.length && <section className="home-further"><h2>{t('explore')}</h2><ul>{further.map((section) => <li key={section.id}><a href={sectionHref(section.id)} onClick={(event) => { event.preventDefault(); onSection(section.id); }}><strong>{section.title}</strong><span aria-hidden="true">→</span>{section.description && <p>{section.description}</p>}</a></li>)}</ul></section>}
    {last && <p className="continue-reading">{t('continue')} <a href={documentHref(last.id)} onClick={(event) => { event.preventDefault(); onDocument(last.id); }}>{last.title} <span aria-hidden="true">→</span></a></p>}
  </div>;
}

function SectionView({ data, id, locale, onDocument, onHome }: {
  data: Bootstrap; id: string; locale: Locale; onDocument: (id: string) => void; onHome: () => void;
}) {
  const t = (key: string) => translate(locale, key);
  const group = data.navigation.groups.find((entry) => entry.sections.some((section) => section.id === id));
  const section = group?.sections.find((entry) => entry.id === id);
  if (!section || !group) return <div className="status-panel error"><p>{t('fragmentMissing')}</p><button onClick={onHome}>{t('home')}</button></div>;
  const docs = documentsFor(section, data.catalog);
  return <section className="topic-page"><header className="page-heading">
    <p className="eyebrow">{t(group.id)}</p><h1>{section.title}</h1>{section.description && <p>{section.description}</p>}
    </header>{docs.length ? <DocumentEntries docs={docs} locale={locale} onDocument={onDocument} /> : <p className="status-panel">{t('noTopicDocs')}</p>}
  </section>;
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

function DocumentView({ doc, data, locale, projectId, fragment, onDocument, onTopic, onSource, onReference, onDiagram, onCopy, onMissing, onFragment }: {
  doc: KnowledgeDocument; data: Bootstrap; locale: Locale; projectId: string | null; fragment: string;
  onDocument: (id: string, fragment?: string) => void; onTopic: (id: string) => void;
  onSource: (documentId: string, sourceId: string) => void; onReference: (from: string, target: string) => void;
  onDiagram: (diagram: Diagram) => void;
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
  const firstHeading = doc.sections[0];
  const titleId = firstHeading?.level === 1 && firstHeading.title === doc.title ? firstHeading.id : undefined;
  const sections = doc.sections.filter((section) => section.id !== titleId);
  const review = doc.semanticReview;
  const section = doc.sections.find((item) => item.id === (fragment || currentSection));
  const handoff = () => {
    const reference = `${doc.id}${section ? '#' + section.id : fragment ? '#' + fragment : ''}`;
    const project = projectTitle(data) || projectId || t('unknownProject');
    return locale === 'zh-CN' ? [
      `请解释「${doc.title}${section ? ' / ' + section.title : ''}」当前如何运作，以及有哪些适用限制。`,
      `项目 ${project}${projectId && projectId !== project ? ' (' + projectId + ')' : ''}`, `知识引用 ${reference}`, `内容版本 ${doc.revision}`,
      '请沿知识库提供的来源核对关键结论。'
    ].join('\n') : [
      `Explain how "${doc.title}${section ? ' / ' + section.title : ''}" works today and which limitations apply.`,
      `Project ${project}${projectId && projectId !== project ? ' (' + projectId + ')' : ''}`, `Knowledge reference ${reference}`, `Content revision ${doc.revision}`,
      'Verify key conclusions against the linked sources.'
    ].join('\n');
  };
  return <div className="document-layout"><article className="document">
    <header className="doc-header"><span className="eyebrow">{documentLabel(locale, doc)}</span>
      <h1 id={titleId} tabIndex={titleId ? -1 : undefined}>{doc.title}</h1>{doc.summary && <p className="doc-summary">{doc.summary}</p>}{doc.normativeScope && <p className="normative-scope">{doc.normativeScope}</p>}
      {doc.collection === 'validation' && <p className="validation-note">{t('validationLimit')}</p>}
      {warning && <div className={`document-warning ${doc.freshness === 'conflict' ? 'danger' : ''}`} role="status">{warning} <button onClick={() => document.getElementById('document-evidence')?.scrollIntoView({ block: 'start' })}>{t('sourceDetails')}</button></div>}
      <div className="doc-actions">
        <button onClick={() => onCopy(handoff())}>{t('copyQuestion')}</button>
        <a href="#document-evidence" onClick={(event) => { event.preventDefault(); const evidence = document.getElementById('document-evidence'); evidence?.scrollIntoView(); evidence?.focus({ preventScroll: true }); }}>{t('sources')}</a>
      </div>
    </header>
    <MarkdownBody doc={doc} catalog={data.catalog} locale={locale} fragment={fragment} titleId={titleId} onDocument={onDocument} onFragment={onFragment} onSource={onSource} onReference={onReference} onDiagram={onDiagram} onMissing={onMissing} onCurrentSection={currentSectionChanged} />
    <section id="document-evidence" className="document-evidence" tabIndex={-1}><h2>{t('sources')}</h2>
      <p>{t('sourceLimit')}</p>
      <div className="doc-actions"><button onClick={() => onCopy(`${doc.id}${fragment ? `#${fragment}` : ''}`)}>{t('copiedReference')}</button><button onClick={() => download(`${doc.title}.md`, doc.markdown, 'text/markdown;charset=utf-8')}>{t('exportMarkdown')}</button></div>
      <details><summary>{t('pageSources')} · {doc.sources.length}</summary><div className="page-source-list">{doc.sources.map((source) => <a key={source.id} href={evidenceHref({ kind: 'source', documentId: doc.id, sourceId: source.id }, location.href)} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onSource(doc.id, source.id); } }}><strong>{sourceTitle(source, data.catalog, locale)}</strong><span>{source.repoId} / {source.path}</span>{source.startLine && <small>L{source.startLine}{source.endLine ? `–${source.endLine}` : ''}</small>}</a>)}</div></details>
      <details><summary>{t('review')} · {t(review.status)}</summary><dl className="review-data"><div><dt>{t('checkedAt')}</dt><dd>{formatDate(locale, doc.checkedAt)}</dd></div>{review.reviewedAt && <div><dt>{t('review')}</dt><dd>{formatDate(locale, review.reviewedAt)} · {review.reviewer?.kind} / {review.reviewer?.role}</dd></div>}{(['scope', 'limitations', 'findings'] as const).map((key) => review[key]?.length ? <div key={key}><dt>{t(key)}</dt><dd><ul>{review[key]!.map((item) => <li key={item}>{item}</li>)}</ul></dd></div> : null)}</dl></details>
    </section>
    <Related id={doc.id} data={data} locale={locale} onDocument={onDocument} onTopic={onTopic} />
  </article><aside className="doc-aside"><details open={contentsOpen} onToggle={(event) => setContentsOpen(event.currentTarget.open)}><summary>{t('contents')}</summary><nav aria-label={t('contents')}>{sections.length ? sections.map((section) => <a key={section.id} className={`toc-level-${Math.min(section.level, 4)}`} href={`#${encodeURIComponent(section.id)}`} aria-current={currentSection === section.id ? 'location' : undefined} onClick={(event) => { event.preventDefault(); onFragment(section.id); }}>{section.title}</a>) : <p>{t('noToc')}</p>}</nav></details></aside></div>;
}

function EvidenceDialog({ panel, catalog, locale, onClose, onDocument, onSource, onReference, onCopy }: {
  panel: Panel; catalog: CatalogDocument[]; locale: Locale; onClose: () => void; onDocument: (id: string, fragment?: string) => void;
  onSource: (documentId: string, sourceId: string, focusStartLine?: number, focusEndLine?: number, replace?: boolean) => void;
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
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    originFocus.current = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); originFocus.current?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null); setReference(null); setError(''); setRaw(panel.kind === 'source' && panel.focusStartLine !== undefined);
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
        if (resolved.kind === 'document' && resolved.id) { onDocument(resolved.id, resolved.fragment); return; }
        if (resolved.kind === 'source' && resolved.documentId && resolved.sourceId) { onSource(resolved.documentId, resolved.sourceId, resolved.focusStartLine, resolved.focusEndLine, true); return; }
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
  }, [source, panel, raw]);

  const location = source ? `${source.source.repoId}:${source.source.path}#L${source.startLine}-L${source.endLine}` : '';
  const comparison = source ? !source.baselineFingerprint ? 'sourceUnknown' : source.baselineFingerprint === source.fingerprint ? 'sourceSame' : 'sourceDrift' : '';
  const readingMarkdown = source?.markdown;
  return <dialog ref={dialog} className={panel.kind === 'source' && !readingMarkdown ? 'evidence-dialog source-drawer' : 'evidence-dialog'} aria-labelledby="evidence-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2 id="evidence-dialog-title">{panel.kind === 'source' ? source ? sourceTitle(source.source, catalog, locale, source.title) : t('sources') : panel.kind === 'text' ? panel.title : reference?.title ?? t('relatedDocuments')}</h2><button onClick={onClose}>{t('close')} ×</button></header>
    {pending && <p className="dialog-message" role="status">{t('loading')}</p>}
    {error && <div className="status-panel error" role="alert"><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>{t('retry')}</button></div>}
    {panel.kind === 'text' && <pre className="text-content" tabIndex={0}>{panel.content}</pre>}
    {source && panel.kind === 'source' && <>
      <div className="dialog-tools">{readingMarkdown && <div className="reading-modes" role="group" aria-label={t('sourceDetails')}><button aria-pressed={!raw} onClick={() => setRaw(false)}>{t('readingView')}</button><button aria-pressed={raw} onClick={() => setRaw(true)}>{t('rawView')}</button></div>}<button onClick={() => onCopy(window.location.href)}>{t('copyLink')}</button></div>
      <p className={`source-comparison ${comparison === 'sourceDrift' ? 'warning' : ''}`}>{t(comparison)}</p>
      {readingMarkdown && !raw ? <ReferenceMarkdown markdown={readingMarkdown.body} sections={readingMarkdown.sections} path={readingMarkdown.referenceFrom ?? readingMarkdown.path} locale={locale} onReference={onReference} onFragment={(fragment) => dialog.current?.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView({ block: 'start' })} /> : <>{source.startLine > 1 || source.endLine < source.totalLines ? <p className="dialog-message subtle-note">{t('sourceScope')}</p> : null}<div className="source-lines" tabIndex={0}>{source.text.split('\n').map((line, index) => {
        const number = source.startLine + index;
        return <div key={number} data-source-line={number} className={panel.focusStartLine !== undefined && number >= panel.focusStartLine && number <= (panel.focusEndLine ?? panel.focusStartLine) ? 'source-line-target' : ''}><span className="line-number" aria-hidden="true">{number}</span><code>{line || ' '}</code></div>;
      })}</div></>}
      <details className="evidence-metadata"><summary>{t('evidenceDetails')}</summary><p className="dialog-path">{location}</p><div className="dialog-tools"><button onClick={() => onCopy(location)}>{t('copyLocation')}</button><button onClick={() => onCopy(`${panel.documentId}#source:${panel.sourceId}`)}>{t('copiedReference')}</button></div><dl className="source-versions"><div><dt>{t('sourceVersion')}</dt><dd><code>{source.fingerprint}</code></dd></div><div><dt>{t('baselineVersion')}</dt><dd><code>{source.baselineFingerprint ?? '—'}</code></dd></div><div><dt>{t('checkedAt')}</dt><dd>{formatDate(locale, source.observedAt)}</dd></div><div><dt>{t('readAt')}</dt><dd>{formatDate(locale, source.readAt)}</dd></div></dl></details>
    </>}
    {reference && reference.kind === 'markdown' && <><div className="dialog-tools"><div className="reading-modes" role="group" aria-label={t('sourceDetails')}><button aria-pressed={!raw} onClick={() => setRaw(false)}>{t('readingView')}</button><button aria-pressed={raw} onClick={() => setRaw(true)}>{t('rawView')}</button></div><button onClick={() => onCopy(window.location.href)}>{t('copyLink')}</button><button onClick={() => download(`${reference.title ?? 'reference'}.md`, reference.markdown ?? '', 'text/markdown;charset=utf-8')}>{t('exportMarkdown')}</button></div>{raw ? <pre className="text-content" tabIndex={0}>{reference.markdown}</pre> : <ReferenceMarkdown markdown={reference.markdown ?? ''} sections={reference.sections ?? []} path={reference.referenceFrom ?? reference.path} locale={locale} fragment={reference.fragment} onReference={onReference} onFragment={(fragment) => dialog.current?.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView({ block: 'start' })} />}<details className="evidence-metadata"><summary>{t('evidenceDetails')}</summary><p className="dialog-path">{reference.path} · {reference.revision}</p></details></>}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(() => parseEvidence(location.href));
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
    setPanel(null);
    setMenuOpen(false);
    window.scrollTo(0, 0);
    if (next.kind !== 'doc' || !next.fragment) focusWorkspace();
  }, [focusWorkspace]);
  const onDocument = useCallback((id: string, fragment = '') => navigate(documentHref(id, fragment)), [navigate]);
  const onTopic = useCallback((id: string) => { if (id) navigate(`?topic=${encodeURIComponent(id)}`); else navigate('/'); }, [navigate]);
  const onSection = useCallback((id: string) => navigate(sectionHref(id)), [navigate]);
  const onHome = useCallback(() => navigate('/'), [navigate]);
  const onSearch = useCallback(() => navigate('?search=1'), [navigate]);
  const onFragment = useCallback((fragment: string) => {
    const current = parseRoute();
    if (current.kind !== 'doc') return;
    const target = document.getElementById(fragment);
    if (!target && current.fragment === fragment) { notify(t('fragmentMissing')); return; }
    if (current.fragment !== fragment) history.pushState({}, '', documentHref(current.id, fragment));
    setRoute({ ...current, fragment });
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [locale, notify]);
  const openEvidence = useCallback((next: EvidencePanel, replace = false) => {
    const href = evidenceHref(next, location.href);
    if (replace) history.replaceState(history.state, '', href);
    else history.pushState({ ...history.state, evidenceDepth: (Number(history.state?.evidenceDepth) || 0) + 1 }, '', href);
    setPanel(next);
  }, []);
  const onSource = useCallback((documentId: string, sourceId: string, focusStartLine?: number, focusEndLine?: number, replace = false) => openEvidence({ kind: 'source', documentId, sourceId, focusStartLine, focusEndLine }, replace), [openEvidence]);
  const onReference = useCallback((from: string, target: string) => openEvidence({ kind: 'reference', from, target }), [openEvidence]);
  const closeEvidence = useCallback(() => {
    if (parseEvidence(location.href)) {
      const depth = Number(history.state?.evidenceDepth);
      if (Number.isInteger(depth) && depth > 0) { history.go(-depth); return; }
      history.replaceState({}, '', withoutEvidence(location.href));
      setRoute(parseRoute());
    }
    setPanel(null);
  }, []);
  const resolveDocument = useCallback((id: string, fragment = '') => {
    history.replaceState({}, '', documentHref(id, fragment));
    setPanel(null); setRoute(parseRoute()); window.scrollTo(0, 0); focusWorkspace();
  }, [focusWorkspace]);
  const onText = useCallback((title: string, content: string) => setPanel({ kind: 'text', title, content }), []);
  const onCopy = useCallback((value: string) => { void copyText(value).then((copied) => { if (copied) notify(translate(locale, 'copied')); else { notify(translate(locale, 'copyUnavailable')); setPanel({ kind: 'text', title: translate(locale, 'copyManually'), content: value }); } }); }, [locale, notify]);

  const loadBootstrap = useCallback(async () => {
    setRefreshing(true); setBootstrapError('');
    try {
      const [config, catalog, map] = await Promise.all([api<ReaderConfig>('/api/config'), api<Catalog>('/api/catalog'), api<KnowledgeMap>('/api/map')]);
      const { navigation } = map;
      const previousProject = dataRef.current ? dataRef.current.config.projectId : safeRead('lumine:active-project') || null;
      const changed = shouldResetProject(dataRef.current !== null, previousProject, config.projectId);
      const languageKey = projectKey(config.projectId, 'ui-locale');
      const savedLocale = languageKey ? safeRead(languageKey) : '';
      const nextLocale = savedLocale === 'zh-CN' || savedLocale === 'en' ? savedLocale : config.locale;
      if (changed) { setProjectNotice(translate(nextLocale, 'serviceChanged')); history.replaceState({}, '', '/'); setRoute({ kind: 'home' }); setDocState({ value: null, pending: false, error: '' }); setPanel(null); setDiagram(null); }
      safeWrite('lumine:active-project', config.projectId ?? '');
      setLocale(nextLocale);
      const next = { config, catalog: catalog.documents, map, navigation, issues: [...catalog.issues ?? [], ...navigation.issues] };
      bootstrapRevision.current++;
      dataRef.current = next; setData(next);
      setBootstrapError('');
    } catch { setBootstrapError(translate(locale, 'loadError')); }
    finally { setRefreshing(false); }
  }, [locale]);

  useEffect(() => { void loadBootstrap(); }, []);
  useEffect(() => {
    const changed = () => { const evidence = parseEvidence(location.href); setRoute(parseRoute()); setPanel(evidence); if (!panel && !evidence) focusWorkspace(); };
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, [focusWorkspace, panel]);
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
          const currentEvidence = parseEvidence(location.href);
          history.replaceState(history.state, '', currentEvidence ? evidenceHref(currentEvidence, documentHref(id, fragment)) : documentHref(id, fragment));
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
      const next: EvidencePanel = { kind: 'source', documentId: route.id, sourceId: route.fragment.slice(7) };
      history.replaceState(history.state, '', evidenceHref(next, withoutEvidence(location.href)));
      setPanel(next);
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
        : route.kind === 'section' ? data.navigation.groups.flatMap((group) => group.sections).find((item) => item.id === route.id)?.title
          : route.kind === 'search' ? t('search') : t('home');
    document.title = `${current ?? t('knowledge')} · ${projectTitle(data) || t('unknownProject')}`;
    document.documentElement.lang = locale;
  }, [data, route, locale]);

  if (!data) return <div className="boot-shell"><p role="status">{bootstrapError || t('loading')}</p>{bootstrapError && <button onClick={() => void loadBootstrap()}>{t('retry')}</button>}</div>;
  const projectName = projectTitle(data) || t('unknownProject');
  const selectedDoc = route.kind === 'doc' ? data.catalog.find((item) => item.id === route.id) : null;
  const activeSection = data.navigation.groups.flatMap((group) => group.sections)
    .find((section) => route.kind === 'doc' ? section.documents.includes(route.id) : route.kind === 'section' && section.id === route.id);
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
        <EditorialSidebar data={data} route={route} locale={locale} onSection={onSection} onDocument={onDocument} />
        <details className="secondary-nav"><summary>{t('relatedDocuments')}</summary><button onClick={() => navigate('?collection=spec')}>{t('specs')}</button><button onClick={() => navigate('?collection=plan')}>{t('plans')}</button></details>
        <details className="secondary-nav"><summary>{t('maintenance')}</summary><p>{t('coverageNote')}</p><p>{t('coverage')} · {coverageSummary(data.map, new Set(data.catalog.map((item) => item.id))).covered} / {data.map.topics.length}</p>{!!data.issues.length && <p className="warning">{t('missing')} · {data.issues.length}</p>}<button onClick={() => onCopy(locale === 'zh-CN' ? '请核对当前项目知识目录、已有正文、来源及待处理缺口，保留人工修改和冲突，继续受影响主题。' : 'Check the current knowledge tree, text, sources and open gaps; preserve human edits and conflicts, then continue affected topics.')}>{t('copyResume')}</button></details>
      </aside>
      <div className="main"><header className="topbar">
        <button ref={menuButton} className="mobile-menu" aria-label={t('menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>☰</button>
        <nav className="breadcrumb" aria-label={t('path')}>
          <a href="/" onClick={(event) => { event.preventDefault(); onHome(); }}>{projectName}</a>
          {activeSection && <span><span aria-hidden="true">/</span><a aria-current={route.kind === 'section' ? 'page' : undefined} href={sectionHref(activeSection.id)} onClick={(event) => { event.preventDefault(); onSection(activeSection.id); }}>{activeSection.title}</a></span>}
          {selectedDoc && <span><span aria-hidden="true">/</span><span aria-current="page">{selectedDoc.title}</span></span>}
        </nav>
        <div className="top-actions"><button className="top-search" onClick={onSearch}>{t('search')} <kbd aria-hidden="true">/</kbd></button><button onClick={() => void loadBootstrap()} disabled={refreshing}>{refreshing ? t('loading') : t('refresh')}</button><button onClick={() => { const next = locale === 'en' ? 'zh-CN' : 'en'; setLocale(next); const key = projectKey(projectId, 'ui-locale'); if (key) safeWrite(key, next); }} aria-label={t('language')}>{locale === 'en' ? '中文' : 'English'}</button></div>
      </header>
        <main className="workspace" id="workspace" tabIndex={-1}>
          {projectNotice && <div className="status-panel" role="status">{projectNotice}<button onClick={() => setProjectNotice('')}>{t('close')}</button></div>}
          {bootstrapError && <div className="status-panel error" role="alert">{bootstrapError}<button onClick={() => void loadBootstrap()}>{t('retry')}</button></div>}
          {route.kind === 'home' && <HomeView data={data} projectId={projectId} locale={locale} onSearch={onSearch} onSection={onSection} onDocument={onDocument} onCopy={onCopy} />}
          {route.kind === 'search' && <SearchView key={projectId ?? 'unregistered'} locale={locale} projectId={projectId} catalog={data.catalog} initialQuery={route.query} legacyCollection={route.legacyCollection} onDocument={onDocument} onCopy={onCopy} />}
          {route.kind === 'section' && <SectionView data={data} id={route.id} locale={locale} onDocument={onDocument} onHome={onHome} />}
          {route.kind === 'topic' && <TopicView data={data} id={route.id} locale={locale} onDocument={onDocument} onTopic={onTopic} onCopy={onCopy} />}
          {route.kind === 'doc' && <>
            {docState.pending && !displayedDoc && <p className="loading-state" role="status">{t('loading')}</p>}
            {docState.error && <div className="status-panel error" role="alert"><p>{docState.error}</p><button onClick={() => setDocRetry((value) => value + 1)}>{t('retry')}</button><button onClick={onHome}>{t('home')}</button></div>}
            {displayedDoc && <DocumentView key={displayedDoc.id} doc={displayedDoc} data={data} locale={locale} projectId={projectId} fragment={displayedDoc.id === route.id ? route.fragment : ''} onDocument={onDocument} onTopic={onTopic} onSource={onSource} onReference={onReference} onDiagram={setDiagram} onCopy={onCopy} onMissing={onFragmentMissing} onFragment={onFragment} />}
          </>}
        </main>
      </div>
    </div>
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    {panel && <EvidenceDialog panel={panel} catalog={data.catalog} locale={locale} onClose={closeEvidence} onDocument={resolveDocument} onSource={onSource} onReference={onReference} onCopy={onCopy} />}
    {diagram && activeDoc && <DiagramDialog diagram={diagram} document={activeDoc} locale={locale} onClose={() => setDiagram(null)} onCopy={onCopy} onText={(title, text) => { setDiagram(null); onText(title, text); }} />}
  </>;
}

const app = document.getElementById('app');
if (app) createRoot(app).render(<ReaderApp />);
