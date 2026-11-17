import { createHash } from 'node:crypto';
import { createCodeHighlighter } from '../vendor/shiki.ts';

export interface HighlightedCode { tokens: Array<Array<{ content: string; color?: string }>>; background: string; foreground: string }
const cache = new Map<string, HighlightedCode>();
let highlighter: ReturnType<typeof createCodeHighlighter> | undefined;
const aliases: Record<string, string> = { ts: 'typescript', js: 'javascript', sh: 'bash', shell: 'bash', yml: 'yaml', md: 'markdown', golang: 'go', vue: 'html', tsx: 'typescript', jsx: 'javascript' };

export async function highlightCode(code: string, language = 'text'): Promise<HighlightedCode> {
  if (code.length > 100_000) throw new Error('CODE_TOO_LARGE');
  const lang = aliases[language.toLowerCase()] ?? language.toLowerCase();
  const key = createHash('sha256').update(lang).update('\0').update(code).digest('hex');
  const previous = cache.get(key);
  if (previous) { cache.delete(key); cache.set(key, previous); return previous; }
  const plain: HighlightedCode = { tokens: code.split('\n').map((content) => [{ content }]), background: '#171715', foreground: '#e4e1d7' };
  let result = plain;
  if (code.length < 50_000 && !code.split('\n').some((line) => line.length > 2000)) {
    try {
      const engine = await (highlighter ??= createCodeHighlighter());
      if (engine.getLoadedLanguages().includes(lang)) {
        const highlighted = engine.codeToTokens(code, { lang, theme: 'vitesse-dark' });
        result = { tokens: highlighted.tokens.map((line) => line.map(({ content, color }) => ({ content, ...(color && /^#[a-f\d]{6,8}$/i.test(color) ? { color } : {}) }))), background: plain.background, foreground: highlighted.fg ?? plain.foreground };
      }
    } catch { /* A grammar failure never hides the underlying code. */ }
  }
  cache.set(key, result);
  while (cache.size > 64) cache.delete(cache.keys().next().value!);
  return result;
}

export const sourceLanguage = (file: string): string => file.split('.').at(-1) ?? 'text';
