import { hash } from './files.ts';
import { visibleText } from './transactions.ts';
import type { CoverageContent, CoverageMap, KnowledgeDocument } from './types.ts';
export const COVERAGE_PATH = '.lumine/wiki-state/coverage.json';
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,159}$/u.test(value);
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
export function validateCoverage(value: unknown): CoverageContent {
  const coverage = value as CoverageContent;
  if (!coverage || coverage.schemaVersion !== 1 || !Array.isArray(coverage.topics)) throw new Error('COVERAGE_INVALID');
  const ids = new Set<string>();
  const pageOwners = new Map<string, string>();
  for (const topic of coverage.topics) {
    if (!safeId(topic.id) || ids.has(topic.id) || typeof topic.title !== 'string' || !topic.title.trim() || !stringArray(topic.questions) || !stringArray(topic.documentRefs) || !Array.isArray(topic.sourceScopes) || !['planned', 'partial', 'covered', 'deferred'].includes(topic.status)) throw new Error('COVERAGE_TOPIC_INVALID');
    if (topic.sourceScopes.some((scope) => !scope || !safeId(scope.repoId) || typeof scope.path !== 'string' || !scope.path || scope.path.startsWith('/') || scope.path.split(/[\\/]/).includes('..'))) throw new Error('COVERAGE_SCOPE_INVALID');
    if (topic.status === 'deferred' && !topic.reason?.trim()) throw new Error('COVERAGE_DEFER_REASON_REQUIRED');
    for (const reference of topic.documentRefs) {
      const pageId = reference.split('#')[0];
      if (pageOwners.has(pageId)) throw new Error(`COVERAGE_DOCUMENT_DUPLICATE:${pageId}`);
      pageOwners.set(pageId, topic.id);
    }
    ids.add(topic.id);
  }
  for (const topic of coverage.topics) {
    let cursor = topic, visited = new Set([topic.id]);
    while (cursor.parentId) {
      if (!ids.has(cursor.parentId)) throw new Error('COVERAGE_PARENT_MISSING');
      if (visited.has(cursor.parentId)) throw new Error('COVERAGE_CYCLE');
      visited.add(cursor.parentId); cursor = coverage.topics.find((entry) => entry.id === cursor.parentId)!;
    }
  }
  for (const topic of coverage.topics) if (topic.status === 'covered' && !topic.documentRefs.length) {
    const children = coverage.topics.filter((entry) => entry.parentId === topic.id);
    if (!children.length) throw new Error('COVERAGE_COVERED_WITHOUT_DOCUMENT');
    if (children.some((entry) => entry.status !== 'covered')) throw new Error('COVERAGE_GROUP_INCOMPLETE');
  }
  return coverage;
}
export function readCoverage(root: string, documents: KnowledgeDocument[] = []): CoverageMap {
  const source = visibleText(root, COVERAGE_PATH), content = source === null ? { schemaVersion: 1 as const, topics: [] } : validateCoverage(JSON.parse(source));
  const referenced = new Set(content.topics.flatMap((topic) => topic.documentRefs.map((reference) => reference.split('#')[0])));
  return { ...content, revision: hash(source ?? ''), unmappedDocumentIds: documents.filter((document) => !referenced.has(document.id)).map((document) => document.id) };
}
