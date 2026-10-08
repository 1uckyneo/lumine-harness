import type { KnowledgeCard, KnowledgeMatch, ReaderDocument, Section } from './types.ts';
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const STOP = new Set(('a an and are as at be by can could do does for from how i in into is it me my of on or our please should that the their this to was we what when where which who why will with would you your 这个 那个 这些 那些 怎么 怎样 如何 为什么 什么 是否 可以 需要 进行 处理 提示 页面 项目 功能 使用 相关 一个 一下 我们 以及 还有').split(' '));
function stem(word: string): string {
  if (!/^[a-z]{4,}$/.test(word)) return word;
  return word.replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, '');
}
export function searchTerms(text: string): string[] {
  const normalized = text.normalize('NFKC').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLocaleLowerCase();
  const raw: string[] = [];
  for (const item of normalized.match(/[a-z0-9_.:/-]+|[\p{Script=Han}]+/gu) ?? []) {
    if (/\p{Script=Han}/u.test(item)) {
      for (const part of segmenter.segment(item)) if (part.isWordLike) raw.push(part.segment);
    } else { raw.push(item); raw.push(...item.split(/[_.:/-]+/)); }
  }
  return [...new Set(raw.filter((term) => term.length > 1 && !STOP.has(term)).map(stem).filter(Boolean))];
}
const sentenceSegmenter = new Intl.Segmenter('zh', { granularity: 'sentence' });
function plain(text: string): string {
  const lines: string[] = [];
  let fence: { char: string; size: number; diagram: boolean } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2].trim()) fence = null;
      else if (!fence.diagram) lines.push(line);
      continue;
    }
    if (marker) { fence = { char: marker[1][0], size: marker[1].length, diagram: /^mermaid(?:\s|$)/i.test(marker[2].trim()) }; continue; }
    if (/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(line) || /^ {0,3}\[[^\]]+\]:\s+/.test(line)) continue;
    lines.push(line);
  }
  // Keep code verbatim while removing surrounding presentation syntax. An underscore
  // can be part of task_id, __init__ or another identifier, never strip it globally.
  const code: string[] = [];
  let result = lines.join('\n').replace(/(`+)([^\n]*?)\1/g, (_match, _ticks, value: string) => `\uE000${code.push(value) - 1}\uE001`);
  result = result.replace(/<a\s+id=[^>]*>\s*<\/a>/g, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!?\[([^\]\n]*)\]\((?:\\.|[^()\\]|\([^()]*\))*\)/g, '$1')
    .replace(/!?\[([^\]\n]*)\]\[[^\]\n]*\]/g, '$1')
    .replace(/^ {0,3}#{1,6}\s+/gm, '').replace(/^\s*\|(.+)\|\s*$/gm, (_match, cells: string) => cells.split('|').map(cell => cell.trim()).join('；') + '。')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*(?=\s|[，。,.!?！？]|$)/g, '$1$2');
  result = result.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => code[Number(index)]);
  return result.replace(/\s+/g, ' ').trim();
}
function snippet(text: string, query: string[], maxChars = 560): string {
  const clean = plain(text);
  if (clean.length <= maxChars) return clean;
  let position = -1;
  for (const term of query) { const found = clean.toLowerCase().indexOf(term); if (found >= 0 && (position < 0 || found < position)) position = found; }
  const sentences = [...sentenceSegmenter.segment(clean)];
  const selected = Math.max(0, sentences.findIndex(sentence => position >= sentence.index && position < sentence.index + sentence.segment.length));
  let start = sentences[selected]?.index ?? 0, end = start + (sentences[selected]?.segment.length ?? 0);
  // A reference and page summary are better than half a sentence that loses its condition or negation.
  if (end - start > maxChars - 2) return '';
  for (let index = selected - 1; index >= 0 && end - sentences[index].index <= maxChars - 2; index--) start = sentences[index].index;
  for (let index = selected + 1; index < sentences.length && sentences[index].index + sentences[index].segment.length - start <= maxChars - 2; index++) end = sentences[index].index + sentences[index].segment.length;
  return `${start ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}
function directBody(document: ReaderDocument, section: Section): string {
  const child = document.sections.find((item) => item.startLine > section.startLine && item.startLine <= section.endLine);
  return child ? document.body.split(/\r?\n/).slice(section.startLine - 1, child.startLine - 1).join('\n') : section.body;
}
export function searchKnowledge(documents: ReaderDocument[], query: string, limit: number, budget: number, offset = 0, bounded = true): { query: string; cards: KnowledgeCard[]; total: number; contextChars: number; noAnswer: boolean } {
  const terms = searchTerms(query);
  if (!terms.length && query.trim()) return { query, cards: [], total: 0, contextChars: 2, noAnswer: true };
  const entries = documents.map((document) => {
    const titleTerms = searchTerms(`${document.title} ${document.aliases.join(' ')} ${document.tags.join(' ')}`);
    const metadata = `${document.summary} ${document.sources.map((source) => source.path + ' ' + (source.note ?? '')).join(' ')} ${document.relations.map((relation) => relation.target + ' ' + (relation.note ?? '')).join(' ')} ${document.diagrams.map((diagram) => `${diagram.title} ${diagram.caption} ${diagram.code}`).join(' ')}`;
    const sections = document.sections.length ? document.sections : [{ id: '', title: document.title, body: document.body, startLine: 1, endLine: document.body.split('\n').length, level: 1, stable: false, sources: [] }];
    return { document, titleTerms, metadata, sections: sections.map((section) => ({ section, text: directBody(document, section), tokens: searchTerms(directBody(document, section)) })) };
  });
  const frequency = new Map<string, number>();
  for (const term of terms) frequency.set(term, entries.filter((entry) => entry.titleTerms.includes(term) || searchTerms(entry.metadata).includes(term) || entry.sections.some((section) => section.tokens.includes(term))).length);
  const ranked = entries.map((entry) => {
    const metadata = searchTerms(entry.metadata);
    const matchSet = new Set<string>();
    const sectionScores = entry.sections.map(({ section, text, tokens }) => {
      let score = 0;
      for (const term of terms) {
        const inTitle = entry.titleTerms.includes(term), inSection = searchTerms(section.title).includes(term), inBody = tokens.includes(term), inMeta = metadata.includes(term);
        if (inTitle || inSection || inBody || inMeta) matchSet.add(term);
        const idf = Math.log(1 + (entries.length + 1) / ((frequency.get(term) ?? 0) + 1));
        score += idf * (inTitle ? 5 : 0) + idf * (inSection ? 3 : 0) + idf * (inBody ? 2 / (0.8 + tokens.length / 300) : 0) + idf * (inMeta ? 0.35 : 0);
      }
      return { section, text, score };
    }).sort((a, b) => b.score - a.score || a.section.startLine - b.section.startLine);
    const matched = [...matchSet], coverage = terms.length ? matched.length / terms.length : 1;
    const score = (sectionScores[0]?.score ?? 0) * coverage;
    return { ...entry, matched, score, sectionScores, relevant: !terms.length || (matched.length > 0 && coverage >= 0.25) };
  }).filter((entry) => entry.relevant).sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title));
  const cards: KnowledgeCard[] = [];
  for (const entry of ranked.slice(offset)) {
    if (cards.length >= limit) break;
    const document = entry.document;
    const matches: KnowledgeMatch[] = entry.sectionScores.filter((section) => section.score > 0 || !terms.length).slice(0, 2).map(({ section, text }) => ({ sectionId: section.id, title: section.title, excerpt: snippet(text || section.body, terms), reference: section.id ? `${document.id}#${section.id}` : document.id }));
    const sectionSources = new Set(entry.sectionScores.slice(0, 2).flatMap((item) => item.section.sources));
    const sources = (sectionSources.size ? document.sources.filter((source) => sectionSources.has(source.id)) : document.sources).slice(0, 3);
    const item: KnowledgeCard = { id: document.id, title: document.title, summary: document.summary, type: document.type, status: document.status, collection: document.collection, locale: document.locale, path: document.path, revision: document.revision, freshness: document.freshness, repositories: document.repositories, tags: document.tags, sources, relations: document.relations.slice(0, 4), diagramIds: document.diagrams.map((diagram) => diagram.id), diagramTypes: [...new Set(document.diagrams.map((diagram) => diagram.code.split(/\s+/)[0]))], reason: entry.matched.join(', '), matches, checkedAt: document.checkedAt, sourceObservation: document.sourceObservation, semanticReview: document.semanticReview };
    if (bounded && JSON.stringify([...cards, item]).length > budget) { item.matches = item.matches.slice(0, 1).map((match) => ({ ...match, excerpt: snippet(match.excerpt, terms, 160) })); item.sources = item.sources.slice(0, 1); item.relations = []; item.summary = snippet(item.summary, terms, 180); }
    if (!bounded || JSON.stringify([...cards, item]).length <= budget) cards.push(item);
  }
  return { query, cards, total: ranked.length, contextChars: JSON.stringify(cards).length, noAnswer: ranked.length === 0 };
}

/** Browser pagination has its own bounded page size and never consumes the Agent context budget. */
export function searchKnowledgePage(documents: ReaderDocument[], query: string, limit: number, offset: number): { query: string; cards: KnowledgeCard[]; total: number; hasMore: boolean } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('SEARCH_PAGE_INVALID');
  const result = searchKnowledge(documents, query, limit, 1, offset, false);
  return { query, cards: result.cards, total: result.total, hasMore: offset + result.cards.length < result.total };
}
