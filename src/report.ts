import { z } from 'zod';
import { FailureReasonSchema, SuccessfulAnalysisSchema } from './analyzer/types.ts';

const count = z.number().int().nonnegative();
const delta = z.object({
  cyclomatic: z.number().int(),
  cognitive: z.number().int(),
  max_nesting_depth: z.number().int(),
});
const side = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), analysis: SuccessfulAnalysisSchema }),
  z.object({ status: z.literal('unavailable'), reason: FailureReasonSchema }),
]);
/** Before/after indexes refer to measured scopes; parent refers to a change index in the same file */
export const ScopeChangeSchema = z.union([
  z.object({
    change: z.enum(['added', 'unavailable']),
    before_index: z.undefined().optional(),
    after_index: count,
    parent: count.optional(),
    delta: z.undefined().optional(),
  }),
  z.object({
    change: z.enum(['removed', 'unavailable']),
    before_index: count,
    after_index: z.undefined().optional(),
    parent: count.optional(),
    delta: z.undefined().optional(),
  }),
  z.object({
    change: z.enum(['modified', 'unchanged']),
    before_index: count,
    after_index: count,
    parent: count.optional(),
    delta: delta.optional(),
  }),
]);
export const FileReportSchema = z
  .object({
    path: z.string(),
    before: side.optional(),
    after: side.optional(),
    changes: z.array(ScopeChangeSchema),
  })
  .superRefine((file, ctx) => {
    const before = file.before?.status === 'ok' ? file.before.analysis.scopes : [];
    const after = file.after?.status === 'ok' ? file.after.analysis.scopes : [];
    const available = file.before?.status !== 'unavailable' && file.after?.status !== 'unavailable';
    for (const [index, change] of file.changes.entries()) {
      const old = change.before_index === undefined ? undefined : before[change.before_index];
      const current = change.after_index === undefined ? undefined : after[change.after_index];
      if (change.before_index !== undefined && !old)
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'before_index'],
          message: 'Index must refer to a measured scope before the change',
        });
      if (change.after_index !== undefined && !current)
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'after_index'],
          message: 'Index must refer to a measured scope after the change',
        });
      if ((change.change === 'unavailable') === available)
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'change'],
          message: 'Change status must match measurement availability',
        });
      if (
        old &&
        current &&
        (old.kind !== current.kind || Boolean(change.delta) !== Boolean(old.metrics && current.metrics))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index],
          message: 'Paired scopes must have matching kinds and comparable metrics',
        });
      const scope = current ?? old;
      if (!scope) continue;
      const parent = change.parent === undefined ? undefined : file.changes[change.parent];
      const parentIndex = current ? parent?.after_index : parent?.before_index;
      if (
        scope.parent === undefined
          ? change.parent !== undefined
          : change.parent === undefined || change.parent >= index || parentIndex !== scope.parent
      )
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'parent'],
          message: 'Parent must refer to the paired enclosing scope',
        });
    }
  });
export const ReportSchema = z.object({
  report_id: z.string().min(1),
  session_id: z.string().min(1),
  turn: count,
  start_seq: count,
  end_seq: count,
  files: z.array(FileReportSchema),
});
export const ReportIndexSchema = ReportSchema.pick({ report_id: true, turn: true, start_seq: true });

export type Report = z.infer<typeof ReportSchema>;
export type FileReport = z.infer<typeof FileReportSchema>;
export type ScopeChange = z.infer<typeof ScopeChangeSchema>;
export type ReportIndex = z.infer<typeof ReportIndexSchema>;
