import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeCard, Locale } from '../harness/wiki/types.ts';
import { api, documentHref, safeRead, safeWrite, translate, typeLabel, type CatalogDocument, type SearchPage } from './reader-common.ts';

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
  const submit = (event: React.FormEvent) => { event.preventDefault(); queryInput.current?.blur(); };

  return <section className="search-page">
    <header className="page-heading"><span className="eyebrow">{t('knowledge')}</span><h1>{t('searchPrompt')}</h1></header>
    <form className="search-form" role="search" onSubmit={submit}>
      <label htmlFor="wiki-query" className="sr-only">{t('search')}</label>
      <input ref={queryInput} id="wiki-query" type="search" autoComplete="off" value={query} placeholder={t('queryPlaceholder')}
        onChange={(event) => { setQuery(event.target.value); history.replaceState({}, '', `?search=1${event.target.value ? `&q=${encodeURIComponent(event.target.value)}` : ''}`); }} />
      <button type="submit">{t('search')}</button>
    </form>
    <div className="search-scope" role="group" aria-label={t('relatedDocuments')}>
      <button aria-pressed={filters.scope === 'wiki'} onClick={() => change('scope', 'wiki')}>{t('wikiOnly')}</button>
      <button aria-pressed={filters.scope === 'all'} onClick={() => change('scope', 'all')}>{t('allDocuments')}</button>
    </div>
    <details className="search-filters"><summary>{t('filters')}{filterCount ? ` · ${filterCount}` : ''}</summary>
      <div className="filter-controls">
        <label>{t('allRepos')}<select value={filters.repo} onChange={(event) => change('repo', event.target.value)}><option value="">{t('allRepos')}</option>{allRepos.map((repo) => <option key={repo} value={repo}>{repo}</option>)}</select></label>
        <label>{t('allTypes')}<select value={filters.type} onChange={(event) => change('type', event.target.value)}><option value="">{t('allTypes')}</option>{allTypes.map((type) => <option key={type} value={type}>{typeLabel(locale, type)}</option>)}</select></label>
        <label>{t('allStates')}<select value={filters.freshness} onChange={(event) => change('freshness', event.target.value)}><option value="">{t('allStates')}</option>{['current', 'stale', 'unverified', 'missing-source', 'conflict'].map((state) => <option key={state} value={state}>{t(state)}</option>)}</select></label>
        {filterCount > 0 && <button onClick={() => setFilters({ ...filters, repo: '', type: '', freshness: '' })}>{t('clearFilters')}</button>}
      </div>
    </details>
    {filterCount > 0 && <div className="active-filters" aria-label={t('filters')}>
      {(['repo', 'type', 'freshness'] as const).filter((key) => filters[key]).map((key) => <button key={key} onClick={() => change(key, '')}>{filters[key]} ×</button>)}
    </div>}
    <p className="result-count" role="status">{pending && !resultDocs.length ? t('loading') : `${t('showing')} ${resultDocs.length} / ${resultTotal} ${t('results')}`}</p>
    {error && <div className="status-panel error" role="alert"><p>{error}</p><button onClick={() => void search(null)}>{t('retry')}</button></div>}
    {!pending && !error && !resultDocs.length && <div className="status-panel"><p>{catalog.length ? t('noResults') : t('empty')}</p><button onClick={() => onCopy(locale === 'zh-CN' ? `请调查当前项目中的“${query}”，核对源码与现有知识，并说明证据和未覆盖范围。` : `Investigate "${query}" in this project. Check source and existing knowledge, and explain evidence and limitations.`)}>{t('copyQuestion')}</button></div>}
    <div className="search-results">{resultDocs.map(({ doc, hit }) => <article className="result-card" key={doc.id}>
      <div className="result-meta"><span>{doc.collection === 'wiki' ? t('knowledge') : doc.collection === 'spec' ? t('specs') : doc.collection === 'plan' ? t('plans') : t('validation')}</span>{doc.collection !== 'validation' && doc.freshness !== 'current' && <span className={`status-text ${doc.freshness}`}>{t(doc.freshness)}</span>}</div>
      <h2><a href={documentHref(doc.id)} onClick={(event) => { event.preventDefault(); onDocument(doc.id); }}>{doc.title}</a></h2>
      <p>{doc.summary}</p>
      {hit?.matches.map((match) => <div className="result-match" key={match.reference}>
        <a href={documentHref(doc.id, match.sectionId)} onClick={(event) => { event.preventDefault(); onDocument(doc.id, match.sectionId); }}>{match.title}</a>
        <p>{match.excerpt}</p>
      </div>)}
      <small>{doc.repositories.join(' · ')}</small>
    </article>)}</div>
    {query.trim() && hasMore && <button className="load-more" disabled={pending} onClick={() => void search(cursor)}>{pending ? t('loading') : t('more')}</button>}
    {query.trim() && !hasMore && !!resultDocs.length && <p className="end-note">{t('noMore')}</p>}
  </section>;
}
