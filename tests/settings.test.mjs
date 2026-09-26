import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionStore from '@deepseek-ai/dsh-session';
import { SettingsForm } from '../lib/client/SettingsForm.js';
import { patternLines, savePatterns } from '../lib/client/settings.js';
import { en, zh } from '../lib/client/locales.js';
import { configurationWorkspace } from './configuration.mjs';

test(
  'saved file rules preserve the current turn, apply to the next turn and survive restart',
  { timeout: 15000 },
  async (t) => {
    const base = { include: ['**/*.ts'], exclude: [] };
    const { ctx, cwd, directory, fiber } = await configurationWorkspace(t, undefined, base);
    await ctx.plugin(SessionStore);
    const reports = ctx.noema;
    const session = ctx.sessions.create(undefined, { meta: { cwd } });
    const abort = new AbortController();
    t.after(() => abort.abort());
    const watch = ctx.noema.watch(session.id, abort.signal);
    assert.deepEqual((await watch.next()).value, []);
    const editFiles = async (source) => {
      await writeFile(`${cwd}/main.ts`, source);
      await writeFile(`${cwd}/main.test.ts`, source);
    };
    const start = async (turn) => {
      session.append('turn/start', { turn });
      await ctx.waterfall('agent/pre-step', { agent: { session } }, () => Promise.resolve());
    };
    const end = (turn) => session.append('turn/end', { turn, reason: { kind: 'completed' } });
    const branch = 'function f(){if(x)return 1;return 0}';
    const simple = 'function f(){return 0}';
    await editFiles(simple);
    await start(1);
    await ctx.settings.update('noema', { exclude: ['**/*.test.ts'] });
    assert.equal(ctx.noema, reports);
    await editFiles(branch);
    end(1);
    let indexes = (await watch.next()).value;
    assert.deepEqual((await ctx.noema.get(session.id, indexes[0].report_id)).files.map((f) => f.path).sort(), [
      'main.test.ts',
      'main.ts',
    ]);
    await start(2);
    await editFiles(simple);
    end(2);
    indexes = (await watch.next()).value;
    assert.deepEqual(
      (await ctx.noema.get(session.id, indexes[1].report_id)).files.map((f) => f.path),
      ['main.ts'],
    );
    await ctx.settings.update('noema', { include: [] });
    await start(3);
    await editFiles(branch);
    end(3);
    await fiber.dispose();
    abort.abort();
    await watch.return();
    await ctx.fiber.dispose();
    const again = await configurationWorkspace(t, directory, base);
    assert.equal((await again.ctx.noema.list(session.id)).length, 2);
    assert.deepEqual(again.ctx.settings.describe().find((x) => x.ns === 'noema').value, {
      include: [],
      exclude: ['**/*.test.ts'],
    });
    await assert.rejects(again.ctx.settings.update('noema', { include: 42 }));
    await again.ctx.settings.replace('noema', {});
    assert.deepEqual(again.ctx.settings.describe().find((x) => x.ns === 'noema').value, base);
  },
);

test('user-facing settings render both languages and explain empty selections', () => {
  const value = { include: [], exclude: [] };
  const snapshot = {
    status: 'ready',
    value,
    base: value,
    user: {},
    revision: 0,
    writable: true,
    mode: 'host',
  };
  const scope = { getSnapshot: () => snapshot, subscribe: () => () => {} };
  for (const dictionary of [en, zh]) {
    const html = renderToStaticMarkup(
      createElement(SettingsForm, {
        scope,
        view: 'page',
        t: (key) => dictionary[key],
      }),
    );
    for (const key of ['include_label', 'exclude_label', 'include_empty', 'exclude_tests', 'save', 'restore_defaults'])
      assert.ok(html.includes(dictionary[key]));
  }
});

test('pattern input trims whitespace, drops blank lines and deduplicates globs', () => {
  assert.deepEqual(patternLines('  **/*.ts \r\n\n**/*.py\n**/*.ts'), ['**/*.ts', '**/*.py']);
});

test('settings saves preserve Host acceptance, revision fencing and transport errors', async () => {
  const patterns = { include: ['src/**'], exclude: ['**/*.test.ts'] };
  const calls = [];
  const form = {
    async mutate(ops, revision) {
      calls.push({ ops, revision });
      return false;
    },
  };
  assert.equal(await savePatterns(form, patterns, 7, false), false);
  assert.deepEqual(calls.pop(), {
    revision: 7,
    ops: [
      { op: 'set', path: ['include'], value: patterns.include },
      { op: 'set', path: ['exclude'], value: patterns.exclude },
    ],
  });
  assert.equal(await savePatterns({ mutate: async () => true }, patterns, 8, false), true);
  await savePatterns(form, patterns, 9, true);
  assert.deepEqual(calls.pop(), {
    revision: 9,
    ops: [
      { op: 'unset', path: ['include'] },
      { op: 'unset', path: ['exclude'] },
    ],
  });
  await assert.rejects(
    savePatterns(
      {
        mutate: async () => {
          throw new Error('offline');
        },
      },
      patterns,
      9,
      false,
    ),
    /offline/,
  );
});

test('profile settings reject stale writes and restore inherited rules', async (t) => {
  const base = { include: ['src/**'], exclude: [] };
  const { ctx, directory } = await configurationWorkspace(t, undefined, base);
  const before = ctx.settings.describe().find((x) => x.ns === 'noema');
  await ctx.settings.update('noema', { exclude: ['**/*.test.ts'] }, before.revision);
  await assert.rejects(ctx.settings.update('noema', { include: [] }, before.revision), { code: 'SETTINGS_CONFLICT' });
  assert.deepEqual(ctx.settings.describe().find((x) => x.ns === 'noema').value, { ...base, exclude: ['**/*.test.ts'] });
  await ctx.settings.mutate('noema', [{ op: 'unset', path: ['exclude'] }]);
  await ctx.fiber.dispose();
  const again = await configurationWorkspace(t, directory, base);
  assert.deepEqual(again.ctx.settings.describe().find((x) => x.ns === 'noema').value, base);
});

test('legacy rules import once and remain editable after restart', { timeout: 15000 }, async (t) => {
  const legacy = { include: ['src/**'], exclude: ['**/*.test.ts'] };
  const { ctx, directory } = await configurationWorkspace(t, undefined, {}, legacy);
  const { setTimeout } = await import('node:timers/promises');
  const deadline = Date.now() + 5000;
  while (ctx.settings.describe().find((x) => x.ns === 'noema').value.include[0] !== 'src/**') {
    assert.ok(Date.now() < deadline, 'legacy import did not finish');
    await setTimeout(10);
  }
  assert.deepEqual(ctx.settings.describe().find((x) => x.ns === 'noema').value, legacy);
  await ctx.settings.update('noema', { include: ['lib/**'] });
  await ctx.fiber.dispose();
  const again = await configurationWorkspace(t, directory);
  assert.deepEqual(again.ctx.settings.describe().find((x) => x.ns === 'noema').value, {
    ...legacy,
    include: ['lib/**'],
  });
  const { readFile, stat } = await import('node:fs/promises');
  assert.deepEqual(JSON.parse(await readFile(`${directory}/settings.yaml.imported`, 'utf8')), { noema: legacy });
  await assert.rejects(stat(`${directory}/settings.yaml`), { code: 'ENOENT' });
});

test('settings show unavailable and read-only states', () => {
  const render = (snapshot) =>
    renderToStaticMarkup(
      createElement(SettingsForm, {
        scope: { getSnapshot: () => snapshot, subscribe: () => () => {} },
        view: 'page',
        t: (key) => en[key],
      }),
    );
  const unavailable = render({ status: 'unavailable' });
  assert.ok(unavailable.includes(en.settings_unavailable));
  assert.ok(!unavailable.includes('<form'));
  const readonly = render({
    status: 'ready',
    revision: 1,
    writable: false,
    mode: 'host',
    value: { include: ['**/*'], exclude: [] },
  });
  assert.match(readonly, /<fieldset disabled=""/);
  assert.ok(readonly.includes(en.settings_readonly));
});
