import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import type { KnowledgeCard, Locale } from '../harness/wiki/types.ts';
import { api, documentHref, safeRead, safeWrite, translate, typeLabel, documentLabel, type CatalogDocument, type SearchPage } from './reader-common.ts';

type Filters = { scope: 'wiki' | 'all'; repo: string; type: string; freshness: string };
const initialFilters: Filters = { scope: 'wiki', repo: '', type: '', freshness: '' };

function loadFilters(projectId: string | null): Filters {
  if (!projectId) return initialFilters;
  try {
    const saved = JSON.parse(safeRead(`lumine:${projectId}:search-filters`)) as Partial<Filters>;
    return { scope: saved.scope === 'all' ? 'all' : 'wiki', repo: saved.repo ?? '', type: saved.type ?? '', freshness: saved.freshness ?? '' };
  } catch { return initialFilters; }
}

export function SearchView({ locale, projectId, catalog, initialQuery, legacyCollection, onDocument, onCopy }: {
  locale: Locale; projectId: string | null; catalog: CatalogDocument[]; initialQuery: string; legacyCollection?: string;
  onDocument: (id: string, fragment?: string) => void; onCopy: (value: string) => void;
}) {
  const t = (key: string) => translate(locale, key);
  const [query, setQuery] = useState(initialQuery);
  const [expandedHits, setExpandedHits] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(() => {
    const saved = loadFilters(projectId);
    return legacyCollection === 'spec' || legacyCollection === 'plan' ? { ...saved, scope: 'all', type: legacyCollection === 'spec' ? 'product-spec' : 'exec-plan' } : saved;
  });
  const [hits, setHits] = useState<KnowledgeCard[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const queryInput = useRef<HTMLInputElement>(null);
  const filterKey = JSON.stringify(filters);

  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => { if (projectId) safeWrite(`lumine:${projectId}:search-filters`, filterKey); }, [projectId, filterKey]);

  const search = useCallback(async (nextCursor: string | null, signal?: AbortSignal) => {
    const version = ++request.current;
    const term = query.trim();
    if (!term) { setHits([]); setTotal(0); setHasMore(false); setCursor(null); setPending(false); setError(''); return; }
    setPending(true); setError('');
    const params = new URLSearchParams({ q: term, scope: filters.scope, limit: '20' });
    if (nextCursor) params.set('cursor', nextCursor);
    if (filters.repo) params.set('repo', filters.repo);
    if (filters.type) params.set('type', filters.type);
    if (filters.freshness) params.set('freshness', filters.freshness);
    try {
      const result = await api<SearchPage>(`/api/search?${params}`, signal);
      if (version !== request.current) return;
      setHits((previous) => nextCursor ? [...previous, ...result.cards.filter((card) => !previous.some((entry) => entry.id === card.id))] : result.cards);
      setTotal(result.total); setHasMore(result.hasMore); setCursor(result.nextCursor); setError('');
    } catch (reason) {
      if (version !== request.current || signal?.aborted) return;
      if (nextCursor && reason instanceof Error && reason.message === 'SEARCH_CURSOR_STALE') {
        void search(null);
        return;
      }
      setError(t('loadError'));
    } finally { if (version === request.current) setPending(false); }
  }, [query, filterKey, locale]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void search(null, controller.signal); }, query.trim() ? 240 : 0);
    return () => { clearTimeout(timer); controller.abort(); ++request.current; };
  }, [search]);

  const scopeDocs = useMemo(() => catalog.filter((doc) =>
    (filters.scope === 'all' || doc.collection === 'wiki')
    && (!filters.repo || doc.repositories.includes(filters.repo))
    && (!filters.type || doc.type === filters.type)
    && (!filters.freshness || doc.freshness === filters.freshness),
  ), [catalog, filterKey]);
  const resultDocs = query.trim() ? hits.map((hit) => ({ hit, doc: catalog.find((doc) => doc.id === hit.id) })).filter((item): item is { hit: KnowledgeCard; doc: CatalogDocument } => !!item.doc)
    : scopeDocs.map((doc) => ({ doc, hit: undefined }));
  const resultTotal = query.trim() ? total : resultDocs.length;
  const filterCount = Number(!!filters.repo) + Number(!!filters.type) + Number(!!filters.freshness);
  const allRepos = [...new Set(catalog.flatMap((doc) => doc.repositories))].sort();
  const allTypes = [...new Set(catalog.filter((doc) => filters.scope === 'all' || doc.collection === 'wiki').map((doc) => doc.type))].sort();
  const change = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => { event.preventDefault(); void search(null); };

  return <section className="search-page">
    <header className="page-heading"><span className="eyebrow">{t('knowledge')}</span><h1>{t('searchPrompt')}</h1></header>
    <form className="search-form" role="search" onSubmit={submit}>
      <label htmlFor="wiki-query" className="sr-only">{t('search')}</label>
      <input ref={queryInput} id="wiki-query" type="search" autoComplete="off" value={query} placeholder={t('queryPlaceholder')}
        onChange={(event) => { setQuery(event.target.value); history.replaceState({}, '', `?search=1${event.target.value ? `&q=${encodeURIComponent(event.target.value)}` : ''}`); }} />
      <Button type="submit"><Search size={17} aria-hidden="true" />{t('search')}</Button>
    </form>
    <Tabs className="search-scope" selectedKey={filters.scope} onSelectionChange={(key) => change('scope', String(key))}><TabList aria-label={t('relatedDocuments')}><Tab id="wiki">{t('wikiOnly')}</Tab><Tab id="all">{t('allDocuments')}</Tab></TabList><TabPanel id="wiki" /><TabPanel id="all" /></Tabs>
    <details className="search-filters"><summary>{t('filters')}{filterCount ? ` · ${filterCount}` : ''}</summary>
      <div className="filter-controls">
        <label>{t('allRepos')}<select value={filters.repo} onChange={(event) => change('repo', event.target.value)}><option value="">{t('allRepos')}</option>{allRepos.map((repo) => <option key={repo} value={repo}>{repo}</option>)}</select></label>
        <label>{t('allTypes')}<select value={filters.type} onChange={(event) => change('type', event.target.value)}><option value="">{t('allTypes')}</option>{allTypes.map((type) => <option key={type} value={type}>{typeLabel(locale, type)}</option>)}</select></label>
        <label>{t('allStates')}<select value={filters.freshness} onChange={(event) => change('freshness', event.target.value)}><option value="">{t('allStates')}</option>{['current', 'stale', 'unverified', 'missing-source', 'conflict'].map((state) => <option key={state} value={state}>{t(state)}</option>)}</select></label>
        {filterCount > 0 && <button onClick={() => setFilters({ ...filters, repo: '', type: '', freshness: '' })}>{t('clearFilters')}</button>}
      </div>
    </details>
    {filterCount > 0 && <div className="active-filters" aria-label={t('filters')}>
      {(['repo', 'type', 'freshness'] as const).filter((key) => filters[key]).map((key) => <button key={key} onClick={() => change(key, '')}>{key === 'type' ? typeLabel(locale, filters[key]) : key === 'freshness' ? t(filters[key]) : filters[key]} ×</button>)}
    </div>}
    <p className="result-count" role="status">{pending && !resultDocs.length ? t('loading') : `${t('showing')} ${resultDocs.length} / ${resultTotal} ${t('results')}`}</p>
    {error && <div className="status-panel error" role="alert"><p>{error}</p><button onClick={() => void search(null)}>{t('retry')}</button></div>}
    {!pending && !error && !resultDocs.length && <div className="status-panel"><p>{catalog.length ? t('noResults') : t('empty')}</p><button onClick={() => onCopy(locale === 'zh-CN' ? `请调查项目 ${projectId ?? ''} 中的“${query}”，核对源码与现有知识，并说明证据和未覆盖范围。` : `Investigate "${query}" in project ${projectId ?? "(current project)"}. Check source and existing knowledge, and explain evidence and limitations.`)}>{t('copyQuestion')}</button></div>}
    <div className="search-results">{resultDocs.map(({ doc, hit }) => <article className="result-card" key={doc.id}>
      <div className="result-meta"><span>{documentLabel(locale, doc)}</span>{doc.collection !== 'validation' && doc.freshness !== 'current' && <span className={`status-text ${doc.freshness}`}>{t(doc.freshness)}</span>}</div>
      <h2><a href={documentHref(doc.id)} onClick={(event) => { event.preventDefault(); onDocument(doc.id); }}>{doc.title}</a></h2>
      {(!hit?.matches.length || expandedHits.has(doc.id)) && <p className="result-excerpt">{doc.summary}</p>}
      {hit?.matches.slice(0, expandedHits.has(doc.id) ? undefined : 1).map((match) => <div className="result-match" key={match.reference}>
        <a href={documentHref(doc.id, match.sectionId)} onClick={(event) => { event.preventDefault(); onDocument(doc.id, match.sectionId); }}>{match.title}</a>
        <p className={expandedHits.has(doc.id) ? undefined : "result-excerpt"}>{match.excerpt}</p>
      </div>)}
      {!!hit && hit.matches.length > 1 && <Button className="quiet-action" aria-expanded={expandedHits.has(doc.id)} onPress={() => setExpandedHits((previous) => { const next = new Set(previous); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; })}>{expandedHits.has(doc.id) ? locale === 'zh-CN' ? '收起匹配' : 'Fewer matches' : locale === 'zh-CN' ? `查看其余 ${hit.matches.length - 1} 处匹配` : `Show ${hit.matches.length - 1} more matches`}</Button>}
      {doc.repositories.length > 1 && <small>{doc.repositories.join(' · ')}</small>}
    </article>)}</div>
    {query.trim() && hasMore && <button className="load-more" disabled={pending} onClick={() => void search(cursor)}>{pending ? t('loading') : t('more')}</button>}
    {query.trim() && !hasMore && !!resultDocs.length && <p className="end-note">{t('noMore')}</p>}
  </section>;
}
