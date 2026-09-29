import { createServer, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveHarnessRuntimeRoot } from '../core/runtime-layout.ts';
import { containedPath, hash, isExcluded, readSource, slash, walkFiles, wikiConfig } from './files.ts';
import { listKnowledge, queryKnowledge, showKnowledge } from './engine.ts';
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
        const documents = listKnowledge(root, ['wiki', 'spec', 'plan']);
        json(response, 200, { documents: documents.map(({ markdown: _markdown, body: _body, diagrams, ...document }) => ({ ...document, diagrams: diagrams.map(({ code: _code, ...diagram }) => diagram) })) }); return;
      }
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
        const address = new URL(target, `https://wiki.invalid/${fromPath}`);
        if (address.origin !== 'https://wiki.invalid' || address.search || !target || target.includes('\\')) throw new Error('REFERENCE_NOT_ALLOWED');
        const relative = decodeURIComponent(address.pathname).slice(1), file = permittedFile(relative);
        if (!relative.endsWith('.md')) { json(response, 200, { kind: 'attachment', path: relative }); return; }
        if (!relative.startsWith('docs/validation/')) {
          const document = showKnowledge(root, relative);
          json(response, 200, { kind: 'document', id: document.id, path: document.path, status: document.status, fragment: decodeURIComponent(address.hash.slice(1)) }); return;
        }
        if (statSync(file).size > 2_000_000) throw new Error('REFERENCE_TOO_LARGE');
        const markdown = readFileSync(file, 'utf8');
        if (markdown.includes('\0')) throw new Error('REFERENCE_NOT_TEXT');
        json(response, 200, { kind: 'markdown', path: relative, markdown, title: /^#\s+(.+)$/m.exec(markdown)?.[1] ?? path.basename(relative, '.md'), revision: hash(markdown), fragment: decodeURIComponent(address.hash.slice(1)) }); return;
      }
      if (url.pathname === '/api/source') {
        const document = showKnowledge(root, url.searchParams.get('document') ?? '');
        const source = document.sources.find((item) => item.id === url.searchParams.get('id'));
        if (!source) throw new Error('SOURCE_NOT_IN_DOCUMENT');
        json(response, 200, { source, ...readSource(root, config, source) }); return;
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
