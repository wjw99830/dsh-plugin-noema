import type { Node } from 'web-tree-sitter';

export interface NodeRule {
  cyclomatic: number;
  cognitive: number;
  /** Adds one level to maximum control depth */
  control: boolean;
  /** Adds the enclosing cognitive depth to this node's score */
  nesting: boolean;
  children: { node: Node; nesting: number; boolean_chain: boolean; else_if: boolean }[];
}

export function nodeRule(node: Node, booleanChain: boolean): NodeRule {
  return {
    cyclomatic: 0,
    cognitive: 0,
    control: false,
    nesting: false,
    children: node.namedChildren.map((child) => ({
      node: child,
      nesting: 0,
      boolean_chain: node.type === 'parenthesized_expression' && booleanChain,
      else_if: false,
    })),
  };
}

export function structure(rule: NodeRule, branches = 1): void {
  rule.control = true;
  rule.nesting = true;
  rule.cyclomatic = branches;
  rule.cognitive = 1;
}

export function nest(rule: NodeRule, body?: Node | null): void {
  for (const child of rule.children) if (child.node.id === body?.id) child.nesting++;
}

export function operator(node: Node): string | undefined {
  if (!['binary_expression', 'boolean_operator', 'augmented_assignment_expression'].includes(node.type))
    return undefined;
  return node.childForFieldName('operator')?.text;
}

const booleanOperators = new Set(['&&', '||', 'and', 'or']);

function logicalSequenceCount(root: Node): number {
  const stack: (Node | string)[] = [root];
  let previous: string | undefined;
  let count = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (typeof item === 'string') {
      if (item !== previous) count++;
      previous = item;
      continue;
    }
    if (item.type === 'parenthesized_expression') {
      stack.push(...item.namedChildren.toReversed());
      continue;
    }
    const op = operator(item);
    if (op !== undefined && booleanOperators.has(op))
      stack.push(item.childForFieldName('right')!, op, item.childForFieldName('left')!);
  }
  return count;
}

/** @param booleanChain True when an enclosing expression owns the cognitive sequence score */
export function logical(node: Node, rule: NodeRule, booleanChain: boolean): void {
  rule.cyclomatic++;
  if (!booleanChain) rule.cognitive += logicalSequenceCount(node);
  for (const child of rule.children) child.boolean_chain = true;
}
