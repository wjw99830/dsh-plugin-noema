import { z } from 'zod';

export const SCORING_RULES = 'noema/structural-v2-experimental';

const count = z.number().int().nonnegative();
const metrics = z.object({ cyclomatic: count, cognitive: count, max_nesting_depth: count });
const range = z.object({
  start_byte: count,
  end_byte: count,
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
});
const scopeFields = { code_hash: z.string(), syntax_kind: z.string(), range };
const moduleScope = z.object({
  ...scopeFields,
  kind: z.literal('module'),
  name: z.string(),
  parent: z.undefined().optional(),
  metrics,
});
const functionScope = z.object({
  ...scopeFields,
  kind: z.literal('function'),
  name: z.string(),
  parent: count,
  metrics,
  recursion: z.object({ direct: z.boolean(), cycle_members: z.array(count).nonempty() }).optional(),
});
const topLevelScope = z.object({
  ...scopeFields,
  kind: z.literal('top_level'),
  name: z.literal('Top Level'),
  parent: count,
  metrics,
});
const containerScope = z.object({
  ...scopeFields,
  kind: z.enum(['class', 'interface', 'namespace']),
  name: z.string().optional(),
  parent: count,
  metrics: z.undefined().optional(),
});
const childScope = z.discriminatedUnion('kind', [functionScope, topLevelScope, containerScope]);
const scopes = z
  .tuple([moduleScope])
  .rest(childScope)
  .superRefine((values, ctx) => {
    for (const [index, scope] of values.entries()) {
      if (scope.parent !== undefined) {
        const parent = values[scope.parent];
        if (scope.parent >= index || !parent || parent.kind === 'top_level')
          ctx.addIssue({
            code: 'custom',
            path: [index, 'parent'],
            message: 'Parent must refer to an earlier enclosing scope',
          });
        else if (scope.kind === 'top_level' && parent.kind !== 'module' && parent.kind !== 'function')
          ctx.addIssue({
            code: 'custom',
            path: [index, 'parent'],
            message: 'Top Level must belong to a file or function',
          });
      }
      if (scope.kind === 'function' && scope.recursion) {
        const members = scope.recursion.cycle_members;
        if (!members.includes(index) || members.some((member) => values[member]?.kind !== 'function'))
          ctx.addIssue({
            code: 'custom',
            path: [index, 'recursion', 'cycle_members'],
            message: 'Recursion members must refer to functions and include this function',
          });
      }
    }
  });
const engine = z.object({
  name: z.literal('noema-tree-sitter'),
  rules: z.literal(SCORING_RULES),
  runtime_version: z.string(),
  grammar: z.object({ package_name: z.string(), version: z.string() }),
});

export const SuccessfulAnalysisSchema = z.object({
  path: z.string(),
  language: z.enum(['typescript', 'tsx', 'python', 'go']),
  engine,
  scopes,
});
export const FailureReasonSchema = z.enum([
  'parse_error',
  'read_error',
  'changed_during_read',
  'file_too_large',
  'not_text',
  'not_regular_file',
]);

/** UTF-8 byte offsets are zero-based and end-exclusive; lines are one-based and inclusive */
export type SourceRange = z.infer<typeof range>;
export type StructuralMetrics = z.infer<typeof metrics>;
export type ModuleScope = z.infer<typeof moduleScope>;
export type FunctionScope = z.infer<typeof functionScope>;
export type TopLevelScope = z.infer<typeof topLevelScope>;
export type ContainerScope = z.infer<typeof containerScope>;
export type ChildScope = z.infer<typeof childScope>;
export type MeasuredScope = ModuleScope | ChildScope;
export type MeasuredScopes = z.infer<typeof scopes>;
export type EngineIdentity = z.infer<typeof engine>;
export type SuccessfulAnalysis = z.infer<typeof SuccessfulAnalysisSchema>;
export type FailureReason = z.infer<typeof FailureReasonSchema>;

export type UnaggregatedFunction = Omit<FunctionScope, 'name'> & { name?: string };
export type UnaggregatedChild = UnaggregatedFunction | ContainerScope;
export type UnaggregatedScopes = [ModuleScope, ...UnaggregatedChild[]];

export type SourceAnalysis =
  ({ status: 'ok' } & SuccessfulAnalysis) | { status: 'not_analyzed'; reason: 'parse_error' };
