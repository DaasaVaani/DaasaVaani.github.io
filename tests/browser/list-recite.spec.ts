import { test, expect, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import type { ListTransferV2 } from "../../src/list-transfer-types";
import { config, personalSnapshot, serveLyrics } from "../lyric-browser";
import { lyricFixture, lyricId } from "../lyric-fixture";
import { installScreenAwakeAdapter } from "../screen-awake";

const labels = messages.en, name = "Ordered synthetic list";
const start = (page: Page) => page.getByRole("button", { name: labels.reciteList, exact: true });
const exit = (page: Page) => page.getByRole("button", { name: labels.exitRecite, exact: true });
const previous = (page: Page) => page.getByRole("button", { name: labels.previousRecitationEntry, exact: true });
const next = (page: Page) => page.getByRole("button", { name: labels.nextRecitationEntry, exact: true });
const navigation = (page: Page) => page.getByRole("region", { name: labels.reciteList, exact: true });
const body = (page: Page) => page.getByRole("region", { name: labels.recite, exact: true });
const layout = (page: Page) => body(page).locator("div[lang=kn] > p").evaluateAll(elements =>
  elements.map(element => [element.id, element.textContent, element.hasAttribute("data-layout"), element.innerHTML]));
async function position(page: Page, value: number, total: number) {
  await expect(navigation(page).getByRole("heading")).toHaveText(labels.entryNumber
    .replace("{position}", String(value)).replace("{total}", String(total)));
}
function expectPositionOnly(before: Awaited<ReturnType<typeof personalSnapshot>>, after: Awaited<ReturnType<typeof personalSnapshot>>,
  index: number, changes: number) {
  expect(after).toEqual({ ...before, tables: { ...before.tables,
    control: [{ ...before.tables.control[0], revision: before.tables.control[0].revision + changes }],
    recitationPosition: [{ id: "recitation", position: {
      listId: before.tables.lists[0].id, entryId: before.tables.lists[0].entries[index].id,
    } }],
  } });
}
async function prepare(page: Page, entries: ListTransferV2["entries"], history = false,
  fixture = lyricFixture(), corrupt: () => boolean = () => false) {
  const requests = await serveLyrics(page, fixture, corrupt);
  await page.goto("/#/settings");
  const enabled = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(enabled).toBeChecked();
  if (!history) { await enabled.click(); await expect(enabled).not.toBeChecked(); }
  const value: ListTransferV2 = { format: "daasavaani-list", formatVersion: 2, name, entries };
  await page.getByLabel(labels.transferFile, { exact: true }).setInputFiles({
    name: "synthetic-list-recite.gz", mimeType: "application/gzip", buffer: gzipSync(JSON.stringify(value)),
  });
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: labels.saveList, exact: true }).click();
  await page.getByRole("link", { name: labels.viewLists, exact: true }).click();
  await page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name, exact: true }).click();
  await expect(start(page)).toBeEnabled();
  return requests;
}
test("ordered mixed occurrences never deduplicate skip wrap or change unrelated personal data and retain cached text offline", async ({ page, context }) => {
  const raw = "  <b>Literal placeholder</b>  ";
  const requests = await prepare(page, [
    { kind: "lyric", lyricId: lyricId(1), fallback: "  Literal fallback  " },
    { kind: "lyric", lyricId: lyricId(1) },
    { kind: "placeholder", text: raw }, { kind: "placeholder", text: raw },
    { kind: "lyric", lyricId: lyricId(99), fallback: "Unresolved canonical" },
    { kind: "legacyVideo", videoId: lyricId(1), fallback: "Distinct legacy identity" },
    { kind: "legacyVideo", videoId: "fixture-one" }, { kind: "legacyVideo", videoId: "fixture-one" },
  ]);
  const before = await personalSnapshot(page);
  await start(page).click(); await position(page, 1, 8);
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  const original = await layout(page);
  expect(requests).toHaveLength(3); await expect(previous(page)).toBeDisabled();
  await expect(page.getByRole("navigation", { name: labels.appName, exact: true })).toBeHidden();
  await next(page).click(); await position(page, 2, 8);
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  expect(await layout(page)).toEqual(original);
  for (const value of [3, 4]) {
    await next(page).click(); await position(page, value, 8);
    await expect(body(page).getByText(labels.lyricsUnavailable, { exact: true })).toBeVisible();
    expect(await body(page).locator("span").last().textContent()).toBe(raw);
    await expect(body(page).locator("b")).toHaveCount(0);
  }
  for (const value of [5, 6]) {
    await next(page).click(); await position(page, value, 8);
    await expect(body(page).getByText(labels.lyricsUnavailable, { exact: true })).toBeVisible();
    await expect(body(page).locator("div[lang=kn]")).toHaveCount(0);
  }
  await next(page).click(); await position(page, 7, 8);
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  const fixtureLayout = await layout(page);
  await next(page).click(); await position(page, 8, 8);
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  expect(await layout(page)).toEqual(fixtureLayout);
  await expect(next(page)).toBeDisabled(); await expect(page.getByText(labels.recitationEnd, { exact: true })).toBeVisible();
  await context.setOffline(true);
  for (let value = 7; value >= 1; value--) { await previous(page).click(); await position(page, value, 8); }
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  expect(await layout(page)).toEqual(original); expect(requests).toHaveLength(3);
  await exit(page).press("Escape"); await expect(start(page)).toBeFocused();
  expectPositionOnly(before, await personalSnapshot(page), 0, 15);
  await context.setOffline(false);
});
test("an empty saved list has no invented position or reading request and both boundaries are disabled", async ({ page }) => {
  const requests = await prepare(page, []), before = await personalSnapshot(page);
  await start(page).click();
  await expect(navigation(page).getByRole("heading")).toHaveText(labels.emptyRecitation);
  await expect(previous(page)).toBeDisabled(); await expect(next(page)).toBeDisabled();
  await expect(body(page)).toHaveCount(0);
  await exit(page).click(); expect(requests).toHaveLength(0);
  expect(await personalSnapshot(page)).toEqual(before);
});
test("Back exits to exact draft controls while Forward Settings and restart never automatically enter list Recite", async ({ page }) => {
  await prepare(page, [{ kind: "placeholder", text: "Saved placeholder" }]);
  const rename = page.getByRole("form", { name: labels.renameList, exact: true }).getByLabel(labels.listName, { exact: true });
  await rename.fill("Unsaved list draft");
  await page.getByRole("button", { name: labels.editEntry, exact: true }).click();
  const draft = page.getByLabel(labels.placeholderText, { exact: true }); await draft.fill("Unsaved entry draft");
  const before = await personalSnapshot(page);
  await start(page).click(); await expect(exit(page)).toBeVisible();
  await page.goBack(); await expect(start(page)).toBeFocused();
  await expect(rename).toHaveValue("Unsaved list draft"); await expect(draft).toHaveValue("Unsaved entry draft");
  await page.goForward(); await expect(exit(page)).toHaveCount(0); await expect(start(page)).toBeVisible();
  await start(page).click(); await page.reload();
  await expect(exit(page)).toHaveCount(0);
  await page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name, exact: true }).click();
  await start(page).click(); await page.getByRole("button", { name: labels.showReadingControls, exact: true }).click();
  await page.getByRole("navigation", { name: labels.appName, exact: true }).getByRole("link", { name: labels.settings, exact: true }).click();
  await expect(page.locator("body")).not.toHaveAttribute("data-recite", /.+/);
  await page.goBack(); await expect(exit(page)).toHaveCount(0);
  await expect(page.getByRole("list", { name: labels.lists, exact: true })).toBeVisible();
  expectPositionOnly(before, await personalSnapshot(page), 0, 1);
});
test("reading preferences preserve literal text and one scoped wake request spans occurrences but not background or exit", async ({ page }) => {
  await installScreenAwakeAdapter(page);
  await prepare(page, [{ kind: "lyric", lyricId: lyricId(1) }, { kind: "lyric", lyricId: lyricId(1) }]);
  await start(page).click(); await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  const original = await layout(page), before = await personalSnapshot(page);
  const awake = page.getByRole("button", { name: labels.keepScreenAwake, exact: true });
  await awake.click(); await expect(awake).toHaveAttribute("aria-pressed", "true");
  await next(page).click(); await position(page, 2, 2);
  await expect(awake).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => [window.reciteWakeTest.requests, window.reciteWakeTest.releases])).toEqual([1, 0]);
  await page.getByRole("button", { name: labels.showReadingControls, exact: true }).click();
  await page.getByRole("button", { name: labels.increaseLyricFontSize, exact: true }).click();
  await expect(body(page).locator("div[lang=kn]")).toHaveCSS("font-size", `${config.readerFontSize + config.readerFontSizeStep}px`);
  await page.getByRole("combobox", { name: labels.readingDensity, exact: true }).selectOption("compact");
  await expect(body(page).locator("div[lang=kn]")).toHaveCSS("line-height",
    `${(config.readerFontSize + config.readerFontSizeStep) * config.readerLineHeights.compact}px`);
  expect(await layout(page)).toEqual(original);
  await page.evaluate(() => { window.reciteWakeTest.hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(awake).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => { window.reciteWakeTest.hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  expect(await page.evaluate(() => window.reciteWakeTest.requests)).toBe(1);
  await exit(page).click();
  expect(await page.evaluate(() => [window.reciteWakeTest.requests, window.reciteWakeTest.releases])).toEqual([1, 1]);
  const after = await personalSnapshot(page);
  for (const key of ["lists", "recentHistory", "learningLabels"]) expect(after.tables[key]).toEqual(before.tables[key]);
});
test("catalog failures expose no partial text or history and explicit retry reads only the remembered selected lyric", async ({ page }) => {
  let corrupt = true;
  const requests = await prepare(page, [{ kind: "lyric", lyricId: lyricId(1) }], false, lyricFixture(), () => corrupt);
  const before = await personalSnapshot(page);
  await start(page).click(); await expect(body(page).getByRole("alert")).toBeVisible();
  await expect(body(page).locator("div[lang=kn]")).toHaveCount(0);
  expectPositionOnly(before, await personalSnapshot(page), 0, 1);
  corrupt = false; await body(page).getByRole("button", { name: labels.retry, exact: true }).click();
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  expect(requests).toHaveLength(4); expectPositionOnly(before, await personalSnapshot(page), 0, 1);
});
test("cancelled and late item responses never expose stale text or history while successful explicit occurrences use normal history", async ({ page }) => {
  const fixture = lyricFixture(), requests = await prepare(page, [
    { kind: "lyric", lyricId: lyricId(1), fallback: "Preserved fallback" },
    { kind: "placeholder", text: "Only this occurrence" },
    { kind: "legacyVideo", videoId: "fixture-one", fallback: "Independent legacy fallback" },
  ], true, fixture);
  const reference = fixture.manifest.catalog[0]!.item;
  let release!: () => void, held = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(new URL(reference.path, new URL(".", config.lyricPreview.descriptorUrl)).href, async route => {
    held++; await gate; await route.fulfill({ body: fixture.files.get(reference.path)!, contentType: "application/octet-stream",
      headers: { "access-control-allow-origin": "*" } });
  });
  const before = await personalSnapshot(page);
  await start(page).click(); await expect.poll(() => held).toBe(1);
  await body(page).getByRole("button", { name: labels.cancel, exact: true }).click();
  await expect(body(page).getByText(labels.loadingCancelled, { exact: true })).toBeVisible();
  await next(page).click(); await position(page, 2, 3); release();
  await expect(body(page).getByText("Only this occurrence", { exact: true })).toBeVisible();
  await expect(body(page).locator("div[lang=kn]")).toHaveCount(0);
  expectPositionOnly(before, await personalSnapshot(page), 1, 2);
  await previous(page).click(); await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled: true, entries: [{ kind: "lyric", lyricId: lyricId(1) }] }]);
  const recorded = await personalSnapshot(page);
  await next(page).click(); await previous(page).click();
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(4);
  expectPositionOnly(recorded, await personalSnapshot(page), 0, 2); expect(requests).toHaveLength(2);
  await next(page).click(); await next(page).click();
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled: true, entries: [
      { kind: "legacyVideo", videoId: "fixture-one" }, { kind: "lyric", lyricId: lyricId(1) },
    ] }]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await personalSnapshot(page)).tables.lists).toEqual(before.tables.lists);
});
for (const mutation of ["rename", "delete"] as const) test(`an external list ${mutation} ends Recite explicitly instead of jumping or continuing stale occurrences`, async ({ page, context }) => {
  await prepare(page, [{ kind: "placeholder", text: "Independent occurrence" }]);
  const before = await personalSnapshot(page);
  await start(page).click(); await expect(exit(page)).toBeVisible();
  const peer = await context.newPage();
  try {
    await peer.goto("/#/lists");
    await peer.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name, exact: true }).click();
    if (mutation === "rename") {
      await peer.getByRole("form", { name: labels.renameList, exact: true }).getByLabel(labels.listName, { exact: true }).fill("Changed externally");
      await peer.getByRole("button", { name: labels.renameList, exact: true }).click();
      await expect(peer.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name: "Changed externally", exact: true })).toBeVisible();
    } else {
      await peer.getByRole("button", { name: labels.deleteList, exact: true }).click();
      await peer.getByRole("button", { name: labels.confirmDelete, exact: true }).click();
      await expect(peer.getByRole("list", { name: labels.lists, exact: true }).getByRole("button")).toHaveCount(0);
    }
    await expect(exit(page)).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: labels.personalStale })).toBeVisible();
    await expect(page.getByRole("heading", { name: labels.lists, exact: true })).toBeFocused();
    expect((await personalSnapshot(page)).tables.control[0].revision).toBe(before.tables.control[0].revision + 2);
  } finally { await peer.close(); }
});
test("actual offline fixture reads reuse only already verified session content and unavailable downloads stay explicit and retryable", async ({ page, context }) => {
  await prepare(page, [
    { kind: "legacyVideo", videoId: "fixture-one" }, { kind: "legacyVideo", videoId: "fixture-one" },
    { kind: "legacyVideo", videoId: "fixture-two" },
  ]);
  const before = await personalSnapshot(page);
  await start(page).click(); await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  const original = await layout(page);
  await context.setOffline(true);
  await next(page).click(); await position(page, 2, 3);
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  expect(await layout(page)).toEqual(original);
  await next(page).click(); await position(page, 3, 3);
  await expect(body(page).getByRole("alert")).toBeVisible();
  await expect(body(page).locator("div[lang=kn]")).toHaveCount(0);
  await previous(page).click(); await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  expect(await layout(page)).toEqual(original);
  await next(page).click(); await expect(body(page).getByRole("alert")).toBeVisible();
  await context.setOffline(false); await body(page).getByRole("button", { name: labels.retry, exact: true }).click();
  await expect(body(page).locator("div[lang=kn] > p")).toHaveCount(2);
  expect(await layout(page)).not.toEqual(original);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expectPositionOnly(before, await personalSnapshot(page), 2, 5);
});

const savedPosition = (page: Page) => page.getByRole("region", { name: labels.savedRecitationPosition, exact: true });
const continueReciting = (page: Page) => savedPosition(page).getByRole("button", { name: labels.continueRecitation, exact: true });
const entryGroup = (page: Page, value: number, total: number) => page.getByRole("group", { name: labels.entryNumber
  .replace("{position}", String(value)).replace("{total}", String(total)), exact: true });
test("Continue survives restart at the second equal occurrence without automatic entry, requests, history or wake", async ({ page }) => {
  await installScreenAwakeAdapter(page);
  const requests = await prepare(page, [
    { kind: "placeholder", text: "  Equal occurrences  " }, { kind: "placeholder", text: "  Equal occurrences  " },
    { kind: "lyric", lyricId: lyricId(99), fallback: "Unavailable reference" },
  ]);
  const before = await personalSnapshot(page);
  await entryGroup(page, 2, 3).getByRole("button", { name: labels.recite, exact: true }).click();
  await position(page, 2, 3);
  expectPositionOnly(before, await personalSnapshot(page), 1, 1);
  await exit(page).click();
  await expect(entryGroup(page, 2, 3).getByRole("button", { name: labels.recite, exact: true })).toBeFocused();
  const remembered = await personalSnapshot(page);
  await page.reload(); await expect(continueReciting(page)).toBeVisible();
  await expect(exit(page)).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(remembered); expect(requests).toHaveLength(0);
  await continueReciting(page).click(); await position(page, 2, 3);
  await expect(page.getByRole("button", { name: labels.keepScreenAwake, exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.reciteWakeTest.requests)).toBe(0);
  expect(await personalSnapshot(page)).toEqual(remembered);
  await next(page).click(); await position(page, 3, 3);
  await expect(body(page).getByText(labels.lyricsUnavailable, { exact: true })).toBeVisible();
  const unresolved = await personalSnapshot(page);
  expectPositionOnly(remembered, unresolved, 2, 1);
  await exit(page).click(); await page.reload();
  await expect(continueReciting(page)).toBeVisible(); expect(await personalSnapshot(page)).toEqual(unresolved);
});
test("Continue resolves current order and replacement contents while own position writes do not invalidate untouched editor drafts", async ({ page }) => {
  await prepare(page, [{ kind: "placeholder", text: "First" }, { kind: "placeholder", text: "Second" }]);
  await start(page).click(); await next(page).click(); await position(page, 2, 2); await exit(page).click();
  await entryGroup(page, 2, 2).getByRole("button", { name: labels.moveUp, exact: true }).click();
  await expect(entryGroup(page, 1, 2).getByRole("button", { name: labels.editEntry, exact: true })).toBeEnabled();
  await continueReciting(page).click(); await position(page, 1, 2);
  await expect(body(page).getByText("Second", { exact: true })).toBeVisible();
  await exit(page).click();
  await entryGroup(page, 1, 2).getByRole("button", { name: labels.editEntry, exact: true }).click();
  await page.getByLabel(labels.placeholderText, { exact: true }).fill("Current replacement");
  await page.getByRole("form", { name: labels.editEntry, exact: true }).getByRole("button", { name: labels.saveEntry, exact: true }).click();
  await expect(page.getByText(labels.listUpdated, { exact: true })).toBeVisible();
  await continueReciting(page).click(); await position(page, 1, 2);
  await expect(body(page).getByText("Current replacement", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("a removed repeated occurrence stays unresolved until explicit entry selection replaces it", async ({ page }) => {
  await prepare(page, [{ kind: "placeholder", text: "Same" }, { kind: "placeholder", text: "Same" }]);
  await entryGroup(page, 2, 2).getByRole("button", { name: labels.recite, exact: true }).click();
  await position(page, 2, 2); await exit(page).click();
  const remembered = (await personalSnapshot(page)).tables.recitationPosition;
  await entryGroup(page, 2, 2).getByRole("button", { name: labels.removeEntry, exact: true }).click();
  await expect(savedPosition(page).getByText(labels.recitationEntryMissing, { exact: true })).toBeVisible();
  expect((await personalSnapshot(page)).tables.recitationPosition).toEqual(remembered);
  await expect(continueReciting(page)).toHaveCount(0); await expect(exit(page)).toHaveCount(0);
  await page.reload();
  await savedPosition(page).getByRole("button", { name, exact: true }).click();
  await entryGroup(page, 1, 1).getByRole("button", { name: labels.recite, exact: true }).click();
  await position(page, 1, 1); await exit(page).click();
  await expect(continueReciting(page)).toBeVisible();
  expect((await personalSnapshot(page)).tables.recitationPosition).not.toEqual(remembered);
});
test("a deleted list retains its missing pair and reciting an empty list never replaces it", async ({ page }) => {
  const requests = await prepare(page, [{ kind: "placeholder", text: "Existing selection" }]);
  await start(page).click(); await position(page, 1, 1); await exit(page).click();
  const remembered = (await personalSnapshot(page)).tables.recitationPosition;
  await page.getByRole("button", { name: labels.deleteList, exact: true }).click();
  await page.getByRole("button", { name: labels.confirmDelete, exact: true }).click();
  await expect(savedPosition(page).getByText(labels.recitationListMissing, { exact: true })).toBeVisible();
  expect((await personalSnapshot(page)).tables.recitationPosition).toEqual(remembered);
  await expect(continueReciting(page)).toHaveCount(0);
  const form = page.getByRole("form", { name: labels.createList, exact: true });
  await form.getByLabel(labels.listName, { exact: true }).fill("Empty recovery list");
  await form.getByRole("button", { name: labels.createList, exact: true }).click();
  await page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name: "Empty recovery list", exact: true }).click();
  const before = await personalSnapshot(page);
  await start(page).click(); await expect(navigation(page).getByRole("heading")).toHaveText(labels.emptyRecitation);
  await exit(page).click(); expect(await personalSnapshot(page)).toEqual(before); expect(requests).toHaveLength(0);
});

declare global { interface Window { recitationPositionTest: { fail: boolean; hold: boolean } } }
test("failed position transactions retain the old cursor and every personal row, with explicit retry", async ({ page }) => {
  await page.addInitScript(() => {
    window.recitationPositionTest = { fail: false, hold: false };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === "recitationPosition" && window.recitationPositionTest.fail) {
        throw new DOMException("Synthetic recitation write failure", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  await prepare(page, [{ kind: "placeholder", text: "First" }, { kind: "placeholder", text: "Second" }]);
  const before = await personalSnapshot(page);
  await page.evaluate(() => { window.recitationPositionTest.fail = true; });
  await start(page).click(); await expect(page.getByRole("alert")).toHaveText(labels.personalFailed);
  await expect(exit(page)).toHaveCount(0); expect(await personalSnapshot(page)).toEqual(before);
  await page.evaluate(() => { window.recitationPositionTest.fail = false; });
  await start(page).click(); await position(page, 1, 2);
  const selected = await personalSnapshot(page);
  await page.evaluate(() => { window.recitationPositionTest.fail = true; });
  await next(page).click(); await expect(navigation(page).getByRole("alert")).toHaveText(labels.personalFailed);
  await position(page, 1, 2); expect(await personalSnapshot(page)).toEqual(selected);
  await page.evaluate(() => { window.recitationPositionTest.fail = false; });
  await navigation(page).getByRole("button", { name: labels.retry, exact: true }).click();
  await position(page, 2, 2); expectPositionOnly(selected, await personalSnapshot(page), 1, 1);
});
test("departure while the real database is locked cancels an uncommitted start and never reopens Recite", async ({ page }) => {
  await prepare(page, [{ kind: "placeholder", text: "Pending explicit choice" }]);
  const before = await personalSnapshot(page);
  await page.evaluate(async name => {
    window.recitationPositionTest = { fail: false, hold: true };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("recitationPosition", "readwrite"), store = transaction.objectStore("recitationPosition");
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => database.close();
    const keep = () => { store.get("recitation").onsuccess = () => { if (window.recitationPositionTest.hold) keep(); }; };
    keep();
  }, config.databaseName);
  try {
    await start(page).click(); await expect(page.getByText(labels.recitationPositionSaving, { exact: true })).toBeVisible();
    await page.evaluate(() => { location.hash = "/settings"; });
    await expect(page.getByRole("heading", { name: labels.settings, exact: true })).toBeVisible();
  } finally { await page.evaluate(() => { window.recitationPositionTest.hold = false; }); }
  expect(await personalSnapshot(page)).toEqual(before);
  await page.getByRole("navigation", { name: labels.appName, exact: true }).getByRole("link", { name: labels.lists, exact: true }).click();
  await expect(exit(page)).toHaveCount(0);
  await expect(savedPosition(page).getByText(labels.noRecitationPosition, { exact: true })).toBeVisible();
});

for (const mode of ["valid", "extra-field", "extra-index"] as const) test(`v7 preserving position upgrade is atomic for ${mode} storage`, async ({ page }) => {
  await page.route("**/resume-seed", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Synthetic seed</title>" }));
  await page.goto("/resume-seed");
  await page.evaluate(async ({ name, id, mode }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 70);
      request.onupgradeneeded = () => {
        for (const name of ["personal", "lists", "control", "recentHistory", "learningLabels"]) {
          const store = request.result.createObjectStore(name, { keyPath: "id" });
          if (mode === "extra-index" && name === "learningLabels") store.createIndex("unexpected", "entries");
        }
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction([...database.objectStoreNames], "readwrite");
      transaction.objectStore("control").put({ id: "state", formatVersion: 7, epoch: crypto.randomUUID(), revision: 31 });
      const lyric = { kind: "lyric", lyricId: id }, legacy = { kind: "legacyVideo", videoId: id };
      transaction.objectStore("personal").put({ id: "personal", language: "en", theme: "warm",
        fontSize: 42, density: "relaxed", favorites: [lyric, legacy] });
      transaction.objectStore("lists").put({ id: crypto.randomUUID(), name: "  Preserve raw list  ", entries: [
        { id: crypto.randomUUID(), ...lyric, fallback: "  Preserve fallback  " }, { id: crypto.randomUUID(), ...lyric },
        { id: crypto.randomUUID(), kind: "placeholder", text: "<b>literal</b>" },
      ] });
      transaction.objectStore("recentHistory").put({ id: "history", enabled: false, entries: [legacy, lyric] });
      transaction.objectStore("learningLabels").put({ id: "learning", entries: [{ ...lyric, label: "practising" }],
        ...(mode === "extra-field" ? { score: 1 } : {}) });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }, { name: config.databaseName, id: lyricId(1), mode });
  const before = await personalSnapshot(page);
  await page.goto("/#/lists");
  if (mode !== "valid") {
    await expect(page.getByRole("alert")).toContainText(labels.personalInvalid);
    expect(await personalSnapshot(page)).toEqual(before);
  } else {
    await expect(savedPosition(page).getByText(labels.noRecitationPosition, { exact: true })).toBeVisible();
    const after = await personalSnapshot(page);
    expect(after.version).toBe(80);
    expect(after.schema).toEqual({ ...before.schema, recitationPosition: { keyPath: "id", autoIncrement: false, indexes: [] } });
    for (const name of ["personal", "lists", "recentHistory", "learningLabels"]) expect(after.tables[name]).toEqual(before.tables[name]);
    expect(after.tables.recitationPosition).toEqual([{ id: "recitation", position: null }]);
    expect(after.tables.control).toEqual([{ ...before.tables.control[0], formatVersion: 8, revision: 0, epoch: after.tables.control[0].epoch }]);
    expect(after.tables.control[0].epoch).not.toBe(before.tables.control[0].epoch);
    await page.reload(); await expect(savedPosition(page)).toBeVisible();
    expect(await personalSnapshot(page)).toEqual(after);
  }
});
