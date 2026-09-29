import { createServer, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveHarnessRuntimeRoot } from '../core/runtime-layout.ts';
import { containedPath, hash, isExcluded, readSource, slash, walkFiles, wikiConfig } from './files.ts';
import { inspectKnowledge, mapKnowledge, queryKnowledge, relatedKnowledge, showKnowledge } from './engine.ts';
import { baselineFor } from './documents.ts';
import { parseSections } from './sections.ts';
import type { Collection, Freshness } from './types.ts';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
function json(response: ServerResponse, status: number, body: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); }
function readerAssets(): string {
  const runtime = resolveHarnessRuntimeRoot(import.meta.url);
  const candidates = [path.join(runtime, 'wiki-reader'), path.join(runtime, '..', 'wiki-reader')];
  const found = candidates.find((directory) => existsSync(path.join(directory, 'index.html')));
  if (!found) throw new Error('WIKI_READER_ASSETS_MISSING');
  return found;
}
export async function serveWiki(root: string, options: { port?: number; assetsRoot?: string } = {}): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  const assets = options.assetsRoot ?? readerAssets(), config = wikiConfig(root);
  let origin = '';
  const server = createServer((request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('cross-origin-resource-policy', 'same-origin');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'none'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (request.headers.host !== origin.replace('http://', '') || (request.headers.origin && request.headers.origin !== origin)) { json(response, 403, { code: 'ORIGIN_REJECTED' }); return; }
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.setHeader('allow', 'GET, HEAD'); json(response, 405, { code: 'READ_ONLY' }); return; }
    try {
      if ((request.url?.length ?? 0) > 8192) throw new Error('REQUEST_TOO_LONG');
      const url = new URL(request.url ?? '/', origin);
      if (url.pathname === '/api/config') { json(response, 200, { locale: config.locale, repositories: config.repositories.map((repo) => ({ id: repo.id })), maxCards: config.maxCards }); return; }
      if (url.pathname === '/api/catalog') {
        const { documents, issues } = inspectKnowledge(root, ['wiki', 'spec', 'plan']);
        json(response, 200, { issues, documents: documents.map(({ markdown: _markdown, body: _body, diagrams, sections, ...document }) => ({ ...document, sections: sections.map(({ body: _sectionBody, ...section }) => section), diagrams: diagrams.map(({ code: _code, ...diagram }) => diagram) })) }); return;
      }
      if (url.pathname === '/api/map') { json(response, 200, mapKnowledge(root)); return; }
      if (url.pathname === '/api/related') { json(response, 200, relatedKnowledge(root, url.searchParams.get('id') ?? '')); return; }
      if (url.pathname === '/api/query') {
        const collection = url.searchParams.get('collection') ?? 'wiki';
        if (!['wiki', 'spec', 'plan'].includes(collection)) throw new Error('COLLECTION_INVALID');
        json(response, 200, queryKnowledge(root, url.searchParams.get('q') ?? '', { limit: Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 6)), collection: collection as Collection, repoId: url.searchParams.get('repo') ?? undefined, type: url.searchParams.get('type') ?? undefined, freshness: url.searchParams.get('freshness') as Freshness | null ?? undefined })); return;
      }
      if (url.pathname === '/api/document') { json(response, 200, showKnowledge(root, url.searchParams.get('id') ?? '')); return; }
      if (url.pathname === '/api/reference') {
        const allowed = [config.root, 'docs/product-specs', 'docs/exec-plans', 'docs/validation'];
        const permittedFile = (relative: string): string => {
          const directory = allowed.find((base) => relative.startsWith(`${base}/`));
          if (!directory || isExcluded(relative)) throw new Error('REFERENCE_NOT_ALLOWED');
          const base = containedPath(root, directory), file = containedPath(base, relative.slice(directory.length + 1));
          const realRelative = slash(path.relative(realpathSync(root), realpathSync(file)));
          if (!statSync(file).isFile() || !walkFiles(root, relative, 1).includes(relative) || !walkFiles(root, realRelative, 1).includes(realRelative)) throw new Error('REFERENCE_EXCLUDED');
          return file;
        };
        const from = url.searchParams.get('from') ?? '', target = url.searchParams.get('target') ?? '';
        let fromPath: string;
        if (from.startsWith('docs/validation/') && from.endsWith('.md')) { permittedFile(from); fromPath = from; }
        else fromPath = showKnowledge(root, from).path;
        if (target.startsWith('source:')) {
          const document = showKnowledge(root, from), source = document.sources.find((item) => item.id === target.slice(7));
          if (!source) throw new Error('SOURCE_NOT_IN_DOCUMENT');
          json(response, 200, { kind: 'source', path: source.path, documentId: document.id, sourceId: source.id }); return;
        }
        const address = new URL(target, `https://wiki.invalid/${fromPath}`);
        if (address.origin !== 'https://wiki.invalid' || address.search || !target || target.includes('\\')) throw new Error('REFERENCE_NOT_ALLOWED');
        const relative = decodeURIComponent(address.pathname).slice(1);
        // Relative Markdown source links remain useful in raw files. Resolve only
        // declarations owned by this document; never turn the reader into a file server.
        if (!allowed.some((base) => relative.startsWith(`${base}/`)) || /^L\d/.test(decodeURIComponent(address.hash.slice(1)))) {
          const document = showKnowledge(root, from);
          const requestedFile = path.resolve(root, relative), fragment = decodeURIComponent(address.hash.slice(1));
          const lineRange = fragment ? /^L([1-9]\d*)(?:-L?([1-9]\d*))?$/.exec(fragment) : null;
          if (fragment && !lineRange) throw new Error('SOURCE_REFERENCE_FRAGMENT_INVALID');
          const startLine = lineRange ? Number(lineRange[1]) : undefined, endLine = lineRange ? Number(lineRange[2] ?? lineRange[1]) : undefined;
          if (startLine !== undefined && (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || endLine! < startLine)) throw new Error('SOURCE_RANGE_INVALID');
          const matches = document.sources.filter((source) => {
            const repository = config.repositories.find((item) => item.id === source.repoId);
            return repository && path.resolve(root, repository.path, source.path) === requestedFile;
          });
          if (!matches.length) throw new Error('SOURCE_NOT_IN_DOCUMENT');
          const candidates = matches.map((source) => ({ source, excerpt: readSource(root, config, source) }))
            .filter(({ excerpt }) => startLine === undefined || (startLine >= excerpt.startLine && endLine! <= excerpt.endLine))
            .sort((a, b) => (a.excerpt.endLine - a.excerpt.startLine) - (b.excerpt.endLine - b.excerpt.startLine));
          if (!candidates.length) throw new Error('SOURCE_RANGE_INVALID');
          if (!fragment && candidates.length > 1) throw new Error('SOURCE_REFERENCE_AMBIGUOUS');
          const { source } = candidates[0];
          json(response, 200, { kind: 'source', path: source.path, documentId: document.id, sourceId: source.id, focusStartLine: startLine, focusEndLine: endLine }); return;
        }
        const file = permittedFile(relative);
        if (!relative.endsWith('.md')) { json(response, 200, { kind: 'attachment', path: relative }); return; }
        if (!relative.startsWith('docs/validation/')) {
          const document = showKnowledge(root, relative);
          json(response, 200, { kind: 'document', id: document.id, path: document.path, status: document.status, fragment: decodeURIComponent(address.hash.slice(1)) }); return;
        }
        if (statSync(file).size > 2_000_000) throw new Error('REFERENCE_TOO_LARGE');
        const markdown = readFileSync(file, 'utf8');
        if (markdown.includes('\0')) throw new Error('REFERENCE_NOT_TEXT');
        json(response, 200, { kind: 'markdown', path: relative, markdown, title: /^#\s+(.+)$/m.exec(markdown)?.[1] ?? path.basename(relative, '.md'), revision: hash(markdown), sections: parseSections(markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')), fragment: decodeURIComponent(address.hash.slice(1)) }); return;
      }
      if (url.pathname === '/api/source') {
        const document = showKnowledge(root, url.searchParams.get('document') ?? '');
        const source = document.sources.find((item) => item.id === url.searchParams.get('id'));
        if (!source) throw new Error('SOURCE_NOT_IN_DOCUMENT');
        const baseline = baselineFor(root, document.id);
        json(response, 200, { source, ...readSource(root, config, source), baselineFingerprint: baseline?.sources.fingerprints[`${source.repoId}:${source.path}`] ?? null, observedAt: document.checkedAt, readAt: new Date().toISOString() }); return;
      }
      if (url.pathname.startsWith('/api/')) { json(response, 404, { code: 'ENDPOINT_NOT_FOUND' }); return; }
      const raw = decodeURIComponent(url.pathname), relative = raw === '/' ? 'index.html' : raw.slice(1);
      if (!relative || relative.split('/').some((segment) => segment === '..' || segment.startsWith('.')) || !MIME[path.extname(relative)]) throw new Error('ASSET_NOT_ALLOWED');
      const file = containedPath(assets, relative);
      if (!statSync(file).isFile()) throw new Error('ASSET_NOT_FOUND');
      response.writeHead(200, { 'content-type': MIME[path.extname(file)], 'cache-control': 'no-cache' });
      if (request.method === 'HEAD') response.end(); else response.end(readFileSync(file));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'REQUEST_FAILED';
      // Never expose absolute host paths or filesystem stacks through the browser.
      const safe = /^[A-Z0-9_:-]+$/.test(code) ? code : 'REQUEST_FAILED';
      json(response, /NOT_FOUND|NOT_IN_DOCUMENT/.test(safe) ? 404 : 400, { code: safe });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4318, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') { reject(new Error('SERVER_ADDRESS_INVALID')); return; } origin = `http://127.0.0.1:${address.port}`; resolve(); }); });
  return { server, url: origin, close: () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeIdleConnections?.(); }) };
}
