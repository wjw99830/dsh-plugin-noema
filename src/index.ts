import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-fs';
import type {} from '@deepseek-ai/dsh-typert-registry';
import { TYPERT } from './rpc.ts';
import type { Session } from '@deepseek-ai/dsh-session';
import { Config } from './config.ts';
import type {} from '@deepseek-ai/dsh-settings';
import { AnalysisQueue } from './analyzer/queue.ts';
import { TurnRecorder } from './recorder.ts';
import { NoemaReports } from './store.ts';
import { diagnose } from './diagnostics.ts';

diagnose('module.loaded', { module: import.meta.url });

export { Config } from './config.ts';
export type { Report, FileReport, ScopeChange } from './report.ts';
export type { ReportIndex } from './report.ts';
export { NoemaReports } from './store.ts';

export const name = 'dsh-plugin-noema';
export const inject = ['fs', 'storageDomain', 'typert'];

declare module '@deepseek-ai/cordis' {
  interface Context {
    noema: NoemaReports;
  }
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  diagnose('plugin.initializing');
  const owner = ctx.fiber;
  ctx.inject(['settings'], (ctx) => {
    ctx.effect(() => ctx.settings.configure({ auto: false }, owner));
  });
  const lifetime = new AbortController();
  const queue = new AnalysisQueue(config.max_pending_reports, config.analysis_timeout_ms);
  const reports = new NoemaReports(ctx.storageDomain, lifetime.signal);
  const recorders = new Map<Session, TurnRecorder>();
  const finishing = new Set<Promise<void>>();
  ctx.effect(() => async () => {
    diagnose('plugin.disposing', { sessions: recorders.size });
    lifetime.abort();
    await queue.close();
    await Promise.all([...recorders.values()].map((recorder) => recorder.finished()));
    await Promise.all(finishing);
    await reports.close();
  });
  ctx.provide('noema', reports);
  ctx.effect(() => ctx.typert.register(TYPERT));
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') {
      const { cwd, origin, delegationDepth } = session.header;
      diagnose('turn.start', {
        session_id: session.id,
        turn: event.data.turn,
        seq: event.seq,
        cwd,
        origin,
        delegation_depth: delegationDepth,
      });
      if (!cwd || origin === 'subagent' || (delegationDepth ?? 0) > 0) {
        diagnose('turn.skipped', {
          session_id: session.id,
          turn: event.data.turn,
          reason: !cwd ? 'missing_cwd' : 'subagent',
        });
        return;
      }
      let recorder = recorders.get(session);
      if (!recorder) {
        recorder = new TurnRecorder(
          ctx.fs,
          cwd,
          session.id,
          () => ({ ...config, include: [...config.include.get()], exclude: [...config.exclude.get()] }),
          lifetime.signal,
          queue,
          (report) => reports.save(report),
        );
        recorders.set(session, recorder);
      }
      recorder.start(event.data.turn, event.seq);
    } else if (event.type === 'turn/end') {
      const recorder = recorders.get(session);
      diagnose('turn.end', {
        session_id: session.id,
        turn: event.data.turn,
        seq: event.seq,
        reason: event.data.reason.kind,
        recorder_found: recorder !== undefined,
      });
      recorder?.end(event.data.turn, event.seq);
    }
  });
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    await recorders.get(agent.session)?.barrier();
    return next();
  });
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.agent) await recorders.get(exec.agent.session)?.barrier();
    return next();
  });
  ctx.on('session/disposed', (session) => {
    const recorder = recorders.get(session);
    recorders.delete(session);
    diagnose('session.disposed', { session_id: session.id, recorder_found: recorder !== undefined });
    if (!recorder) return;
    const done = recorder.finished();
    finishing.add(done);
    void done.finally(() => {
      finishing.delete(done);
    });
  });
  diagnose('plugin.ready', {}, 'info');
}
