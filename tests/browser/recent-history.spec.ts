import { test, expect, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import type { PersonalReference } from "../../shared/types/personal";
import { config, readingDefaults, maxRecents, personalSnapshot, serveLyrics } from "../lyric-browser";
import { lyricId } from "../lyric-fixture";

const labels = messages.en;
const lyric = (index: number): PersonalReference => ({ kind: "lyric", lyricId: lyricId(index) });
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: labels.appName, exact: true })
  .getByRole("link", { name, exact: true });
async function expectHistory(page: Page, entries: PersonalReference[], enabled = true) {
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled, entries }]);
}
async function prepare(page: Page) {
  await nav(page, labels.ownerLyrics).click();
  await expect(page.getByRole("article")).toHaveCount(2);
}
async function open(page: Page, index = 0) {
  await page.getByRole("article").nth(index).getByRole("link", { name: labels.open, exact: true }).click();
  await expect(page.getByRole("heading", { name: `ಕನ್ನಡ synthetic ${String(index + 1).padStart(3, "0")}`, exact: true })).toBeVisible();
}
async function settled(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test("only successful explicit real and fixture reads record typed history; catalog loading and preview do not", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto("/#/recent");
  await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toBeChecked();
  await expect(page.getByRole("region", { name: labels.recentHistory, exact: true }).getByRole("status"))
    .toHaveText(labels.emptyRecentHistory);
  const before = await personalSnapshot(page);
  expect(requests).toEqual([]);
  await prepare(page);
  expect(await personalSnapshot(page)).toEqual(before);
  await open(page);
  await expectHistory(page, [lyric(1)]);
  await page.getByRole("link", { name: "← " + labels.lyricBack, exact: true }).click();
  await open(page, 1);
  await expectHistory(page, [lyric(2), lyric(1)]);
  await nav(page, labels.recentHistory).click();
  const region = page.getByRole("region", { name: labels.recentHistory, exact: true });
  await expect(region.getByRole("heading", { level: 2 })).toHaveText(["ಕನ್ನಡ synthetic 002", "ಕನ್ನಡ synthetic 001"]);
  const current = await personalSnapshot(page);
  const read = region.getByRole("article").first().getByRole("link", { name: labels.open, exact: true });
  await read.focus(); await read.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ಕನ್ನಡ synthetic 002");
  await settled(page); expect(await personalSnapshot(page)).toEqual(current);
  await page.getByRole("link", { name: "← " + labels.recentHistory, exact: true }).click();
  await expect(read).toBeFocused();
  await nav(page, labels.settings).click();
  await page.getByLabel(labels.transferFile, { exact: true }).setInputFiles({ name: "synthetic.gz", mimeType: "application/gzip",
    buffer: gzipSync(JSON.stringify({ format: "daasavaani-list", formatVersion: 2, name: "No history from preview", entries: [lyric(1)] })) });
  await expect(page.getByRole("heading", { name: "No history from preview", exact: true })).toBeVisible();
  expect(await personalSnapshot(page)).toEqual(current);
  await page.goto("/#/item/fixture-one");
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  const expected: PersonalReference[] = [{ kind: "legacyVideo", videoId: "fixture-one" }, lyric(2), lyric(1)];
  await expectHistory(page, expected);
  const successful = await personalSnapshot(page);
  await page.goto("/#/item/unknown-synthetic-reference");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await personalSnapshot(page)).toEqual(successful);
  await page.goto("/#/lyrics/" + lyricId(99));
  await expect(page.getByRole("alert")).toHaveText(labels.lyricsUnavailable);
  expect(await personalSnapshot(page)).toEqual(successful);
  expect(successful.tables.personal).toEqual(before.tables.personal);
  expect(successful.tables.lists).toEqual(before.tables.lists);
  expect(requests).toHaveLength(4);
});

test("disable restart clear and re-enable preserve unrelated state and do not record a still-mounted reader again", async ({ page, context }) => {
  const requests = await serveLyrics(page);
  await page.goto("/#/lists");
  const create = page.getByRole("form", { name: labels.createList, exact: true });
  await create.getByLabel(labels.listName, { exact: true }).fill("Preserved history-independent list");
  await create.getByRole("button", { name: labels.createList, exact: true }).click();
  await expect(page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button")).toHaveCount(1);
  await prepare(page); await open(page);
  await expectHistory(page, [lyric(1)]);
  await page.getByRole("button", { name: labels.addFavorite, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.removeFavorite, exact: true })).toBeVisible();
  const before = await personalSnapshot(page), peer = await context.newPage();
  try {
    await peer.goto("/#/settings");
    const recording = peer.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
    await recording.click(); await expectHistory(peer, [lyric(1)], false);
    const off = await personalSnapshot(peer);
    await peer.reload(); await expect(recording).not.toBeChecked();
    expect(await personalSnapshot(peer)).toEqual(off);
    await page.getByRole("link", { name: "← " + labels.lyricBack, exact: true }).click();
    await open(page, 1);
    await settled(page); expect(await personalSnapshot(page)).toEqual(off);
    await peer.getByRole("button", { name: labels.clearRecentHistory, exact: true }).click();
    await expectHistory(peer, [], false);
    await expect(recording).toBeFocused();
    await recording.click(); await expectHistory(peer, []);
    await settled(page); await settled(peer);
    const cleared = await personalSnapshot(page);
    expect(cleared.tables.personal).toEqual(before.tables.personal);
    expect(cleared.tables.lists).toEqual(before.tables.lists);
    const header = before.tables.control?.[0];
    if (!header || typeof header !== "object" || !("revision" in header) || typeof header.revision !== "number") {
      throw new Error("Missing verified personal revision");
    }
    expect(cleared.tables.control).toMatchObject([{ revision: header.revision + 3 }]);
    await page.getByRole("link", { name: "← " + labels.lyricBack, exact: true }).click();
    await open(page);
    await expectHistory(page, [lyric(1)]);
    expect(requests).toHaveLength(4);
  } finally { await peer.close(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("history commit never steals focus from another control or a new route", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto("/#/recent");
  const recording = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(recording).toBeChecked();
  const changeAndMove = (navigate: boolean) => recording.evaluate((input, leave) => {
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing recording control");
    const destination = document.querySelector<HTMLAnchorElement>('nav a[href="#/lyrics"]');
    if (!destination) throw new Error("Missing lyric navigation");
    input.click();
    if (leave) destination.click(); else destination.focus();
  }, navigate);
  await changeAndMove(false);
  await expectHistory(page, [], false);
  await settled(page);
  await expect(nav(page, labels.ownerLyrics)).toBeFocused();
  await changeAndMove(true);
  await expectHistory(page, []);
  await expect(page.getByRole("region", { name: labels.ownerLyrics, exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(2);
  await settled(page);
  await expect(page.getByRole("main")).toBeFocused();
  expect(requests).toHaveLength(2);
});

test("history quota failure is explicit and atomic without hiding verified reading or fabricating a saved open", async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "recentHistory" && Reflect.get(window, "failHistoryPut")) {
        throw new DOMException("Synthetic history quota failure", "QuotaExceededError");
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  const requests = await serveLyrics(page);
  await page.goto("/#/settings"); await prepare(page);
  const before = await personalSnapshot(page);
  await page.evaluate(() => Reflect.set(window, "failHistoryPut", true));
  await open(page);
  await expect(page.getByRole("alert")).toContainText("Synthetic history quota failure");
  await expect(page.getByText("ಕನ್ನಡ 😀  ", { exact: true })).toBeVisible();
  expect(await personalSnapshot(page)).toEqual(before);
  await page.evaluate(() => Reflect.set(window, "failHistoryPut", false));
  await page.getByRole("button", { name: labels.retry, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("link", { name: "← " + labels.lyricBack, exact: true }).click();
  await open(page);
  await expectHistory(page, [lyric(1)]);
  expect(requests).toHaveLength(3);
});

test("an over-capacity current history is refused without resetting its preference or any personal row", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toBeChecked();
  await page.evaluate(async ({ name, count }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("recentHistory", "readwrite");
        tx.objectStore("recentHistory").put({ id: "history", enabled: false, entries: Array.from({ length: count },
          (_, index) => ({ kind: "legacyVideo", videoId: `synthetic_${index}` })) });
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { name: config.databaseName, count: maxRecents + 1 });
  const before = await personalSnapshot(page);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Personal storage or collection limit reached");
  await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(before);
});

test("the actual recent window retains unresolved typed identities across reload and evicts only its oldest reference", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto("/#/settings");
  await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toBeChecked();
  const entries: PersonalReference[] = [{ kind: "legacyVideo", videoId: lyricId(1) },
    ...Array.from({ length: maxRecents - 1 }, (_, index) => lyric(index + 100))];
  await page.evaluate(async ({ name, entries }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("recentHistory", "readwrite");
        transaction.objectStore("recentHistory").put({ id: "history", enabled: true, entries });
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }, { name: config.databaseName, entries });
  await page.reload();
  await nav(page, labels.recentHistory).click();
  const region = page.getByRole("region", { name: labels.recentHistory, exact: true });
  await expect(region.getByRole("article")).toHaveCount(maxRecents);
  await expect(region.getByRole("article").first().getByRole("link")).toHaveCount(0);
  await expectHistory(page, entries);
  expect(requests).toEqual([]);
  await prepare(page); await open(page);
  await expectHistory(page, [lyric(1), ...entries.slice(0, -1)]);
  await nav(page, labels.recentHistory).click();
  await expect(region.getByRole("article")).toHaveCount(maxRecents);
  await expect(region.getByRole("article").nth(1).locator("code")).toHaveText(lyricId(1));
  await expect(region.getByRole("article").nth(1).getByRole("link")).toHaveCount(0);
  await page.reload();
  await expect(region.getByRole("article")).toHaveCount(maxRecents);
  await expectHistory(page, [lyric(1), ...entries.slice(0, -1)]);
  expect(requests).toHaveLength(3);
});

for (const invalid of [false, true]) {
  test(`v4 history migration ${invalid ? "rolls every native change back for invalid old data" : "preserves typed preferences lists and identities without inventing activity"}`, async ({ page }) => {
    await page.route("**/history-v4-seed", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>History migration fixture</title>" }));
    await page.goto("/history-v4-seed");
    await page.evaluate(async ({ name, invalid, id }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 40);
        request.onupgradeneeded = () => { for (const store of ["personal", "lists", "control"]) request.result.createObjectStore(store, { keyPath: "id" }); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(["personal", "lists", "control"], "readwrite");
          tx.objectStore("control").put({ id: "state", formatVersion: invalid ? 5 : 4, epoch: id, revision: 17 });
          tx.objectStore("personal").put({ id: "personal", language: "en", theme: "warm", favorites: [
            { kind: "lyric", lyricId: id }, { kind: "legacyVideo", videoId: id }] });
          tx.objectStore("lists").put({ id: "00000000-0000-4000-8000-000000000003", name: "  Keep raw  ", entries: [
            { id: "00000000-0000-4000-8000-000000000004", kind: "lyric", lyricId: id, fallback: "  Keep fallback  " }] });
          tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    }, { name: config.databaseName, invalid, id: lyricId(1) });
    const before = await personalSnapshot(page);
    await page.goto("/#/settings");
    if (invalid) {
      await expect(page.getByRole("alert")).toContainText("Invalid personal database record");
      expect(await personalSnapshot(page)).toEqual(before);
    } else {
      await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toBeChecked();
      const after = await personalSnapshot(page);
      expect(after.version).toBe(80);
      expect(after.tables.personal).toEqual(before.tables.personal.map((row: unknown) => {
        if (!row || typeof row !== "object") throw new Error("Invalid seeded personal row");
        return { ...row, ...readingDefaults };
      }));
      expect(after.tables.lists).toEqual(before.tables.lists);
      expect(after.tables.control).toMatchObject([{ id: "state", formatVersion: 8, revision: 0 }]);
      expect(after.tables.recitationPosition).toEqual([{ id: "recitation", position: null }]);
      expect(after.tables.control).not.toEqual(before.tables.control);
      await expectHistory(page, []);
      await page.reload(); await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toBeChecked();
      expect(await personalSnapshot(page)).toEqual(after);
    }
  });
}
