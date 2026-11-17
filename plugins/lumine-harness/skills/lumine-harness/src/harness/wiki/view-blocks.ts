import { parseDocument } from 'yaml';

/** The sole, inert article-extension grammar. Ordinary Markdown is never interpreted as a directive. */
export interface ViewCode { language: string; code: string; caption?: string; source?: string; }
interface ViewBase { version: 1; id: string; title?: string; }
export type ViewBlock =
  | (ViewBase & { type: 'steps'; diagram?: string; items: { id: string; title: string; body: string; nodes?: string[]; source?: string; code?: ViewCode }[] })
  | (ViewBase & { type: 'comparison'; columns: { id: string; title: string }[]; rows: { label: string; values: string[] }[] })
  | (ViewBase & { type: 'term'; term: string; meaning: string })
  | (ViewBase & ViewCode & { type: 'code'; collapsed?: boolean })
  | (ViewBase & { type: 'details'; title: string; body: string })
  | (ViewBase & { type: 'explainer'; asset: string; text: string; input?: Record<string, string | number | boolean>; height?: number });

type Row = Record<string, unknown>;
function object(value: unknown, label: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected an object`);
  return value as Row;
}
function keys(row: Row, allowed: string[], label: string) {
  const unknown = Object.keys(row).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label}: unsupported field ${unknown}`);
}
function text(value: unknown, label: string, max = 24000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}: expected nonempty text (max ${max})`);
  return value;
}
function id(value: unknown, label: string): string {
  const result = text(value, label, 100);
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(result)) throw new Error(`${label}: expected a stable identifier`);
  return result;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error(`${label}: expected 1–${max} items`);
  return value;
}
function unique(ids: string[], label: string) { if (new Set(ids).size !== ids.length) throw new Error(`${label}: duplicate identifier`); }
function code(value: unknown): ViewCode {
  const row = object(value, 'code'); keys(row, ['language', 'code', 'caption', 'source'], 'code');
  const result: ViewCode = { language: text(row.language, 'language', 30), code: text(row.code, 'code', 100000) };
  if (!/^[a-zA-Z0-9_+-]+$/.test(result.language)) throw new Error('language: unsupported identifier');
  if (row.caption !== undefined) result.caption = text(row.caption, 'caption', 500);
  if (row.source !== undefined) result.source = id(row.source, 'source');
  return result;
}

export function parseViewBlock(yaml: string): ViewBlock {
  if (yaml.length > 150000) throw new Error('view: content exceeds 150000 characters');
  const document = parseDocument(yaml, { uniqueKeys: true, strict: true, schema: 'core' });
  if (document.errors.length) throw new Error(document.errors[0].message);
  const row = object(document.toJS({ maxAliasCount: 0 }), 'view');
  if (row.version !== 1) throw new Error('view: unsupported version');
  const base: ViewBase = { version: 1, id: id(row.id, 'id') };
  if (row.title !== undefined) base.title = text(row.title, 'title', 160);
  const common = ['version', 'id', 'type', 'title'];
  switch (row.type) {
    case 'steps': {
      keys(row, [...common, 'diagram', 'items'], 'steps');
      const items = array(row.items, 'items', 20).map((value) => {
        const item = object(value, 'step'); keys(item, ['id', 'title', 'body', 'nodes', 'source', 'code'], 'step');
        const result: Extract<ViewBlock, { type: 'steps' }>['items'][number] = { id: id(item.id, 'step.id'), title: text(item.title, 'step.title', 160), body: text(item.body, 'step.body') };
        if (item.nodes !== undefined) result.nodes = array(item.nodes, 'nodes', 20).map((node) => id(node, 'node'));
        if (item.source !== undefined) result.source = id(item.source, 'source');
        if (item.code !== undefined) result.code = code(item.code);
        return result;
      });
      unique(items.map((item) => item.id), 'steps');
      return { ...base, type: 'steps', items, ...(row.diagram !== undefined ? { diagram: id(row.diagram, 'diagram') } : {}) };
    }
    case 'comparison': {
      keys(row, [...common, 'columns', 'rows'], 'comparison');
      const columns = array(row.columns, 'columns', 4).map((value) => {
        const column = object(value, 'column'); keys(column, ['id', 'title'], 'column');
        return { id: id(column.id, 'column.id'), title: text(column.title, 'column.title', 160) };
      });
      unique(columns.map((column) => column.id), 'columns');
      const rows = array(row.rows, 'rows', 30).map((value) => {
        const entry = object(value, 'row'); keys(entry, ['label', 'values'], 'row');
        const values = array(entry.values, 'values', 4).map((value) => text(value, 'value', 5000));
        if (values.length !== columns.length) throw new Error('row: values must correspond to every column');
        return { label: text(entry.label, 'row.label', 160), values };
      });
      return { ...base, type: 'comparison', columns, rows };
    }
    case 'term': keys(row, [...common, 'term', 'meaning'], 'term'); return { ...base, type: 'term', term: text(row.term, 'term', 160), meaning: text(row.meaning, 'meaning', 5000) };
    case 'details': keys(row, [...common, 'body'], 'details'); return { ...base, type: 'details', title: text(row.title, 'title', 160), body: text(row.body, 'body') };
    case 'code': {
      keys(row, [...common, 'language', 'code', 'caption', 'source', 'collapsed'], 'code');
      if (row.collapsed !== undefined && typeof row.collapsed !== 'boolean') throw new Error('collapsed: expected boolean');
      const entry = Object.fromEntries(['language', 'code', 'caption', 'source'].filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
      return { ...base, type: 'code', ...code(entry), ...(row.collapsed !== undefined ? { collapsed: row.collapsed as boolean } : {}) };
    }
    case 'explainer': {
      keys(row, [...common, 'asset', 'text', 'input', 'height'], 'explainer');
      const result: Extract<ViewBlock, { type: 'explainer' }> = { ...base, type: 'explainer', asset: id(row.asset, 'asset'), text: text(row.text, 'text') };
      if (row.height !== undefined) {
        if (!Number.isInteger(row.height) || Number(row.height) < 180 || Number(row.height) > 900) throw new Error('height: expected 180–900');
        result.height = Number(row.height);
      }
      if (row.input !== undefined) {
        const input = object(row.input, 'input');
        if (Object.keys(input).length > 20 || JSON.stringify(input).length > 8000 || Object.values(input).some((value) => !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))) throw new Error('input: expected at most 20 scalar values');
        result.input = input as Record<string, string | number | boolean>;
      }
      return result;
    }
    default: throw new Error('view: unsupported type');
  }
}

/** Plain language remains available for indexing, terminal reading and failed interactive resources. */
export function viewBlockText(block: ViewBlock): string {
  const title = block.title ? `${block.title}\n\n` : '';
  switch (block.type) {
    case 'steps': return title + block.items.map((item, index) => `${index + 1}. ${item.title}\n${item.body}${item.code ? `\n${item.code.code}` : ''}`).join('\n\n');
    case 'comparison': return title + block.rows.map((row) => `${row.label}\n${block.columns.map((column, index) => `${column.title}：${row.values[index]}`).join('\n')}`).join('\n\n');
    case 'term': return `${title}${block.term}：${block.meaning}`;
    case 'code': return `${title}${block.caption ?? ''}\n${block.code}`;
    case 'details': return `${title}${block.body}`;
    case 'explainer': return `${title}${block.text}`;
  }
}

export function viewFences(markdown: string): { line: number; endLine: number; value: string }[] {
  const lines = markdown.split('\n'), result: { line: number; endLine: number; value: string }[] = [];
  let fence: { char: string; size: number; start: number; view: boolean } | null = null;
  for (let index = 0; index < lines.length; index++) {
    if (!fence) {
      const open = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(lines[index]);
      if (open) fence = { char: open[1][0], size: open[1].length, start: index, view: open[2].trim() === 'lumine-view' };
    } else {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[index]);
      if (!close || close[1][0] !== fence.char || close[1].length < fence.size) continue;
      if (fence.view) result.push({ line: fence.start + 1, endLine: index + 1, value: lines.slice(fence.start + 1, index).join('\n') });
      fence = null;
    }
  }
  return result;
}

/** Derived search text; never write this projection back over the Markdown source. */
export function viewMarkdownText(markdown: string): string {
  const lines = markdown.split('\n');
  for (const fence of viewFences(markdown).reverse()) {
    try { lines.splice(fence.line - 1, fence.endLine - fence.line + 1, viewBlockText(parseViewBlock(fence.value))); }
    catch { /* An invalid block remains visible and searchable as its original text. */ }
  }
  return lines.join('\n');
}
