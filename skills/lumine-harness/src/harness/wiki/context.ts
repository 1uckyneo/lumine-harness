import { inspectKnowledge } from './engine.ts';
import { listDocuments } from './documents.ts';
import { wikiConfig, relativePath } from './files.ts';
import { readCoverage } from './coverage.ts';
import { readNavigation } from './navigation.ts';
import { resolveAliasReference } from './references.ts';
import { searchKnowledge, searchTerms } from './search.ts';
import { visibleJson, withWikiReadScope } from './transactions.ts';
import type { KnowledgeDocument, Relation, WatchScope } from './types.ts';

const current = (document: KnowledgeDocument) => !['historical', 'archived', 'completed'].includes(document.status);
const within = (scope: WatchScope, file: WatchScope) => scope.repoId === file.repoId && (scope.path === '.' || scope.path === file.path || file.path.startsWith(`${scope.path.replace(/\/$/, '')}/`));
const cardOf = (document: KnowledgeDocument) => ({ id: document.id, title: document.title, path: document.path, revision: document.revision, summary: document.summary });
function graph(root: string, documents: KnowledgeDocument[]) {
  const aliases = visibleJson<Record<string, string>>(root, '.lumine/wiki-state/document-aliases.json', {});
  const resolve = (reference: string) => resolveAliasReference(reference, aliases);
  const coverage = readCoverage(root, documents);
  const edges: { from: string; target: string; kind: Relation['kind'] | 'part_of'; note?: string }[] = documents.flatMap(document => document.relations.map(relation => ({ from: document.id, ...relation, target: resolve(relation.target) })));
  for (const topic of coverage.topics) if (topic.parentId) {
    const parent = coverage.topics.find(item => item.id === topic.parentId)!;
    for (const from of topic.documentRefs) for (const target of parent.documentRefs) if (from !== target) edges.push({ from: resolve(from).split('#')[0], target: resolve(target), kind: 'part_of', note: `${topic.title} → ${parent.title}` });
  }
  return { resolve, edges, coverage };
}

/** Grounded starting context, not an answer generator or a replacement for applicable rules. */
export function contextKnowledge(root: string, question: string, options: { limit?: number; maxChars?: number; reference?: string } = {}) {
  if (typeof question !== 'string' || !question.trim() || question.length > 4000) throw new Error('CONTEXT_QUESTION_REQUIRED');
  const config = wikiConfig(root), limit = options.limit ?? config.maxCards, budget = options.maxChars ?? config.maxContextChars;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30 || !Number.isSafeInteger(budget) || budget < 1000 || budget > 200000) throw new Error('CONTEXT_BUDGET_INVALID');
  return withWikiReadScope(root, () => {
    const { documents, issues } = inspectKnowledge(root, ['wiki', 'spec', 'plan']);
    const { resolve, edges, coverage } = graph(root, documents);
    const navigation = readNavigation(root, documents.filter(document => document.collection === 'wiki'));
    const ranked = searchKnowledge(documents, question, limit, budget);
    const seeds = new Set(ranked.cards.map(card => card.id));
    if (options.reference) {
      const resolved = resolve(options.reference), [id, fragment] = resolved.split('#');
      const document = documents.find(document => document.id === id || document.path === id);
      if (!document || (fragment && ![...document.sections, ...document.diagrams].some(item => item.id === fragment))) throw new Error('CONTEXT_REFERENCE_NOT_FOUND');
      seeds.add(document.id);
      if (!ranked.cards.some(card => card.id === document.id)) ranked.cards.unshift(...searchKnowledge([document], '', 1, budget).cards);
    }
    const terms = searchTerms(question);
    const relatedAll = edges.flatMap(edge => {
      const from = seeds.has(edge.from), to = seeds.has(edge.target.split('#')[0]);
      if (!from && !to) return [];
      const target = from ? edge.target : edge.from;
      const document = documents.find(document => document.id === target.split('#')[0]);
      return document && !seeds.has(document.id) ? [{ ...cardOf(document), reference: target, kind: edge.kind, via: from ? edge.from : edge.target, ...(edge.note ? { reason: edge.note } : {}), direction: from ? 'out' : 'in' }] : [];
    }).filter((entry, index, all) => all.findIndex(other => other.reference === entry.reference && other.kind === entry.kind) === index);
    const related = relatedAll.slice(0, 12);
    const topicMatches = coverage.topics.filter(topic => topic.documentRefs.some(ref => seeds.has(resolve(ref).split('#')[0])) || searchTerms(`${topic.title} ${topic.questions.join(' ')}`).some(term => terms.includes(term)));
    const requiredReading = navigation.norms.flatMap(norm => {
      const document = documents.find(document => document.id === norm.id);
      const linked = seeds.has(norm.id) || relatedAll.some(item => item.id === norm.id);
      const scopeMatch = searchTerms(norm.scope).some(term => terms.includes(term));
      return document && (linked || scopeMatch) ? [{ id: document.id, title: document.title, reference: document.id, path: document.path, scope: norm.scope, readFull: true as const }] : [];
    });
    const result = {
      schemaVersion: 1 as const, question: question.trim(), cards: ranked.cards, related,
      topics: topicMatches.map(({ id, title, questions, documentRefs }) => ({ id, title, questions, documentRefs })),
      requiredReading,
      ruleRouting: { instructions: 'AGENTS.md', index: '.lumine/wiki-state/navigation.json', command: 'wiki map', readApplicableRulesInFull: true },
      followUp: { section: 'wiki show <id#section>', source: 'Read the registered source file and relevant tests.', impact: 'wiki impact <repo:path...>' },
      noAnswer: seeds.size === 0, omitted: { cards: Math.max(0, ranked.total - ranked.cards.length), related: relatedAll.length - related.length, topics: 0 },
      issues, contextChars: 0
    };
    // Keep rule references intact. Remove lower-ranked navigation suggestions before rejecting a tiny budget.
    const size = () => JSON.stringify(result).length;
    while (size() + 16 > budget && result.related.length) { result.related.pop(); result.omitted.related++; }
    while (size() + 16 > budget && result.topics.length) { result.topics.pop(); result.omitted.topics++; }
    while (size() + 16 > budget && result.cards.length > 1) { result.cards.pop(); result.omitted.cards++; }
    if (size() + 16 > budget) throw new Error('CONTEXT_BUDGET_TOO_SMALL');
    while (result.contextChars !== size()) result.contextChars = size();
    return result;
  });
}

/** Paths are supplied by the caller (including deleted paths); this does not rescan a repository or write a decision. */
export function impactKnowledge(root: string, changes: WatchScope[]) {
  const config = wikiConfig(root);
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 1000) throw new Error('IMPACT_CHANGES_REQUIRED');
  const files = changes.map(change => {
    if (!change || !config.repositories.some(repo => repo.id === change.repoId)) throw new Error('IMPACT_REPOSITORY_UNKNOWN');
    return { repoId: change.repoId, path: relativePath(change.path) };
  });
  return withWikiReadScope(root, () => {
    const documents = listDocuments(root, ['wiki'], { includeHistorical: true }).filter(current);
    const { resolve, edges, coverage } = graph(root, documents), navigation = readNavigation(root, documents);
    const reasons = new Map<string, { kind: 'source' | 'scope' | 'topic' | 'relation'; reference: string }[]>();
    const add = (id: string, kind: 'source' | 'scope' | 'topic' | 'relation', reference: string) => {
      if (!documents.some(document => document.id === id)) return;
      const entries = reasons.get(id) ?? [];
      if (!entries.some(entry => entry.kind === kind && entry.reference === reference)) entries.push({ kind, reference });
      reasons.set(id, entries);
    };
    for (const document of documents) for (const file of files) {
      if (document.sources.some(source => within(source, file))) add(document.id, 'source', `${file.repoId}:${file.path}`);
      else if (document.watchScopes.some(scope => within(scope, file))) add(document.id, 'scope', `${file.repoId}:${file.path}`);
    }
    const topics = coverage.topics.filter(topic => topic.sourceScopes.some(scope => files.some(file => within(scope, file))));
    for (const topic of topics) for (const ref of topic.documentRefs) add(resolve(ref).split('#')[0], 'topic', topic.id);
    const directlyAffected = new Set(reasons.keys());
    // Only one relation hop: a candidate is not proof that the entire connected graph changed.
    for (const edge of edges) {
      if (directlyAffected.has(edge.from)) add(edge.target.split('#')[0], 'relation', `${edge.from}:${edge.kind}`);
      if (directlyAffected.has(edge.target.split('#')[0])) add(edge.from, 'relation', `${edge.target}:${edge.kind}`);
    }
    const candidates = [...reasons].map(([id, reasons]) => {
      const document = documents.find(document => document.id === id)!;
      const changedSourceIds = new Set(document.sources.filter(source => files.some(file => within(source, file))).map(source => source.id));
      return { ...cardOf(document), reasons, direct: directlyAffected.has(id),
        sections: document.sections.filter(section => section.sources.some(id => changedSourceIds.has(id))).map(section => `${id}#${section.id}`),
        diagrams: document.diagrams.filter(diagram => diagram.sources.some(id => changedSourceIds.has(id))).map(diagram => `${id}#${diagram.id}`),
        normativeScope: navigation.norms.find(norm => norm.id === id)?.scope,
        reviewTogether: ['body', 'summary', 'diagrams', 'navigation', 'relations', 'sources']
      };
    }).sort((a, b) => Number(b.direct) - Number(a.direct) || a.id.localeCompare(b.id));
    const unmatched = files.filter(file => !documents.some(document => [...document.sources, ...document.watchScopes].some(scope => within(scope, file))) && !topics.some(topic => topic.sourceScopes.some(scope => within(scope, file))));
    return { schemaVersion: 1 as const, changes: files, candidates, topics: topics.map(({ id, title, questions, documentRefs }) => ({ id, title, questions, documentRefs })), unmatched, candidateOnly: true as const };
  });
}
