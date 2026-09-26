import s from '@deepseek-ai/schemastery';

export interface FilePatterns {
  include: string[];
  exclude: string[];
}

const patterns = {
  include: s.array(s.string()).default(['**/*']),
  exclude: s
    .array(s.string())
    .default(['**/{.git,node_modules,.artifacts,dist,build,coverage,.venv,__pycache__,.next}/**']),
};

export const FilePatterns: s<FilePatterns> = s.object(patterns);

export interface AnalysisConfig extends FilePatterns {
  max_file_bytes: number;
  max_snapshot_bytes: number;
  max_files: number;
  snapshot_timeout_ms: number;
  analysis_timeout_ms: number;
  max_pending_reports: number;
}

export const Config = s.object({
  max_file_bytes: s
    .number()
    .step(1)
    .min(1)
    .default(2 * 1024 * 1024),
  max_snapshot_bytes: s
    .number()
    .step(1)
    .min(1)
    .default(32 * 1024 * 1024),
  max_files: s.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(2000),
  snapshot_timeout_ms: s.number().step(1).min(1).max(2_147_483_647).default(10_000),
  analysis_timeout_ms: s.number().step(1).min(1).max(2_147_483_647).default(15_000),
  max_pending_reports: s.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(3),
  include: patterns.include.volatile(),
  exclude: patterns.exclude.volatile(),
});

export type Config = ReturnType<typeof Config>;
