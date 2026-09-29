// Conservative line-based three-way merge. Overlapping edits remain durable conflicts.
interface Hunk { start: number; end: number; lines: string[] }
function edits(base: string[], next: string[]): Hunk[] {
  let prefix = 0;
  while (prefix < base.length && prefix < next.length && base[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < base.length - prefix && suffix < next.length - prefix && base[base.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  const left = base.slice(prefix, base.length - suffix), right = next.slice(prefix, next.length - suffix);
  if (!left.length && !right.length) return [];
  if (left.length * right.length > 4_000_000) return [{ start: prefix, end: base.length - suffix, lines: right }];
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const hunks: Hunk[] = []; let i = 0, j = 0, current: Hunk | null = null;
  const flush = (): void => { if (current) hunks.push(current); current = null; };
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { flush(); i++; j++; continue; }
    if (!current) current = { start: prefix + i, end: prefix + i, lines: [] };
    if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) current.lines.push(right[j++]);
    else { i++; current.end = prefix + i; }
  }
  flush(); return hunks;
}
export function threeWayMerge(base: string, current: string, candidate: string): { clean: boolean; content: string } {
  if (current === candidate) return { clean: true, content: current };
  if (base === current) return { clean: true, content: candidate };
  if (base === candidate) return { clean: true, content: current };
  const original = base.split('\n'), human = edits(original, current.split('\n')), generated = edits(original, candidate.split('\n'));
  const merged: Hunk[] = [...human];
  for (const update of generated) {
    let duplicate = false;
    for (const edit of human) {
      if (edit.start === update.start && edit.end === update.end && JSON.stringify(edit.lines) === JSON.stringify(update.lines)) { duplicate = true; break; }
      const overlap = edit.start === edit.end && update.start === update.end ? edit.start === update.start : Math.max(edit.start, update.start) < Math.min(edit.end, update.end) || (edit.start === edit.end && edit.start >= update.start && edit.start <= update.end) || (update.start === update.end && update.start >= edit.start && update.start <= edit.end);
      if (overlap) return { clean: false, content: current };
    }
    if (!duplicate) merged.push(update);
  }
  const output = [...original];
  for (const hunk of merged.sort((a, b) => b.start - a.start || b.end - a.end)) output.splice(hunk.start, hunk.end - hunk.start, ...hunk.lines);
  return { clean: true, content: output.join('\n') };
}
