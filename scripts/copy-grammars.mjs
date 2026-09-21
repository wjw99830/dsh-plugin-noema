import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const destination = new URL('../lib/analyzer/grammars/', import.meta.url);
await mkdir(destination, { recursive: true });
const runtimeDirectory = dirname(fileURLToPath(import.meta.resolve('web-tree-sitter')));
const runtime = JSON.parse(await readFile(join(runtimeDirectory, 'package.json'), 'utf8'));
const manifest = { runtime_version: runtime.version, languages: {} };
for (const [mode, packageName] of Object.entries({
  typescript: 'tree-sitter-typescript',
  tsx: 'tree-sitter-typescript',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
})) {
  const packageFile = require.resolve(`${packageName}/package.json`);
  const directory = dirname(packageFile);
  const metadata = JSON.parse(await readFile(packageFile, 'utf8'));
  const filename = `tree-sitter-${mode}.wasm`;
  await copyFile(join(directory, filename), new URL(filename, destination));
  await copyFile(join(directory, 'LICENSE'), new URL(`${packageName}.LICENSE`, destination));
  manifest.languages[mode] = { package_name: packageName, version: metadata.version, filename };
}
await writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
