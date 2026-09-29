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
export function snapshotSources(root: string, sources: SourceRef[], scopes: WatchScope[]): SourceSnapshot {
  const config = wikiConfig(root), fingerprints: Record<string, string | null> = {}, files: Record<string, string> = {}, scopeFingerprints: Record<string, string> = {}, missing: string[] = [];
  for (const source of sources) {
    const key = `${source.repoId}:${source.path}`;
    try { const file = sourcePath(root, config, source.repoId, source.path); fingerprints[key] = hash(readFileSync(file)); }
    catch { fingerprints[key] = null; missing.push(key); }
  }
  const allScopes = new Map(scopes.map((scope) => [`${scope.repoId}:${scope.path}`, scope]));
  for (const [key, scope] of allScopes) {
    try {
      const repoRoot = repositoryRoot(root, config, scope.repoId);
      const relative = relativePath(scope.path);
      sourcePath(root, config, scope.repoId, relative);
      const entries: Record<string, string> = {};
      for (const file of walkFiles(repoRoot, relative, 40000, (file) => belongsToNestedRepository(root, config, scope.repoId, file) || (config.repositories.find((entry) => entry.id === scope.repoId)?.path === '.' && (file === config.root || file.startsWith(`${config.root}/`))))) {
        try { sourcePath(root, config, scope.repoId, file); } catch { continue; }
        const info = statSync(path.join(repoRoot, file));
        if (info.size > 2_000_000) { entries[file] = `large:${info.size}:${info.mtimeMs}`; continue; }
        entries[file] = hash(readFileSync(path.join(repoRoot, file)));
        files[`${scope.repoId}:${file}`] = entries[file];
      }
      scopeFingerprints[key] = hash(JSON.stringify(entries));
    } catch (error) {
      if (error instanceof Error && error.message === 'SOURCE_SCAN_LIMIT_EXCEEDED') throw error;
      scopeFingerprints[key] = 'missing'; missing.push(key);
    }
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
