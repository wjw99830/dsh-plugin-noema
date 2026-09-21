import assert from "node:assert/strict";
import test from "node:test";
import { compareSnapshots } from "../lib/compare.js";
import { request } from "./helpers.mjs";
import { ReportSubscriptions } from "../lib/client/reports.js";

test("shares raw Typert stream values across cards and restarts them on reconnect", async t => {
  const requests = [];
  const warnings = [];
  const remote = {
    async *watch(id, signal) {
      const number = requests.length + 1;
      requests.push({ id, signal });
      yield [
        {
          report_id: `report-${number}`,
          turn: 1,
          start_seq: 0,
        },
      ];
      await new Promise((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", resolve, { once: true });
      });
    },
  };
  const subscriptions = new ReportSubscriptions(remote, (error) =>
    warnings.push(error),
  );
  t.after(() => subscriptions.close());
  const source = subscriptions.source("session"),
    other = subscriptions.source("session");
  let change = Promise.withResolvers();
  const first = source.subscribe(() => change.resolve());
  const second = other.subscribe(() => {});
  await change.promise;
  assert.equal(requests.length, 1);
  assert.equal(source.getSnapshot()[0].report_id, "report-1");
  assert.equal(source.getSnapshot(), other.getSnapshot());
  change = Promise.withResolvers();
  subscriptions.reset();
  await change.promise;
  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(source.getSnapshot()[0].report_id, "report-2");
  first();
  assert.equal(requests[1].signal.aborted, false);
  second();
  assert.equal(requests[1].signal.aborted, true);
  assert.deepEqual(warnings, []);
});

test("rejects a remote success response without file measurements", async () => {
  const report = await compareSnapshots(request({}, { "a.ts": "function f() {}" }));
  report.files[0].after.analysis.scopes = [];
  const subscriptions = new ReportSubscriptions({
    get: async () => ({ ok: true, value: report }),
  }, () => {});
  await assert.rejects(
    subscriptions.load("session", "report", new AbortController().signal),
    { name: "ZodError" },
  );
});

test("a malformed remote index is reported without replacing the current snapshot", async t => {
  const indexes = [{ report_id: "report", turn: 1, start_seq: 0 }];
  const failed = Promise.withResolvers();
  const subscriptions = new ReportSubscriptions({
    async *watch() {
      yield indexes;
      yield [{ report_id: "report", turn: "invalid", start_seq: 0 }];
    },
  }, failed.resolve);
  t.after(() => subscriptions.close());
  const source = subscriptions.source("session");
  let updates = 0;
  source.subscribe(() => updates++);
  assert.equal((await failed.promise).name, "ZodError");
  assert.deepEqual(source.getSnapshot(), indexes);
  assert.equal(updates, 1);
});
