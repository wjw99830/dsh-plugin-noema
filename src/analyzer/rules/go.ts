import type { Node } from 'web-tree-sitter';
import { logical, nest, nodeRule, operator, structure } from './helpers.ts';
import type { NodeRule } from './helpers.ts';

export function goRule(node: Node, booleanChain: boolean, elseIf = false): NodeRule {
  const rule = nodeRule(node, booleanChain);
  switch (node.type) {
    case 'if_statement': {
      structure(rule);
      rule.nesting = !elseIf;
      nest(rule, node.childForFieldName('consequence'));
      const alternative = node.childForFieldName('alternative');
      if (alternative?.type === 'block') {
        rule.cognitive++;
        nest(rule, alternative);
      }
      for (const child of rule.children)
        if (child.node.id === alternative?.id && alternative.type === 'if_statement') child.else_if = true;
      break;
    }
    case 'for_statement':
      structure(rule);
      nest(rule, node.childForFieldName('body'));
      break;
    case 'expression_switch_statement':
    case 'type_switch_statement':
    case 'select_statement':
      structure(
        rule,
        node.type === 'select_statement'
          ? Math.max(
              0,
              node.namedChildren.filter((child) => child.type === 'communication_case' || child.type === 'default_case')
                .length - 1,
            )
          : 0,
      );
      for (const child of rule.children)
        if (['expression_case', 'type_case', 'communication_case', 'default_case'].includes(child.node.type))
          child.nesting++;
      break;
    case 'expression_case':
    case 'type_case':
      rule.cyclomatic++;
      break;
    case 'goto_statement':
      rule.cognitive++;
      break;
    case 'break_statement':
    case 'continue_statement':
      if (node.namedChildCount > 0) rule.cognitive++;
      break;
  }
  const op = operator(node);
  if (op === '&&' || op === '||') logical(node, rule, booleanChain);
  return rule;
}
