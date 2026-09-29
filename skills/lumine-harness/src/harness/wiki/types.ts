export type Locale = 'zh-CN' | 'en';
export type KnowledgeStatus = 'current' | 'proposed' | 'historical';
export type Freshness = 'current' | 'stale' | 'unverified' | 'missing-source' | 'conflict';
export type Collection = 'wiki' | 'spec' | 'plan';
export interface SourceRef { id: string; repoId: string; path: string; startLine?: number; endLine?: number; kind?: 'source' | 'runtime' | 'decision'; note?: string }
export interface WatchScope { repoId: string; path: string }
export interface Diagram { id: string; title: string; caption: string; sources: string[]; code: string }
export interface KnowledgeMeta {
  id: string; title: string; summary: string; type: string; status: string; locale: Locale;
  tags: string[]; aliases: string[]; repositories: string[]; sources: SourceRef[];
  relations: string[]; diagrams: Omit<Diagram, 'code'>[]; watchScopes: WatchScope[];
}
export interface KnowledgeDocument extends KnowledgeMeta { path: string; collection: Collection; body: string; markdown: string; revision: string; diagrams: Diagram[]; freshness: Freshness; issues: string[] }
export interface KnowledgeCard { id: string; title: string; summary: string; type: string; status: string; collection: Collection; locale: Locale; path: string; revision: string; freshness: Freshness; repositories: string[]; tags: string[]; sources: SourceRef[]; relations: string[]; diagramIds: string[]; diagramTypes: string[]; reason: string }
export interface SourceSnapshot { fingerprints: Record<string, string | null>; scopeFingerprints: Record<string, string>; files: Record<string, string>; missing: string[] }
export interface WikiConfig { root: string; locale: Locale; repositories: { id: string; path: string }[]; watchScopes: WatchScope[]; maxCards: number; maxContextChars: number; excludes: string[] }
export interface Baseline { schemaVersion: 2; id: string; path: string; generation: number; generatedMarkdown: string; appliedRevision: string; sources: SourceSnapshot; updatedAt: string }
export interface UpdateUnit { id: string; path: string; currentMarkdown: string; currentRevision: string; baseline: Baseline | null; sources: SourceSnapshot; sourceRefs: SourceRef[]; watchScopes: WatchScope[] }
export interface UpdatePacket { schemaVersion: 2; id: string; createdAt: string; configFingerprint: string; scope: string[]; units: UpdateUnit[]; status: 'prepared' | 'partial' | 'applied'; results: ApplyResult[]; decisions?: { id: string; action: 'keep-current' | 'defer'; reason: string; at: string }[] }
export interface Candidate { id: string; markdown: string; path?: string }
export interface ApplyResult { id: string; status: 'applied' | 'conflict' | 'source-drift' | 'config-drift' | 'invalid' | 'protected'; reason: string; candidatePath?: string }
export interface CheckIssue { code: string; severity: 'error' | 'warning'; document?: string; message: string }
