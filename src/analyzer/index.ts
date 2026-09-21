import { readFile } from 'node:fs/promises';
import { Language, Parser } from 'web-tree-sitter';
import { languageForPath } from '../languages.ts';
import type { AnalysisLanguage } from '../languages.ts';
import { measureScopes } from './measure.ts';
import { SCORING_RULES } from './types.ts';
import type { EngineIdentity, SourceAnalysis } from './types.ts';

export type { SourceAnalysis, MeasuredScope, StructuralMetrics, EngineIdentity } from './types.ts';

interface GrammarManifest {
  runtime_version: string;
  languages: Record<AnalysisLanguage, { package_name: string; version: string; filename: string }>;
}

let initialization: Promise<GrammarManifest> | undefined;
const grammars = new Map<AnalysisLanguage, Promise<Language>>();

export async function analyzeSource(path: string, source: string): Promise<SourceAnalysis | undefined> {
  const language = languageForPath(path);
  if (language === undefined) return undefined;
  initialization ??= Promise.all([
    Parser.init(),
    readFile(new URL('./grammars/manifest.json', import.meta.url), 'utf8'),
  ]).then(([, manifest]) => JSON.parse(manifest) as GrammarManifest);
  const manifest = await initialization;
  const grammar = manifest.languages[language];
  let loading = grammars.get(language);
  if (!loading) {
    loading = Language.load(new URL(`./grammars/${grammar.filename}`, import.meta.url));
    grammars.set(language, loading);
  }
  const parser = new Parser();
  try {
    parser.setLanguage(await loading);
    const tree = parser.parse(source);
    if (!tree) throw new Error(`Tree-sitter returned no tree for ${path}`);
    try {
      const identity = {
        path,
        language,
        engine: {
          name: 'noema-tree-sitter',
          rules: SCORING_RULES,
          runtime_version: manifest.runtime_version,
          grammar: { package_name: grammar.package_name, version: grammar.version },
        } satisfies EngineIdentity,
      };
      if (tree.rootNode.hasError) return { status: 'not_analyzed', reason: 'parse_error' };
      return { ...identity, status: 'ok', scopes: measureScopes(tree.rootNode, source, path, language) };
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
}
