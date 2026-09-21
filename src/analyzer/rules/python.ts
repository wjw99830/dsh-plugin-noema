import type { Node } from 'web-tree-sitter';
import { logical, nest, nodeRule, operator, structure } from './helpers.ts';
import type { NodeRule } from './helpers.ts';

export function pythonRule(node: Node, booleanChain: boolean): NodeRule {
  const rule = nodeRule(node, booleanChain);
  switch (node.type) {
    case 'if_statement':
    case 'elif_clause':
      structure(rule);
      rule.nesting = node.type !== 'elif_clause';
      nest(rule, node.childForFieldName('consequence'));
      break;
    case 'else_clause':
      rule.cognitive++;
      for (const child of rule.children) child.nesting++;
      break;
    case 'for_statement':
    case 'while_statement':
      structure(rule);
      nest(rule, node.childForFieldName('body'));
      break;
    case 'except_clause':
    case 'except_group_clause':
      structure(rule);
      nest(
        rule,
        node.namedChildren.find((child) => child.type === 'block'),
      );
      break;
    case 'conditional_expression':
      structure(rule);
      for (const child of rule.children) child.nesting++;
      break;
    case 'match_statement':
      structure(rule, 0);
      nest(rule, node.childForFieldName('body'));
      break;
    case 'case_clause': {
      const patterns = node.namedChildren.filter((child) => child.type === 'case_pattern');
      if (patterns.length !== 1 || !irrefutablePattern(patterns[0]!)) rule.cyclomatic++;
      break;
    }
    case 'assert_statement':
      rule.cyclomatic++;
      break;
    case 'for_in_clause':
    case 'if_clause':
      structure(rule);
      break;
    case 'list_comprehension':
    case 'set_comprehension':
    case 'dictionary_comprehension':
    case 'generator_expression': {
      const body = node.childForFieldName('body');
      rule.children.sort((a, b) => Number(a.node.id === body?.id) - Number(b.node.id === body?.id));
      let depth = 0;
      for (const child of rule.children) {
        child.nesting = depth;
        if (child.node.type === 'for_in_clause' || child.node.type === 'if_clause') depth++;
      }
      break;
    }
  }
  const op = operator(node);
  if (op === 'and' || op === 'or') logical(node, rule, booleanChain);
  return rule;
}

/** @returns False for the decorator exception in Cognitive Complexity, Appendix A */
export function pythonFunctionNesting(node: Node): boolean {
  const statements = node.childForFieldName('body')!.namedChildren.filter((child) => child.type !== 'comment');
  return !(
    statements.length === 2 &&
    statements[0]!.type === 'function_definition' &&
    statements[1]!.type === 'return_statement'
  );
}

function irrefutablePattern(node: Node): boolean {
  const children = node.namedChildren.filter((child) => child.type !== 'comment');
  switch (node.type) {
    case '_':
      return true;
    case 'case_pattern':
      return node.text.trim() === '_' || (children.length === 1 && irrefutablePattern(children[0]!));
    case 'tuple_pattern':
      return (
        !node.children.some((child) => child.type === ',') && children.length === 1 && irrefutablePattern(children[0]!)
      );
    case 'as_pattern':
      return irrefutablePattern(children[0]!);
    case 'union_pattern':
      return node.children.some(irrefutablePattern);
    case 'dotted_name':
      return children.length === 1;
    default:
      return false;
  }
}
