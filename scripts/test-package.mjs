import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const tarball = fileURLToPath(new URL(`${metadata.name}-${metadata.version}.tgz`, root));
await mkdir(new URL('.artifacts/', root), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('.artifacts/wasm-package-', root)));
await writeFile(
  `${directory}/package.json`,
  JSON.stringify(
    {
      name: 'noema-wasm-package-check',
      private: true,
      type: 'module',
      dependencies: {
        'dsh-plugin-noema': `file:${tarball}`,
        '@deepseek-ai/cordis': '4.0.2',
        '@deepseek-ai/dsh-fs-local': '0.1.6-alpha.2',
        '@deepseek-ai/dsh-storage': '0.1.6-alpha.2',
        '@deepseek-ai/dsh-storage-json': '0.1.6-alpha.2',
        '@deepseek-ai/dsh-settings-file': '0.1.6-alpha.2',
      },
    },
    null,
    2,
  ) + '\n',
);
const install = spawnSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: directory,
  encoding: 'utf8',
  timeout: 120_000,
});
assert.equal(install.status, 0, install.stderr || install.error?.message);
await writeFile(
  `${directory}/check.mjs`,
  `
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
assert.equal(process.env.PATH, '')
globalThis.fetch = async () => { throw new Error('Network fetching is disabled during this check') }
const ownDirectory = fileURLToPath(new URL('./', import.meta.url))
const pluginURL = import.meta.resolve('dsh-plugin-noema/package.json')
assert.ok(fileURLToPath(pluginURL).startsWith(ownDirectory))
assert.ok(fileURLToPath(import.meta.resolve('web-tree-sitter')).startsWith(ownDirectory))
const { analyzeSource } = await import(new URL('./lib/analyzer/index.js', pluginURL))
const inputs = [
  ['sample.ts', 'function choose(x:boolean){if(x)return 1;return 0}'],
  ['sample.tsx', 'const View=()=> <div>{flag ? "yes" : "no"}</div>'],
  ['sample.py', 'def choose(x):\\n    if x: return 1\\n    return 0\\n'],
  ['sample.go', 'package p; func Choose(x bool) int {if x {return 1};return 0}'],
]
const results = []
for (const [path, source] of inputs) {
  const result = await analyzeSource(path, source)
  assert.equal(result.status, 'ok')
  const fn = result.scopes.find(scope => scope.kind === 'function')
  assert.deepEqual(fn.metrics, { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 })
  results.push({ path, metrics: fn.metrics })
}
const recursive = await analyzeSource('recursive.ts', 'function a(){b()} function b(){a()}')
assert.equal(recursive.status, 'ok')
const functions = recursive.scopes.filter(scope => scope.kind === 'function')
for (const fn of functions) {
  assert.equal(fn.metrics.cognitive, 1)
  assert.equal(fn.recursion.direct, false)
  assert.deepEqual(fn.recursion.cycle_members.map(index => recursive.scopes[index].name), ['a', 'b'])
}
const { Context } = await import('@deepseek-ai/cordis')
const plugin = await import('dsh-plugin-noema')
const {default:LocalFs}=await import('@deepseek-ai/dsh-fs-local')
const {default:Storage}=await import('@deepseek-ai/dsh-storage')
const JsonStorage=await import('@deepseek-ai/dsh-storage-json')
const DomainStorage=await import('@deepseek-ai/dsh-storage-domain')
const {default:Typert}=await import('@deepseek-ai/dsh-typert-registry')
const {default:SettingsFile}=await import('@deepseek-ai/dsh-settings-file')
const ctx = new Context()
try {
 await ctx.plugin(LocalFs,{cwd:ownDirectory})
 await ctx.plugin(Storage)
 await ctx.plugin(JsonStorage,{root:ownDirectory+'/storage'})
 await ctx.plugin(DomainStorage,{backend:'json'})
 await ctx.plugin(Typert)
 await ctx.plugin(SettingsFile,{path:ownDirectory+'/settings.yaml',watch:false})
 const fiber=await ctx.plugin(plugin,{})
 assert.ok(ctx.noema)
 assert.deepEqual(await ctx.noema.list('empty'),[])
 assert.ok(ctx.typert.getPackage('dsh-plugin-noema','host'))
 await fiber.dispose()
}
finally { await ctx.fiber.dispose() }
const installed = []
for (const entry of await readdir(new URL('./node_modules/', import.meta.url))) {
  if (entry.startsWith('.')) continue
  if (entry.startsWith('@')) for (const name of await readdir(new URL('./node_modules/' + entry + '/', import.meta.url))) installed.push(entry + '/' + name)
  else installed.push(entry)
}
for (const unused of ['tree-sitter', 'tree-sitter-typescript', 'tree-sitter-python', 'tree-sitter-go', 'node-gyp-build', 'node-addon-api', 'typescript']) assert.ok(!installed.includes(unused), unused)
const manifest = JSON.parse(await readFile(new URL(pluginURL), 'utf8'))
assert.ok(manifest.dependencies['web-tree-sitter'])
assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-chat'))
const client=await readFile(new URL('./lib/client.js',pluginURL),'utf8')
assert.match(client,/window\.__ModuleLoader__\.load/)
console.log(JSON.stringify({ results, installed_packages: installed.sort(), path_empty: true, network_fetch_disabled: true, cordis_load: 'passed', recursion_check: 'passed' }))
`,
);
const run = spawnSync(process.execPath, [`${directory}/check.mjs`], {
  cwd: directory,
  env: { ...process.env, PATH: '' },
  encoding: 'utf8',
  timeout: 15_000,
});
assert.equal(run.status, 0, run.stderr || run.error?.message);
const report = {
  checked_at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  install_directory: directory,
  tarball_bytes: (await stat(tarball)).size,
  ...JSON.parse(run.stdout),
};
await writeFile(new URL('.artifacts/wasm-package-validation.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
