import type { Snapshot } from './snapshot.ts';

const levels = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof levels;
const configuredLevel = process.env.NOEMA_LOG_LEVEL ?? 'warn';
if (!Object.hasOwn(levels, configuredLevel)) {
  throw new Error('NOEMA_LOG_LEVEL must be error, warn, info, or debug');
}
const threshold = levels[configuredLevel as LogLevel];

/** @param details Diagnostic metadata without captured source */
export function diagnose(stage: string, details: Record<string, unknown> = {}, level: LogLevel = 'debug'): void {
  if (levels[level] > threshold) return;
  process.stderr.write(
    `[noema:${level}] ${JSON.stringify({ time: new Date().toISOString(), pid: process.pid, stage, ...details })}\n`,
  );
}

export function snapshotDetails(snapshot: Snapshot) {
  const files = Object.entries(snapshot.files);
  return {
    captured_files: files.filter(([, file]) => file.status === 'ok').length,
    skipped_files: files.flatMap(([path, file]) => (file.status === 'skipped' ? [{ path, reason: file.reason }] : [])),
    ignore_files: Object.keys(snapshot.ignore_rules).length,
  };
}
