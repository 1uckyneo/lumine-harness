import { useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '../harness/wiki/types.ts';
import { parseViewBlock, type ViewBlock } from '../harness/wiki/view-blocks.ts';
import { translate, type HighlightResult } from './reader-common.ts';
import { CodeReadingContext, CodeTokens, useCodeHighlight } from './reader-code.tsx';
import styles from './article.module.css';

export function CodeSnippet({ code, language = 'text', locale, caption, source, onSource, highlighted, readingLine }: {
  code: string; language?: string; locale: Locale; caption?: string; source?: string; onSource?: (id: string) => void;
  highlighted?: HighlightResult; readingLine?: string;
}) {
  const { container, syntax } = useCodeHighlight(code, language, highlighted);
  const readCode = useContext(CodeReadingContext);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const zh = locale === 'zh-CN';
  const title = caption || (language === 'text' ? translate(locale, 'code') : language);
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); } }, [copied]);
  return <div className={`article-code ${styles.code}`} ref={container} data-reading-line={readingLine}>
    <div className={styles.codeToolbar}><span>{title}</span><div>
      {source && onSource && <button type="button" onClick={() => onSource(source)}>{zh ? '查看来源' : 'View source'}</button>}
      {readCode && <button type="button" onClick={(event) => readCode({ code, language, title, highlighted: syntax ?? undefined }, event.currentTarget)}>{translate(locale, 'readCode')}</button>}
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(code).then(() => { setCopied(true); setCopyError(false); }).catch(() => setCopyError(true)); if (!navigator.clipboard) setCopyError(true); }}>{copied ? (zh ? '已复制' : 'Copied') : (zh ? '复制代码' : 'Copy code')}</button>
    </div></div>
    {copyError && <p role="status" className={styles.codeStatus}>{zh ? '无法访问剪贴板，请选择下方代码复制。' : 'Clipboard unavailable. Select the code below to copy it.'}</p>}
    <pre tabIndex={0} aria-label={caption || (zh ? '代码，可横向滚动' : 'Code, horizontally scrollable')}><code>{syntax ? syntax.tokens.map((line, index) => <span className={styles.codeLine} key={index}><CodeTokens tokens={line} line="" />{index < syntax.tokens.length - 1 ? '\n' : ''}</span>) : code}</code></pre>
  </div>;
}

function Explainer({ block, documentId, locale, prose }: { block: Extract<ViewBlock, { type: 'explainer' }>; documentId: string; locale: Locale; prose: (text: string) => ReactNode }) {
  const [opened, setOpened] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [available, setAvailable] = useState(false);
  const [height, setHeight] = useState(block.height ?? 420);
  const frame = useRef<HTMLIFrameElement>(null);
  const zh = locale === 'zh-CN';
  const title = block.title || (zh ? '交互解释' : 'Interactive explanation');
  const url = `/api/explainer?${new URLSearchParams({ document: documentId, asset: block.asset })}`;
  useEffect(() => {
    if (!opened) { setAvailable(false); return; }
    const controller = new AbortController();
    setFailed(false); setLoaded(false);
    void fetch(url, { method: 'HEAD', signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return;
      if (response.ok && response.headers.get('content-type')?.includes('text/html')) setAvailable(true);
      else setFailed(true);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [opened, url]);
  useEffect(() => {
    if (!opened) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object' || event.data.asset !== block.asset) return;
      if (event.data.type === 'lumine:resize' && Number.isInteger(event.data.height) && event.data.height >= 180 && event.data.height <= 900) setHeight(event.data.height);
      if (event.data.type === 'lumine:ready') { setLoaded(true); setFailed(false); frame.current?.contentWindow?.postMessage({ type: 'lumine:input', asset: block.asset, input: block.input ?? {}, locale, theme: 'warm' }, '*'); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [opened, block, locale]);
  useEffect(() => {
    if (!opened || loaded) return;
    const timer = setTimeout(() => setFailed(true), 10000);
    return () => clearTimeout(timer);
  }, [opened, loaded]);
  return <section id={block.id} className={styles.explainer} tabIndex={-1} aria-label={title}>
    {block.title && <h3>{block.title}</h3>}
    {prose(block.text)}
    {!opened ? <button className={styles.exploreButton} type="button" onClick={() => { setOpened(true); setFailed(false); }}>{zh ? '打开交互示例' : 'Explore the interactive example'}</button> : <>
      {!loaded && !failed && <p role="status">{zh ? '正在加载交互示例…' : 'Loading the interactive example…'}</p>}
      {failed && <p role="status">{zh ? '交互示例暂时无法显示，上方说明仍可完整阅读。' : 'The interactive example is unavailable. The complete explanation remains above.'}</p>}
      {available && <iframe ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" src={url} style={{ height }} onLoad={() => { setLoaded(true); frame.current?.contentWindow?.postMessage({ type: 'lumine:input', asset: block.asset, input: block.input ?? {}, locale, theme: 'warm' }, '*'); }} onError={() => setFailed(true)} />}
      <button type="button" onClick={() => { setOpened(false); setLoaded(false); }}>{zh ? '收起交互示例' : 'Close interactive example'}</button>
    </>}
  </section>;
}

function Steps({ block, locale, prose, onSource }: { block: Extract<ViewBlock, { type: 'steps' }>; locale: Locale; prose: (text: string) => ReactNode; onSource: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const zh = locale === 'zh-CN';
  const focus = (item: typeof block.items[number]) => {
    setSelected(item.id);
    if (!block.diagram || !item.nodes?.length) return;
    window.dispatchEvent(new CustomEvent('lumine:diagram-focus', { detail: { diagramId: block.diagram, nodeIds: item.nodes, stepId: `${block.id}-${item.id}` } }));
    document.getElementById(block.diagram)?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <section id={block.id} className={styles.steps} tabIndex={-1} aria-label={block.title}>
    {block.title && <h3>{block.title}</h3>}
    <ol>{block.items.map((item, index) => <li key={item.id} id={`${block.id}-${item.id}`} data-selected={selected === item.id}>
      <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
      <div><h3>{item.title}</h3>{prose(item.body)}
        <div className={styles.stepActions}>
          {block.diagram && item.nodes?.length ? <button type="button" aria-pressed={selected === item.id} onClick={() => focus(item)}>{zh ? '在图中查看这一步' : 'Locate this step in the diagram'}</button> : null}
          {item.source && <button type="button" onClick={() => onSource(item.source!)}>{zh ? '查看来源' : 'View source'}</button>}
        </div>
        {item.code && <details className={styles.detail}><summary>{item.code.caption || (zh ? '展开实现' : 'Show implementation')}</summary><CodeSnippet {...item.code} locale={locale} onSource={onSource} /></details>}
      </div>
    </li>)}</ol>
  </section>;
}

export function ArticleView({ value, documentId, locale, prose, onSource }: {
  value: string; documentId: string; locale: Locale; prose: (text: string) => ReactNode; onSource: (id: string) => void;
}) {
  let block: ViewBlock;
  try { block = parseViewBlock(value); }
  catch { return <aside className={styles.invalid} role="note"><p>{locale === 'zh-CN' ? '这段展示内容暂时无法排版，原文已保留。' : 'This content could not be formatted. Its original text is preserved.'}</p><details><summary>{locale === 'zh-CN' ? '查看原文' : 'View original'}</summary><pre>{value}</pre></details></aside>; }
  switch (block.type) {
    case 'steps': return <Steps block={block} locale={locale} prose={prose} onSource={onSource} />;
    case 'comparison': return <section id={block.id} tabIndex={-1} className={styles.comparison}>{block.title && <h3>{block.title}</h3>}<div className="table-scroll" tabIndex={0}><table><thead><tr><th scope="col">{locale === 'zh-CN' ? '比较项' : 'Aspect'}</th>{block.columns.map((column) => <th key={column.id} scope="col">{column.title}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}><th scope="row">{row.label}</th>{row.values.map((value, column) => <td key={column}>{prose(value)}</td>)}</tr>)}</tbody></table></div></section>;
    case 'term': return <details id={block.id} className={styles.term}><summary>{block.term}</summary>{prose(block.meaning)}</details>;
    case 'details': return <details id={block.id} className={styles.detail}><summary>{block.title}</summary>{prose(block.body)}</details>;
    case 'code': {
      const snippet = <CodeSnippet {...block} locale={locale} onSource={onSource} />;
      return block.collapsed ? <details id={block.id} className={styles.detail}><summary>{block.title || block.caption || (locale === 'zh-CN' ? '展开代码' : 'Show code')}</summary>{snippet}</details> : <section id={block.id}>{block.title && <h3>{block.title}</h3>}{snippet}</section>;
    }
    case 'explainer': return <Explainer block={block} documentId={documentId} locale={locale} prose={prose} />;
  }
}
