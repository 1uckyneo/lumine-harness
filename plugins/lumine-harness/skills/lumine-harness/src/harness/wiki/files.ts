import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, openSync, closeSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { loadProjectConfig } from '../core/project-config.ts';
import type { SourceRef, SourceSnapshot, WatchScope, WikiConfig } from './types.ts';

export const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const slash = (value: string): string => value.split(path.sep).join('/');
export const readJson = <T>(file: string, fallback: T): T => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : fallback;
export function atomicWrite(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, file);
}
export function writeJson(file: string, value: unknown): void { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
export function inside(root: string, file: string): boolean { const rel = path.relative(root, file); return !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); }
export function relativePath(value: string): string {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value) || value.includes('\\') || value.split('/').includes('..')) throw new Error('PATH_NOT_RELATIVE');
  return slash(path.normalize(value));
}
export function containedPath(root: string, relative: string, mustExist = true): string {
  const target = path.resolve(root, relativePath(relative));
  if (!inside(path.resolve(root), target)) throw new Error('PATH_OUTSIDE_ROOT');
  let ancestor = target;
  while (!existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
  if (!inside(realpathSync(root), realpathSync(ancestor))) throw new Error('SYMLINK_OUTSIDE_ROOT');
  if (mustExist && !existsSync(target)) throw new Error('PATH_NOT_FOUND');
  return target;
}
export function wikiConfig(root: string): WikiConfig {
  const config = loadProjectConfig(root);
  const wiki = config.wiki;
  return {
    root: relativePath(wiki?.root ?? 'docs/repo-wiki'), locale: config.locale === 'zh-CN' ? 'zh-CN' : 'en',
    repositories: config.repositories?.length ? config.repositories.map((repo) => ({ id: repo.id, path: repo.path })) : [{ id: 'root', path: '.' }],
    watchScopes: wiki?.watchScopes ?? [], maxCards: Math.min(30, Math.max(1, wiki?.maxCards ?? 6)),
    maxContextChars: Math.max(1000, wiki?.maxContextChars ?? 12000),
    excludes: ['**/local/**', '**/node_modules/**', '**/.git/**', '**/dist/**', '**/coverage/**', '**/.env*', '**/*secret*', '**/*credential*', '**/*.pem', '**/*.key']
  };
}
export function configFingerprint(root: string): string { return hash(JSON.stringify(wikiConfig(root))); }
const SKIP_COMPONENTS = new Set(['.git', 'node_modules', 'dist', 'coverage', 'target', '.lumine', '.harness', '.lumine-migrations', 'local', '.next', '.nuxt', '.output', '.cache', '.venv']);
const EXCLUDED = /(?:^|\/)(?:docs\/(?:generated|drafts)|plugins\/lumine-harness\/skills|assets\/(?:harness|wiki-reader)|(?:migration|migrations)\/fixtures)(?:\/|$)/;
export function isExcluded(relative: string): boolean {
  const parts = relative.split('/');
  return parts.some((part) => SKIP_COMPONENTS.has(part)) || EXCLUDED.test(relative) || parts.some((part) => /^\.env(?:\.|$)|(?:secret|credential)|\.(?:pem|key|p12|pfx)$/i.test(part));
}
export function repositoryRoot(root: string, config: WikiConfig, repoId: string): string {
  const repo = config.repositories.find((item) => item.id === repoId);
  if (!repo) throw new Error('REPOSITORY_NOT_REGISTERED');
  // A repository may be explicitly registered outside a non-Git parent. Its own realpath is the boundary.
  const absolute = path.resolve(root, repo.path);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) throw new Error('REPOSITORY_MISSING');
  return realpathSync(absolute);
}
const ignoreCache = new Map<string, { fingerprint: string; matcher: Ignore }>();
function ignoredByGitFiles(repoRoot: string, relative: string): boolean {
  if (relative === '.') return false;
  const segments = relative.split('/');
  for (let depth = 0; depth < segments.length; depth++) {
    const folder = path.join(repoRoot, ...segments.slice(0, depth)), file = path.join(folder, '.gitignore');
    if (!existsSync(file) || lstatSync(file).isSymbolicLink()) continue;
    const stat = statSync(file), fingerprint = `${stat.mtimeMs}:${stat.size}`;
    let item = ignoreCache.get(file);
    if (!item || item.fingerprint !== fingerprint) { item = { fingerprint, matcher: ignore().add(readFileSync(file, 'utf8')) }; ignoreCache.set(file, item); }
    const local = segments.slice(depth).join('/');
    if (item.matcher.ignores(local)) return true;
  }
  return false;
}
function belongsToNestedRepository(root: string, config: WikiConfig, repoId: string, relative: string): boolean {
  const repo = config.repositories.find((entry) => entry.id === repoId);
  if (!repo) return false;
  const base = path.resolve(root, repo.path), target = path.resolve(base, relative);
  return config.repositories.some((entry) => entry.id !== repoId && path.resolve(root, entry.path) !== base && inside(base, path.resolve(root, entry.path)) && inside(path.resolve(root, entry.path), target));
}
export function sourcePath(root: string, config: WikiConfig, repoId: string, relative: string): string {
  relative = relativePath(relative);
  if (isExcluded(relative) || (config.repositories.find((repo) => repo.id === repoId)?.path === '.' && (relative === config.root || relative.startsWith(`${config.root}/`)))) throw new Error('SOURCE_EXCLUDED');
  const repoRoot = repositoryRoot(root, config, repoId);
  if (belongsToNestedRepository(root, config, repoId, relative)) throw new Error('SOURCE_BELONGS_TO_OTHER_REPOSITORY');
  if (ignoredByGitFiles(repoRoot, relative)) throw new Error('SOURCE_GITIGNORED');
  return containedPath(repoRoot, relative);
}
export function readSource(root: string, config: WikiConfig, source: SourceRef): { text: string; fingerprint: string; startLine: number; endLine: number; totalLines: number } {
  const file = sourcePath(root, config, source.repoId, source.path);
  if (!statSync(file).isFile() || statSync(file).size > 2_000_000) throw new Error('SOURCE_TOO_LARGE_OR_NOT_FILE');
  const full = readFileSync(file, 'utf8');
  if (full.includes('\0')) throw new Error('SOURCE_NOT_TEXT');
  const lines = full.split('\n');
  const start = Math.max(1, source.startLine ?? 1), end = Math.min(lines.length, source.endLine ?? Math.min(lines.length, start + 199));
  if (end < start || end - start > 2000) throw new Error('SOURCE_RANGE_INVALID');
  return { text: lines.slice(start - 1, end).join('\n'), fingerprint: hash(full), startLine: start, endLine: end, totalLines: lines.length };
}
export function walkFiles(root: string, relative = '.', limit = 40000, omit: (relative: string) => boolean = () => false): string[] {
  const found: string[] = [];
  const visit = (current: string): void => {
    if ((isExcluded(current) || ignoredByGitFiles(root, current) || omit(current)) && current !== '.') return;
    let absolute: string;
    try { absolute = containedPath(root, current); } catch { return; }
    if (lstatSync(absolute).isSymbolicLink()) return;
    if (statSync(absolute).isFile()) { found.push(current); return; }
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= limit) throw new Error('SOURCE_SCAN_LIMIT_EXCEEDED');
      if (entry.isSymbolicLink()) continue;
      const next = current === '.' ? entry.name : `${current}/${entry.name}`;
      if (!isExcluded(next)) visit(next);
    }
  };
  visit(relative);
  return found.sort();
}
/** The optional cache belongs to one scan/prepare operation, never to a process-wide index. */
export function snapshotSources(root: string, sources: SourceRef[], scopes: WatchScope[], cache = new Map<string, SourceSnapshot>()): SourceSnapshot {
  const config = wikiConfig(root), prefix = `${path.resolve(root)}\0`;
  const fingerprints: Record<string, string | null> = {}, files: Record<string, string> = {}, scopeFingerprints: Record<string, string> = {}, missing: string[] = [];
  const includes = (parent: string, child: string) => parent === '.' || child === parent || child.startsWith(`${parent}/`);
  const digest = (repoId: string, relative: string, file: string): string => {
    const identity = `${repoId}:${relative}`, key = `${prefix}file:${identity}`;
    const saved = cache.get(key)?.fingerprints[identity];
    if (typeof saved === 'string') return saved;
    const value = hash(readFileSync(file));
    cache.set(key, { fingerprints: { [identity]: value }, files: {}, scopeFingerprints: {}, missing: [] });
    return value;
  };
  const captureScope = (scope: WatchScope): SourceSnapshot => {
    const identity = `${scope.repoId}:${scope.path}`;
    let relative: string;
    try { relative = relativePath(scope.path); }
    catch { return { fingerprints: {}, files: {}, scopeFingerprints: { [identity]: 'missing' }, missing: [identity] }; }
    const scopePrefix = `${prefix}scope:${scope.repoId}:`, cacheKey = `${scopePrefix}${relative}`;
    const saved = cache.get(cacheKey);
    if (saved) return saved;
    const result: SourceSnapshot = { fingerprints: {}, files: {}, scopeFingerprints: {}, missing: [] };
    try {
      const repoRoot = repositoryRoot(root, config, scope.repoId);
      sourcePath(root, config, scope.repoId, relative);
      const available = [...cache].flatMap(([key, snapshot]) => key.startsWith(scopePrefix) && !snapshot.missing.length
        ? [{ relative: key.slice(scopePrefix.length), snapshot }] : []);
      const ancestor = available.find((entry) => includes(entry.relative, relative));
      const entries: Record<string, string> = {};
      if (ancestor) {
        // Existence/exclusion was checked above: an absent child of a valid parent is not an empty valid scope.
        for (const [file, fingerprint] of Object.entries(ancestor.snapshot.files)) {
          const local = file.slice(scope.repoId.length + 1);
          if (includes(relative, local)) entries[local] = fingerprint;
        }
      } else {
        // Reuse whole captured subtrees even if a narrower page was prepared before its parent.
        const descendants = available.filter((entry) => includes(relative, entry.relative))
          .sort((a, b) => a.relative.length - b.relative.length)
          .filter((entry, index, all) => !all.slice(0, index).some((parent) => includes(parent.relative, entry.relative)));
        for (const entry of descendants) for (const [file, fingerprint] of Object.entries(entry.snapshot.files)) entries[file.slice(scope.repoId.length + 1)] = fingerprint;
        const omit = (file: string) => descendants.some((entry) => includes(entry.relative, file))
          || belongsToNestedRepository(root, config, scope.repoId, file)
          || (config.repositories.find((entry) => entry.id === scope.repoId)?.path === '.' && (file === config.root || file.startsWith(`${config.root}/`)));
        for (const file of walkFiles(repoRoot, relative, 40000, omit)) {
          let absolute: string;
          try { absolute = sourcePath(root, config, scope.repoId, file); } catch { continue; }
          const info = statSync(absolute);
          entries[file] = info.size > 2_000_000 ? `large:${info.size}:${info.mtimeMs}` : digest(scope.repoId, file, absolute);
        }
      }
      if (Object.keys(entries).length > 40000) throw new Error('SOURCE_SCAN_LIMIT_EXCEEDED');
      // Keep fingerprints independent of cache hits, subtree order and directory iteration order.
      const ordered = Object.fromEntries(Object.keys(entries).sort().map((file) => [file, entries[file]]));
      result.files = Object.fromEntries(Object.entries(ordered).map(([file, fingerprint]) => [`${scope.repoId}:${file}`, fingerprint]));
      result.scopeFingerprints[`${scope.repoId}:${relative}`] = hash(JSON.stringify(ordered));
    } catch (error) {
      if (error instanceof Error && error.message === 'SOURCE_SCAN_LIMIT_EXCEEDED') throw error;
      result.scopeFingerprints[`${scope.repoId}:${relative}`] = 'missing'; result.missing.push(`${scope.repoId}:${relative}`);
    }
    cache.set(cacheKey, result); return result;
  };
  const allScopes = [...new Map(scopes.map((scope) => [`${scope.repoId}:${scope.path}`, scope])).values()];
  // Capture wider scopes first within a call; callers can still request child-before-parent across calls.
  for (const scope of [...allScopes].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.length - b.path.length)) captureScope(scope);
  for (const scope of allScopes) {
    const snapshot = captureScope(scope), key = `${scope.repoId}:${scope.path}`;
    scopeFingerprints[key] = Object.values(snapshot.scopeFingerprints)[0];
    Object.assign(files, snapshot.files);
    if (snapshot.missing.length) missing.push(key);
  }
  for (const source of sources) {
    const key = `${source.repoId}:${source.path}`;
    try {
      const file = sourcePath(root, config, source.repoId, source.path);
      fingerprints[key] = digest(source.repoId, relativePath(source.path), file);
    } catch { fingerprints[key] = null; missing.push(key); }
  }
  return { fingerprints, scopeFingerprints, files, missing: [...new Set(missing)] };
}
export function withWikiLock<T>(root: string, callback: () => T): T {
  const directory = containedPath(root, '.lumine/local/wiki', false); mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'write.lock');
  let descriptor: number;
  try { descriptor = openSync(file, 'wx', 0o600); }
  catch { throw new Error('WIKI_WRITE_LOCKED: inspect the owning process before removing .lumine/local/wiki/write.lock'); }
  writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  try { return callback(); } finally { closeSync(descriptor); unlinkSync(file); }
}
