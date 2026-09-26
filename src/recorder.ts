import type { FileSystem } from '@deepseek-ai/dsh-fs';
import type { AnalysisConfig } from './config.ts';
import { captureSnapshot } from './snapshot.ts';
import type { Snapshot } from './snapshot.ts';
import type { Report } from './report.ts';
import type { AnalysisQueue } from './analyzer/queue.ts';
import { diagnose, snapshotDetails } from './diagnostics.ts';

interface TurnCapture {
  turn: number;
  start_seq: number;
  before?: Snapshot;
  config: AnalysisConfig;
}

export class TurnRecorder {
  private tail: Promise<void> = Promise.resolve();
  private readonly turns = new Map<number, TurnCapture>();
  private readonly jobs = new Set<Promise<void>>();

  /** @param getConfig Settings captured once at each turn start */
  constructor(
    private readonly fs: FileSystem,
    private readonly cwd: string,
    private readonly sessionId: string,
    private readonly getConfig: () => AnalysisConfig,
    private readonly signal: AbortSignal,
    private readonly queue: AnalysisQueue,
    private readonly save: (report: Report) => Promise<void>,
  ) {}

  /** Call barrier() after start() to await baseline capture before running workspace tools */
  start(turn: number, seq: number): void {
    const state: TurnCapture = {
      turn,
      start_seq: seq,
      config: this.getConfig(),
    };
    const context = { session_id: this.sessionId, turn, start_seq: seq };
    diagnose('capture.queued', {
      ...context,
      cwd: this.cwd,
      include: state.config.include,
      exclude: state.config.exclude,
    });
    this.turns.set(turn, state);
    this.tail = this.tail
      .then(async () => {
        diagnose('baseline.started', context);
        state.before = await captureSnapshot(this.fs, this.cwd, state.config, this.signal);
        diagnose('baseline.completed', { ...context, ...snapshotDetails(state.before) });
      })
      .catch((error) => {
        diagnose('baseline.failed', { ...context, error: String(error) }, this.signal.aborted ? 'debug' : 'warn');
      });
  }

  end(turn: number, seq: number): void {
    const state = this.turns.get(turn);
    this.turns.delete(turn);
    const context = { session_id: this.sessionId, turn, end_seq: seq };
    if (!state) {
      diagnose('capture.skipped', { ...context, reason: 'start_not_recorded' }, 'warn');
      return;
    }
    this.tail = this.tail
      .then(async () => {
        if (state.before === undefined) {
          diagnose('capture.skipped', { ...context, reason: 'baseline_unavailable' });
          return;
        }
        diagnose('final_snapshot.started', context);
        const after = await captureSnapshot(this.fs, this.cwd, state.config, this.signal, state.before.ignore_rules);
        const paths = new Set([...Object.keys(state.before.files), ...Object.keys(after.files)]);
        const changed = [...paths].filter((path) => {
          const before = state.before!.files[path];
          const current = after.files[path];
          return before?.status !== 'ok' || current?.status !== 'ok' || before.hash !== current.hash;
        });
        diagnose('final_snapshot.completed', { ...context, ...snapshotDetails(after), changed_candidates: changed });
        diagnose('analysis.queued', context);
        let phase = 'analysis';
        const job = this.queue
          .run({
            report_id: `${Buffer.from(this.sessionId).toString('base64url')}_${state.start_seq}`,
            session_id: this.sessionId,
            turn,
            start_seq: state.start_seq,
            end_seq: seq,
            before: state.before,
            after,
          })
          .then(async (report) => {
            diagnose('analysis.completed', { ...context, file_count: report?.files.length ?? 0 });
            if (report === undefined) return;
            if (this.signal.aborted) {
              diagnose('save.skipped', { ...context, reason: 'plugin_disposed' });
              return;
            }
            phase = 'save';
            diagnose('save.started', context);
            await this.save(report);
            diagnose(
              'save.completed',
              { ...context, report_id: report.report_id, files: report.files.map((file) => file.path) },
              'info',
            );
          })
          .catch((error) => {
            diagnose(`${phase}.failed`, { ...context, error: String(error) }, this.signal.aborted ? 'debug' : 'error');
          });
        this.jobs.add(job);
        void job.finally(() => {
          this.jobs.delete(job);
        });
        state.before = undefined;
      })
      .catch((error) => {
        diagnose('final_snapshot.failed', { ...context, error: String(error) }, this.signal.aborted ? 'debug' : 'warn');
      });
  }

  /** Waits for snapshot capture, without waiting for analysis or storage */
  barrier(): Promise<void> {
    return this.tail;
  }

  /** Waits for snapshot capture, analysis and result storage */
  async finished(): Promise<void> {
    await this.tail;
    await Promise.all(this.jobs);
  }
}
