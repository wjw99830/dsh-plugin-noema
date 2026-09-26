import { createHash } from 'node:crypto';
import ignore from 'ignore';
import picomatch from 'picomatch';
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs';
import { languageForPath } from './languages.ts';
import type { AnalysisConfig } from './config.ts';
import type { FailureReason } from './analyzer/types.ts';

export type CapturedFile =
  { status: 'ok'; source: string; hash: string } | { status: 'skipped'; reason: Exclude<FailureReason, 'parse_error'> };
export interface Snapshot {
  files: Record<string, CapturedFile>;
  ignore_rules: Record<string, string>;
}

/** Records per-file read failures; rejects an incomplete scan
 * @param rules Reuse the baseline ignore rules when capturing the end snapshot
 */
export async function captureSnapshot(
  fs: FileSystem,
  cwd: string,
  config: AnalysisConfig,
  lifetime: AbortSignal,
  rules?: Record<string, string>,
): Promise<Snapshot> {
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(config.snapshot_timeout_ms)]);
  const root = await fs.resolve('.', { cwd, signal });
  const included = picomatch(config.include, { dot: true, nonegate: true });
  const excludedByGlob = picomatch(config.exclude, { dot: true, nonegate: true });
  const result: Snapshot = { files: {}, ignore_rules: rules ? { ...rules } : {} };
  let total = 0;
  let files = 0;
  const pending: {
    path: string;
    target: FsTarget;
    ignores: { base: string; matcher: ReturnType<typeof ignore> }[];
  }[] = [{ path: '', target: root, ignores: [] }];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (pending.length) {
    signal.throwIfAborted();
    const directory = pending.pop()!;
    const ignored = [...directory.ignores];
    let content = rules?.[directory.path];
    if (rules === undefined) {
      const path = `${directory.path}.gitignore`;
      const info = await fs.lstat(path, { cwd }, signal);
      if (info?.type === 'file') {
        const target = await fs.resolve(path, { cwd, signal });
        if (!fs.contains(root, target)) throw new Error('Git ignore path escaped the workspace');
        content = decoder.decode(await fs.readBytes(target, signal, config.max_file_bytes));
        result.ignore_rules[directory.path] = content;
      }
    }
    if (content !== undefined) ignored.push({ base: directory.path, matcher: ignore().add(content) });
    for (const entry of await fs.listDir(directory.target, signal)) {
      signal.throwIfAborted();
      const path = directory.path + entry.name;
      const info = await fs.lstat(path, { cwd }, signal);
      const candidate = path + (info?.type === 'directory' ? '/' : '');
      if (excludedByGlob(candidate)) continue;
      let excluded = false;
      for (const { base, matcher } of ignored) {
        const match = matcher.test(candidate.slice(base.length));
        if (match.ignored) excluded = true;
        else if (match.unignored) excluded = false;
      }
      if (excluded) continue;
      if (info?.type === 'directory') {
        if (!fs.contains(root, entry.target)) throw new Error('Directory escaped the workspace');
        pending.push({ path: path + '/', target: entry.target, ignores: ignored });
        continue;
      }
      if (languageForPath(path) === undefined || !included(path)) continue;
      if (++files > config.max_files) throw new Error('Snapshot file limit exceeded');
      if (info?.type !== 'file') {
        result.files[path] = { status: 'skipped', reason: 'not_regular_file' };
        continue;
      }
      if (info.size !== undefined && info.size > config.max_file_bytes) {
        result.files[path] = { status: 'skipped', reason: 'file_too_large' };
        continue;
      }
      try {
        const target = await fs.resolve(path, { cwd, signal });
        if (!fs.contains(root, target)) throw new Error('File escaped the workspace');
        const before = await fs.stat(target, signal);
        const bytes = await fs.readBytes(target, signal, config.max_file_bytes);
        const after = await fs.stat(target, signal);
        const pathAfter = await fs.lstat(path, { cwd }, signal);
        if (before?.version !== after?.version || info.version !== pathAfter?.version || pathAfter?.type !== 'file') {
          result.files[path] = { status: 'skipped', reason: 'changed_during_read' };
          continue;
        }
        if (bytes.includes(0)) {
          result.files[path] = { status: 'skipped', reason: 'not_text' };
          continue;
        }
        const source = decoder.decode(bytes);
        total += bytes.byteLength;
        result.files[path] = { status: 'ok', source, hash: createHash('sha256').update(bytes).digest('hex') };
      } catch (error) {
        signal.throwIfAborted();
        result.files[path] = {
          status: 'skipped',
          reason: error instanceof TypeError ? 'not_text' : 'read_error',
        };
      }
      if (total > config.max_snapshot_bytes) throw new Error('Snapshot byte limit exceeded');
    }
  }
  return result;
}
