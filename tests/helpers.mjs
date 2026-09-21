import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Context } from "@deepseek-ai/cordis";
import LocalFileSystem from "@deepseek-ai/dsh-fs-local";
import Storage from "@deepseek-ai/dsh-storage";
import * as JsonStorage from "@deepseek-ai/dsh-storage-json";
import * as DomainStorage from "@deepseek-ai/dsh-storage-domain";
import Typert from "@deepseek-ai/dsh-typert-registry";
import SettingsFile from "@deepseek-ai/dsh-settings-file";
import { Config } from "../lib/config.js";

export const config = Config({});
export function snapshot(files) {
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([path, source]) => [
        path,
        typeof source === "string"
          ? {
              status: "ok",
              source,
              hash: createHash("sha256").update(source).digest("hex"),
            }
          : source,
      ]),
    ),
    ignore_rules: {},
  };
}
export function request(before, after, extra = {}) {
  return {
    report_id: "session_1",
    session_id: "session",
    turn: 0,
    start_seq: 1,
    end_seq: 8,
    before: snapshot(before),
    after: snapshot(after),
    ...extra,
  };
}
export async function workspace(t, root) {
  await mkdir(resolve(".artifacts"), { recursive: true });
  const directory = root ?? (await mkdtemp(resolve(".artifacts/integration-")));
  const cwd = resolve(directory, "workspace");
  await mkdir(cwd, { recursive: true });
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LocalFileSystem, { cwd });
  await ctx.plugin(Storage);
  await ctx.plugin(JsonStorage, { root: resolve(directory, "storage") });
  await ctx.plugin(DomainStorage, { backend: "json" });
  await ctx.plugin(Typert);
  await ctx.plugin(SettingsFile, {
    path: resolve(directory, "settings.yaml"),
    watch: false,
  });
  return { ctx, cwd, directory };
}
