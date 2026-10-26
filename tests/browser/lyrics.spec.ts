import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import type { ListTransferV2 } from "../../src/list-transfer-types";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { lyricFixture, lyricId } from "../lyric-fixture";
import { config, readingDefaults, serveLyrics as serve, personalSnapshot } from "../lyric-browser";

const labels = messages.en;
async function holdDownload(page: Page, target: string) {
  await page.addInitScript(targetUrl => {
    const original = window.fetch.bind(window);
    Reflect.set(window, "holdLyricDownload", true);
    Reflect.set(window, "lyricDownloadAborted", false);
    window.fetch = (input, options) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === targetUrl && Reflect.get(window, "holdLyricDownload")) {
        return new Promise<Response>((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) throw new Error("Missing lyric download abort signal");
          signal.addEventListener("abort", () => {
            Reflect.set(window, "lyricDownloadAborted", true);
            reject(signal.reason);
          }, { once: true });
        });
      }
      return original(input, options);
    };
  }, target);
}
test.beforeEach(async ({ page }) => {
  // These journeys preserve no-write reading; default-on history is exercised separately.
  await page.goto("/#/settings");
  const recording = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(recording).toBeChecked();
  await recording.click(); await expect(recording).not.toBeChecked();
  await page.goto("about:blank");
});
test("real Favorites have independent complete title paging and preserve context without personal writes", async ({ page }) => {
  const count = config.lyricPreview.pageSize * 2 + 1, fixture = lyricFixture(count);
  const requests = await serve(page, fixture);
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: labels.light, exact: true })).toBeVisible();
  await page.evaluate(async ({ databaseName, ids, readingDefaults }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("personal", "readwrite"), store = transaction.objectStore("personal");
        const request = store.get("personal");
        request.onsuccess = () => store.put({ id: "personal", language: "en", theme: "light", ...readingDefaults, ...request.result,
          favorites: ids.map(lyricId => ({ kind: "lyric", lyricId })) });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }, { databaseName: config.databaseName, ids: fixture.manifest.catalog.map(entry => entry.lyricId), readingDefaults });
  await page.reload();
  await page.getByRole("link", { name: labels.favorites, exact: true }).click();
  const favorites = page.getByRole("region", { name: labels.ownerLyrics, exact: true });
  await expect(favorites.getByRole("article")).toHaveCount(config.lyricPreview.pageSize);
  await expect(favorites.getByRole("searchbox")).toHaveCount(0);
  const before = await personalSnapshot(page);
  expect(requests).toHaveLength(0);
  await page.getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await expect(page.getByRole("searchbox", { name: labels.lyricTitleFilter, exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(config.lyricPreview.pageSize);
  expect(requests).toHaveLength(2);
  await page.getByRole("link", { name: labels.favorites, exact: true }).click();
  const query = favorites.getByRole("searchbox", { name: labels.lyricTitleFilter, exact: true });
  await query.fill("synthetic");
  for (let pageIndex = 1; pageIndex <= 2; pageIndex++) {
    await favorites.getByRole("button", { name: labels.showMoreResults, exact: true }).click();
    await expect(favorites.getByRole("article")).toHaveCount(Math.min(count, (pageIndex + 1) * config.lyricPreview.pageSize));
    await expect(favorites.getByRole("article").nth(pageIndex * config.lyricPreview.pageSize)
      .getByRole("link", { name: labels.open, exact: true })).toBeFocused();
  }
  const last = favorites.getByRole("article").last().getByRole("link", { name: labels.open, exact: true });
  await last.press("Enter");
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  await page.getByRole("link", { name: labels.favorites, exact: false }).filter({ hasText: "←" }).click();
  await expect(last).toBeFocused();
  await expect(query).toHaveValue("synthetic");
  await expect(favorites.getByRole("article")).toHaveCount(count);
  const title = fixture.manifest.catalog.at(-1)?.title;
  if (!title) throw new Error("Missing synthetic final title");
  await query.fill(title);
  await expect(favorites.getByRole("article")).toHaveCount(1);
  await query.fill("no synthetic match");
  await expect(favorites.getByRole("article")).toHaveCount(0);
  await expect(favorites.getByRole("status")).toHaveText(labels.noResults);
  await query.fill("");
  await expect(favorites.getByRole("article")).toHaveCount(config.lyricPreview.pageSize);
  expect(requests).toHaveLength(3);
  expect(await personalSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("explicit real favorites and repeated reader-to-list saves persist without implicit preparation or identity remapping", async ({ page }) => {
  const requests = await serve(page);
  await page.goto("/#/lists");
  const create = page.getByRole("form", { name: labels.createList, exact: true });
  await create.getByLabel(labels.listName, { exact: true }).fill("Synthetic real reader");
  await create.getByRole("button", { name: labels.createList, exact: true }).click();
  await expect(page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name: "Synthetic real reader", exact: true })).toBeVisible();
  await page.getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await page.getByRole("article").first().getByRole("link", { name: labels.open, exact: true }).click();
  await page.getByRole("button", { name: labels.addFavorite, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.removeFavorite, exact: true })).toHaveAttribute("aria-pressed", "true");
  const add = page.getByRole("form", { name: labels.addToList, exact: true }), choice = add.getByLabel(labels.chooseList, { exact: true });
  const listId = await choice.getByRole("option", { name: /^Synthetic real reader · / }).getAttribute("value");
  if (!listId) throw new Error("Missing real-reader target list");
  for (let occurrence = 0; occurrence < 2; occurrence++) {
    await choice.selectOption(listId);
    await add.getByRole("button", { name: labels.addOccurrence, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(labels.occurrenceAdded);
  }
  const saved = await personalSnapshot(page);
  expect(saved.tables.personal).toMatchObject([{ favorites: [{ kind: "lyric", lyricId: lyricId(1) }] }]);
  expect(saved.tables.lists).toMatchObject([{ id: listId, entries: [
    { kind: "lyric", lyricId: lyricId(1) }, { kind: "lyric", lyricId: lyricId(1) },
  ] }]);
  const ids = [...JSON.stringify(saved.tables.lists).matchAll(/"id":"([0-9a-f-]+)"/g)].map(match => match[1]);
  expect(ids).toHaveLength(3); expect(new Set(ids).size).toBe(3);
  expect(JSON.stringify(saved.tables.lists)).not.toContain("fallback");
  const prepared = [...requests];
  await page.getByRole("link", { name: labels.favorites, exact: true }).click();
  const favorites = page.getByRole("region", { name: labels.ownerLyrics, exact: true });
  await expect(favorites.getByRole("article")).toHaveCount(1);
  await expect(page.getByText(labels.emptyFavorites, { exact: true })).toHaveCount(0);
  const read = favorites.getByRole("link", { name: labels.open, exact: true });
  await read.focus(); await read.press("Enter");
  await page.getByRole("link", { name: labels.favorites, exact: false }).filter({ hasText: "←" }).click();
  await expect(read).toBeFocused();
  expect(requests).toEqual(prepared);
  await page.reload();
  await expect(favorites.getByText(labels.lyricOnlineCatalogPending, { exact: true })).toBeVisible();
  expect(requests).toEqual(prepared); expect(await personalSnapshot(page)).toEqual(saved);
  await read.click();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  await expect(page.getByRole("button", { name: labels.removeFavorite, exact: true })).toBeVisible();
  expect(requests).toHaveLength(prepared.length * 2);
  expect(await personalSnapshot(page)).toEqual(saved);
  await page.getByRole("button", { name: labels.removeFavorite, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.addFavorite, exact: true })).toBeVisible();
  const removed = await personalSnapshot(page);
  expect(removed.tables.lists).toEqual(saved.tables.lists);
  expect(removed.tables.personal).toMatchObject([{ favorites: [] }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("repeated reader additions wait for their own committed list snapshot before another selection", async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
      if (this.name === "lists" && Reflect.get(window, "holdNextListObservation")) {
        Reflect.set(window, "holdNextListObservation", false);
        const db = this.transaction.db;
        this.transaction.addEventListener("complete", () => {
          // A real queued transaction delays observation without fabricating a write result.
          const barrier = db.transaction([...db.objectStoreNames], "readwrite");
          Reflect.set(window, "listObservationHeld", true);
          const pump = () => {
            const next = barrier.objectStore("control").get("state");
            next.onsuccess = () => { if (Reflect.get(window, "holdListObservation")) pump(); };
          };
          pump();
        }, { once: true, capture: true });
      }
      return request;
    };
  });
  await serve(page);
  await page.goto("/#/lists");
  const name = "Observed reader additions", create = page.getByRole("form", { name: labels.createList, exact: true });
  await create.getByLabel(labels.listName, { exact: true }).fill(name);
  await create.getByRole("button", { name: labels.createList, exact: true }).click();
  await expect(page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await page.getByRole("article").first().getByRole("link", { name: labels.open, exact: true }).click();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  const region = page.getByRole("region", { name: labels.addToList, exact: true });
  const choice = region.getByLabel(labels.chooseList, { exact: true }), add = region.getByRole("button", { name: labels.addOccurrence, exact: true });
  const listId = await choice.getByRole("option", { name: new RegExp(`^${name} · `) }).getAttribute("value");
  if (!listId) throw new Error("Missing observed target list");
  const before = await personalSnapshot(page);
  await page.evaluate(() => {
    Reflect.set(window, "holdListObservation", true); Reflect.set(window, "holdNextListObservation", true);
  });
  try {
    await choice.selectOption(listId); await add.click();
    await expect(region.getByRole("status")).toHaveText(labels.occurrenceAdded);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "listObservationHeld"))).toBe(true);
    await expect(choice).toBeDisabled(); await expect(add).toBeDisabled();
  } finally { await page.evaluate(() => Reflect.set(window, "holdListObservation", false)); }
  await expect(choice).toBeEnabled();
  await choice.selectOption(listId); await add.click();
  await expect(region.getByRole("status")).toHaveText(labels.occurrenceAdded);
  await expect.poll(async () => (await personalSnapshot(page)).tables.lists).toMatchObject([{ name, entries: [
    { kind: "lyric", lyricId: lyricId(1) }, { kind: "lyric", lyricId: lyricId(1) },
  ] }]);
  const after = await personalSnapshot(page), header = before.tables.control?.[0];
  if (!header || typeof header !== "object" || !("revision" in header) || typeof header.revision !== "number") {
    throw new Error("Missing verified pre-add revision");
  }
  expect(after.tables.control).toEqual([{ ...header, revision: header.revision + 2 }]);
  expect(after.tables.personal).toEqual(before.tables.personal); expect(after.tables.recentHistory).toEqual(before.tables.recentHistory);
});

test("mixed typed transfers resolve only explicit lyric references and list-origin reading retains exact context", async ({ page }) => {
  const requests = await serve(page);
  const value: ListTransferV2 = { format: "daasavaani-list", formatVersion: 2, name: "Synthetic mixed references", entries: [
    { kind: "lyric", lyricId: lyricId(1), fallback: "  User text, not a title  " },
    { kind: "legacyVideo", videoId: lyricId(1) },
    { kind: "placeholder", text: "<b>Only literal</b>" },
    { kind: "lyric", lyricId: lyricId(1) },
    { kind: "lyric", lyricId: lyricId(99) },
  ] };
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: labels.light, exact: true })).toBeVisible();
  const before = await personalSnapshot(page);
  await page.getByLabel(labels.transferFile, { exact: true }).setInputFiles({
    name: "synthetic-v2.gz", mimeType: "application/gzip", buffer: gzipSync(JSON.stringify(value)),
  });
  await expect(page.getByRole("heading", { name: value.name, exact: true })).toBeVisible();
  expect(requests).toHaveLength(0); expect(await personalSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: labels.transferDownload, exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: labels.transferDownload, exact: true }).click()]);
  const path = await download.path();
  if (!path) throw new Error("Missing typed snapshot download");
  expect(JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"))).toEqual(value);
  expect(await personalSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: labels.saveList, exact: true }).click();
  await page.getByRole("link", { name: labels.viewLists, exact: true }).click();
  await page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name: value.name, exact: true }).click();
  const rows = page.locator("main ol > li"), read = rows.first().getByRole("link", { name: labels.open, exact: true });
  await expect(rows).toHaveCount(value.entries.length);
  await expect(rows.nth(1).getByRole("link")).toHaveCount(0);
  const saved = await personalSnapshot(page);
  expect(saved.tables.lists).toMatchObject([{ entries: value.entries }]);
  const ids = [...JSON.stringify(saved.tables.lists).matchAll(/"id":"([0-9a-f-]+)"/g)].map(match => match[1]);
  expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
  const rename = page.getByRole("form", { name: labels.renameList, exact: true }).getByLabel(labels.listName, { exact: true });
  await rename.fill("Unsaved real list name");
  await read.focus(); await read.press("Enter");
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  expect(requests).toHaveLength(3);
  await page.getByRole("link", { name: labels.backToList, exact: false }).click();
  await expect(rename).toHaveValue("Unsaved real list name"); await expect(read).toBeFocused();
  await expect(rows.first().getByText(labels.referenceKnown, { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByText(labels.lyricsUnavailable, { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByText(labels.referenceKnown, { exact: true })).toHaveCount(0);
  await expect(page.locator("main b")).toHaveCount(0);
  const prepared = [...requests];
  await rows.last().getByRole("link", { name: labels.open, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(labels.lyricsUnavailable);
  await page.goBack(); await expect(rename).toHaveValue("Unsaved real list name");
  expect(requests).toEqual(prepared); expect(await personalSnapshot(page)).toEqual(saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("online browsing loads only metadata and exact selected text without personal writes, including direct reload", async ({ page }) => {
  const fixture = lyricFixture(), requests = await serve(page, fixture);
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: messages.en.languageName, exact: true })).toBeVisible();
  const before = await personalSnapshot(page);
  expect(requests).toHaveLength(0);
  await page.getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(requests).toEqual(["latest.json", fixture.descriptor.manifest.path]);
  await expect(page.getByText("Development demo", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: labels.prepareLibrary })).toHaveCount(0);
  await page.getByRole("article").first().getByRole("link", { name: labels.open, exact: true }).click();
  await expect(page.locator("div[lang=kn] > p")).toHaveText(["ಕನ್ನಡ 😀  ", " \t ", "", "ಅಕ್ಷರ"], { useInnerText: false });
  expect(await page.locator("div[lang=kn] > p").evaluateAll(nodes => nodes.map(node => node.textContent)))
    .toEqual(["ಕನ್ನಡ 😀  ", " \t ", "", "ಅಕ್ಷರ"]);
  await expect(page.getByRole("button", { name: labels.addFavorite })).toBeVisible();
  await expect(page.getByText(labels.canonical, { exact: true })).toHaveCount(0);
  await expect(page.getByText(labels.lyricNoMedia, { exact: true })).toBeVisible();
  expect(requests).toEqual(["latest.json", fixture.descriptor.manifest.path, fixture.manifest.catalog[0]?.item.path]);
  const preparedRequests = [...requests];
  expect(await personalSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.locator("div[lang=kn] > p")).toHaveText(["ಕನ್ನಡ 😀  ", " \t ", "", "ಅಕ್ಷರ"], { useInnerText: false });
  expect(requests).toEqual([...preparedRequests, ...preparedRequests]);
  expect(await personalSnapshot(page)).toEqual(before);
});
test("complete title paging and reader Back/Forward retain exact query, focus and prepared bytes", async ({ page }) => {
  const count = config.lyricPreview.pageSize * 2 + 1, requests = await serve(page, lyricFixture(count));
  await page.goto("/#/lyrics");
  await expect(page.getByRole("article")).toHaveCount(config.lyricPreview.pageSize);
  await page.getByRole("searchbox", { name: labels.lyricTitleFilter }).fill("synthetic");
  await page.getByRole("button", { name: labels.showMoreResults }).click();
  await expect(page.getByRole("article")).toHaveCount(config.lyricPreview.pageSize * 2);
  await page.getByRole("button", { name: labels.showMoreResults }).click();
  await expect(page.getByRole("article")).toHaveCount(count);
  const read = page.getByRole("article").last().getByRole("link", { name: labels.open, exact: true });
  await expect(read).toBeFocused();
  const position = await page.evaluate(() => window.scrollY);
  const before = [...requests];
  await read.press("Enter");
  await expect(page).toHaveURL(new RegExp(lyricId(count)));
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  expect(requests).toHaveLength(before.length + 1);
  const readRequests = [...requests];
  await page.goBack();
  await expect(page.getByRole("searchbox")).toHaveValue("synthetic");
  await expect(read).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(position, 0);
  await expect(page.getByRole("article")).toHaveCount(count);
  await page.goForward();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  await page.getByRole("link", { name: labels.lyricBack, exact: false }).click();
  await expect(read).toBeFocused();
  expect(requests).toEqual(readRequests);
});
test("corrupt requested lyrics never expose partial text and retry without refetching the catalog or unavailable fixtures", async ({ page }) => {
  let corrupt = true;
  const requests = await serve(page, lyricFixture(), () => corrupt);
  await page.route("**/demo/latest.json", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/#/lyrics");
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(requests).toHaveLength(2);
  await page.getByRole("article").first().getByRole("link", { name: labels.open, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Artifact encoded size mismatch");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(0);
  await expect(page.getByText(labels.noResults, { exact: true })).toHaveCount(0);
  corrupt = false;
  await page.getByRole("button", { name: labels.retry }).click();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requests).toHaveLength(4);
});
test("cancellation aborts the active download and retry cannot activate stale partial state", async ({ page }) => {
  const requests = await serve(page);
  await holdDownload(page, config.lyricPreview.descriptorUrl);
  await page.goto("/#/lyrics");
  await page.getByRole("button", { name: labels.cancel, exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "lyricDownloadAborted"))).toBe(true);
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(labels.loadingCancelled, { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.evaluate(() => Reflect.set(window, "holdLyricDownload", false));
  await page.getByRole("button", { name: labels.retry }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(requests).toHaveLength(2);
});
test("catalog errors remain explicit with no partial cards or personal writes until an explicit retry", async ({ page }) => {
  const requests = await serve(page);
  let unavailable = true;
  await page.route(config.lyricPreview.descriptorUrl, route => unavailable
    ? route.fulfill({ status: 503, body: "Synthetic catalog unavailable" }) : route.fallback());
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: labels.settings, exact: true })).toBeVisible();
  const before = await personalSnapshot(page);
  await page.getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText(labels.noResults, { exact: true })).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(before);
  unavailable = false;
  await page.getByRole("button", { name: labels.retry, exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(requests).toHaveLength(2);
  expect(await personalSnapshot(page)).toEqual(before);
});
test("cancelling an individual read never records history and retry fetches only that item", async ({ page }) => {
  const fixture = lyricFixture(), reference = fixture.manifest.catalog[0]?.item;
  if (!reference) throw new Error("Missing synthetic selected item");
  const requests = await serve(page, fixture);
  await holdDownload(page, new URL(reference.path, new URL(".", config.lyricPreview.descriptorUrl)).href);
  await page.goto("/#/settings");
  const recording = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(recording).not.toBeChecked(); await recording.click(); await expect(recording).toBeChecked();
  const before = await personalSnapshot(page);
  await page.getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await page.getByRole("article").first().getByRole("link", { name: labels.open, exact: true }).click();
  await page.getByRole("button", { name: labels.cancel, exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "lyricDownloadAborted"))).toBe(true);
  await expect(page.getByText(labels.loadingCancelled, { exact: true })).toBeVisible();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(await personalSnapshot(page)).toEqual(before);
  await page.evaluate(() => Reflect.set(window, "holdLyricDownload", false));
  await page.getByRole("button", { name: labels.retry, exact: true }).click();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled: true, entries: [{ kind: "lyric", lyricId: lyricId(1) }] }]);
  const after = await personalSnapshot(page);
  expect(after.tables.personal).toEqual(before.tables.personal); expect(after.tables.lists).toEqual(before.tables.lists);
  expect(requests).toEqual(["latest.json", fixture.descriptor.manifest.path, reference.path]);
});
test("unknown lyric IDs never infer matches and saved UI locale/theme do not alter canonical Kannada", async ({ page }) => {
  const requests = await serve(page);
  await page.goto("/#/lyrics/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("alert")).toHaveText(labels.lyricsUnavailable);
  expect(requests).toHaveLength(2);
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(0);
  await page.getByRole("link", { name: labels.settings, exact: true }).click();
  await page.getByRole("button", { name: messages.kn.languageName, exact: true }).click();
  await page.getByRole("button", { name: messages.kn.warm, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  await page.getByRole("link", { name: messages.kn.ownerLyrics, exact: true }).click();
  await page.getByRole("article").first().getByRole("link", { name: messages.kn.open, exact: true }).click();
  await expect(page.locator("div[lang=kn] > p").first()).toHaveText("ಕನ್ನಡ 😀  ");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  await expect(page.locator("div[lang=kn] > p").first()).toHaveText("ಕನ್ನಡ 😀  ");
});
