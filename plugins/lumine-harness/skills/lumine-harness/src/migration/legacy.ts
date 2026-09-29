import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { getSessionStatePath } from '../harness/core/work-status.ts';
import type { HarnessProduct } from '../harness/core/contracts.ts';

const oldRoot = '.harness';
const names = ['navigate', 'draft', 'generated', 'design', 'plan', 'run', 'check'];
const products = new Set(['codex', 'qoder', 'trae', 'kimi', 'cursor', 'opencode', 'zcode', 'codebuddy', 'deepseek-harness']);
const retiredTemplates = ['draft.md', 'component-map.md', 'handoff.md', 'handoff.design.json'];
const protocolFiles = new Set(['.harness/project.json', '.harness/root.json', '.harness/managed.json']);
const read = (file: string): Record<string, any> => JSON.parse(readFileSync(file, 'utf8'));
const slash = (value: string): string => value.split(path.sep).join('/');
const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const present = (file: string): boolean => { try { lstatSync(file); return true; } catch { return false; } };

function safePath(root: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..')) throw new Error('Unsafe legacy path: ' + relative);
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Legacy path outside project');
  for (let current = file; current !== path.resolve(root); current = path.dirname(current)) {
    if (present(current) && lstatSync(current).isSymbolicLink()) throw new Error('Legacy symlink protected: ' + relative);
  }
  return file;
}

/** Never descend into symlinks, private local trees, or embedded repositories. */
function inventory(root: string, relative: string, protectLocal = true): { files: string[]; protectedPaths: string[] } {
  const result: { files: string[]; protectedPaths: string[] } = { files: [], protectedPaths: [] };
  const visit = (rel: string): void => {
    const file = path.join(root, rel);
    if (!present(file)) return;
    const info = lstatSync(file);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) { result.protectedPaths.push(rel); return; }
    if (info.isFile()) { result.files.push(rel); return; }
    const entries = readdirSync(file, { withFileTypes: true });
    if (!entries.length) return;
    if (present(path.join(file, '.git')) || (protectLocal && rel === '.harness/local')) { result.protectedPaths.push(rel); return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) visit(slash(path.join(rel, entry.name)));
  };
  visit(relative);
  return result;
}

function managedFiles(root: string): Record<string, { hash?: string }> {
  const file = safePath(root, '.harness/managed.json');
  return existsSync(file) ? read(file).files ?? {} : {};
}

export function inspectLegacy(root: string) {
  const file = safePath(root, '.harness/project.json');
  return { exists: existsSync(file), project: existsSync(file) ? read(file) : {}, managed: managedFiles(root) };
}

export function convertLegacyProject(current: Record<string, any>, children: string[]) {
  const { generatedTargets, childRepositories, ...rest } = current;
  return {
    ...rest,
    modules: (current.modules ?? ['workflow']).filter((module: string) => module !== 'generated'),
    repositories: current.repositories ?? [{ id: 'project', path: '.' }, ...(childRepositories ?? children).map((relative: string) => ({ id: relative.replace(/[^a-zA-Z0-9_-]/g, '-'), path: relative }))],
    autonomy: current.autonomy ?? { maxContinuationChain: 20, noProgressThreshold: 2 },
    extensions: { ...current.extensions },
  };
}

function retirementAssessment(root: string, reviewedPaths: string[]) {
  const managed = managedFiles(root), reviewed = new Set(reviewedPaths), paths: string[] = [], conflicts: string[] = [];
  const inventories = names.map((name) => inventory(root, '.agents/skills/lumine-harness-' + name, false));
  for (const name of retiredTemplates) inventories.push(inventory(root, 'docs/templates/' + name, false));
  for (const item of inventories) {
    conflicts.push(...item.protectedPaths);
    for (const relative of item.files) {
      if (reviewed.has(relative) || managed[relative]?.hash === digest(readFileSync(safePath(root, relative)))) paths.push(relative);
      else conflicts.push(relative);
    }
  }
  return { paths: [...new Set(paths)].sort(), conflicts: [...new Set(conflicts)].sort() };
}

/** Deletions enter the manager's ordinary journal and backup flow. */
export function legacyRetirements(root: string, reviewedPaths: string[] = []): string[] {
  return retirementAssessment(root, reviewedPaths).paths;
}
export function legacyRetirementConflicts(root: string, reviewedPaths: string[] = []): string[] {
  return retirementAssessment(root, reviewedPaths).conflicts;
}

export function convertLegacySessions(root: string): Map<string, string> {
  const result = new Map<string, string>();
  const candidates = new Map<string, { relative: string; original: string; value: Record<string, any> }[]>();
  const archive = (relative: string, original: string): void => {
    result.set(slash(path.join('.lumine/local/migration-history/runtime', path.relative('.harness/runtime', relative))), original);
  };
  for (const relative of inventory(root, '.harness/runtime').files) {
    const bytes = readFileSync(safePath(root, relative));
    const original = bytes.toString('utf8');
    if (!Buffer.from(original).equals(bytes)) continue; // Opaque files remain protected in the old root.
    let value: Record<string, any>;
    try { value = JSON.parse(original); } catch { archive(relative, original); continue; }
    if (!relative.startsWith('.harness/runtime/sessions/') || !value || typeof value !== 'object' || Array.isArray(value) || !products.has(value.product) || typeof value.sessionId !== 'string' || !value.sessionId.trim() || value.sessionId === 'unknown') {
      archive(relative, original);
      continue;
    }
    const destination = slash(path.relative(root, getSessionStatePath(root, value.product as HarnessProduct, value.sessionId)));
    const entries = candidates.get(destination) ?? [];
    entries.push({ relative, original, value });
    candidates.set(destination, entries);
  }
  for (const [destination, entries] of candidates) {
    // Ambiguous duplicate identities need human recovery; never pick the last file.
    if (entries.length !== 1) { for (const entry of entries) archive(entry.relative, entry.original); continue; }
    const { relative, original, value } = entries[0];
    archive(relative, original);
    for (const key of ['expectedSkill', 'expectedSkillPath', 'expectedSkillRead', 'expectedSkillReadAt', 'expectedPhase', 'expectedSkills', 'taskUserTurnRevision']) delete value[key];
    Object.assign(value, {
      schemaVersion: 2, expectedSkills: [], usedSkills: [], selectedSkills: [], skillCandidates: [], expectedSkillRead: false,
      requestedActivity: null, pendingContinuationRequestId: null, pendingContinuationRevision: null,
      continuationRequestedAt: null, continuationDeliveredAt: null,
    });
    result.set(destination, JSON.stringify(value, null, 2) + '\n');
  }
  // Old current pointers and probes are archived above, never promoted to current host evidence.
  return result;
}

export function legacyTransition(root: string, adapters: string[], reviewedPaths: string[] = []) {
  const before: Record<string, string> = {}, bridges: Record<string, string> = {};
  const scan = inventory(root, oldRoot), protectedPaths = [...scan.protectedPaths];
  const managed = managedFiles(root), reviewed = new Set(reviewedPaths);
  for (const relative of scan.files) {
    const file = safePath(root, relative), bytes = readFileSync(file), fingerprint = digest(bytes);
    const recoverableState = relative.startsWith('.harness/runtime/') && /\.jsonl?$/.test(relative) && Buffer.from(bytes.toString('utf8')).equals(bytes);
    const known = protocolFiles.has(relative) || recoverableState || managed[relative]?.hash === fingerprint || reviewed.has(relative);
    if (!known) { protectedPaths.push(relative); continue; }
    before[relative] = fingerprint;
    if (relative === oldRoot + '/cli') {
      bridges[relative] = '#!/usr/bin/env bash\nset -euo pipefail\nexec "$(cd "$(dirname "$0")/../.lumine" && pwd)/cli" "$@"\n';
    } else if (adapters.some((adapter) => relative.startsWith(oldRoot + '/adapters/' + adapter + '/hooks/')) && relative.endsWith('.mjs') && !relative.includes('/lib/')) {
      const destination = path.join(root, '.lumine', path.relative(path.join(root, oldRoot), file));
      const modulePath = slash(path.relative(path.dirname(file), destination));
      bridges[relative] = '// Temporary migration bridge; removed after host verification.\n' +
        "import { spawnSync } from 'node:child_process';\nimport { fileURLToPath } from 'node:url';\n" +
        `const entry = fileURLToPath(new URL(${JSON.stringify(modulePath)}, import.meta.url));\n` +
        "const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' });\n" +
        "if (result.error) { process.stderr.write(result.error.message + '\\n'); process.exit(1); }\n" +
        "if (result.signal) { process.kill(process.pid, result.signal); } else { process.exit(result.status ?? 1); }\n";
    }
  }
  return { before, bridges, protectedPaths: [...new Set(protectedPaths)].sort() };
}

export function backupLegacy(root: string, recovery: string, snapshot: Record<string, string>): void {
  for (const [relative, expected] of Object.entries(snapshot)) {
    const source = safePath(root, relative), destination = safePath(recovery, 'legacy/' + relative);
    if (existsSync(destination)) {
      if (digest(readFileSync(destination)) !== expected) throw new Error('Legacy backup changed: ' + relative);
      continue;
    }
    if (!existsSync(source) || digest(readFileSync(source)) !== expected) throw new Error('Legacy input changed: ' + relative);
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
  }
}

export function finishLegacy(root: string, recovery: string, snapshot: Record<string, string>, bridges: Record<string, string>, protectedPaths: string[] = []): void {
  const current = inventory(root, oldRoot);
  const unexpected = current.files.filter((relative) => !Object.hasOwn(snapshot, relative));
  const blocked = [...new Set([...protectedPaths.filter((relative) => present(path.join(root, relative))), ...current.protectedPaths, ...unexpected])];
  if (blocked.length) throw new Error('Protected legacy content remains; preserved for review: ' + blocked.join(', '));
  // Validate the complete set before deleting the first file, including resumed finalization.
  for (const [relative, expected] of Object.entries(snapshot)) {
    const file = safePath(root, relative), backup = safePath(recovery, 'legacy/' + relative);
    if (!existsSync(backup) || digest(readFileSync(backup)) !== expected) throw new Error('Missing verified backup: ' + relative);
    if (existsSync(file) && digest(readFileSync(file)) !== (bridges[relative] ? digest(Buffer.from(bridges[relative])) : expected)) throw new Error('Legacy file changed; preserve and review: ' + relative);
  }
  for (const relative of Object.keys(snapshot)) { const file = safePath(root, relative); if (existsSync(file)) rmSync(file); }
  const prune = (directory: string): void => {
    if (!present(directory) || lstatSync(directory).isSymbolicLink()) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) prune(path.join(directory, entry.name));
    if (!readdirSync(directory).length) rmdirSync(directory);
  };
  prune(path.join(root, oldRoot));
  if (existsSync(path.join(root, oldRoot))) throw new Error('Unclassified legacy files remain; preserved for review.');
}

export function restoreLegacy(root: string, recovery: string, snapshot: Record<string, string>, bridges: Record<string, string>): string[] {
  const conflicts: string[] = [];
  for (const [relative, expected] of Object.entries(snapshot)) {
    try {
      const file = safePath(root, relative), backup = safePath(recovery, 'legacy/' + relative);
      if (!existsSync(backup) || digest(readFileSync(backup)) !== expected) { conflicts.push(relative); continue; }
      if (existsSync(file)) {
        const actual = digest(readFileSync(file));
        if (actual === expected) continue;
        if (!bridges[relative] || actual !== digest(Buffer.from(bridges[relative]))) { conflicts.push(relative); continue; }
      }
      mkdirSync(path.dirname(file), { recursive: true });
      copyFileSync(backup, file);
    } catch { conflicts.push(relative); }
  }
  return conflicts;
}

export function pruneRetiredSkillDirectories(root: string): void {
  for (const name of names) {
    const directory = safePath(root, '.agents/skills/lumine-harness-' + name);
    if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) continue;
    const prune = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) if (entry.isDirectory() && !entry.isSymbolicLink()) prune(path.join(current, entry.name));
      if (!readdirSync(current).length) rmdirSync(current);
    };
    prune(directory);
  }
}
