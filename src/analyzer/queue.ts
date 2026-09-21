import { Worker } from 'node:worker_threads';
import { ReportSchema } from '../report.ts';
import type { Report } from '../report.ts';
import type { ReportRequest } from '../compare.ts';

export class AnalysisQueue {
  private readonly lifetime = new AbortController();
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  /** @param maxPending Maximum active and queued jobs together
   * @param timeoutMs Analysis timeout per job, excluding queue wait
   */
  constructor(
    private readonly maxPending: number,
    private readonly timeoutMs: number,
  ) {}

  run(request: ReportRequest): Promise<Report | undefined> {
    if (this.lifetime.signal.aborted) return Promise.reject(this.lifetime.signal.reason);
    if (this.pending >= this.maxPending) return Promise.reject(new Error('Noema report queue is full'));
    this.pending++;
    const result = this.tail.then(async () => {
      this.lifetime.signal.throwIfAborted();
      const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: request });
      const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.timeoutMs)]);
      let abort = () => {};
      try {
        return await new Promise<Report | undefined>((resolve, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          worker.once('message', (value: unknown) => {
            const parsed = ReportSchema.optional().safeParse(value);
            if (parsed.success) resolve(parsed.data);
            else reject(parsed.error);
          });
          worker.once('error', reject);
          worker.once('exit', (code) => reject(new Error(`Noema Worker exited without a report (${code})`)));
        });
      } finally {
        signal.removeEventListener('abort', abort);
        await worker.terminate();
      }
    });
    const settled = result.finally(() => {
      this.pending--;
    });
    this.tail = settled.then(
      () => undefined,
      () => undefined,
    );
    return settled;
  }

  /** Cancels queued and running jobs, then waits for them to settle */
  async close(): Promise<void> {
    this.lifetime.abort(new Error('Noema analysis disposed'));
    await this.tail;
  }
}
