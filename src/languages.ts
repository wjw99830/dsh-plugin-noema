export type AnalysisLanguage = 'typescript' | 'tsx' | 'python' | 'go';

export function languageForPath(path: string): AnalysisLanguage | undefined {
  if (/\.d\.(ts|mts|cts)$/.test(path)) return undefined;
  switch (path.slice(path.lastIndexOf('.'))) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    default:
      return undefined;
  }
}
