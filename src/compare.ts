import { z } from 'zod';
import { diagnose } from './diagnostics.ts';
import { analyzeSource } from './analyzer/index.ts';
import { FailureReasonSchema } from './analyzer/types.ts';
import type { MeasuredScope } from './analyzer/types.ts';
import type { FileReport, Report, ScopeChange } from './report.ts';
import type { CapturedFile } from './snapshot.ts';

const capturedFile = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), source: z.string(), hash: z.string() }),
  z.object({ status: z.literal('skipped'), reason: FailureReasonSchema.exclude(['parse_error']) }),
]);
const snapshot = z.object({
  files: z.record(z.string(), capturedFile),
  ignore_rules: z.record(z.string(), z.string()),
});
export const ReportRequestSchema = z.object({
  report_id: z.string().min(1),
  session_id: z.string().min(1),
  turn: z.number().int().nonnegative(),
  start_seq: z.number().int().nonnegative(),
  end_seq: z.number().int().nonnegative(),
  before: snapshot,
  after: snapshot,
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

function scopeKeys(scopes: MeasuredScope[]): (string | undefined)[] {
  const keys: (string | undefined)[] = [];
  for (const scope of scopes) {
    const parent = scope.parent === undefined ? '' : keys[scope.parent];
    keys.push(
      parent === undefined || scope.name === undefined
        ? undefined
        : `${parent}/${JSON.stringify([scope.kind, scope.syntax_kind, scope.name])}`,
    );
  }
  const counts = new Map<string, number>();
  for (const key of keys) if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (let i = 0; i < keys.length; i++) {
    const parent = scopes[i]!.parent;
    const key = keys[i];
    if (key === undefined || counts.get(key) !== 1 || (parent !== undefined && keys[parent] === undefined))
      keys[i] = undefined;
  }
  return keys;
}

function pairScopes(before: MeasuredScope[], after: MeasuredScope[], available: boolean): ScopeChange[] {
  const oldKeys = scopeKeys(before);
  const newKeys = scopeKeys(after);
  const oldByKey = new Map(oldKeys.flatMap((key, index) => (key === undefined ? [] : [[key, index] as const])));
  const changes: ScopeChange[] = [];
  const oldToChange = new Map<number, number>();
  const newToChange = new Map<number, number>();
  for (const [index, scope] of after.entries()) {
    const key = newKeys[index];
    const previous = key === undefined ? undefined : oldByKey.get(key);
    const old = previous === undefined ? undefined : before[previous]!;
    const delta =
      old?.metrics && scope.metrics
        ? {
            cyclomatic: scope.metrics.cyclomatic - old.metrics.cyclomatic,
            cognitive: scope.metrics.cognitive - old.metrics.cognitive,
            max_nesting_depth: scope.metrics.max_nesting_depth - old.metrics.max_nesting_depth,
          }
        : undefined;
    if (previous === undefined) {
      changes.push({
        change: available ? 'added' : 'unavailable',
        after_index: index,
      });
    } else {
      changes.push({
        change:
          old!.code_hash !== scope.code_hash ||
          (delta !== undefined && Object.values(delta).some((value) => value !== 0))
            ? 'modified'
            : 'unchanged',
        before_index: previous,
        after_index: index,
        ...(delta && { delta }),
      });
    }
    newToChange.set(index, changes.length - 1);
    if (previous !== undefined) oldToChange.set(previous, changes.length - 1);
  }
  for (let index = 0; index < before.length; index++)
    if (!oldToChange.has(index)) {
      changes.push({
        before_index: index,
        change: available ? 'removed' : 'unavailable',
      });
      oldToChange.set(index, changes.length - 1);
    }
  for (const change of changes) {
    const source = change.after_index === undefined ? before[change.before_index]! : after[change.after_index]!;
    const indexes = change.after_index === undefined ? oldToChange : newToChange;
    if (source.parent !== undefined) change.parent = indexes.get(source.parent)!;
  }
  return changes;
}

async function measure(path: string, file: CapturedFile | undefined): Promise<FileReport['before']> {
  if (file === undefined) return undefined;
  if (file.status === 'skipped') return { status: 'unavailable', reason: file.reason };
  const result = await analyzeSource(path, file.source);
  if (result === undefined) throw new Error(`Snapshot contains unsupported file ${path}`);
  if (result.status === 'not_analyzed') return { status: 'unavailable', reason: result.reason };
  const { status, ...analysis } = result;
  return { status, analysis };
}

export async function compareSnapshots(request: ReportRequest): Promise<Report | undefined> {
  const context = { session_id: request.session_id, turn: request.turn, start_seq: request.start_seq };
  diagnose('comparison.started', context);
  const omitted: { path: string; reason: string }[] = [];
  let unchanged = 0;
  const files: FileReport[] = [];
  const paths = [...new Set([...Object.keys(request.before.files), ...Object.keys(request.after.files)])].sort();
  for (const path of paths) {
    const old = request.before.files[path];
    const current = request.after.files[path];
    if (current === undefined) {
      omitted.push({ path, reason: 'deleted_file' });
      continue;
    }
    if (old?.status === 'ok' && current?.status === 'ok' && old.hash === current.hash) {
      unchanged++;
      continue;
    }
    const before = await measure(path, old);
    const after = await measure(path, current);
    const a = before?.status === 'ok' ? before.analysis.scopes : undefined;
    const b = after?.status === 'ok' ? after.analysis.scopes : undefined;
    if (a && b && a[0].code_hash === b[0].code_hash) {
      omitted.push({ path, reason: 'syntax_unchanged' });
      continue;
    }
    if (before === undefined && b !== undefined) {
      const empty = await analyzeSource(path, '');
      if (empty?.status === 'ok' && b[0].code_hash === empty.scopes[0].code_hash) {
        omitted.push({ path, reason: 'empty_syntax' });
        continue;
      }
    }
    files.push({
      path,
      ...(before && { before }),
      ...(after && { after }),
      changes: pairScopes(
        a ?? [],
        b ?? [],
        (before === undefined || a !== undefined) && (after === undefined || b !== undefined),
      ),
    });
  }
  diagnose('comparison.completed', {
    ...context,
    files: files.map((file) => file.path),
    unchanged_files: unchanged,
    omitted,
  });
  if (files.length === 0) return undefined;
  return {
    report_id: request.report_id,
    session_id: request.session_id,
    turn: request.turn,
    start_seq: request.start_seq,
    end_seq: request.end_seq,
    files,
  };
}
