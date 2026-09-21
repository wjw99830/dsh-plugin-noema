import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
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
  scope: SettingsScope<FilePatterns>,
  patterns: FilePatterns,
  revision: number,
  reset: boolean,
): Promise<boolean> {
  if (scope.getSnapshot().revision !== revision) return false;
  await scope.mutate(
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
  const saved = scope.getSnapshot();
  if (
    !saved.value ||
    JSON.stringify(saved.value.include) !== JSON.stringify(patterns.include) ||
    JSON.stringify(saved.value.exclude) !== JSON.stringify(patterns.exclude)
  )
    return false;
  if (reset && saved.user && typeof saved.user === 'object')
    return !('include' in saved.user) && !('exclude' in saved.user);
  return (
    saved.user !== null &&
    typeof saved.user === 'object' &&
    'include' in saved.user &&
    'exclude' in saved.user &&
    JSON.stringify(saved.user.include) === JSON.stringify(patterns.include) &&
    JSON.stringify(saved.user.exclude) === JSON.stringify(patterns.exclude)
  );
}
