import { test, expect, type Page } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, personalSnapshot, readingDefaults, serveLyrics } from "../lyric-browser";
import { lyricId } from "../lyric-fixture";

const labels = messages.en;
const controls = (page: Page) => page.getByRole("group", { name: labels.readingPreferences, exact: true });
const density = (page: Page) => controls(page).getByRole("combobox", { name: labels.readingDensity, exact: true });
const increase = (page: Page) => controls(page).getByRole("button", { name: labels.increaseLyricFontSize, exact: true });
const decrease = (page: Page) => controls(page).getByRole("button", { name: labels.decreaseLyricFontSize, exact: true });
const body = (page: Page) => page.locator('div[lang="kn"]');
async function font(page: Page, size: number, mode: keyof typeof config.readerLineHeights) {
  await expect(body(page)).toHaveCSS("font-size", `${size}px`);
  await expect.poll(() => body(page).evaluate(element => Number.parseFloat(getComputedStyle(element).lineHeight)))
    .toBeCloseTo(size * config.readerLineHeights[mode], 2);
}
async function layout(page: Page) {
  return body(page).locator("p").evaluateAll(elements => elements.map(element =>
    ({ id: element.id, text: element.textContent, layout: element.hasAttribute("data-layout"), html: element.innerHTML })));
}

test("default display, repeated density and reload do not fabricate a preference row or revision", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(density(page)).toHaveValue(readingDefaults.density);
  const before = await personalSnapshot(page);
  expect(before.version).toBe(80); expect(before.tables.personal).toEqual([]);
  await density(page).selectOption(readingDefaults.density);
  await expect(density(page)).toBeEnabled();
  expect(await personalSnapshot(page)).toEqual(before);
  await page.reload(); await expect(density(page)).toHaveValue(readingDefaults.density);
  expect(await personalSnapshot(page)).toEqual(before);
});

test("canonical reading uses actual bounded font steps and all densities without changing text, layout, UI or network", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto(`/#/lyrics/${lyricId(1)}`);
  await expect(body(page).locator("p")).toHaveCount(4);
  await expect(controls(page)).toBeVisible();
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled: true, entries: [{ kind: "lyric", lyricId: lyricId(1) }] }]);
  await font(page, config.readerFontSize, readingDefaults.density);
  const original = await layout(page);
  const titleFont = await page.getByRole("heading", { level: 1 }).evaluate(element => getComputedStyle(element).fontSize);
  const before = await personalSnapshot(page);
  let changes = 0;
  for (let size = config.readerFontSize; size < config.readerFontSizeMax;) {
    if (size === config.readerFontSize) { await increase(page).focus(); await increase(page).press("Enter"); }
    else await increase(page).click();
    size = Math.min(config.readerFontSizeMax, size + config.readerFontSizeStep);
    await font(page, size, readingDefaults.density); changes++;
    await expect(size === config.readerFontSizeMax ? decrease(page) : increase(page)).toBeFocused();
  }
  await expect(increase(page)).toBeDisabled();
  for (const mode of ["compact", "normal", "relaxed"] as const) {
    await density(page).selectOption(mode); await font(page, config.readerFontSizeMax, mode); changes++;
    expect(await layout(page)).toEqual(original);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (let size = config.readerFontSizeMax; size > config.readerFontSizeMin;) {
    await decrease(page).click(); size = Math.max(config.readerFontSizeMin, size - config.readerFontSizeStep);
    await font(page, size, "relaxed"); changes++;
    await expect(size === config.readerFontSizeMin ? increase(page) : decrease(page)).toBeFocused();
  }
  await expect(decrease(page)).toBeDisabled();
  expect(await layout(page)).toEqual(original);
  expect(await page.getByRole("heading", { level: 1 }).evaluate(element => getComputedStyle(element).fontSize)).toBe(titleFont);
  const after = await personalSnapshot(page);
  expect(after.tables.lists).toEqual(before.tables.lists);
  expect(after.tables.recentHistory).toEqual(before.tables.recentHistory);
  expect(after.tables.personal).toMatchObject([{ fontSize: config.readerFontSizeMin, density: "relaxed" }]);
  expect(after.tables.control[0].revision).toBe(before.tables.control[0].revision + changes);
  expect(requests).toHaveLength(3);
  await page.reload(); await font(page, config.readerFontSizeMin, "relaxed");
  expect(await layout(page)).toEqual(original);
  expect(await personalSnapshot(page)).toEqual(after);
  expect(requests).toHaveLength(6);
});

test("peer preferences apply to a mounted fixture reader without rerecording peer-cleared history or overwriting other settings", async ({ page, context }) => {
  await page.goto("/#/item/fixture-one");
  await expect(body(page).getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled: true, entries: [{ kind: "legacyVideo", videoId: "fixture-one" }] }]);
  const original = await layout(page), peer = await context.newPage();
  try {
    await peer.goto("/#/settings");
    await peer.getByRole("button", { name: labels.clearRecentHistory, exact: true }).click();
    await expect(peer.getByRole("button", { name: labels.clearRecentHistory, exact: true })).toBeDisabled();
    await density(peer).selectOption("compact"); await expect(density(page)).toHaveValue("compact");
    await peer.getByRole("button", { name: labels.warm, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
    const before = await personalSnapshot(page);
    await increase(page).click();
    await font(page, config.readerFontSize + config.readerFontSizeStep, "compact");
    await expect.poll(async () => (await personalSnapshot(page)).tables.control[0].revision)
      .toBe(before.tables.control[0].revision + 1);
    const after = await personalSnapshot(page);
    expect(after.tables.recentHistory).toEqual(before.tables.recentHistory);
    expect(after.tables.recentHistory).toEqual([{ id: "history", enabled: true, entries: [] }]);
    expect(after.tables.personal).toMatchObject([{ theme: "warm", language: "en", density: "compact",
      fontSize: config.readerFontSize + config.readerFontSizeStep }]);
    expect(after.tables.lists).toEqual(before.tables.lists); expect(await layout(page)).toEqual(original);
    await expect(controls(peer).getByText(`${config.readerFontSize + config.readerFontSizeStep} px`, { exact: true })).toBeVisible();
    await peer.getByRole("button", { name: messages.kn.languageName, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "kn");
    await expect(page.getByRole("group", { name: messages.kn.readingPreferences, exact: true })).toBeVisible();
    await font(page, config.readerFontSize + config.readerFontSizeStep, "compact");
    expect(await layout(page)).toEqual(original);
  } finally { await peer.close(); }
});

for (const mode of ["valid", "invalid-row", "invalid-schema"] as const) {
  test(`v5 upgrade ${mode} preserves every typed value and history or rolls native schema and all rows back`, async ({ page }) => {
    await page.route("**/reading-seed", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Reading migration fixture</title>" }));
    await page.goto("/reading-seed");
    await page.evaluate(async ({ name, id, mode }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 50);
        request.onupgradeneeded = () => {
          for (const name of ["personal", "lists", "control", "recentHistory"]) {
            const store = request.result.createObjectStore(name, { keyPath: "id" });
            if (mode === "invalid-schema" && name === "recentHistory") store.createIndex("unexpected", "enabled");
          }
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction(["personal", "lists", "control", "recentHistory"], "readwrite");
          const references = [{ kind: "lyric", lyricId: id }, { kind: "legacyVideo", videoId: id }];
          tx.objectStore("control").put({ id: "state", formatVersion: 5, epoch: id, revision: 23 });
          tx.objectStore("personal").put({ id: "personal", language: "kn", theme: "warm", favorites: references,
            ...(mode === "invalid-row" ? { fontSize: 28 } : {}) });
          tx.objectStore("recentHistory").put({ id: "history", enabled: false, entries: [...references].reverse() });
          tx.objectStore("lists").put({ id: "00000000-0000-4000-8000-000000000003", name: "  Raw synthetic  ", entries: [
            { id: "00000000-0000-4000-8000-000000000004", kind: "lyric", lyricId: id, fallback: "  Raw fallback  " },
            { id: "00000000-0000-4000-8000-000000000005", kind: "placeholder", text: "<b>Keep literal</b>" },
            { id: "00000000-0000-4000-8000-000000000006", kind: "lyric", lyricId: id },
          ] });
          tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
        });
      } finally { database.close(); }
    }, { name: config.databaseName, id: lyricId(1), mode });
    const before = await personalSnapshot(page);
    await page.goto("/#/settings");
    if (mode !== "valid") {
      await expect(page.getByRole("alert")).toContainText("Invalid personal database record");
      expect(await personalSnapshot(page)).toEqual(before);
    } else {
      await expect(page.getByRole("combobox", { name: messages.kn.readingDensity, exact: true })).toHaveValue(readingDefaults.density);
      const after = await personalSnapshot(page);
      expect(after.version).toBe(80);
      expect(after.schema).toEqual({ ...before.schema, learningLabels: { keyPath: "id", autoIncrement: false, indexes: [] },
        recitationPosition: { keyPath: "id", autoIncrement: false, indexes: [] } });
      expect(after.tables.recitationPosition).toEqual([{ id: "recitation", position: null }]);
      expect(after.tables.learningLabels).toEqual([{ id: "learning", entries: [] }]);
      expect(after.tables.personal).toEqual([{ id: "personal", language: "kn", theme: "warm", ...readingDefaults,
        favorites: [{ kind: "lyric", lyricId: lyricId(1) }, { kind: "legacyVideo", videoId: lyricId(1) }] }]);
      expect(after.tables.lists).toEqual(before.tables.lists);
      expect(after.tables.recentHistory).toEqual(before.tables.recentHistory);
      expect(after.tables.control).toMatchObject([{ id: "state", formatVersion: 8, revision: 0 }]);
      expect(after.tables.control[0].epoch).not.toBe(before.tables.control[0].epoch);
      await page.reload();
      await expect(page.getByRole("combobox", { name: messages.kn.readingDensity, exact: true })).toHaveValue(readingDefaults.density);
      expect(await personalSnapshot(page)).toEqual(after);
    }
  });
}
