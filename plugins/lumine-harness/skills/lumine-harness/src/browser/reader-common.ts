import type { CoverageMap, Diagram, KnowledgeCard, KnowledgeDocument, Locale, Section, SourceRef } from '../harness/wiki/types.ts';

export type CatalogDocument = Omit<KnowledgeDocument, 'markdown' | 'body' | 'diagrams' | 'sections'> & {
  diagrams: Omit<Diagram, 'code'>[];
  sections: Omit<Section, 'body'>[];
};
export type ReaderConfig = { locale: Locale; projectId: string | null; displayName: string | null; repositories: { id: string }[] };
export type Catalog = { documents: CatalogDocument[]; issues?: { code: string; document?: string; message: string }[] };
export type ReaderMap = CoverageMap;
export type SearchPage = { query: string; cards: KnowledgeCard[]; total: number; hasMore: boolean; nextCursor: string | null };
export type RelatedResult = { id: string; relations: { target: string; kind: string; note?: string; direction: string; title?: string; path?: string; summary?: string }[] };
export type ReferenceResult = { kind: 'document' | 'markdown' | 'attachment' | 'source'; id?: string; path: string; markdown?: string; title?: string; revision?: string; fragment?: string; referenceFrom?: string; sections?: Section[]; documentId?: string; sourceId?: string; focusStartLine?: number; focusEndLine?: number };
export type HighlightResult = { tokens: { content: string; color?: string }[][]; background?: string; foreground?: string };
export type SourceResult = { source: SourceRef; title?: string; markdown?: { body: string; sections: Section[]; title: string; path: string; referenceFrom?: string }; text: string; highlighted?: HighlightResult; startLine: number; endLine: number; totalLines: number; fingerprint: string; baselineFingerprint: string | null; observedAt: string | null; readAt: string };

export type EvidencePanel = { kind: 'source'; documentId: string; sourceId: string; focusStartLine?: number; focusEndLine?: number }
  | { kind: 'reference'; from: string; target: string };

/** Evidence is an addressable reading state, including when opened in another tab. */
export function evidenceHref(panel: EvidencePanel, base: string): string {
  const url = new URL(base, 'http://reader.local/');
  for (const key of ['source', 'sourceStart', 'sourceEnd', 'reference', 'from']) url.searchParams.delete(key);
  if (panel.kind === 'source') {
    url.searchParams.set('doc', panel.documentId);
    for (const key of ['section', 'topic', 'search', 'q', 'collection']) url.searchParams.delete(key);
    url.searchParams.set('source', panel.sourceId);
    if (panel.focusStartLine) url.searchParams.set('sourceStart', String(panel.focusStartLine));
    if (panel.focusEndLine) url.searchParams.set('sourceEnd', String(panel.focusEndLine));
  } else {
    url.searchParams.set('reference', panel.target);
    url.searchParams.set('from', panel.from);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseEvidence(url: string): EvidencePanel | null {
  const params = new URL(url, 'http://reader.local/').searchParams;
  const documentId = params.get('doc'), sourceId = params.get('source');
  const line = (key: string) => { const raw = params.get(key); const n = raw && /^\d+$/.test(raw) ? Number(raw) : 0; return Number.isSafeInteger(n) && n > 0 ? n : undefined; };
  if (documentId && sourceId) return { kind: 'source', documentId, sourceId, focusStartLine: line('sourceStart'), focusEndLine: line('sourceEnd') };
  const from = params.get('from'), target = params.get('reference');
  return from && target ? { kind: 'reference', from, target } : null;
}

export function withoutEvidence(url: string): string {
  const target = new URL(url, 'http://reader.local/');
  for (const key of ['source', 'sourceStart', 'sourceEnd', 'reference', 'from']) target.searchParams.delete(key);
  if (decode(target.hash.slice(1)).startsWith('source:')) target.hash = '';
  return `${target.pathname}${target.search}${target.hash}`;
}

/** Titles belong to the source language; UI verbs belong to the reader locale. IDs are never labels. */
export function sourceTitle(source: SourceRef, catalog: CatalogDocument[], locale: Locale, resolvedTitle?: string): string {
  const title = resolvedTitle?.trim() || source.title?.trim() || catalog.find((item) => item.path === source.path)?.title.trim();
  if (title) return title;
  const filename = source.path.replace(/\\/g, '/').split('/').pop() ?? '';
  if (source.note?.trim() && source.note.trim().length <= 90) return source.note.trim();
  if (/\.md$/i.test(filename) && !/^(readme|index)\.md$/i.test(filename)) return filename.replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
  return filename ? `${translate(locale, /\.md$/i.test(filename) ? 'sourceDocument' : 'sourceFile')} · ${filename}` : translate(locale, 'sources');
}

const dictionary: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    explore: '继续深入', sectionToggle: '展开或收起目录', sourceDocument: '参考文档', sourceFile: '实现文件',
    readingView: '阅读文档', rawView: '查看原文', evidenceDetails: '版本与定位', copyLink: '复制链接', sourceScope: '当前仅显示引用的行范围。',
    understand: '理解项目', operate: '开发与运行', reference: '查找与核实',
    moreDetail: '更多说明', table: '表格，可横向滚动', home: '项目首页', knowledge: '仓库知识', search: '搜索知识', tree: '知识目录', contents: '本页导航',
    relatedDocuments: '关联文档', specs: '产品方案', plans: '执行计划', validation: '验证记录', maintenance: '知识维护',
    browse: '浏览全部知识', overview: '阅读项目概览', topics: '知识主题', continue: '继续阅读',
    projectLibrary: '项目知识库', intro: '从项目全貌理解机制，沿着来源核实结论。',
    queryPlaceholder: '搜索功能、流程或开发规范…', searchPrompt: '搜索知识库',
    allDocuments: '全体文档', wikiOnly: '仅仓库知识', filters: '筛选', clearFilters: '清除筛选',
    allRepos: '全部仓库', allTypes: '全部类型', allStates: '全部来源状态',
    loading: '正在载入…', loadError: '连接失败，已读内容仍可查看。请检查阅读服务后重试。',
    retry: '重试', empty: '尚未收录知识。可以复制整理指令继续建库。',
    noResults: '未找到相关知识。试试其他关键词，或查看知识目录。',
    copyQuestion: '复制给 Agent 的问题', copyResume: '复制继续整理指令', copied: '已复制',
    copyUnavailable: '剪贴板不可用，请从打开的文本窗口手动复制。',
    copyManually: '手动复制文本',
    results: '项结果', showing: '已显示', more: '继续查看', noMore: '已显示全部结果',
    source: '来源', sources: '来源依据', sourceDetails: '查证来源', sourceUnavailable: '来源暂时不可读取；正文仍可阅读。',
    sourceChanged: '来源有变化，影响待核实。', conflict: '内容存在冲突，请核对后使用。',
    missingSource: '来源缺失，当前无法核实这项结论。', unverified: '来源尚未核对。',
    reviewOutdated: '内容已修订，原有审阅结论需要重新核实。',
    current: '最近观察时来源未变', stale: '来源有变化', 'missing-source': '来源缺失',
    review: '内容审阅', reviewed: '有适用审阅记录', unreviewed: '尚无适用审阅',
    issues: '审阅发现问题', outdated: '审阅版本已变化', sourceLimit: '源码对应文件版本；部署和实际运行仍需各自证据。',
    sourceSame: '与知识库记录的来源版本一致。',
    sourceDrift: '当前文件与知识基线不同，请重新核实结论。',
    sourceUnknown: '没有这项来源的知识基线，无法判断是否变化。',
    sourceVersion: '当前文件指纹', baselineVersion: '知识基线指纹', checkedAt: '来源上次观察',
    readAt: '本次读取', scope: '覆盖范围', limitations: '限制与未覆盖', findings: '发现',
    copiedReference: '复制引用', copyLocation: '复制源码定位', copyEdit: '复制修订指令',
    exportMarkdown: '导出 Markdown', exportMermaid: '导出 Mermaid', exportSvg: '导出 SVG',
    viewMermaid: '查看 Mermaid 源码', copyMermaid: '复制 Mermaid 源码', diagram: '图解', openDiagram: '放大图解',
    diagramError: '图解暂时无法显示。文字说明和 Mermaid 源码仍可阅读。',
    diagramAssetError: '图解资源载入失败。请在阅读服务恢复后重新载入阅读器；文字说明和 Mermaid 源码仍可阅读。',
    reloadReader: '重新载入阅读器',
    zoomIn: '放大', zoomOut: '缩小', fit: '适合窗口', reset: '重置', close: '关闭',
    menu: '打开知识目录', closeMenu: '关闭目录', language: '界面语言', refresh: '刷新',
    fragmentMissing: '该章节或图解已不存在。请从目录选择有效内容。',
    referenceError: '资料暂时无法打开，请核对引用和访问范围。',
    attachment: '此附件不在阅读器内预览。请按项目相对路径查看原文件。',
    originalMarkdown: '查看原始 Markdown', noToc: '本页没有分节。', noTopicDocs: '这个主题还没有可阅读的文档。',
    noMap: '知识目录尚未建立；已有文档仍可浏览和搜索。',
    missing: '引用内容暂缺', unresolved: '目录关系待修复', unmapped: '尚未编入目录',
    coverage: '知识覆盖', coverageNote: '整理进度不代表内容已经通过语义审阅。',
    planned: '待整理', partial: '待完善', covered: '已整理', deferred: '已延后',
    sectionSources: '本节来源', pageSources: '本页来源',
    proposed: '拟议方案', historical: '历史记录', implementation: '当前实现', validationLimit: '这份验证记录只说明记录时的范围和环境；当前实现请另行核对。',
    outgoing: '引用', incoming: '被引用', depends_on: '依赖', decision: '决策依据', related: '相关', part_of: '所属主题',
    noRelated: '暂无已登记的关联。', skip: '跳到正文', path: '阅读路径', back: '返回',
    serviceChanged: '阅读服务已切换项目，现已返回当前项目首页。',
    unknownProject: '项目知识库',
  },
  en: {
    explore: 'Explore further', sectionToggle: 'Expand or collapse section', sourceDocument: 'Reference document', sourceFile: 'Implementation file',
    readingView: 'Read document', rawView: 'View original', evidenceDetails: 'Version and location', copyLink: 'Copy link', sourceScope: 'Only the referenced line range is shown.',
    understand: 'Understand the project', operate: 'Develop and operate', reference: 'Find and verify',
    moreDetail: 'More detail', table: 'Scrollable table', home: 'Project home', knowledge: 'Repo Wiki', search: 'Search knowledge', tree: 'Knowledge tree', contents: 'On this page',
    relatedDocuments: 'Related documents', specs: 'Product specs', plans: 'Execution plans', validation: 'Validation record', maintenance: 'Knowledge maintenance',
    browse: 'Browse all knowledge', overview: 'Read the project overview', topics: 'Topics', continue: 'Continue reading',
    projectLibrary: 'Project knowledge', intro: 'Understand the system from its map, then follow the sources behind each conclusion.',
    queryPlaceholder: 'Search features, workflows or engineering standards…', searchPrompt: 'Search the wiki',
    allDocuments: 'All documents', wikiOnly: 'Repo Wiki only', filters: 'Filters', clearFilters: 'Clear filters',
    allRepos: 'All repositories', allTypes: 'All types', allStates: 'All source states',
    loading: 'Loading…', loadError: 'Connection failed. Read content remains available. Check the reader service and retry.',
    retry: 'Try again', empty: 'No knowledge yet. Copy the continuation prompt to build the wiki.',
    noResults: 'No relevant knowledge found. Try other terms or explore the knowledge tree.',
    copyQuestion: 'Copy question for an agent', copyResume: 'Copy continuation prompt', copied: 'Copied',
    copyUnavailable: 'Clipboard unavailable. Copy manually from the open text window.',
    copyManually: 'Copy text manually',
    results: 'results', showing: 'Showing', more: 'Show more', noMore: 'All results shown',
    source: 'Source', sources: 'Sources', sourceDetails: 'Inspect source', sourceUnavailable: 'Source cannot be read now. The document remains available.',
    sourceChanged: 'Sources changed; their effect is not yet assessed.', conflict: 'Content has a conflict. Check before use.',
    missingSource: 'A source is missing. This conclusion cannot be checked now.', unverified: 'Sources have not been checked.',
    reviewOutdated: 'This page changed. Its previous review needs to be repeated.',
    current: 'Sources unchanged at last observation', stale: 'Sources changed', 'missing-source': 'Source missing',
    review: 'Semantic review', reviewed: 'Applicable review recorded', unreviewed: 'No applicable review',
    issues: 'Review found issues', outdated: 'Review is out of date', sourceLimit: 'Code reflects a file version. Deployment and runtime behavior need their own evidence.',
    sourceSame: 'Matches the source version recorded by the knowledge base.',
    sourceDrift: 'The current file differs from the knowledge baseline. Recheck the conclusion.',
    sourceUnknown: 'No knowledge baseline exists for this source, so changes cannot be determined.',
    sourceVersion: 'Current file fingerprint', baselineVersion: 'Knowledge baseline fingerprint', checkedAt: 'Sources last observed',
    readAt: 'Read at', scope: 'Review scope', limitations: 'Limitations and exclusions', findings: 'Findings',
    copiedReference: 'Copy reference', copyLocation: 'Copy source location', copyEdit: 'Copy revision prompt',
    exportMarkdown: 'Export Markdown', exportMermaid: 'Export Mermaid', exportSvg: 'Export SVG',
    viewMermaid: 'View Mermaid source', copyMermaid: 'Copy Mermaid source', diagram: 'Diagram', openDiagram: 'Open diagram',
    diagramError: 'This diagram could not be displayed. Its explanation and Mermaid text remain available.',
    diagramAssetError: 'The diagram resource could not load. Reload the reader when its service is available; the explanation and Mermaid text remain readable.',
    reloadReader: 'Reload reader',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', reset: 'Reset', close: 'Close',
    menu: 'Open knowledge tree', closeMenu: 'Close tree', language: 'Interface language', refresh: 'Refresh',
    fragmentMissing: 'This section or diagram no longer exists. Choose an available item from the tree.',
    referenceError: 'This reference could not be opened. Check its identity and access scope.',
    attachment: 'This attachment is not previewed here. Open its original project-relative path.',
    originalMarkdown: 'View original Markdown', noToc: 'This page has no sections.', noTopicDocs: 'This topic has no readable documents yet.',
    noMap: 'The knowledge tree has not been built. Existing documents can still be browsed and searched.',
    missing: 'Referenced content missing', unresolved: 'Tree relation needs repair', unmapped: 'Outside the knowledge tree',
    coverage: 'Knowledge coverage', coverageNote: 'Writing progress does not establish semantic correctness.',
    planned: 'To write', partial: 'In progress', covered: 'Documented', deferred: 'Deferred',
    sectionSources: 'Section sources', pageSources: 'Page sources',
    proposed: 'Proposed', historical: 'Historical', implementation: 'Current implementation', validationLimit: 'This validation record describes its recorded scope and environment. Check the current implementation separately.',
    outgoing: 'References', incoming: 'Referenced by', depends_on: 'Depends on', decision: 'Decision basis', related: 'Related', part_of: 'In topic',
    noRelated: 'No recorded relationships yet.', skip: 'Skip to content', path: 'Breadcrumb', back: 'Back',
    serviceChanged: 'The reader switched projects and returned to this project’s home page.',
    unknownProject: 'Project knowledge',
  },
};

export function translate(locale: Locale, key: string): string { return dictionary[locale][key] ?? key; }
export function formatDate(locale: Locale, value: string | null | undefined): string {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN') : '—';
}
export function typeLabel(locale: Locale, type: string): string {
  const labels: Record<string, [string, string]> = {
    architecture: ['系统架构', 'Architecture'], mechanism: ['实现机制', 'Mechanism'],
    'product-spec': ['产品方案', 'Product spec'], 'exec-plan': ['执行计划', 'Execution plan'],
    business: ['业务机制', 'Business flow'], 'business-flow': ['业务流程', 'Business flow'],
    solution: ['技术方案', 'Technical solution'], 'technical-solution': ['技术方案', 'Technical solution'],
    convention: ['工程约定', 'Convention'], stack: ['技术栈', 'Technology'],
    spec: ['产品方案', 'Product spec'], plan: ['执行计划', 'Execution plan'],
  };
  return labels[type]?.[locale === 'zh-CN' ? 0 : 1] ?? type;
}
export function decode(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
export function safeRead(key: string): string { try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; } }
export function safeWrite(key: string, value: string): void { try { sessionStorage.setItem(key, value); } catch { /* Reading works without storage. */ } }
export async function api<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(endpoint, { cache: 'no-store', signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { code?: string };
    throw new Error(payload.code ?? `HTTP_${response.status}`);
  }
  return response.json() as Promise<T>;
}
export function documentLabel(locale: Locale, doc: Pick<CatalogDocument, 'collection' | 'status' | 'type' | 'editorialRole' | 'normativeScope'>): string {
  const t = (key: string) => translate(locale, key);
  const labels: Record<string, [string, string]> = {
    overview: ['项目概览', 'Overview'], business: ['业务功能', 'Business capability'],
    scenario: ['业务场景', 'Workflow'], standard: ['工程规范', 'Engineering standard'],
    guide: ['操作指南', 'Guide'], example: ['示例', 'Example'], implementation: ['实现说明', 'Implementation'],
    decision: ['长期决定', 'Decision'], history: ['历史资料', 'History'],
  };
  const role = doc.editorialRole ? labels[doc.editorialRole]?.[locale === 'zh-CN' ? 0 : 1] : undefined;
  const kind = doc.collection === 'wiki' ? role ?? typeLabel(locale, doc.type) :
    t(doc.collection === 'spec' ? 'specs' : doc.collection === 'plan' ? 'plans' : 'validation');
  const state = doc.status === 'proposed' || doc.status === 'historical' ? t(doc.status) : '';
  const scope = doc.normativeScope ? (locale === 'zh-CN' ? '适用任务必读' : 'Required in scope') : '';
  return [kind, state, scope].filter(Boolean).join(' · ');
}
export function download(name: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(value: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(value); return true; } catch { return false; }
}
export function documentHref(id: string, fragment = ''): string {
  return `?doc=${encodeURIComponent(id)}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
}
