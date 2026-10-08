export type Locale = 'zh-CN' | 'en';
export type KnowledgeStatus = 'current' | 'proposed' | 'historical';
export type Freshness = 'current' | 'stale' | 'unverified' | 'missing-source' | 'conflict';
export type Collection = 'wiki' | 'spec' | 'plan' | 'validation';
export interface SourceRef { id: string; repoId: string; path: string; startLine?: number; endLine?: number; kind?: 'source' | 'runtime' | 'decision'; note?: string }
export interface WatchScope { repoId: string; path: string }
export interface Diagram { id: string; title: string; caption: string; sources: string[]; code: string }
export interface Section { id: string; title: string; level: number; parentId?: string; startLine: number; endLine: number; body: string; stable: boolean; sources: string[] }
export interface Relation { target: string; kind: 'depends_on' | 'decision' | 'related'; note?: string }
export interface CoverageTopic { id: string; title: string; parentId?: string; questions: string[]; sourceScopes: WatchScope[]; documentRefs: string[]; status: 'planned' | 'partial' | 'covered' | 'deferred'; reason?: string }
export interface CoverageContent { schemaVersion: 1; topics: CoverageTopic[] }
export interface CoverageMap extends CoverageContent { revision: string; unmappedDocumentIds: string[] }
export interface ReviewRecord { documentId: string; revision: string; sourceFingerprint: string; reviewedAt: string; reviewer: { kind: 'agent' | 'human'; role: 'author' | 'independent' }; outcome: 'reviewed' | 'issues'; scope: string[]; findings: string[]; limitations: string[] }
export interface SemanticReview extends Partial<Omit<ReviewRecord, 'outcome' | 'documentId'>> { status: 'unreviewed' | 'reviewed' | 'issues' | 'outdated' }
export interface SourceObservation { status: 'observed' | 'not_observed'; checkedAt: string | null; sourceFingerprint: string | null }
export interface ObservationRecord { id: string; revision: string; freshness: Freshness; checkedAt: string; sourceFingerprint: string; sources: SourceSnapshot }
export interface KnowledgeMeta {
  id: string; title: string; summary: string; type: string; status: string; locale: Locale;
  tags: string[]; aliases: string[]; repositories: string[]; sources: SourceRef[];
  relations: Relation[]; diagrams: Omit<Diagram, 'code'>[]; watchScopes: WatchScope[];
}
export interface KnowledgeDocument extends KnowledgeMeta { path: string; collection: Collection; body: string; markdown: string; revision: string; diagrams: Diagram[]; sections: Section[]; freshness: Freshness; issues: string[]; checkedAt: string | null; sourceObservation: SourceObservation; semanticReview: SemanticReview; selection?: { kind: 'section' | 'diagram'; id: string } }
/** Explicitly registered validation files are read-only reader references, not managed Wiki documents. */
export type ReaderDocument = KnowledgeDocument | (Omit<KnowledgeDocument, 'collection'> & { collection: 'validation' });
export interface KnowledgeMatch { sectionId: string; title: string; excerpt: string; reference: string }
export interface KnowledgeCard { id: string; title: string; summary: string; type: string; status: string; collection: Collection | 'validation'; locale: Locale; path: string; revision: string; freshness: Freshness; repositories: string[]; tags: string[]; sources: SourceRef[]; relations: Relation[]; diagramIds: string[]; diagramTypes: string[]; reason: string; matches: KnowledgeMatch[]; checkedAt: string | null; sourceObservation: SourceObservation; semanticReview: SemanticReview }
export interface SourceSnapshot { fingerprints: Record<string, string | null>; scopeFingerprints: Record<string, string>; files: Record<string, string>; missing: string[] }
export interface WikiConfig { root: string; locale: Locale; repositories: { id: string; path: string }[]; watchScopes: WatchScope[]; maxCards: number; maxContextChars: number; excludes: string[] }
export interface Baseline { schemaVersion: 2; id: string; path: string; generation: number; generatedMarkdown: string; appliedRevision: string; sources: SourceSnapshot; updatedAt: string }
export interface ChangeDeclaration { kind: 'create' | 'update'; id: string; path?: string; sourceRefs?: SourceRef[]; watchScopes?: WatchScope[]; replaceSources?: boolean; replaceWatchScopes?: boolean; group?: string }
export interface ChangeManifest { schemaVersion: 1; changes: ChangeDeclaration[]; coverage?: CoverageContent; referenceMoves?: { from: string; to: string }[] }
export interface UpdateUnit { kind?: 'create' | 'update'; group?: string; id: string; path: string; currentMarkdown: string | null; currentRevision: string | null; baseline: Baseline | null; sources: SourceSnapshot; sourceRefs: SourceRef[]; watchScopes: WatchScope[]; replaceSources?: boolean; replaceWatchScopes?: boolean }
export interface UpdatePacket { schemaVersion: 2; id: string; createdAt: string; configFingerprint: string; scope: string[]; units: UpdateUnit[]; status: 'prepared' | 'partial' | 'applied'; results: ApplyResult[]; coverage?: { before: string | null; content: CoverageContent }; referenceMoves?: { before: string | null; entries: { from: string; to: string }[] }; decisions?: { id: string; action: 'keep-current' | 'defer'; reason: string; at: string }[] }
export interface Candidate { id: string; markdown: string; path?: string; review?: ReviewRecord }
export interface ApplyResult { id: string; status: 'applied' | 'conflict' | 'source-drift' | 'config-drift' | 'invalid' | 'protected' | 'pending'; reason: string; candidatePath?: string }
export interface CheckIssue { code: string; severity: 'error' | 'warning'; document?: string; message: string }
