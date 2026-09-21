import type {} from '@deepseek-ai/dsh-client-ui-chat/client';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { Report, FileReport } from '../report.ts';
import type { ReportIndex } from '../report.ts';
import type { NoemaKey } from './locales.ts';
import type { FailureReason } from '../analyzer/types.ts';
import { measuredScope, metricText, scopeChildren } from './presentation.ts';

export interface CardInjected {
  source: {
    getSnapshot: () => ReportIndex[];
    subscribe: (listener: () => void) => () => void;
  };
  load: (report_id: string, signal: AbortSignal) => Promise<Report | undefined>;
  onError: (error: unknown) => void;
}

type CardProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'noema'> & InjectFace<CardInjected>;
type Translate = (key: NoemaKey) => string;

export function NoemaCard({ turn, source, load, onError, t }: CardProps) {
  const indexes = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const index = indexes.find((item) => item.start_seq === turn.start?.seq && item.turn === turn.turn);
  const loaded = useRef<string>();
  const [report, setReport] = useState<Report>();
  useEffect(() => {
    const reportId = index?.report_id;
    if (reportId && loaded.current === reportId) return;
    const abort = new AbortController();
    setReport(undefined);
    loaded.current = undefined;
    if (reportId)
      void load(reportId, abort.signal)
        .then((result) => {
          if (!abort.signal.aborted) {
            loaded.current = reportId;
            setReport(result);
          }
        })
        .catch((error) => {
          if (!abort.signal.aborted) onError(error);
        });
    return () => abort.abort();
  }, [index, load, onError]);
  if (!report) return null;
  return <ReportCard report={report} t={t} />;
}

export function ReportCard({ report, t }: { report: Report; t: Translate }) {
  return (
    <section className="noema-card" data-noema-report={report.report_id}>
      <div className="noema-table-scroll">
        <table className="noema-table" aria-label={t('title')}>
          <colgroup>
            <col className="noema-name-column" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <Tooltip label={t('attribution')} side="bottom">
                  <span className="noema-title">
                    <svg
                      className="noema-mark"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M3 5c5-4 9 4 14 0M3 10c5-4 9 4 14 0M3 15c5-4 9 4 14 0" />
                    </svg>
                    {t('title')}
                  </span>
                </Tooltip>
              </th>
              <th scope="col">{t('cyclomatic')}</th>
              <th scope="col">{t('cognitive')}</th>
              <th scope="col">{t('nesting')}</th>
            </tr>
          </thead>
          {report.files.map((file) => (
            <FileCard key={file.path} file={file} t={t} />
          ))}
        </table>
      </div>
    </section>
  );
}

type MetricProps = {
  before?: number;
  after?: number;
};

function MetricValue({ before, after }: MetricProps) {
  const delta = before === undefined || after === undefined ? undefined : after - before;
  const tone = delta === undefined ? 'default' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  return (
    <span className={`noema-metric noema-${tone}`} aria-label={metricText(before, after)}>
      <span className="noema-values">
        {before !== undefined && after !== undefined && before !== after && (
          <>
            <span className="noema-before">{before}</span>
            <span className="noema-arrow">→</span>
          </>
        )}
        <strong>{after ?? before ?? '-'}</strong>
      </span>
      {delta !== undefined && delta !== 0 && (
        <span className="noema-delta">
          {delta > 0 ? '+' : '−'}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

function Metric(props: MetricProps) {
  return (
    <td>
      <MetricValue {...props} />
    </td>
  );
}

function FileCard({ file, t }: { file: FileReport; t: Translate }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedFunctions, setExpandedFunctions] = useState<Set<number>>(() => new Set());
  const [revealed, setRevealed] = useState<Set<number | undefined>>(() => new Set());
  const changed = scopeChildren(file);
  const all = scopeChildren(file, true);
  const scopeAt = (index: number) =>
    measuredScope(file, file.changes[index]!, 'after') ?? measuredScope(file, file.changes[index]!, 'before')!;
  const expandable = (parent?: number) => (all.get(parent) ?? []).some((index) => scopeAt(index).kind === 'function');
  type Row = { kind: 'code'; index: number; depth: number } | { kind: 'reveal'; parent?: number; depth: number };
  const rows: Row[] = [];
  const visit = (parent: number | undefined, depth: number) => {
    const children = (revealed.has(parent) ? all : changed).get(parent) ?? [];
    for (const index of children) {
      rows.push({ kind: 'code', index, depth });
      if (expandedFunctions.has(index)) visit(index, depth + 1);
    }
    if (!revealed.has(parent) && (all.get(parent)?.length ?? 0) > children.length)
      rows.push({ kind: 'reveal', parent, depth });
  };
  const current = file.after?.status === 'ok' ? file.after.analysis.scopes[0].metrics : undefined;
  const old = current && file.before?.status === 'ok' ? file.before.analysis.scopes[0].metrics : undefined;
  const fileExpandable = current !== undefined && expandable();
  const FileTitle = fileExpandable ? 'button' : 'span';
  if (expanded && fileExpandable) visit(undefined, 1);
  return (
    <tbody className="noema-file">
      <tr
        className={fileExpandable ? 'noema-file-row noema-expandable-row' : 'noema-file-row'}
        onClick={fileExpandable ? () => setExpanded((value) => !value) : undefined}
      >
        <th scope="row">
          <div className="noema-file-heading">
            <FileTitle
              className="noema-file-title"
              type={fileExpandable ? 'button' : undefined}
              aria-expanded={fileExpandable ? expanded : undefined}
            >
              {fileExpandable ? <Chevron className="noema-file-chevron" /> : <span className="noema-toggle-space" />}
              <span className="noema-file-path">{file.path}</span>
            </FileTitle>
            <MeasurementIssue side={current ? file.before : file.after} phase={current ? 'before' : 'after'} t={t} />
            {file.before === undefined && <span className="noema-status noema-status-added">{t('added')}</span>}
          </div>
        </th>
        <Metric before={old?.cyclomatic} after={current?.cyclomatic} />
        <Metric before={old?.cognitive} after={current?.cognitive} />
        <Metric before={old?.max_nesting_depth} after={current?.max_nesting_depth} />
      </tr>
      {rows.map((row) => {
        if (row.kind === 'reveal')
          return (
            <tr key={`reveal-${row.parent}`}>
              <td colSpan={4}>
                <button
                  type="button"
                  className="noema-reveal"
                  style={{ paddingInlineStart: row.depth * 16 }}
                  onClick={() => setRevealed((value) => new Set(value).add(row.parent))}
                >
                  {t('show_unchanged')}
                </button>
              </td>
            </tr>
          );
        const { index, depth } = row;
        const change = file.changes[index]!;
        const before = measuredScope(file, change, 'before'),
          after = measuredScope(file, change, 'after');
        const scope = after ?? before!;
        const name = scope.kind === 'top_level' ? t('top_level') : scope.name!;
        const nested = expandable(index);
        const side = after ? file.after : file.before;
        const recursive = scope.kind === 'function' ? scope.recursion : undefined;
        const recursionNames = recursive?.cycle_members
          .map((member) => (side?.status === 'ok' ? side.analysis.scopes[member]!.name : '—'))
          .join(', ');
        const recursionLabel = [
          ...(recursive?.direct ? [t('direct')] : []),
          ...(recursive && recursive.cycle_members.length > 1 ? [`${t('mutual')}: ${recursionNames}`] : []),
        ].join(' · ');
        return (
          <tr
            key={index}
            data-change={change.change}
            className={nested ? 'noema-expandable-row' : undefined}
            onClick={
              nested
                ? () =>
                    setExpandedFunctions((value) => {
                      const next = new Set(value);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                : undefined
            }
          >
            <th scope="row">
              <div className="noema-function" style={{ paddingInlineStart: depth * 16 }}>
                {nested ? (
                  <button
                    type="button"
                    className="noema-function-label"
                    aria-label={name}
                    aria-expanded={expandedFunctions.has(index)}
                  >
                    <Chevron className="noema-function-chevron" />
                    <span className="noema-function-name">{name}</span>
                  </button>
                ) : (
                  <>
                    <span className="noema-toggle-space" />
                    <span
                      className={
                        scope.kind === 'top_level' ? 'noema-function-name noema-top-level' : 'noema-function-name'
                      }
                    >
                      {name}
                    </span>
                  </>
                )}
                {scope.kind === 'function' && (change.change === 'added' || change.change === 'removed') && (
                  <span className={`noema-status noema-status-${change.change}`}>{t(change.change)}</span>
                )}
                {recursionLabel && (
                  <Tooltip label={recursionLabel} side="top">
                    <span className="noema-recursion" aria-label={recursionLabel} tabIndex={0}>
                      ↻
                    </span>
                  </Tooltip>
                )}
              </div>
            </th>
            <Metric before={before?.metrics?.cyclomatic} after={after?.metrics?.cyclomatic} />
            <Metric before={before?.metrics?.cognitive} after={after?.metrics?.cognitive} />
            <Metric before={before?.metrics?.max_nesting_depth} after={after?.metrics?.max_nesting_depth} />
          </tr>
        );
      })}
    </tbody>
  );
}

const failureReasons: Record<FailureReason, 'parse' | 'read' | 'changed' | 'size' | 'text' | 'file'> = {
  parse_error: 'parse',
  read_error: 'read',
  changed_during_read: 'changed',
  file_too_large: 'size',
  not_text: 'text',
  not_regular_file: 'file',
};

function MeasurementIssue({ side, phase, t }: { side: FileReport['before']; phase: 'before' | 'after'; t: Translate }) {
  if (side?.status !== 'unavailable') return null;
  const label = t(`failure_${phase}_${failureReasons[side.reason]}`);
  const warning = phase === 'before';
  return (
    <Tooltip label={label} side="top">
      <span
        className={`noema-issue ${warning ? 'noema-warning' : 'noema-danger'}`}
        role="img"
        aria-label={label}
        tabIndex={0}
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 5.5v3.5M8 11.5h.01" />
        </svg>
      </span>
    </Tooltip>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}
