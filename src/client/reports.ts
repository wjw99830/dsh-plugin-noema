import type { NoemaRemote } from '../rpc.ts';
import { ReportSchema, ReportIndexSchema } from '../report.ts';
import type { Report, ReportIndex } from '../report.ts';

interface Subscription {
  indexes: ReportIndex[];
  listeners: Set<() => void>;
  abort: AbortController;
}

export class ReportSubscriptions {
  private readonly sessions = new Map<string, Subscription>();
  constructor(
    private readonly remote: NoemaRemote,
    private readonly warn: (error: unknown) => void,
  ) {}

  source(id: string) {
    const empty: ReportIndex[] = [];
    return {
      getSnapshot: () => this.sessions.get(id)?.indexes ?? empty,
      subscribe: (listener: () => void) => {
        let state = this.sessions.get(id);
        if (!state) {
          state = { indexes: [], listeners: new Set(), abort: new AbortController() };
          this.sessions.set(id, state);
          this.start(id, state);
        }
        state.listeners.add(listener);
        const current = state;
        return () => {
          current.listeners.delete(listener);
          if (current.listeners.size === 0) {
            current.abort.abort();
            this.sessions.delete(id);
          }
        };
      },
    };
  }

  async load(sessionId: string, reportId: string, signal: AbortSignal): Promise<Report | undefined> {
    const result = await this.remote.get(sessionId, reportId, signal);
    if (!result.ok) throw result.error;
    return ReportSchema.optional().parse(result.value);
  }

  reset(): void {
    for (const [id, state] of this.sessions) {
      state.abort.abort();
      state.abort = new AbortController();
      this.start(id, state);
    }
  }

  close(): void {
    for (const state of this.sessions.values()) state.abort.abort();
    this.sessions.clear();
  }

  private start(id: string, state: Subscription): void {
    const signal = state.abort.signal;
    void (async () => {
      for await (const indexes of this.remote.watch(id, signal)) {
        if (signal.aborted) return;
        state.indexes = ReportIndexSchema.array().parse(indexes);
        for (const listener of state.listeners) listener();
      }
    })().catch((error) => {
      if (!signal.aborted) this.warn(error);
    });
  }
}
