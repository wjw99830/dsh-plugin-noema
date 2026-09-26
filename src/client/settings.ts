import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { FilePatterns } from '../config.ts';

export function patternLines(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

export const testPatterns = [
  '**/*.{test,spec}.{ts,tsx,mts,cts}',
  '**/{test,tests,__tests__}/**',
  '**/test_*.py',
  '**/*_test.py',
  '**/*_test.go',
];

/** @param revision Settings revision captured when editing began
 * @param reset Clear overrides so the profile defaults take effect
 */
export async function savePatterns(
  scope: ConfigForm<FilePatterns>,
  patterns: FilePatterns,
  revision: number,
  reset: boolean,
): Promise<boolean> {
  return scope.mutate(
    reset
      ? [
          { op: 'unset', path: ['include'] },
          { op: 'unset', path: ['exclude'] },
        ]
      : [
          { op: 'set', path: ['include'], value: patterns.include },
          { op: 'set', path: ['exclude'], value: patterns.exclude },
        ],
    revision,
  );
}
