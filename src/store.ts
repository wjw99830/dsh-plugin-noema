import { createHash } from 'node:crypto';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol';
import { ReportSchema } from './report.ts';
import type { Report, ReportIndex } from './report.ts';

const reportDomain = defineDomain({
  name: 'noema',
  version: 1,
  layout: 'per-record',
  tables: { reports: domainTable(ReportSchema) },
});
export class NoemaReports {
  readonly typertRemote = bindTypertRemote(this, 'noema');
  private readonly pending = new Map<string, Promise<void>>();
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(
    private readonly storage: DomainFacility,
    private readonly lifetime: AbortSignal,
  ) {}

  /** Returns indexes ordered by turn start */
  list(session_id: string, signal?: AbortSignal): Promise<ReportIndex[]> {
    return this.withSession(
      session_id,
      (domain) =>
        [...domain.table('reports').entries()]
          .map(([, r]) => ({
            report_id: r.report_id,
            turn: r.turn,
            start_seq: r.start_seq,
          }))
          .sort((a, b) => a.start_seq - b.start_seq),
      signal,
    );
  }

  get(session_id: string, report_id: string, signal?: AbortSignal): Promise<Report | undefined> {
    return this.withSession(
      session_id,
      (domain) => {
        const report = domain.table('reports').get(report_id);
        return report?.session_id === session_id ? report : undefined;
      },
      signal,
    );
  }

  /** Yields complete index lists, starting with the current state */
  async *watch(session_id: string, signal: AbortSignal): AsyncGenerator<ReportIndex[]> {
    const lifetime = AbortSignal.any([signal, this.lifetime]);
    const listeners = this.listeners.get(session_id) ?? new Set<() => void>();
    this.listeners.set(session_id, listeners);
    let dirty = true;
    let wake = () => {};
    const changed = () => {
      dirty = true;
      wake();
    };
    listeners.add(changed);
    lifetime.addEventListener('abort', changed, { once: true });
    try {
      while (!lifetime.aborted) {
        if (!dirty)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        if (lifetime.aborted) break;
        dirty = false;
        const indexes = await this.list(session_id, lifetime);
        if (lifetime.aborted) break;
        yield indexes;
      }
    } finally {
      lifetime.removeEventListener('abort', changed);
      listeners.delete(changed);
      if (listeners.size === 0) this.listeners.delete(session_id);
    }
  }

  async save(report: Report): Promise<void> {
    await this.withSession(report.session_id, (domain) => domain.table('reports').put(report.report_id, report));
    for (const listener of this.listeners.get(report.session_id) ?? []) listener();
  }

  async close(): Promise<void> {
    await Promise.all(this.pending.values());
  }

  private withSession<T>(
    sessionId: string,
    action: (domain: Domain<typeof reportDomain>) => T | Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const operation = (this.pending.get(sessionId) ?? Promise.resolve()).then(async () => {
      this.lifetime.throwIfAborted();
      signal?.throwIfAborted();
      const name = `noema_${createHash('sha256').update(sessionId).digest('hex')}`;
      const domain = await this.storage.open({ ...reportDomain, name });
      try {
        this.lifetime.throwIfAborted();
        signal?.throwIfAborted();
        return await action(domain);
      } finally {
        await domain.close();
      }
    });
    const settled = operation.then(
      () => {},
      () => {},
    );
    this.pending.set(sessionId, settled);
    void settled.then(() => {
      if (this.pending.get(sessionId) === settled) this.pending.delete(sessionId);
    });
    return operation;
  }
}
