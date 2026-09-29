/** Resolve exact moves first, then a document move while retaining an unmapped fragment.
 * A target fragment explicitly replaces the old fragment. Never manufacture a double #.
 * Shared by reading and prospective write validation so both reject the same cycles.
 */
export function resolveAliasReference(reference: string, aliases: Record<string, string>): string {
  const visited = new Set<string>();
  let next = reference;
  for (;;) {
    if (!next || next.split('#').length > 2 || next.endsWith('#')) throw new Error('REFERENCE_INVALID');
    if (visited.has(next)) throw new Error('REFERENCE_ALIAS_CYCLE');
    visited.add(next);
    const [document, fragment] = next.split('#');
    if (Object.hasOwn(aliases, next)) { next = aliases[next]; continue; }
    if (!Object.hasOwn(aliases, document)) return next;
    const target = aliases[document];
    if (typeof target !== 'string') throw new Error('REFERENCE_INVALID');
    next = target.includes('#') || !fragment ? target : `${target}#${fragment}`;
  }
}
