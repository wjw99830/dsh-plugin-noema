import type { Node } from 'web-tree-sitter';
import type { AnalysisLanguage } from '../languages.ts';
import type { UnaggregatedScopes } from './types.ts';

interface Environment {
  parent?: Environment;
  kind: 'file' | 'function' | 'class' | 'block';
  bindings: Map<string, number | undefined>;
  caller?: number;
  body?: Node;
}

function bindingNames(node?: Node | null): string[] {
  if (!node) return [];
  const names: string[] = [];
  const pending = [node];
  while (pending.length) {
    const current = pending.pop()!;
    switch (current.type) {
      case 'identifier':
      case 'shorthand_property_identifier_pattern':
        names.push(current.text);
        break;
      case 'required_parameter':
      case 'optional_parameter': {
        const pattern = current.childForFieldName('pattern');
        if (pattern) pending.push(pattern);
        break;
      }
      case 'parameter_declaration':
      case 'variadic_parameter_declaration':
        pending.push(...current.childrenForFieldName('name'));
        break;
      case 'typed_parameter':
      case 'default_parameter':
      case 'typed_default_parameter': {
        const name = current.childForFieldName('name') ?? current.namedChildren[0];
        if (name) pending.push(name);
        break;
      }
      case 'assignment_pattern':
      case 'object_assignment_pattern': {
        const left = current.childForFieldName('left');
        if (left) pending.push(left);
        break;
      }
      case 'pair_pattern': {
        const value = current.childForFieldName('value');
        if (value) pending.push(value);
        break;
      }
      case 'parameters':
      case 'lambda_parameters':
      case 'formal_parameters':
      case 'parameter_list':
      case 'object_pattern':
      case 'array_pattern':
      case 'tuple_pattern':
      case 'list_pattern':
      case 'pattern_list':
      case 'expression_list':
      case 'rest_pattern':
      case 'list_splat_pattern':
      case 'dictionary_splat_pattern':
      case 'as_pattern_target':
        pending.push(...current.namedChildren);
        break;
    }
  }
  return names;
}

function bind(env: Environment, name: string, target?: number): void {
  env.bindings.set(name, env.bindings.has(name) ? undefined : target);
}

function lookup(env: Environment, name: string): Environment | undefined {
  for (let current: Environment | undefined = env; current; current = current.parent) {
    if (current.bindings.has(name)) return current;
  }
  return undefined;
}

/** Adds one cognitive point to each recursive function in scopes
 * @param functions Syntax node IDs mapped to scope indexes
 */
export function markRecursion(
  root: Node,
  language: AnalysisLanguage,
  scopes: UnaggregatedScopes,
  functions: Map<number, number>,
): void {
  const functionScopes = new Map(
    scopes.flatMap((scope, index) => (scope.kind === 'function' ? [[index, scope] as const] : [])),
  );
  const file: Environment = { kind: 'file', bindings: new Map() };
  const pending: { node: Node; env: Environment }[] = [{ node: root, env: file }];
  const calls: { env: Environment; name: string }[] = [];
  const writes: { env: Environment; name: string }[] = [];
  while (pending.length) {
    let { node, env } = pending.pop()!;
    const fn = functions.get(node.id);
    if (fn !== undefined) {
      const name = node.childForFieldName('name');
      const declaration = ['function_declaration', 'generator_function_declaration', 'function_definition'].includes(
        node.type,
      );
      if (declaration && name) bind(env, name.text, node.parent?.type === 'decorated_definition' ? undefined : fn);
      let parent: Environment | undefined = env;
      if (language === 'python') while (parent?.kind === 'class') parent = parent.parent;
      env = {
        parent,
        kind: 'function',
        bindings: new Map(),
        caller: fn,
        body: node.childForFieldName('body') ?? undefined,
      };
      if (name && (node.type === 'function_expression' || node.type === 'generator_function')) bind(env, name.text, fn);
      for (const param of bindingNames(node.childForFieldName('parameters') ?? node.childForFieldName('parameter')))
        bind(env, param);
      for (const param of bindingNames(node.childForFieldName('receiver'))) bind(env, param);
    } else if (['class_declaration', 'class_definition', 'class'].includes(node.type)) {
      const name = node.childForFieldName('name');
      if (name) bind(env, name.text);
      env = { ...env, parent: env, kind: 'class', bindings: new Map() };
    } else if (
      (language !== 'python' &&
        [
          'statement_block',
          'block',
          'for_statement',
          'for_in_statement',
          'if_statement',
          'catch_clause',
          'switch_case',
          'expression_case',
          'type_case',
          'communication_case',
          'expression_switch_statement',
          'type_switch_statement',
          'select_statement',
          'internal_module',
        ].includes(node.type)) ||
      (language === 'python' &&
        ['list_comprehension', 'set_comprehension', 'dictionary_comprehension', 'generator_expression'].includes(
          node.type,
        ))
    ) {
      env = { ...env, parent: env, kind: 'block', bindings: new Map() };
    }

    const declare = (pattern: Node | null, target?: number) => {
      for (const name of bindingNames(pattern)) bind(env, name, target);
    };
    const write = (pattern?: Node | null) => {
      for (const name of bindingNames(pattern)) writes.push({ env, name });
    };
    if (language === 'typescript' || language === 'tsx') {
      switch (node.type) {
        case 'variable_declarator': {
          const name = node.childForFieldName('name');
          let value = node.childForFieldName('value') ?? undefined;
          while (value?.type === 'parenthesized_expression')
            value = value.namedChildren.find((child) => child.type !== 'comment');
          const target = name?.type === 'identifier' && value ? functions.get(value.id) : undefined;
          let owner = env;
          if (node.parent?.type === 'variable_declaration') {
            while (owner.kind === 'block') owner = owner.parent!;
          }
          for (const binding of bindingNames(name)) bind(owner, binding, target);
          break;
        }
        case 'enum_declaration':
          declare(node.childForFieldName('name'));
          break;
        case 'catch_clause':
          declare(node.childForFieldName('parameter'));
          break;
        case 'for_in_statement': {
          const left = node.childForFieldName('left');
          let owner = env;
          if (node.children.some((child) => child.type === 'var')) {
            while (owner.kind === 'block') owner = owner.parent!;
          }
          for (const name of bindingNames(left)) bind(owner, name);
          break;
        }
        case 'assignment_expression':
        case 'augmented_assignment_expression':
          write(node.childForFieldName('left'));
          break;
        case 'update_expression':
          write(node.childForFieldName('argument'));
          break;
        case 'import_specifier':
          declare(node.childForFieldName('alias') ?? node.childForFieldName('name'));
          break;
        case 'import_clause':
        case 'namespace_import':
          for (const child of node.namedChildren) if (child.type === 'identifier') declare(child);
          break;
      }
    } else if (language === 'python') {
      switch (node.type) {
        case 'assignment':
        case 'augmented_assignment':
        case 'for_statement':
        case 'for_in_clause':
          declare(node.childForFieldName('left'));
          break;
        case 'named_expression': {
          let owner = env;
          while (owner.kind === 'block') owner = owner.parent!;
          for (const name of bindingNames(node.childForFieldName('name'))) bind(owner, name);
          break;
        }
        case 'as_pattern':
          declare(node.childForFieldName('alias'));
          break;
        case 'case_pattern': {
          const patterns = [...node.namedChildren];
          while (patterns.length) {
            const pattern = patterns.pop()!;
            if (pattern.type === 'dotted_name') {
              if (pattern.namedChildCount === 1) declare(pattern.namedChildren[0]!);
            } else if (pattern.type === 'class_pattern') {
              patterns.push(...pattern.namedChildren.slice(1));
            } else if (pattern.type === 'keyword_pattern') {
              patterns.push(...pattern.namedChildren.slice(1));
            } else if (pattern.type === 'dict_pattern') {
              patterns.push(
                ...pattern.childrenForFieldName('value'),
                ...pattern.namedChildren.filter((child) => child.type === 'splat_pattern'),
              );
            } else if (pattern.type === 'splat_pattern' || pattern.type === 'as_pattern') {
              for (const child of pattern.namedChildren) declare(child);
            } else if (pattern.type !== 'case_pattern') {
              patterns.push(...pattern.namedChildren);
            }
          }
          break;
        }
        case 'global_statement':
        case 'nonlocal_statement':
          for (const child of node.namedChildren) {
            declare(child);
            for (const name of bindingNames(child)) {
              const owner = node.type === 'global_statement' ? file : env.parent;
              if (owner) writes.push({ env: owner, name });
            }
          }
          break;
        case 'delete_statement':
          for (const child of node.namedChildren) declare(child);
          break;
        case 'import_statement':
        case 'import_from_statement':
          for (const imported of node.childrenForFieldName('name')) {
            const name = imported.childForFieldName('alias')?.text ?? imported.text.split('.')[0]!;
            bind(env, name);
          }
          break;
      }
    } else {
      switch (node.type) {
        case 'var_spec':
        case 'const_spec':
          for (const name of node.childrenForFieldName('name')) declare(name);
          break;
        case 'type_spec':
        case 'type_alias':
        case 'type_parameter_declaration':
          for (const name of node.childrenForFieldName('name')) bind(env, name.text);
          break;
        case 'type_switch_statement':
          declare(node.childForFieldName('alias'));
          break;
        case 'short_var_declaration':
          declare(node.childForFieldName('left'));
          break;
        case 'receive_statement':
          if (node.children.some((child) => child.type === ':=')) declare(node.childForFieldName('left'));
          else write(node.childForFieldName('left'));
          break;
        case 'range_clause':
          if (node.children.some((child) => child.type === ':=')) declare(node.childForFieldName('left'));
          else write(node.childForFieldName('left'));
          break;
        case 'assignment_statement':
          write(node.childForFieldName('left'));
          break;
        case 'inc_statement':
        case 'dec_statement':
          write(node.namedChildren[0]);
          break;
        case 'import_spec':
          declare(node.childForFieldName('name'));
          break;
      }
    }
    if (
      (node.type === 'call_expression' ||
        node.type === 'call' ||
        (language === 'go' && node.type === 'type_conversion_expression')) &&
      env.caller !== undefined &&
      env.body &&
      node.startIndex >= env.body.startIndex &&
      node.endIndex <= env.body.endIndex
    ) {
      let callee = node.childForFieldName('function') ?? node.childForFieldName('type') ?? undefined;
      while (
        callee &&
        (callee.type === 'parenthesized_expression' ||
          (language === 'go' && ['generic_type', 'index_expression'].includes(callee.type)))
      )
        callee = callee.namedChildren[0];
      if (callee?.type === 'identifier' || (language === 'go' && callee?.type === 'type_identifier'))
        calls.push({ env, name: callee.text });
    }
    for (const child of node.namedChildren.toReversed()) pending.push({ node: child, env });
  }
  for (const { env, name } of writes) lookup(env, name)?.bindings.set(name, undefined);
  const graph = new Map<number, Set<number>>();
  const reverse = new Map<number, Set<number>>();
  for (const index of functions.values()) {
    graph.set(index, new Set());
    reverse.set(index, new Set());
  }
  for (const { env, name } of calls) {
    const target = lookup(env, name)?.bindings.get(name);
    if (target !== undefined) {
      graph.get(env.caller!)!.add(target);
      reverse.get(target)!.add(env.caller!);
    }
  }
  const seen = new Set<number>();
  const order: number[] = [];
  for (const start of graph.keys()) {
    const stack: { index: number; exit: boolean }[] = [{ index: start, exit: false }];
    while (stack.length) {
      const { index, exit } = stack.pop()!;
      if (exit) {
        order.push(index);
        continue;
      }
      if (seen.has(index)) continue;
      seen.add(index);
      stack.push({ index, exit: true });
      for (const target of graph.get(index)!) if (!seen.has(target)) stack.push({ index: target, exit: false });
    }
  }
  seen.clear();
  for (const start of order.toReversed()) {
    if (seen.has(start)) continue;
    const members: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const index = stack.pop()!;
      members.push(index);
      for (const target of reverse.get(index)!)
        if (!seen.has(target)) {
          seen.add(target);
          stack.push(target);
        }
    }
    if (members.length === 1 && !graph.get(start)!.has(start)) continue;
    members.sort((a, b) => a - b);
    for (const index of members) {
      const scope = functionScopes.get(index)!;
      scope.recursion = { direct: graph.get(index)!.has(index), cycle_members: [...members] };
      scope.metrics.cognitive++;
    }
  }
}
