import type {
  FunctionScope,
  MeasuredScopes,
  ModuleScope,
  StructuralMetrics,
  TopLevelScope,
  UnaggregatedScopes,
} from './types.ts';

function add(target: StructuralMetrics, value: StructuralMetrics): void {
  target.cyclomatic += value.cyclomatic;
  target.cognitive += value.cognitive;
  target.max_nesting_depth = Math.max(target.max_nesting_depth, value.max_nesting_depth);
}

function topLevel(scope: ModuleScope | FunctionScope, parent: number, hash: string): TopLevelScope {
  return {
    kind: 'top_level',
    name: 'Top Level',
    parent,
    syntax_kind: scope.syntax_kind,
    range: scope.range,
    code_hash: hash,
    metrics: { ...scope.metrics },
  };
}

/** @param scopes Parents must precede children, with recursion scores already applied
 * @param localHashes One hash per input scope, excluding named child-function bodies
 */
export function aggregateScopes(scopes: UnaggregatedScopes, localHashes: string[]): MeasuredScopes {
  const [module, ...children] = scopes;
  const root: ModuleScope = { ...module, metrics: { ...module.metrics } };
  const rootLocal = topLevel(root, 0, localHashes[0]!);
  const result: MeasuredScopes = [root, rootLocal];
  const indexes = new Map([[0, 0]]);
  const owners = new Map([[0, 0]]);
  const locals = new Map<number, { scope: ModuleScope | FunctionScope; metrics: StructuralMetrics }>([
    [0, { scope: root, metrics: rootLocal.metrics }],
  ]);
  for (const [offset, scope] of children.entries()) {
    const index = offset + 1;
    const parent = indexes.get(scope.parent)!;
    const owner = owners.get(scope.parent)!;
    if (scope.kind !== 'function') {
      indexes.set(index, result.length);
      result.push({ ...scope, parent });
      owners.set(index, owner);
      continue;
    }
    if (scope.name === undefined) {
      indexes.set(index, parent);
      owners.set(index, owner);
      add(locals.get(owner)!.metrics, scope.metrics);
      continue;
    }
    const position = result.length;
    indexes.set(index, position);
    const named: FunctionScope = { ...scope, name: scope.name, parent, metrics: { ...scope.metrics } };
    const local = topLevel(named, position, localHashes[index]!);
    result.push(named, local);
    owners.set(index, position);
    locals.set(position, { scope: named, metrics: local.metrics });
  }
  for (const { scope, metrics } of locals.values()) scope.metrics = { ...metrics };
  for (let index = result.length - 1; index > 0; index--) {
    const scope = result[index]!;
    if (scope.kind !== 'function') continue;
    let parent = result[scope.parent]!;
    while (parent.metrics === undefined) parent = result[parent.parent]!;
    add(parent.metrics, scope.metrics);
    if (scope.recursion)
      scope.recursion = {
        direct: scope.recursion.direct,
        cycle_members: [...new Set(scope.recursion.cycle_members.map((member) => indexes.get(member)!))],
      };
  }
  return result;
}
