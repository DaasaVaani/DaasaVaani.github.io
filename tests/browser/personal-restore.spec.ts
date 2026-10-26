import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import type { PersonalContents } from "../../src/personal-model";
import { personalSnapshot } from "../lyric-browser";

declare global {
  interface Window {
    personalRestoreApi: Pick<typeof import("../../src/personal"),
      "readStore" | "restorePersonalContents" | "saveList" | "updatePersonal" | "updateHistory" | "recordOpened">;
  }
}

let source: string;
test.beforeAll(async () => {
  const built = await build({
    configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)), logLevel: "error",
    build: { write: false, emptyOutDir: false, minify: false, lib: {
      entry: fileURLToPath(new URL("../../src/personal.ts", import.meta.url)), name: "personalRestoreApi", formats: ["iife"],
    } },
  });
  const outputs = Array.isArray(built) ? built : [built];
  const chunks = outputs.flatMap(output => {
    if (!("output" in output)) throw new Error("Personal API test bundle did not complete");
    return output.output.filter(item => item.type === "chunk");
  });
  if (chunks.length !== 1 || !chunks[0]) throw new Error("Expected one in-memory personal API test bundle");
  source = chunks[0].code;
});
async function prepare(page: Page) {
  await page.goto("/#/settings");
  await expect(page.getByRole("checkbox", { name: messages.en.recentHistoryEnabled, exact: true })).toBeChecked();
  await page.addScriptTag({ content: source });
  return page.evaluate(async () => {
    const state = await window.personalRestoreApi.readStore();
    const listId = crypto.randomUUID(), first = crypto.randomUUID(), second = crypto.randomUUID(), lyricId = crypto.randomUUID();
    const candidate: PersonalContents = {
      personal: { id: "personal", favorites: [{ kind: "lyric", lyricId }, { kind: "legacyVideo", videoId: lyricId }],
        language: "en", theme: "warm", fontSize: 42, density: "relaxed" },
      lists: [{ id: listId, name: "  Exact raw name  ", entries: [
        { id: first, kind: "lyric", lyricId }, { id: second, kind: "lyric", lyricId },
        { id: crypto.randomUUID(), kind: "placeholder", text: "  <b>Literal</b>  " },
      ] }],
      history: { enabled: false, entries: [{ kind: "legacyVideo", videoId: lyricId }, { kind: "lyric", lyricId }] },
      learning: { entries: [{ kind: "lyric", lyricId, label: "practising" }] },
      recitation: { position: { listId, entryId: second } },
    };
    return { candidate, expected: state.control };
  });
}

test("the actual six-store replacement preserves identities and raw data, removes previous rows and fences old writers", async ({ page }) => {
  const { candidate, expected } = await prepare(page), before = await personalSnapshot(page);
  const old = await page.evaluate(async () => {
    const state = await window.personalRestoreApi.readStore();
    const list = { id: crypto.randomUUID(), name: "Must be replaced, not merged", entries: [] };
    const revision = await window.personalRestoreApi.saveList(list, state.control);
    return { list, revision };
  });
  const revision = await page.evaluate(async ({ candidate, old }) =>
    window.personalRestoreApi.restorePersonalContents(candidate, old.revision, new AbortController().signal), { candidate, old });
  expect(revision.epoch).not.toBe(expected.epoch);
  expect(revision).toMatchObject({ id: "state", formatVersion: 8, revision: 0 });
  expect(await personalSnapshot(page)).toEqual({ ...before, tables: {
    control: [revision], personal: [candidate.personal], lists: candidate.lists,
    recentHistory: [{ id: "history", ...candidate.history }], learningLabels: [{ id: "learning", ...candidate.learning }],
    recitationPosition: [{ id: "recitation", ...candidate.recitation }],
  } });
  const stale = await page.evaluate(async old => {
    try { await window.personalRestoreApi.saveList(old.list, old.revision); return "unexpected success"; }
    catch (reason) { return reason instanceof Error ? reason.message : String(reason); }
  }, old);
  expect(stale).toContain("Personal data changed");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: messages.en.recentHistoryEnabled, exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: messages.en.exitRecite, exact: true })).toHaveCount(0);
  expect((await personalSnapshot(page)).tables.control).toEqual([revision]);
});

test("a stale preview, malformed candidate and already-cancelled request preserve every table and schema", async ({ page }) => {
  const { candidate, expected } = await prepare(page);
  await page.evaluate(async () => {
    const state = await window.personalRestoreApi.readStore();
    await window.personalRestoreApi.saveList({ id: crypto.randomUUID(), name: "Existing local data", entries: [] }, state.control);
  });
  const before = await personalSnapshot(page);
  const errors = await page.evaluate(async ({ candidate, expected }) => {
    const api = window.personalRestoreApi, results: string[] = [];
    try { await api.restorePersonalContents(candidate, expected, new AbortController().signal); results.push("unexpected success"); }
    catch (reason) { results.push(reason instanceof Error ? reason.message : String(reason)); }
    const state = await api.readStore(), invalid = structuredClone(candidate);
    invalid.lists[0]!.entries[1]!.id = invalid.lists[0]!.entries[0]!.id;
    try { await api.restorePersonalContents(invalid, state.control, new AbortController().signal); results.push("unexpected success"); }
    catch (reason) { results.push(reason instanceof Error ? reason.message : String(reason)); }
    const controller = new AbortController(); controller.abort();
    try { await api.restorePersonalContents(candidate, state.control, controller.signal); results.push("unexpected success"); }
    catch (reason) { results.push(reason instanceof Error ? reason.name : String(reason)); }
    return results;
  }, { candidate, expected });
  expect(errors).toEqual([expect.stringContaining("Personal data changed"), expect.stringContaining("Invalid personal"), "AbortError"]);
  expect(await personalSnapshot(page)).toEqual(before);
});

for (const failure of ["quota", "abort"] as const) {
  test(`${failure} after all replacement tables are written rolls the real transaction back completely`, async ({ page }) => {
    const { candidate, expected } = await prepare(page);
    await page.evaluate(async ({ candidate, expected }) =>
      window.personalRestoreApi.restorePersonalContents(candidate, expected, new AbortController().signal), { candidate, expected });
    const before = await personalSnapshot(page);
    const error = await page.evaluate(async ({ candidate, failure }) => {
      const api = window.personalRestoreApi, state = await api.readStore(), controller = new AbortController();
      const original = IDBObjectStore.prototype.put;
      const replacement: PersonalContents = { ...candidate, personal: undefined, lists: [], history: { enabled: true, entries: [] },
        learning: { entries: [] }, recitation: { position: null } };
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "control" && failure === "quota") throw new DOMException("Synthetic final write quota", "QuotaExceededError");
        const request = key === undefined ? original.call(this, value) : original.call(this, value, key);
        if (this.name === "control" && failure === "abort") controller.abort();
        return request;
      };
      try { await api.restorePersonalContents(replacement, state.control, controller.signal); return "unexpected success"; }
      catch (reason) { return reason instanceof Error ? reason.name : String(reason); }
      finally { IDBObjectStore.prototype.put = original; }
    }, { candidate, failure });
    expect(error).toBe(failure === "quota" ? "QuotaExceededError" : "AbortError");
    expect(await personalSnapshot(page)).toEqual(before);
  });
}

test("restoration fences captured preference, favorite and history writers without blocking same-epoch changes", async ({ page }) => {
  const { candidate, expected } = await prepare(page);
  const errors = await page.evaluate(async ({ candidate, expected }) => {
    const api = window.personalRestoreApi, before = await api.readStore();
    await api.updatePersonal(value => ({ ...value, theme: "dark" }), expected.epoch);
    await api.updateHistory(value => ({ ...value, enabled: false }), expected.epoch);
    const latest = await api.readStore();
    if (latest.control.epoch !== before.control.epoch || latest.control.revision !== before.control.revision + 2) {
      throw new Error("Same-epoch commands did not retain latest-state mutation semantics");
    }
    await api.restorePersonalContents(candidate, latest.control, new AbortController().signal);
    const restored = await api.readStore(), errors: string[] = [];
    for (const command of [
      () => api.updatePersonal(value => ({ ...value, theme: "light" }), expected.epoch),
      () => api.updatePersonal(value => ({ ...value, favorites: [] }), expected.epoch),
      () => api.updateHistory(value => ({ ...value, entries: [] }), expected.epoch),
      () => api.recordOpened({ kind: "legacyVideo", videoId: "old-reader-completion" }, expected.epoch),
      () => api.updateHistory(value => value, undefined),
    ]) {
      try { await command(); errors.push("unexpected success"); }
      catch (reason) { errors.push(reason instanceof Error ? reason.message : String(reason)); }
    }
    if (JSON.stringify(await api.readStore()) !== JSON.stringify(restored)) throw new Error("An old writer changed restored data");
    return errors;
  }, { candidate, expected });
  expect(errors).toEqual(Array.from({ length: 5 }, () => expect.stringContaining("Personal data changed")));
});
