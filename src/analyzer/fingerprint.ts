import { createHash } from 'node:crypto';
import type { Node } from 'web-tree-sitter';

const commaLists = new Set([
  'array',
  'object',
  'arguments',
  'formal_parameters',
  'parameters',
  'parameter_list',
  'list',
  'tuple',
  'dictionary',
  'set',
  'argument_list',
  'type_arguments',
  'type_parameters',
  'literal_value',
  'import_clause',
  'named_imports',
  'export_clause',
]);

/** Ignores comments, positions and optional punctuation
 * @param excluded Node IDs omitted from ancestor fingerprints, retained in the result
 */
export function fingerprintSyntax(root: Node, excluded: Set<number> = new Set()): Map<number, string> {
  const hashes = new Map<number, string>();
  const stack = [{ node: root, exit: false }];
  while (stack.length) {
    const { node, exit } = stack.pop()!;
    if (node.type === 'comment') continue;
    if (!exit) {
      stack.push({ node, exit: true });
      for (const child of node.children.toReversed()) stack.push({ node: child, exit: false });
      continue;
    }
    const named = node.namedChildren.filter((child) => child.type !== 'comment');
    if (node.type === 'parenthesized_expression' && named.length === 1) {
      hashes.set(node.id, hashes.get(named[0]!.id)!);
      continue;
    }
    const hash = createHash('sha256').update(node.type).update('\0');
    if (node.childCount === 0 && node.id !== root.id) hash.update(node.text);
    else {
      const children = node.children.filter((child) => child.type !== 'comment');
      for (const [index, child] of children.entries()) {
        if (excluded.has(child.id)) continue;
        if (
          child.type === 'empty_statement' &&
          ['program', 'module', 'statement_block', 'block', 'statement_list'].includes(node.type)
        )
          continue;
        if (child.type === ';' && !['for_statement', 'for_clause', 'empty_statement'].includes(node.type)) continue;
        if (child.type === ',' && commaLists.has(node.type) && children[index - 1]?.type !== ',') {
          const next = children[index + 1];
          if (!next || [')', ']', '}', '>'].includes(next.type)) continue;
        }
        const digest = hashes.get(child.id);
        if (digest !== undefined) hash.update(digest);
      }
    }
    hashes.set(node.id, hash.digest('hex'));
  }
  return hashes;
}
