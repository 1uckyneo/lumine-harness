import type { NavigationContent, NavigationGroupId, NormativeChange } from './types.ts';

export const NAVIGATION_PATH = '.lumine/wiki-state/navigation.json';
export const NAVIGATION_GROUPS = ['understand', 'operate', 'reference'] as const satisfies readonly NavigationGroupId[];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,159}$/u.test(value);
const isText = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && !value.includes('\0');
const hasOnly = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).every((key) => keys.includes(key));

export function validateNavigation(value: unknown): NavigationContent {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isId(value.overview) || !hasOnly(value, ['schemaVersion', 'overview', 'groups', 'unlisted', 'norms']) ||
    !Array.isArray(value.groups) || !Array.isArray(value.unlisted) || !Array.isArray(value.norms)) throw new Error('NAVIGATION_INVALID');
  const groups = new Set<string>(), sections = new Set<string>(), documents = new Set<string>(), norms = new Set<string>();
  const place = (id: string): void => {
    if (documents.has(id)) throw new Error(`NAVIGATION_DOCUMENT_DUPLICATE:${id}`);
    documents.add(id);
  };
  for (const group of value.groups as unknown[]) {
    if (!isRecord(group) || !hasOnly(group, ['id', 'sections']) || !NAVIGATION_GROUPS.includes(group.id as NavigationGroupId) || groups.has(group.id as string) || !Array.isArray(group.sections)) throw new Error('NAVIGATION_GROUP_INVALID');
    groups.add(group.id as string);
    for (const section of group.sections as unknown[]) {
      if (!isRecord(section) || !hasOnly(section, ['id', 'title', 'description', 'documents']) || !isId(section.id) || sections.has(section.id) || !isText(section.title) ||
        (section.description !== undefined && !isText(section.description)) || !Array.isArray(section.documents) || !section.documents.length || !section.documents.every(isId)) throw new Error('NAVIGATION_SECTION_INVALID');
      sections.add(section.id);
      section.documents.forEach(place);
    }
  }
  if (groups.size !== NAVIGATION_GROUPS.length) throw new Error('NAVIGATION_GROUPS_REQUIRED');
  for (const item of value.unlisted as unknown[]) {
    if (!isRecord(item) || !hasOnly(item, ['id', 'reason']) || !isId(item.id) || !isText(item.reason) || item.id === value.overview) throw new Error('NAVIGATION_UNLISTED_INVALID');
    place(item.id);
  }
  for (const item of value.norms as unknown[]) {
    if (!isRecord(item) || !hasOnly(item, ['id', 'scope']) || !isId(item.id) || !isText(item.scope) || norms.has(item.id)) throw new Error('NAVIGATION_NORM_INVALID');
    norms.add(item.id);
  }
  return value as unknown as NavigationContent;
}

export function validateNormativeChanges(value: unknown): NormativeChange[] {
  if (!Array.isArray(value)) throw new Error('NORMATIVE_CHANGES_INVALID');
  const ids = new Set<string>();
  for (const item of value as unknown[]) {
    if (!isRecord(item) || !hasOnly(item, ['id', 'reason']) || !isId(item.id) || !isText(item.reason) || ids.has(item.id)) throw new Error('NORMATIVE_CHANGES_INVALID');
    ids.add(item.id);
  }
  return value as NormativeChange[];
}
