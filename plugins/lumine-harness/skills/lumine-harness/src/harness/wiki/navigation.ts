import path from 'node:path';
import { loadProjectConfig } from '../core/project-config.ts';
import { hash } from './files.ts';
import { NAVIGATION_GROUPS, NAVIGATION_PATH, validateNavigation } from './navigation-contract.ts';
import { visibleText } from './transactions.ts';
import type { CheckIssue, EditorialNavigation, EditorialPlacement, EditorialRole, KnowledgeDocument, Locale, NavigationContent, NavigationGroup, NormativeChange } from './types.ts';

const roles: Record<string, EditorialRole> = {
  overview: 'overview', business: 'business', scenario: 'scenario', 'engineering-standard': 'standard', standard: 'standard', policy: 'standard',
  guide: 'guide', 'engineering-guide': 'guide', example: 'example', 'engineering-example': 'example',
  decision: 'decision', 'domain-language': 'decision', history: 'history'
};
function isHistorical(document: KnowledgeDocument): boolean { return ['historical', 'archived', 'completed'].includes(document.status); }
export function editorialRole(document: KnowledgeDocument, overview?: string | null): EditorialRole {
  if (isHistorical(document)) return 'history';
  if (document.id === overview) return 'overview';
  return Object.hasOwn(roles, document.type) ? roles[document.type] : 'implementation';
}
export function editorialPlacement(document: KnowledgeDocument, navigation: EditorialNavigation): EditorialPlacement {
  if (document.collection !== 'wiki') return {};
  const rule = navigation.norms.find((item) => document.id === item.id && !navigation.issues.some((issue) => issue.severity === 'error' && issue.document === item.id));
  return { editorialRole: editorialRole(document, navigation.overview), ...(rule ? { normativeScope: rule.scope } : {}) };
}
export function validateNavigationTargets(content: NavigationContent, input: Iterable<KnowledgeDocument>): CheckIssue[] {
  const documents = new Map([...input].filter((document) => document.collection === 'wiki').map((document) => [document.id, document]));
  const placements = new Map(content.groups.flatMap((group) => group.sections.flatMap((section) => section.documents.map((id) => [id, group.id] as const))));
  const hidden = new Set(content.unlisted.map((item) => item.id));
  const issues: CheckIssue[] = [];
  const error = (code: string, document: string | undefined, message: string): void => { issues.push({ code, document, severity: 'error', message }); };
  const overview = content.overview ? documents.get(content.overview) : undefined;
  if (!overview || overview.status !== 'current') error('NAVIGATION_OVERVIEW_MISSING', content.overview ?? undefined, 'The homepage requires a current Wiki overview.');
  for (const id of [...placements.keys(), ...hidden]) if (!documents.has(id)) error('NAVIGATION_TARGET_MISSING', id, 'Resolve the page by its stable Wiki ID.');
  for (const [id, document] of documents) {
    if (id !== content.overview && !placements.has(id) && !hidden.has(id)) error('NAVIGATION_UNPLACED', id, 'Add a primary reading position or an explicit reason for omitting it.');
    if (isHistorical(document) && placements.has(id) && placements.get(id) !== 'reference') error('NAVIGATION_HISTORY_PROMOTED', id, 'Place historical pages under reference.');
    if (['business', 'scenario'].includes(document.type) && document.status === 'current' && placements.get(id) !== 'understand' && id !== content.overview)
      error('NAVIGATION_BUSINESS_HIDDEN', id, 'Place current business pages under understand.');
  }
  for (const norm of content.norms) {
    const document = documents.get(norm.id);
    if (!document || document.status !== 'current' || !['standard', 'guide'].includes(editorialRole(document)) || placements.get(norm.id) !== 'operate')
      error('NAVIGATION_NORM_ROLE_CONFLICT', norm.id, 'An authorized norm must be a current standard or guide under operate.');
  }
  return issues;
}

/** The legacy fallback uses page roles and project root only. Coverage never controls reading order. */
function legacyNavigation(wikiRoot: string, locale: Locale, input: KnowledgeDocument[]): NavigationContent {
  const documents = input.filter((document) => document.collection === 'wiki');
  const overview = documents.find((document) => document.path === path.posix.join(wikiRoot, 'README.md') && document.status === 'current') ??
    documents.find((document) => document.type === 'overview' && document.status === 'current');
  const labels = locale === 'zh-CN' ? ['项目知识', '开发与操作指南', '历史资料'] : ['Project knowledge', 'Development and operations guides', 'History'];
  const groups: NavigationGroup[] = NAVIGATION_GROUPS.map((id, index) => {
    const ids = documents.filter((document) => {
      if (document.id === overview?.id) return false;
      const role = editorialRole(document);
      const group = role === 'history' ? 'reference' : ['guide', 'standard', 'example'].includes(role) ? 'operate' : 'understand';
      return group === id;
    }).map((document) => document.id);
    return { id, sections: ids.length ? [{ id: `legacy-${id}`, title: labels[index], documents: ids }] : [] };
  });
  return { schemaVersion: 1, overview: overview?.id ?? null, groups, unlisted: [], norms: [] };
}

export function readNavigation(root: string, documents: KnowledgeDocument[]): EditorialNavigation {
  const config = loadProjectConfig(root);
  const source = visibleText(root, NAVIGATION_PATH);
  if (source === null) return {
    ...legacyNavigation(config.wiki?.root ?? 'docs/repo-wiki', config.locale === 'zh-CN' ? 'zh-CN' : 'en', documents),
    mode: 'legacy', revision: hash(''),
    issues: config.schemaVersion === 4 ? [{ code: 'NAVIGATION_REQUIRED', severity: 'error', message: 'Apply the editorial navigation manifest for this project.' }] : []
  };
  try {
    if (config.schemaVersion !== 4) throw new Error('NAVIGATION_MIGRATION_REQUIRED');
    const content = validateNavigation(JSON.parse(source));
    return { ...content, mode: 'editorial', revision: hash(source), issues: validateNavigationTargets(content, documents) };
  } catch (error) {
    return { ...legacyNavigation(config.wiki?.root ?? 'docs/repo-wiki', config.locale === 'zh-CN' ? 'zh-CN' : 'en', documents),
      mode: 'legacy', revision: hash(source), issues: [{ code: 'NAVIGATION_INVALID', severity: 'error', message: error instanceof SyntaxError ? 'The navigation file is not valid JSON.' : String(error) }] };
  }
}

/** Routine text updates can change evidence, but not authorized requirements or their authority. */
export function assertNormativeChanges(previous: NavigationContent | null, next: NavigationContent | null, before: Map<string, KnowledgeDocument>, after: Map<string, KnowledgeDocument>, changes: NormativeChange[]): void {
  const previousRules = new Map(previous?.norms.map((norm) => [norm.id, norm.scope]));
  const nextRules = new Map(next?.norms.map((norm) => [norm.id, norm.scope]));
  const declared = new Set(changes.map((change) => change.id));
  for (const id of declared) if (!previousRules.has(id) && !nextRules.has(id)) throw new Error(`NORMATIVE_CHANGE_UNREGISTERED:${id}`);
  for (const id of new Set([...previousRules.keys(), ...nextRules.keys()])) {
    const from = before.get(id), to = after.get(id);
    const textChanged = from?.body !== to?.body || from?.title !== to?.title || from?.summary !== to?.summary || from?.type !== to?.type || from?.status !== to?.status;
    if ((textChanged || previousRules.get(id) !== nextRules.get(id)) && !declared.has(id)) throw new Error(`NORMATIVE_CHANGE_REQUIRED:${id}`);
  }
}
