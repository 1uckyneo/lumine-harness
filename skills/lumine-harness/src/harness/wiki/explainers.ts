import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { containedPath, hash, wikiConfig } from './files.ts';

export interface ExplainerAsset { id: string; documentId: string; path: string; title: string; text: string }
export function readExplainer(root: string, documentId: string, id: string): { asset: ExplainerAsset; html: string } {
  const base = containedPath(root, `${wikiConfig(root).root}/assets`);
  const file = containedPath(base, 'registry.json');
  if (statSync(file).size > 256_000) throw new Error('EXPLAINER_REGISTRY_TOO_LARGE');
  const registry = JSON.parse(readFileSync(file, 'utf8')) as { schemaVersion?: unknown; entries?: ExplainerAsset[] };
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.entries)) throw new Error('EXPLAINER_REGISTRY_INVALID');
  const seen = new Set<string>();
  for (const item of registry.entries) {
    if (!item || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.id) || seen.has(item.id) || !item.documentId || !item.title?.trim() || !item.text?.trim() || !/\.html$/i.test(item.path) || path.isAbsolute(item.path) || item.path.includes('\\')) throw new Error('EXPLAINER_REGISTRY_INVALID');
    seen.add(item.id);
  }
  const asset = registry.entries.find((item) => item.id === id && item.documentId === documentId);
  if (!asset) throw new Error('EXPLAINER_NOT_REGISTERED');
  const target = containedPath(base, asset.path);
  if (!statSync(target).isFile() || statSync(target).size > 512_000) throw new Error('EXPLAINER_TOO_LARGE');
  const html = readFileSync(target, 'utf8');
  if (html.includes('\0')) throw new Error('EXPLAINER_NOT_TEXT');
  return { asset, html };
}

// Opaque sandbox origin: inline presentation scripts may run, but cannot reach
// the host DOM, storage, network, forms, popups, or business endpoints.
export const EXPLAINER_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

interface ReaderFontBundle { css: string; files: Map<string, string> }
const FONT_PATH = /^fonts\/(?:noto-(?:serif|sans)-sc|ibm-plex-mono)-[A-Za-z0-9_.-]+\.woff2$/;
const FONT_FAMILY = /font-family\s*:\s*["']?(Noto Serif SC Variable|Noto Sans SC Variable|IBM Plex Mono)["']?\s*(?:;|$)/;
const FONT_THEME = ':root{--lumine-font-sans:"Noto Sans SC Variable",sans-serif;--lumine-font-serif:"Noto Serif SC Variable",serif;--lumine-font-mono:"IBM Plex Mono","Noto Sans SC Variable",monospace}body{font-family:var(--lumine-font-sans)}h1,h2,h3,h4{font-family:var(--lumine-font-serif)}code,pre{font-family:var(--lumine-font-mono)}button,input,select,textarea{font-family:inherit}';

/** Only shipped, hash-verified WOFF2 declarations become available to opaque frames. */
export function explainerFonts(assets: string): {
  decorate: (html: string, origin: string) => { html: string; csp: string };
  read: (pathname: string) => { bytes: Buffer; fingerprint: string } | null;
} {
  let saved: { key: string; bundle: ReaderFontBundle } | null = null;
  const bundle = (): ReaderFontBundle => {
    // Minimal custom reader fixtures do not promise the bundled typography.
    if (!existsSync(path.join(assets, 'manifest.json'))) return { css: '', files: new Map() };
    const manifestFile = containedPath(assets, 'manifest.json');
    const info = statSync(manifestFile);
    if (!info.isFile() || info.size > 2_000_000) throw new Error('READER_FONT_MANIFEST_INVALID');
    const stylesheet = containedPath(assets, 'reader.css'), cssInfo = statSync(stylesheet);
    if (!cssInfo.isFile() || cssInfo.size > 2_000_000) throw new Error('READER_FONT_STYLES_INVALID');
    const key = `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}/${cssInfo.ino}:${cssInfo.size}:${cssInfo.mtimeMs}:${cssInfo.ctimeMs}`;
    if (saved?.key === key) return saved.bundle;
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as { schemaVersion?: unknown; files?: Record<string, unknown> };
    if (manifest.schemaVersion !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('READER_FONT_MANIFEST_INVALID');
    const expected = manifest.files['reader.css'];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('READER_FONT_STYLES_INVALID');
    const css = readFileSync(stylesheet, 'utf8');
    if (hash(css) !== expected) throw new Error('READER_FONT_STYLES_CHANGED');
    const files = new Map<string, string>(), rules: string[] = [];
    for (const match of css.matchAll(/@font-face\s*\{([^{}]*)\}/g)) {
      const body = match[1], family = FONT_FAMILY.exec(body)?.[1];
      if (!family) continue;
      const resource = /url\(\s*["']?\.\/(fonts\/[A-Za-z0-9_.-]+\.woff2)["']?\s*\)/.exec(body)?.[1];
      const weight = /font-weight\s*:\s*(\d{1,3}(?:\s+\d{1,3})?)\s*(?:;|$)/.exec(body)?.[1];
      const range = /unicode-range\s*:\s*([^;]+)(?:;|$)/.exec(body)?.[1];
      const fingerprint = resource && manifest.files[resource];
      if (!resource || !FONT_PATH.test(resource) || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) || !weight
        || range && !/^U\+[A-Fa-f0-9?]+(?:-[A-Fa-f0-9]+)?(?:\s*,\s*U\+[A-Fa-f0-9?]+(?:-[A-Fa-f0-9]+)?)*$/.test(range)) throw new Error('READER_FONT_RULE_INVALID');
      files.set(resource, fingerprint);
      // Reconstruct the allow-listed declarations; no unrelated CSS or URL is injected.
      rules.push(`@font-face{font-family:"${family}";font-style:normal;font-display:swap;font-weight:${weight};src:url("/${resource}") format("woff2");${range ? `unicode-range:${range}` : ''}}`);
    }
    const next = { css: rules.length ? rules.join('') + FONT_THEME : '', files };
    saved = { key, bundle: next };
    return next;
  };
  return {
    decorate(html, origin) {
      const current = bundle();
      if (!current.css) return { html, csp: EXPLAINER_CSP };
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('READER_FONT_ORIGIN_INVALID');
      const style = `<style data-lumine-fonts>${current.css}</style>`;
      // Ignore closing-head strings within comments, scripts and style blocks.
      const closing = [...html.matchAll(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<\/head\s*>/gi)].find((match) => /^<\/head/i.test(match[0]));
      const result = closing ? html.slice(0, closing.index) + style + html.slice(closing.index)
        : /^\s*<!doctype[^>]*>/i.test(html) ? html.replace(/^(\s*<!doctype[^>]*>)/i, `$1${style}`) : style + html;
      return { html: result, csp: EXPLAINER_CSP.replace("font-src 'none'", `font-src ${origin}/fonts/`) };
    },
    read(pathname) {
      const relative = pathname.slice(1);
      if (!pathname.startsWith('/') || !FONT_PATH.test(relative)) return null;
      const expected = bundle().files.get(relative);
      if (!expected) return null;
      const file = containedPath(assets, relative);
      const info = lstatSync(file);
      if (!info.isFile() || info.size > 2_000_000) throw new Error('READER_FONT_ASSET_INVALID');
      const bytes = readFileSync(file);
      if (bytes.length < 48 || bytes.subarray(0, 4).toString('ascii') !== 'wOF2' || hash(bytes) !== expected) throw new Error('READER_FONT_ASSET_CHANGED');
      return { bytes, fingerprint: expected };
    },
  };
}
