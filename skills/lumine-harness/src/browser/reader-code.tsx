import { createContext, useEffect, useRef, useState } from 'react';
import type { Locale } from '../harness/wiki/types.ts';
import { translate, type HighlightResult } from './reader-common.ts';

export type CodeReading = { code: string; title: string; language: string; highlighted?: HighlightResult };
export const CodeReadingContext = createContext<((reading: CodeReading, trigger: HTMLButtonElement) => void) | null>(null);

const highlightCache = new Map<string, Promise<HighlightResult | null>>();
const hex = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
function validHighlight(value: HighlightResult | null, code: string): value is HighlightResult {
  return Boolean(value && Array.isArray(value.tokens)
    && value.tokens.every((line) => Array.isArray(line) && line.every((token) => token && typeof token.content === 'string' && (token.color === undefined || (typeof token.color === 'string' && hex.test(token.color)))))
    && value.tokens.map((line) => line.map((token) => token.content).join('')).join('\n') === code);
}

function highlighter(code: string, language: string): Promise<HighlightResult | null> {
  const query = new URLSearchParams({ language, code }).toString();
  if (query.length > 7900) return Promise.resolve(null);
  const previous = highlightCache.get(query);
  if (previous) return previous;
  const result = fetch(`/api/highlight?${query}`).then(async (response) => {
    if (!response.ok) return null;
    const value = await response.json() as HighlightResult;
    return validHighlight(value, code) ? value : null;
  }).catch(() => null);
  if (highlightCache.size >= 100) highlightCache.delete(highlightCache.keys().next().value!);
  highlightCache.set(query, result);
  return result;
}

/** The original code remains readable if highlighting fails or is unavailable. */
export function useCodeHighlight(code: string, language: string | undefined, highlighted?: HighlightResult) {
  const [syntax, setSyntax] = useState<HighlightResult | null>(highlighted ?? null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSyntax(highlighted ?? null);
    if (highlighted || !language) return;
    let active = true;
    const load = () => { void highlighter(code, language).then((value) => { if (active) setSyntax(value); }); };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: '200px' });
    if (container.current && observer) observer.observe(container.current); else load();
    return () => { active = false; observer?.disconnect(); };
  }, [code, language, highlighted]);
  return { container, syntax: validHighlight(syntax, code) ? syntax : null };
}

export function CodeTokens({ tokens, line }: { tokens: HighlightResult['tokens'][number] | undefined; line: string }) {
  return tokens?.map((token, i) => <span key={i} style={token.color && hex.test(token.color) ? { color: token.color } : undefined}>{token.content}</span>) ?? line;
}

export function CodeLines({ code, locale, wrap, start = 1, highlighted, language, focusStart, focusEnd }: {
  code: string; locale: Locale; wrap: boolean; start?: number;
  highlighted?: HighlightResult; language?: string; focusStart?: number; focusEnd?: number;
}) {
  const { container, syntax } = useCodeHighlight(code, language, highlighted);
  return <div className="source-lines" data-wrap={wrap} role="region" aria-label={translate(locale, 'code')} tabIndex={0} ref={container}>
    {code.split('\n').map((line, index) => {
      const number = start + index;
      const target = focusStart !== undefined && number >= focusStart && number <= (focusEnd ?? focusStart);
      return <div key={number} data-reading-line={number} data-source-line={number} className={target ? 'source-line-target' : undefined}>
        <span className="line-number" aria-hidden="true">{number}</span>
        <code><CodeTokens tokens={syntax?.tokens[index]} line={line} /></code>
      </div>;
    })}
  </div>;
}
