import type { CoverageMap, CoverageTopic, Section } from './types.ts';

export type TopicNode = { topic: CoverageTopic; children: TopicNode[] };
export function splitReference(reference: string): { id: string; fragment: string } {
  const index = reference.indexOf('#');
  return index < 0 ? { id: reference, fragment: '' } : { id: reference.slice(0, index), fragment: reference.slice(index + 1) };
}
export function topicPath(topics: CoverageTopic[], id: string): CoverageTopic[] {
  const result: CoverageTopic[] = [], seen = new Set<string>();
  let topic = topics.find((item) => item.id === id);
  while (topic && !seen.has(topic.id)) {
    seen.add(topic.id); result.unshift(topic);
    topic = topics.find((item) => item.id === topic!.parentId);
  }
  return result;
}
export function topicForDocument(map: CoverageMap, id: string): CoverageTopic | undefined {
  return map.topics.find((topic) => topic.documentRefs.some((reference) => splitReference(reference).id === id));
}
export function topicTree(map: CoverageMap): { roots: TopicNode[]; unresolved: CoverageTopic[] } {
  const ids = new Set(map.topics.map((topic) => topic.id)), visited = new Set<string>();
  const visit = (parentId?: string): TopicNode[] => map.topics.filter((topic) => topic.parentId === parentId).flatMap((topic) => {
    if (visited.has(topic.id)) return [];
    visited.add(topic.id); return [{ topic, children: visit(topic.id) }];
  });
  const roots = visit();
  return { roots, unresolved: map.topics.filter((topic) => !visited.has(topic.id) || (topic.parentId && !ids.has(topic.parentId))) };
}
export function coverageSummary(map: CoverageMap, documentIds: Set<string>): { total: number; covered: number; partial: number; planned: number; deferred: number; missing: string[] } {
  const missing = [...new Set(map.topics.flatMap((topic) => topic.documentRefs.filter((reference) => !documentIds.has(splitReference(reference).id))))];
  return { total: map.topics.length, covered: map.topics.filter((topic) => topic.status === 'covered').length,
    partial: map.topics.filter((topic) => topic.status === 'partial').length, planned: map.topics.filter((topic) => topic.status === 'planned').length,
    deferred: map.topics.filter((topic) => topic.status === 'deferred').length, missing };
}
/** The parser owns heading identity. The browser never invents a different slug. */
export function headingSections(sections: Section[], levels: number[]): (Section | null)[] {
  let cursor = 0;
  return levels.map((level) => {
    const section = sections[cursor];
    if (!section || section.level !== level) return null;
    cursor += 1; return section;
  });
}
