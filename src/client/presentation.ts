import type { FileReport, ScopeChange } from '../report.ts';

export function measuredScope(file: FileReport, change: ScopeChange, side: 'before' | 'after') {
  const value = file[side];
  const index = change[`${side}_index`];
  return value?.status === 'ok' && index !== undefined ? value.analysis.scopes[index] : undefined;
}

/** Groups functions and Top Level under their enclosing function
 * @returns Parent change indexes mapped to child change indexes; undefined denotes the file
 */
export function scopeChildren(file: FileReport, includeUnchanged = false): Map<number | undefined, number[]> {
  const kinds = file.changes.map(
    (change) => (measuredScope(file, change, 'after') ?? measuredScope(file, change, 'before'))!.kind,
  );
  const parents = new Map<number, number | undefined>();
  for (const [index, change] of file.changes.entries()) {
    if (kinds[index] !== 'function' && kinds[index] !== 'top_level') continue;
    let parent = change.parent;
    while (parent !== undefined && kinds[parent] !== 'function') parent = file.changes[parent]!.parent;
    parents.set(index, parent);
  }
  const visible = new Set<number>();
  for (const [index, change] of file.changes.entries())
    if (parents.has(index) && (includeUnchanged || change.change !== 'unchanged')) {
      let parent: number | undefined = index;
      while (parent !== undefined && !visible.has(parent)) {
        visible.add(parent);
        parent = parents.get(parent);
      }
    }
  const children = new Map<number | undefined, number[]>();
  for (const index of visible) {
    const parent = parents.get(index);
    const siblings = children.get(parent) ?? [];
    siblings.push(index);
    children.set(parent, siblings);
  }
  for (const siblings of children.values())
    siblings.sort((a, b) => {
      const x = file.changes[a]!,
        y = file.changes[b]!;
      return (
        Number(kinds[b] === 'top_level') - Number(kinds[a] === 'top_level') ||
        Math.abs(y.delta?.cognitive ?? 0) - Math.abs(x.delta?.cognitive ?? 0) ||
        Math.abs(y.delta?.cyclomatic ?? 0) - Math.abs(x.delta?.cyclomatic ?? 0) ||
        a - b
      );
    });
  return children;
}

export function metricText(before?: number, after?: number): string {
  if (before === undefined) return after === undefined ? '-' : String(after);
  if (after === undefined || before === after) return String(before);
  const delta = after - before;
  return `${before} → ${after} (${delta > 0 ? '+' : ''}${delta})`;
}
