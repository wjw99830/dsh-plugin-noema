import { build } from 'esbuild';
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2023',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  loader: { '.css': 'text' },
  jsx: 'automatic',
  banner: {
    js: 'window.__ModuleLoader__.load({id:"dsh-plugin-noema",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
  },
  footer: { js: 'return module.exports;}});' },
});
