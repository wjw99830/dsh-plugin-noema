import type { Node } from 'web-tree-sitter';
import { logical, nest, nodeRule, operator, structure } from './helpers.ts';
import type { NodeRule } from './helpers.ts';

export function typescriptRule(node: Node, booleanChain: boolean, elseIf = false): NodeRule {
  const rule = nodeRule(node, booleanChain);
  switch (node.type) {
    case 'if_statement':
      structure(rule);
      rule.nesting = !elseIf;
      nest(rule, node.childForFieldName('consequence'));
      break;
    case 'else_clause': {
      const alternative = rule.children.find((child) => child.node.type !== 'comment');
      if (alternative?.node.type === 'if_statement') alternative.else_if = true;
      else {
        rule.cognitive++;
        for (const child of rule.children) child.nesting++;
      }
      break;
    }
    case 'for_statement':
    case 'for_in_statement':
    case 'while_statement':
    case 'do_statement':
    case 'catch_clause':
      structure(rule);
      nest(rule, node.childForFieldName('body'));
      break;
    case 'switch_statement': {
      const cases = node
        .childForFieldName('body')!
        .namedChildren.filter((child) => child.type === 'switch_case' || child.type === 'switch_default');
      let outcomes = 0;
      let pending = false;
      for (const branch of cases) {
        pending = true;
        if (branch.childrenForFieldName('body').some((child) => child.type !== 'comment')) {
          outcomes++;
          pending = false;
        }
      }
      if (pending || !cases.some((branch) => branch.type === 'switch_default')) outcomes++;
      structure(rule, Math.max(0, outcomes - 1));
      nest(rule, node.childForFieldName('body'));
      break;
    }
    case 'ternary_expression':
      structure(rule);
      for (const child of rule.children) child.nesting++;
      break;
    case 'optional_chain':
    case 'assignment_pattern':
    case 'object_assignment_pattern':
      rule.cyclomatic++;
      break;
    case 'required_parameter':
    case 'optional_parameter':
      if (node.childForFieldName('value')) rule.cyclomatic++;
      break;
    case 'call_expression':
      if (node.children.some((child) => child.type === '?.')) rule.cyclomatic++;
      break;
    case 'break_statement':
    case 'continue_statement':
      if (node.namedChildCount > 0) rule.cognitive++;
      break;
  }
  const op = operator(node);
  if (op === '&&' || op === '||') logical(node, rule, booleanChain);
  if (op === '??' || op === '??=') rule.cyclomatic++;
  if (op === '&&=' || op === '||=') {
    rule.cyclomatic++;
    rule.cognitive++;
  }
  return rule;
}

/** @returns False for declarative wrappers under Cognitive Complexity, Appendix A */
export function typescriptFunctionNesting(node: Node, functions: Set<number>): boolean {
  const body = node.childForFieldName('body')!;
  if (body.type !== 'statement_block') return true;
  const declarations = new Set([
    'lexical_declaration',
    'variable_declaration',
    'function_declaration',
    'generator_function_declaration',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'empty_statement',
  ]);
  for (const statement of body.namedChildren) {
    if (statement.type === 'comment') continue;
    if (declarations.has(statement.type)) continue;
    const assignment = statement.type === 'expression_statement' ? statement.namedChildren[0] : undefined;
    const value = assignment?.type === 'assignment_expression' ? assignment.childForFieldName('right') : undefined;
    if (!value || !functions.has(value.id)) return true;
  }
  const pending = [...body.namedChildren];
  while (pending.length) {
    const child = pending.pop()!;
    if (functions.has(child.id)) continue;
    if (typescriptRule(child, false).control) return true;
    pending.push(...child.namedChildren);
  }
  return false;
}
