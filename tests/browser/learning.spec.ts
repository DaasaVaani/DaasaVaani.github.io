import { test, expect, type Page, type Locator } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, maxFavorites, maxLearningLabels, personalSnapshot, readingDefaults, serveLyrics } from "../lyric-browser";
import { lyricFixture, lyricId } from "../lyric-fixture";
import type { LearningLabel, LearningLabelsV1 } from "../../shared/types/personal";

const labels = messages.en;
const region = (page: Page) => page.getByRole("region", { name: labels.learning, exact: true });
const assignment = (scope: Page | Locator) => scope.getByRole("combobox", { name: labels.learningLabel, exact: true });
const filter = (page: Page) => region(page).getByRole("combobox", { name: labels.learningFilter, exact: true });
const nav = (page: Page, name: string) => page.getByRole("navigation", { name: labels.appName, exact: true })
  .getByRole("link", { name, exact: true });
async function setLabel(scope: Page | Locator, value: LearningLabel | "") {
  await assignment(scope).selectOption(value);
  await expect(scope.getByRole("status").filter({ hasText: labels.learningSaved })).toBeVisible();
  await expect(assignment(scope)).toBeEnabled();
  await expect(assignment(scope)).toHaveValue(value);
}
async function seed(page: Page, entries: LearningLabelsV1["entries"]) {
  await page.evaluate(async ({ name, entries }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("learningLabels", "readwrite");
        tx.objectStore("learningLabels").put({ id: "learning", entries });
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { name: config.databaseName, entries });
  await page.reload();
  await expect(region(page)).toBeVisible();
}

test("reader assignments persist all states, peer updates and exact literal layout without replaying history", async ({ page, context }) => {
  const requests = await serveLyrics(page);
  await page.goto(`/#/lyrics/${lyricId(1)}`);
  await expect(assignment(page)).toHaveValue("");
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0]?.entries)
    .toEqual([{ kind: "lyric", lyricId: lyricId(1) }]);
  const before = await personalSnapshot(page);
  const layout = () => page.locator("div[lang=kn] > p").evaluateAll(elements =>
    elements.map(element => [element.id, element.textContent, element.hasAttribute("data-layout")]));
  const original = await layout();
  await assignment(page).selectOption("");
  expect(await personalSnapshot(page)).toEqual(before);
  for (const value of ["wantToLearn", "practising", "comfortableReciting"] as const) await setLabel(page, value);
  const labelled = await personalSnapshot(page);
  expect(labelled.tables.learningLabels).toEqual([{ id: "learning",
    entries: [{ kind: "lyric", lyricId: lyricId(1), label: "comfortableReciting" }] }]);
  expect(labelled.tables.personal).toEqual(before.tables.personal);
  expect(labelled.tables.lists).toEqual(before.tables.lists);
  expect(labelled.tables.recentHistory).toEqual(before.tables.recentHistory);
  expect(labelled.tables.control[0].revision).toBe(before.tables.control[0].revision + 3);
  expect(await layout()).toEqual(original); expect(requests).toHaveLength(3);
  const peer = await context.newPage();
  try {
    await peer.goto("/#/learning");
    const card = region(peer).getByRole("article");
    await expect(card).toHaveCount(1);
    await setLabel(card, "wantToLearn");
    await expect(assignment(page)).toHaveValue("wantToLearn");
    await peer.goto("/#/settings");
    await peer.getByRole("button", { name: labels.clearRecentHistory, exact: true }).click();
    await expect(peer.getByRole("button", { name: labels.clearRecentHistory, exact: true })).toBeDisabled();
    await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
      .toEqual([{ id: "history", enabled: true, entries: [] }]);
    const cleared = await personalSnapshot(page);
    await setLabel(page, "practising");
    expect((await personalSnapshot(page)).tables.recentHistory).toEqual(cleared.tables.recentHistory);
    expect(await layout()).toEqual(original); expect(requests).toHaveLength(3);
  } finally { await peer.close(); }
  await page.reload(); await expect(assignment(page)).toHaveValue("practising");
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0]?.entries)
    .toEqual([{ kind: "lyric", lyricId: lyricId(1) }]);
  await setLabel(page, "");
  expect((await personalSnapshot(page)).tables.learningLabels).toEqual([{ id: "learning", entries: [] }]);
});

test("Learning manages unresolved and UUID-looking legacy references before preparation with no catalog requests", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto("/#/learning"); await expect(region(page)).toBeVisible();
  await expect(region(page).getByText(labels.emptyLearning, { exact: true })).toBeVisible();
  const entries: LearningLabelsV1["entries"] = [
    { kind: "legacyVideo", videoId: lyricId(1), label: "wantToLearn" },
    { kind: "lyric", lyricId: lyricId(1), label: "practising" },
    { kind: "lyric", lyricId: lyricId(999), label: "comfortableReciting" },
  ];
  await seed(page, entries);
  const cards = region(page).getByRole("article"), before = await personalSnapshot(page);
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).getByRole("link")).toHaveCount(0);
  await expect(cards.nth(1).getByRole("link", { name: labels.open, exact: true })).toHaveAttribute("href", `#/lyrics/${lyricId(1)}`);
  for (const value of ["wantToLearn", "practising", "comfortableReciting"]) {
    await filter(page).selectOption(value); await expect(cards).toHaveCount(1);
  }
  expect(await personalSnapshot(page)).toEqual(before);
  await filter(page).selectOption("");
  await setLabel(cards.first(), "practising");
  expect((await personalSnapshot(page)).tables.learningLabels[0].entries)
    .toEqual([{ ...entries[0], label: "practising" }, ...entries.slice(1)]);
  await filter(page).selectOption("wantToLearn");
  await expect(region(page).getByText(labels.noResults, { exact: true })).toBeVisible();
  await filter(page).selectOption("practising");
  await assignment(cards.first()).focus();
  await assignment(cards.first()).selectOption("");
  await expect(cards).toHaveCount(1);
  await expect(region(page).getByRole("heading", { level: 1 })).toBeFocused();
  expect((await personalSnapshot(page)).tables.learningLabels[0].entries).toEqual(entries.slice(1));
  await expect(region(page).getByText(labels.learningPracticeUnavailable, { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test("complete Learning paging and filter retain true reader origin through Back Forward and repeated discovery", async ({ page }) => {
  const count = config.lyricPreview.pageSize * 2 + 1, requests = await serveLyrics(page, lyricFixture(count));
  await page.goto("/#/learning"); await expect(region(page)).toBeVisible();
  await seed(page, Array.from({ length: count }, (_, index) => ({
    kind: "lyric", lyricId: lyricId(index + 1), label: "wantToLearn",
  })));
  await filter(page).selectOption("wantToLearn");
  const cards = region(page).getByRole("article"), more = region(page).getByRole("button", { name: labels.showMoreResults, exact: true });
  await expect(cards).toHaveCount(config.lyricPreview.pageSize);
  for (const nextCount of [config.lyricPreview.pageSize * 2, count]) {
    const firstNew = await cards.count();
    await more.focus(); await more.press("Enter");
    await expect(cards).toHaveCount(nextCount);
    await expect(cards.nth(firstNew).getByRole("link", { name: labels.open, exact: true })).toBeFocused();
  }
  const read = cards.last().getByRole("link", { name: labels.open, exact: true });
  await read.click();
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  await page.goBack(); await expect(filter(page)).toHaveValue("wantToLearn");
  await expect(cards).toHaveCount(count); await expect(read).toBeFocused();
  await page.goForward(); await expect(assignment(page)).toHaveValue("wantToLearn");
  for (let index = 0; index < 2; index++) {
    await page.evaluate(() => {
      const original = Math.random; Math.random = () => { Math.random = original; return 0; };
    });
    await page.getByRole("button", { name: labels.showAnotherLyric, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/lyrics/${lyricId(index + 1)}$`));
    await expect(assignment(page)).toHaveValue("wantToLearn");
  }
  await page.getByRole("link", { name: "← " + labels.learning, exact: true }).click();
  await expect(filter(page)).toHaveValue("wantToLearn"); await expect(cards).toHaveCount(count);
  await expect(read).toBeFocused(); expect(requests).toHaveLength(5);
  const before = await personalSnapshot(page);
  await filter(page).selectOption("comfortableReciting"); await expect(cards).toHaveCount(0);
  await filter(page).selectOption(""); await expect(cards).toHaveCount(config.lyricPreview.pageSize);
  expect(await personalSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("fixture reader assignment stays independent and Learning resolves its exact return destination", async ({ page }) => {
  await page.goto("/#/item/fixture-one"); await expect(assignment(page)).toHaveValue("");
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0]?.entries)
    .toEqual([{ kind: "legacyVideo", videoId: "fixture-one" }]);
  await setLabel(page, "comfortableReciting");
  await nav(page, labels.learning).click();
  const card = region(page).getByRole("article");
  await expect(card.locator("code")).toHaveText("fixture-one");
  await card.getByRole("link", { name: labels.open, exact: true }).click();
  await expect(assignment(page)).toHaveValue("comfortableReciting");
  await page.getByRole("link", { name: "← " + labels.learning, exact: true }).click();
  await expect(card.getByRole("link")).toBeFocused();
  await filter(page).selectOption("comfortableReciting");
  await assignment(card).selectOption("wantToLearn");
  await expect(card).toHaveCount(0);
  await expect(region(page).getByRole("heading", { level: 1 })).toBeFocused();
  expect((await personalSnapshot(page)).tables.learningLabels[0].entries)
    .toEqual([{ kind: "legacyVideo", videoId: "fixture-one", label: "wantToLearn" }]);
});

test("actual IndexedDB quota failure preserves the entire personal snapshot and exposes no fabricated success", async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === "learningLabels" && value && typeof value === "object" &&
          "entries" in value && Array.isArray(value.entries) && value.entries.length) {
        throw new DOMException("Synthetic learning quota failure", "QuotaExceededError");
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await page.goto("/#/item/fixture-one"); await expect(assignment(page)).toBeEnabled();
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0]?.entries.length).toBe(1);
  const before = await personalSnapshot(page);
  await assignment(page).selectOption("wantToLearn");
  await expect(page.getByRole("alert")).toContainText("Synthetic learning quota failure");
  await expect(page.getByText(labels.learningSaved, { exact: true })).toHaveCount(0);
  await expect(assignment(page)).toHaveValue("");
  await expect(assignment(page)).toBeFocused();
  expect(await personalSnapshot(page)).toEqual(before);
});

test("configured label capacity refuses only new assignments without trimming existing unresolved entries", async ({ page }) => {
  await page.goto("/#/learning"); await expect(region(page)).toBeVisible();
  const entries: LearningLabelsV1["entries"] = Array.from({ length: maxLearningLabels }, (_, index) =>
    ({ kind: "legacyVideo", videoId: `synthetic-${index}`, label: "wantToLearn" }));
  await seed(page, entries);
  await expect(region(page).getByRole("article")).toHaveCount(config.lyricPreview.pageSize);
  await page.goto("/#/item/fixture-one"); await expect(assignment(page)).toBeEnabled();
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0]?.entries.length).toBe(1);
  const before = await personalSnapshot(page);
  await assignment(page).selectOption("wantToLearn");
  await expect(page.getByRole("alert")).toContainText("Personal storage or collection limit reached");
  expect(await personalSnapshot(page)).toEqual(before);
  await expect(assignment(page)).toHaveValue("");
});

test("captured learning fence rejects a transaction-observed revision change and rolls every write back", async ({ page }) => {
  await page.addInitScript(() => {
    let control: Record<string, unknown> | undefined;
    window.addEventListener("synthetic-learning-fence", event => {
      if (!(event instanceof CustomEvent)) throw new Error("Missing synthetic fence event");
      const value: unknown = event.detail;
      if (!value || typeof value !== "object" || !("revision" in value) || typeof value.revision !== "number") {
        throw new Error("Invalid synthetic control");
      }
      control = { ...value, revision: value.revision + 1 };
    });
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores: string | Iterable<string>, mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
      const tx = original.call(this, stores, mode, options);
      if (control && mode === "readwrite" && tx.objectStoreNames.contains("learningLabels")) {
        tx.objectStore("control").put(control);
        control = undefined;
      }
      return tx;
    };
  });
  await page.goto("/#/item/fixture-one"); await expect(assignment(page)).toBeEnabled();
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0]?.entries.length).toBe(1);
  const before = await personalSnapshot(page);
  await page.evaluate(control => window.dispatchEvent(new CustomEvent("synthetic-learning-fence", { detail: control })), before.tables.control[0]);
  await assignment(page).selectOption("wantToLearn");
  await expect(page.getByRole("alert")).toContainText("Personal data changed; review it and try again.");
  await expect(assignment(page)).toHaveValue("");
  await expect(page.getByText(labels.learningSaved, { exact: true })).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(before);
  await setLabel(page, "wantToLearn");
});

test("controlled interface reload manages local labels offline without pretending canonical content is ready", async ({ page, context }) => {
  const requests = await serveLyrics(page);
  await page.goto("/#/learning"); await expect(region(page)).toBeVisible();
  await seed(page, [{ kind: "lyric", lyricId: lyricId(1), label: "wantToLearn" }]);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(region(page).getByRole("article")).toHaveCount(1);
  await context.setOffline(true);
  await page.reload();
  const card = region(page).getByRole("article");
  await expect(card.getByText(labels.referencePending, { exact: true })).toBeVisible();
  await setLabel(card, "comfortableReciting");
  await page.reload(); await expect(assignment(card)).toHaveValue("comfortableReciting");
  await assignment(card).selectOption("");
  await expect(region(page).getByText(labels.emptyLearning, { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  expect((await personalSnapshot(page)).tables.learningLabels).toEqual([{ id: "learning", entries: [] }]);
  await context.setOffline(false);
});

for (const mode of ["valid", "invalid-row", "invalid-schema", "over-capacity"] as const) {
  test(`real native60 upgrade ${mode} preserves every old value or rolls back the schema and rows`, async ({ page }) => {
    await page.route("**/learning-seed", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Learning migration fixture</title>" }));
    await page.goto("/learning-seed");
    await page.evaluate(async ({ name, id, readingDefaults, mode, maxFavorites }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 60);
        request.onupgradeneeded = () => {
          for (const store of ["personal", "lists", "control", "recentHistory"]) request.result.createObjectStore(store, { keyPath: "id" });
          if (mode === "invalid-schema") request.transaction!.objectStore("lists").createIndex("unexpected", "name");
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([...db.objectStoreNames], "readwrite"), references = [
            { kind: "lyric", lyricId: id }, { kind: "legacyVideo", videoId: id },
          ];
          tx.objectStore("control").put({ id: "state", formatVersion: 6, epoch: id, revision: 37 });
          tx.objectStore("personal").put({ id: "personal", language: "en", theme: "warm", ...readingDefaults,
            fontSize: 34, density: mode === "invalid-row" ? "invalid" : "compact",
            favorites: mode === "over-capacity" ? Array.from({ length: maxFavorites + 1 }, (_, index) =>
              ({ kind: "legacyVideo", videoId: `synthetic-${index}` })) : references });
          tx.objectStore("recentHistory").put({ id: "history", enabled: false, entries: [...references].reverse() });
          tx.objectStore("lists").put({ id: "00000000-0000-4000-8000-000000000003", name: "  Raw synthetic  ", entries: [
            { id: "00000000-0000-4000-8000-000000000004", kind: "lyric", lyricId: id, fallback: "  Keep fallback  " },
            { id: "00000000-0000-4000-8000-000000000005", kind: "placeholder",
              text: "<b>Keep literal</b>" },
            { id: "00000000-0000-4000-8000-000000000006", kind: "lyric", lyricId: id },
          ] });
          tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    }, { name: config.databaseName, id: lyricId(1), readingDefaults, mode, maxFavorites });
    const before = await personalSnapshot(page);
    await page.goto("/#/learning");
    if (mode !== "valid") {
      await expect(page.getByRole("alert")).toContainText(mode === "over-capacity" ? "Personal storage or collection limit reached" : "Invalid personal database record");
      expect(await personalSnapshot(page)).toEqual(before);
    } else {
      await expect(region(page).getByText(labels.emptyLearning, { exact: true })).toBeVisible();
      const after = await personalSnapshot(page);
      expect(after.version).toBe(80);
      expect(after.schema).toEqual({ ...before.schema, learningLabels: { keyPath: "id", autoIncrement: false, indexes: [] },
        recitationPosition: { keyPath: "id", autoIncrement: false, indexes: [] } });
      expect(after.tables.recitationPosition).toEqual([{ id: "recitation", position: null }]);
      for (const name of ["personal", "lists", "recentHistory"]) expect(after.tables[name]).toEqual(before.tables[name]);
      expect(after.tables.learningLabels).toEqual([{ id: "learning", entries: [] }]);
      expect(after.tables.control).toEqual([{ ...before.tables.control[0], formatVersion: 8,
        epoch: after.tables.control[0].epoch, revision: 0 }]);
      expect(after.tables.control[0].epoch).not.toBe(before.tables.control[0].epoch);
      await page.reload(); await expect(region(page)).toBeVisible();
      expect(await personalSnapshot(page)).toEqual(after);
    }
  });
}
