import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SessionStore from "@deepseek-ai/dsh-session";
import * as plugin from "../lib/index.js";
import { FilePatterns } from "../lib/config.js";
import { SettingsForm } from "../lib/client/SettingsForm.js";
import { patternLines, savePatterns } from "../lib/client/settings.js";
import { en, zh } from "../lib/client/locales.js";
import { workspace } from "./helpers.mjs";

test(
  "saved file rules preserve the current turn, apply to the next turn and survive restart",
  { timeout: 15000 },
  async (t) => {
    const { ctx, cwd, directory } = await workspace(t);
    await ctx.plugin(SessionStore);
    const base = { include: ["**/*.ts"], exclude: [] };
    const fiber = await ctx.plugin(plugin, base);
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
      session.append("turn/start", { turn });
      await ctx.waterfall("agent/pre-step", { agent: { session } }, () =>
        Promise.resolve(),
      );
    };
    const end = (turn) =>
      session.append("turn/end", { turn, reason: { kind: "completed" } });
    const branch = "function f(){if(x)return 1;return 0}";
    const simple = "function f(){return 0}";
    await editFiles(simple);
    await start(1);
    await ctx.settings.update("noema", { exclude: ["**/*.test.ts"] });
    await editFiles(branch);
    end(1);
    let indexes = (await watch.next()).value;
    assert.deepEqual(
      (await ctx.noema.get(session.id, indexes[0].report_id)).files.map((f) => f.path)
        .sort(),
      ["main.test.ts", "main.ts"],
    );
    await start(2);
    await editFiles(simple);
    end(2);
    indexes = (await watch.next()).value;
    assert.deepEqual(
      (await ctx.noema.get(session.id, indexes[1].report_id)).files.map((f) => f.path),
      ["main.ts"],
    );
    await ctx.settings.update("noema", { include: [] });
    await start(3);
    await editFiles(branch);
    end(3);
    await fiber.dispose();
    abort.abort();
    await watch.return();
    const again = await workspace(t, directory);
    await again.ctx.plugin(plugin, base);
    assert.equal((await again.ctx.noema.list(session.id)).length, 2);
    assert.deepEqual(
      again.ctx.settings.describe().find((x) => x.ns === "noema").value,
      { include: [], exclude: ["**/*.test.ts"] },
    );
    await assert.rejects(again.ctx.settings.update("noema", { include: 42 }));
    await again.ctx.settings.replace("noema", {});
    assert.deepEqual(
      again.ctx.settings.describe().find((x) => x.ns === "noema").value,
      base,
    );
  },
);

test("user-facing settings render both languages and explain empty selections", () => {
  const value = { include: [], exclude: [] };
  const snapshot = {
    status: "ready",
    value,
    base: value,
    user: {},
    revision: 0,
    writable: true,
    mode: "host",
  };
  const scope = { getSnapshot: () => snapshot, subscribe: () => () => {} };
  for (const dictionary of [en, zh]) {
    const html = renderToStaticMarkup(
      createElement(SettingsForm, {
        scope,
        view: "page",
        t: (key) => dictionary[key],
      }),
    );
    for (const key of [
      "include_label",
      "exclude_label",
      "include_empty",
      "exclude_tests",
      "save",
      "restore_defaults",
    ])
      assert.ok(html.includes(dictionary[key]));
  }
});

test("pattern input trims whitespace, drops blank lines and deduplicates globs", () => {
  assert.deepEqual(patternLines("  **/*.ts \r\n\n**/*.py\n**/*.ts"), [
    "**/*.ts",
    "**/*.py",
  ]);
});

test("settings writes reject stale edits and do not report silently refused saves as successful", async () => {
  const base = FilePatterns({});
  const patterns = { include: ["src/**"], exclude: ["**/*.test.ts"] };
  let snapshot = { value: base, base, user: {}, revision: 0 };
  let writes = 0;
  const scope = {
    getSnapshot: () => snapshot,
    async mutate(ops, revision) {
      writes++;
      assert.equal(revision, snapshot.revision);
      const user = { ...snapshot.user };
      for (const op of ops) {
        if (op.op === "unset") delete user[op.path[0]];
        else user[op.path[0]] = op.value;
      }
      snapshot = {
        ...snapshot,
        user,
        value: { ...base, ...user },
        revision: revision + 1,
      };
    },
  };
  assert.equal(await savePatterns(scope, patterns, 0, false), true);
  assert.equal(
    await savePatterns(
      { ...scope, mutate: async () => {} },
      patterns,
      1,
      false,
    ),
    true,
  );
  assert.equal(await savePatterns(scope, base, 0, true), false);
  assert.equal(writes, 1);
  assert.equal(await savePatterns(scope, base, 1, true), true);
  assert.deepEqual(snapshot.user, {});
  assert.equal(
    await savePatterns(
      { ...scope, mutate: async () => {} },
      patterns,
      2,
      false,
    ),
    false,
  );
  await assert.rejects(
    savePatterns(
      {
        ...scope,
        mutate: async () => {
          throw new Error("offline");
        },
      },
      patterns,
      2,
      false,
    ),
    /offline/,
  );
});
