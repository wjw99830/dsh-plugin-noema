import type { Node } from 'web-tree-sitter';
import type { AnalysisLanguage } from '../languages.ts';
import type {
  ContainerScope,
  MeasuredScopes,
  ModuleScope,
  StructuralMetrics,
  SourceRange,
  UnaggregatedChild,
  UnaggregatedScopes,
} from './types.ts';
import { fingerprintSyntax } from './fingerprint.ts';
import { markRecursion } from './recursion.ts';
import { aggregateScopes } from './aggregate.ts';
import { typescriptRule, typescriptFunctionNesting } from './rules/typescript.ts';
import { pythonRule, pythonFunctionNesting } from './rules/python.ts';
import { goRule } from './rules/go.ts';

const languageRules = { typescript: typescriptRule, tsx: typescriptRule, python: pythonRule, go: goRule };

const functionKinds = new Set([
  'function_declaration',
  'function_expression',
  'generator_function',
  'generator_function_declaration',
  'arrow_function',
  'method_definition',
  'function_definition',
  'lambda',
  'method_declaration',
  'func_literal',
]);
const containerKinds = new Map<string, ContainerScope['kind']>([
  ['class', 'class'],
  ['class_declaration', 'class'],
  ['class_definition', 'class'],
  ['abstract_class_declaration', 'class'],
  ['interface_declaration', 'interface'],
  ['internal_module', 'namespace'],
]);

function newMetrics(base: number): StructuralMetrics {
  return { cyclomatic: base, cognitive: 0, max_nesting_depth: 0 };
}

function scopeName(node: Node, language: AnalysisLanguage): string | undefined {
  const name = node.childForFieldName('name');
  if (name) {
    const receiver = language === 'go' ? node.childForFieldName('receiver') : undefined;
    const receiverType = receiver?.namedChildren[0]?.childForFieldName('type');
    return receiverType ? `(${receiverType.text}).${name.text}` : name.text;
  }
  let owner = node.parent;
  while (owner?.type === 'parenthesized_expression') owner = owner.parent;
  if (owner?.type === 'expression_list') {
    if (owner.namedChildCount !== 1) return undefined;
    owner = owner.parent;
  }
  if (!owner) return undefined;
  let target: Node | undefined;
  switch (owner.type) {
    case 'variable_declarator':
    case 'public_field_definition':
    case 'var_spec':
      target = owner.childForFieldName('name') ?? undefined;
      break;
    case 'pair':
      target = owner.childForFieldName('key') ?? undefined;
      break;
    case 'assignment':
    case 'assignment_expression':
    case 'short_var_declaration':
      target = owner.childForFieldName('left') ?? undefined;
      break;
  }
  return target && (target.type !== 'expression_list' || target.namedChildCount === 1) ? target.text : undefined;
}

interface Frame {
  node: Node;
  parent: number;
  metrics: StructuralMetrics;
  depth: number;
  cognitive_depth: number;
  function_nesting: number;
  boolean_chain: boolean;
  else_if: boolean;
}

/** Requires a syntax tree without parse errors */
export function measureScopes(root: Node, source: string, path: string, language: AnalysisLanguage): MeasuredScopes {
  const byteOffsets = new Uint32Array(source.length + 1);
  let bytes = 0;
  for (let i = 0; i < source.length;) {
    const code = source.codePointAt(i)!;
    byteOffsets[i] = bytes;
    if (code > 0xffff) byteOffsets[++i] = bytes;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    byteOffsets[++i] = bytes;
  }
  const range = (node: Node): SourceRange => ({
    start_byte: byteOffsets[node.startIndex]!,
    end_byte: byteOffsets[node.endIndex]!,
    start_line: node.startPosition.row + 1,
    end_line: Math.max(node.startPosition.row + 1, node.endPosition.row + Number(node.endPosition.column > 0)),
  });
  const fingerprints = fingerprintSyntax(root);
  const functionNodesAll = new Set<number>();
  const namedFunctions = new Set<number>();
  const scan = [root];
  while (scan.length) {
    const node = scan.pop()!;
    if (functionKinds.has(node.type) && node.childForFieldName('body')) {
      functionNodesAll.add(node.id);
      if (scopeName(node, language) !== undefined) namedFunctions.add(node.id);
    }
    scan.push(...node.namedChildren);
  }
  const localFingerprints = fingerprintSyntax(root, namedFunctions);
  const moduleMetrics = newMetrics(0);
  const module: ModuleScope = {
    code_hash: fingerprints.get(root.id)!,
    name: path,
    kind: 'module',
    syntax_kind: root.type,
    range: range(root),
    metrics: moduleMetrics,
  };
  const scopes: UnaggregatedChild[] = [];
  const scopeNodes: Node[] = [];
  const stack: Frame[] = root.namedChildren.toReversed().map((node) => ({
    node,
    parent: 0,
    metrics: moduleMetrics,
    depth: 0,
    cognitive_depth: 0,
    function_nesting: 0,
    boolean_chain: false,
    else_if: false,
  }));
  while (stack.length) {
    let { node, parent, metrics, depth, cognitive_depth, function_nesting, boolean_chain, else_if } = stack.pop()!;
    const type = node.type;
    const isFunction = functionKinds.has(type) && node.childForFieldName('body') !== null;
    const kind = isFunction ? 'function' : containerKinds.get(type);
    if (kind) {
      if (isFunction) {
        metrics = newMetrics(namedFunctions.has(node.id) ? 1 : 0);
        cognitive_depth += function_nesting;
        function_nesting = Number(
          language === 'python'
            ? pythonFunctionNesting(node)
            : language === 'go' || typescriptFunctionNesting(node, functionNodesAll),
        );
        depth = 0;
        boolean_chain = false;
        else_if = false;
      }
      const name = scopeName(node, language);
      const fields = {
        code_hash: fingerprints.get(node.id)!,
        ...(name !== undefined && { name }),
        syntax_kind: type,
        parent,
        range: range(node),
      };
      scopes.push(kind === 'function' ? { ...fields, kind, metrics } : { ...fields, kind });
      scopeNodes.push(node);
      parent = scopes.length;
    }

    const rule = languageRules[language](node, boolean_chain, else_if);
    metrics.cyclomatic += rule.cyclomatic;
    metrics.cognitive += rule.cognitive + (rule.nesting ? cognitive_depth : 0);
    if (rule.control) metrics.max_nesting_depth = Math.max(metrics.max_nesting_depth, depth + 1);
    for (const child of rule.children.toReversed())
      stack.push({
        node: child.node,
        parent,
        metrics,
        depth: depth + child.nesting,
        cognitive_depth: cognitive_depth + child.nesting,
        function_nesting,
        boolean_chain: child.boolean_chain,
        else_if: child.else_if,
      });
  }
  const ordered = scopes
    .map((scope, index) => ({ scope, index }))
    .sort((a, b) => a.scope.range.start_byte - b.scope.range.start_byte || a.index - b.index);
  const indexes = new Map([[0, 0], ...ordered.map(({ index }, position) => [index + 1, position + 1] as const)]);
  const result: UnaggregatedScopes = [
    module,
    ...ordered.map(({ scope }) => ({
      ...scope,
      parent: indexes.get(scope.parent)!,
    })),
  ];
  const functionNodes = new Map(
    ordered.flatMap(({ scope, index }, position) =>
      scope.kind === 'function' ? [[scopeNodes[index]!.id, position + 1] as const] : [],
    ),
  );
  markRecursion(root, language, result, functionNodes);
  return aggregateScopes(result, [
    localFingerprints.get(root.id)!,
    ...ordered.map(({ index }) => localFingerprints.get(scopeNodes[index]!.id)!),
  ]);
}
