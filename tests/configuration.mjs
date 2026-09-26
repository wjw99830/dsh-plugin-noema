import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { initProfile, mountRootInclude, readProfilePatches } from '@deepseek-ai/dsh-app-boot';
import ConfigEditor from '@deepseek-ai/dsh-config-editor';
import Settings from '@deepseek-ai/dsh-settings';
import * as noema from '../lib/index.js';
import { workspace } from './helpers.mjs';

export async function configurationWorkspace(t, root, base = {}, legacy) {
  const state = await workspace(t, root);
  const { ctx, directory } = state;
  const dir = resolve(directory, 'profile');
  if (!root) {
    initProfile(dir, ['test-bundle']);
    const bundle = resolve(dir, 'node_modules/test-bundle');
    await mkdir(bundle, { recursive: true });
    await writeFile(resolve(directory, 'package.json'), '{"name":"noema-test-host"}\n');
    await writeFile(
      resolve(bundle, 'package.json'),
      JSON.stringify({ name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }),
    );
    await writeFile(
      resolve(bundle, 'cordis.patch.yml'),
      JSON.stringify([
        {
          insert: [
            { id: 'config-editor', name: 'cordis:editor' },
            { id: 'settings', name: 'cordis:settings' },
            { id: 'noema', name: 'cordis:noema', config: base },
          ],
        },
      ]),
    );
    await writeFile(resolve(dir, 'cordis.yml'), '[]\n');
    if (legacy) await writeFile(resolve(directory, 'settings.yaml'), JSON.stringify({ noema: legacy }));
  }
  const profile = {
    name: 'test',
    startedBundles: ['test-bundle'],
    dir,
    patchPath: resolve(dir, 'cordis.patch.yml'),
    installAnchor: resolve(directory, 'package.json'),
    cwd: directory,
    home: directory,
    overlays: [],
    telemetryDisabledEnv: undefined,
  };
  ctx.provide('profileContext', profile);
  await ctx.plugin(Loader);
  Object.assign(ctx.loader.builtins, { editor: ConfigEditor, settings: Settings, noema });
  await mountRootInclude(ctx, resolve(dir, 'cordis.yml'), readProfilePatches('dsh', profile));
  await ctx.loader.await();
  const fiber = [...ctx.loader.entries()].find((entry) => entry.options.id === 'noema').fiber;
  return { ...state, fiber };
}
