import { marked } from 'marked';
import DOMPurify from 'dompurify';
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
export type ReferenceResult = { kind: 'document' | 'markdown' | 'attachment' | 'source'; id?: string; path: string; markdown?: string; title?: string; revision?: string; fragment?: string; sections?: Section[]; documentId?: string; sourceId?: string; focusStartLine?: number; focusEndLine?: number };
export type SourceResult = { source: SourceRef; text: string; startLine: number; endLine: number; totalLines: number; fingerprint: string; baselineFingerprint: string | null; observedAt: string | null; readAt: string };

const dictionary: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    home: '项目首页', knowledge: '仓库知识', search: '搜索知识', tree: '知识目录', contents: '本页导航',
    relatedDocuments: '关联文档', specs: '产品方案', plans: '执行计划', validation: '验证记录', maintenance: '知识维护',
    browse: '浏览全部知识', overview: '总览入口', topics: '知识主题', continue: '继续阅读',
    projectLibrary: '项目知识库', intro: '从项目全貌理解机制，沿着来源核实结论。',
    queryPlaceholder: '搜索机制、约定或代码标识符…', searchPrompt: '查找你想了解的机制',
    allDocuments: '全体文档', wikiOnly: '仅仓库知识', filters: '筛选', clearFilters: '清除筛选',
    allRepos: '全部仓库', allTypes: '全部类型', allStates: '全部来源状态',
    loading: '正在载入…', loadError: '连接失败，已读内容仍可查看。请检查阅读服务后重试。',
    retry: '重试', empty: '尚未收录知识。可以复制整理指令继续建库。',
    noResults: '未找到相关知识。试试其他关键词，或查看知识目录。',
    copyQuestion: '复制调查问题', copyResume: '复制继续整理指令', copied: '已复制',
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
    sourceSame: '当前文件与知识基线相同；这不等于解释已得到语义核实。',
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
    home: 'Project home', knowledge: 'Repo Wiki', search: 'Search knowledge', tree: 'Knowledge tree', contents: 'On this page',
    relatedDocuments: 'Related documents', specs: 'Product specs', plans: 'Execution plans', validation: 'Validation record', maintenance: 'Knowledge maintenance',
    browse: 'Browse all knowledge', overview: 'Start with an overview', topics: 'Topics', continue: 'Continue reading',
    projectLibrary: 'Project knowledge', intro: 'Understand the system from its map, then follow the sources behind each conclusion.',
    queryPlaceholder: 'Search mechanisms, conventions or code identifiers…', searchPrompt: 'Find a mechanism or decision',
    allDocuments: 'All documents', wikiOnly: 'Repo Wiki only', filters: 'Filters', clearFilters: 'Clear filters',
    allRepos: 'All repositories', allTypes: 'All types', allStates: 'All source states',
    loading: 'Loading…', loadError: 'Connection failed. Read content remains available. Check the reader service and retry.',
    retry: 'Try again', empty: 'No knowledge yet. Copy the continuation prompt to build the wiki.',
    noResults: 'No relevant knowledge found. Try other terms or explore the knowledge tree.',
    copyQuestion: 'Copy investigation question', copyResume: 'Copy continuation prompt', copied: 'Copied',
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
    sourceSame: 'The file matches the knowledge baseline; this does not establish semantic correctness.',
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
export function safeMarkdown(markdown: string): string {
  const renderer = new marked.Renderer();
  renderer.html = () => '';
  const linked = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)').replace(/\]\(source:([^\s)]+)\)/g, '](#source:$1)');
  return DOMPurify.sanitize(marked.parse(linked, { async: false, renderer }) as string, {
    FORBID_TAGS: ['img', 'iframe', 'object', 'embed', 'style', 'script', 'video', 'audio', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'srcset', 'name'], ALLOW_DATA_ATTR: false,
  });
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
