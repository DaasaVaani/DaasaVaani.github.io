import { test, expect, type Page } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, personalSnapshot, serveLyrics } from "../lyric-browser";
import { lyricFixture, lyricId } from "../lyric-fixture";

const labels = messages.en;
const choose = (page: Page) => page.getByRole("button", { name: labels.showAnotherLyric, exact: true });
const heading = (page: Page, index: number) => page.getByRole("heading", {
  name: `ಕನ್ನಡ synthetic ${String(index).padStart(3, "0")}`, exact: true, level: 1,
});
async function disableHistory(page: Page) {
  await page.goto(config.base + "#/settings");
  const recording = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(recording).toBeChecked();
  await recording.click();
  await expect(recording).not.toBeChecked();
}
async function catalog(page: Page, count = 2) {
  await page.getByRole("navigation", { name: labels.appName, exact: true })
    .getByRole("link", { name: labels.ownerLyrics, exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(Math.min(count, config.lyricPreview.pageSize));
}
async function nextChoice(page: Page, value: number) {
  await page.evaluate(value => {
    const original = Math.random;
    Math.random = () => { Math.random = original; return value; };
  }, value);
}

test("choice reaches beyond filtered pages with only the selected item request and retains catalog return context", async ({ page }) => {
  const count = config.lyricPreview.pageSize * 2 + 1, fixture = lyricFixture(count);
  const requests = await serveLyrics(page, fixture);
  await disableHistory(page);
  const before = await personalSnapshot(page);
  await catalog(page, count);
  const query = page.getByRole("searchbox", { name: labels.lyricTitleFilter, exact: true });
  await query.fill("synthetic 001");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(requests).toHaveLength(2);
  await nextChoice(page, 1 - Number.EPSILON);
  await choose(page).click();
  await expect(heading(page, count)).toBeVisible();
  const summary = fixture.manifest.catalog.at(-1);
  const bytes = summary && fixture.files.get(summary.item.path);
  if (!summary || !bytes) throw new Error("Missing synthetic selected object");
  const item = JSON.parse(gunzipSync(bytes).toString("utf8"));
  const expected = item.lines.map((line: { kind: string; lineId?: string; text: string }) =>
    [line.lineId ?? "", line.text, line.kind === "layout"]);
  expect(await page.locator("div[lang=kn] > p").evaluateAll(elements =>
    elements.map(element => [element.id, element.textContent, element.hasAttribute("data-layout")]))).toEqual(expected);
  expect(requests).toEqual(["latest.json", fixture.descriptor.manifest.path, summary.item.path]);
  expect(await personalSnapshot(page)).toEqual(before);
  await page.getByRole("link", { name: "← " + labels.lyricBack, exact: true }).click();
  await expect(query).toHaveValue("synthetic 001");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(choose(page)).toBeFocused();
  expect(await personalSnapshot(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("consecutive reader choices replace the reader and record only normal successful opens without replay", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto(config.base + "#/recent");
  await expect(page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true })).toBeChecked();
  const before = await personalSnapshot(page), control = before.tables.control[0];
  if (!control || typeof control !== "object" || !("revision" in control) || typeof control.revision !== "number") {
    throw new Error("Missing native personal revision");
  }
  await catalog(page);
  expect(await personalSnapshot(page)).toEqual(before);
  await nextChoice(page, 0);
  await choose(page).click();
  await expect(heading(page, 1)).toBeVisible();
  await choose(page).click();
  await expect(heading(page, 2)).toBeVisible();
  const entries = [2, 1].map(index => ({ kind: "lyric", lyricId: lyricId(index) }));
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory)
    .toEqual([{ id: "history", enabled: true, entries }]);
  const after = await personalSnapshot(page);
  expect(after.tables.personal).toEqual(before.tables.personal);
  expect(after.tables.lists).toEqual(before.tables.lists);
  expect(after.tables.control).toEqual([{ ...control, revision: control.revision + 2 }]);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await personalSnapshot(page)).toEqual(after);
  await page.getByRole("link", { name: "← " + labels.lyricBack, exact: true }).click();
  await expect(choose(page)).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect(new URL(page.url()).hash).toBe("#/lyrics");
  await choose(page).click();
  await expect(heading(page, 1)).toBeVisible();
  expect(requests).toHaveLength(4);
  await page.goBack();
  await expect(page.getByRole("searchbox", { name: labels.lyricTitleFilter, exact: true })).toBeVisible();
});

test("sole-current discovery is explicitly unavailable in Kannada without rereading or personal writes", async ({ page }) => {
  const requests = await serveLyrics(page, lyricFixture(1)), kn = messages.kn;
  await disableHistory(page);
  await page.getByRole("button", { name: kn.languageName, exact: true }).click();
  await expect(page).toHaveTitle(kn.appName);
  const before = await personalSnapshot(page);
  await page.getByRole("navigation", { name: kn.appName, exact: true })
    .getByRole("link", { name: kn.ownerLyrics, exact: true }).click();
  const action = page.getByRole("button", { name: kn.showAnotherLyric, exact: true });
  await expect(action).toBeEnabled();
  await action.click();
  await expect(heading(page, 1)).toBeVisible();
  await expect(action).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: kn.noAnotherLyric })).toHaveText(kn.noAnotherLyric);
  await page.getByRole("link", { name: "← " + kn.lyricBack, exact: true }).click();
  await expect(action).toBeDisabled();
  await expect(page.getByText(kn.noAnotherLyric, { exact: true })).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(await personalSnapshot(page)).toEqual(before);
});

test("discovered readers retain exact favorite/list controls and the original Favorites return destination", async ({ page }) => {
  await serveLyrics(page);
  await disableHistory(page);
  await page.getByRole("link", { name: labels.lists, exact: true }).click();
  const create = page.getByRole("form", { name: labels.createList, exact: true });
  await create.getByLabel(labels.listName, { exact: true }).fill("Synthetic discovery collection");
  await create.getByRole("button", { name: labels.createList, exact: true }).click();
  await expect(page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button")).toHaveCount(1);
  const list = (await personalSnapshot(page)).tables.lists[0];
  if (!list || typeof list !== "object" || !("id" in list) || typeof list.id !== "string") {
    throw new Error("Missing synthetic list identity");
  }
  await catalog(page);
  await page.getByRole("article").first().getByRole("link", { name: labels.open, exact: true }).click();
  await expect(heading(page, 1)).toBeVisible();
  await page.getByRole("button", { name: labels.addFavorite, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.removeFavorite, exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: labels.appName, exact: true })
    .getByRole("link", { name: labels.favorites, exact: true }).click();
  const region = page.getByRole("region", { name: labels.ownerLyrics, exact: true });
  const origin = region.locator(`a[href$="/lyrics/${lyricId(1)}"]`);
  await origin.click();
  await expect(heading(page, 1)).toBeVisible();
  const before = await personalSnapshot(page);
  await choose(page).click();
  await expect(heading(page, 2)).toBeVisible();
  expect(await personalSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: labels.addFavorite, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.removeFavorite, exact: true })).toBeVisible();
  const add = page.getByRole("region", { name: labels.addToList, exact: true });
  await add.getByLabel(labels.chooseList, { exact: true }).selectOption(list.id);
  await add.getByRole("button", { name: labels.addOccurrence, exact: true }).click();
  await expect(add.getByRole("status")).toHaveText(labels.occurrenceAdded);
  await expect.poll(async () => (await personalSnapshot(page)).tables.lists).toMatchObject([
    { id: list.id, entries: [{ kind: "lyric", lyricId: lyricId(2) }] },
  ]);
  await page.getByRole("link", { name: "← " + labels.favorites, exact: true }).click();
  await expect(origin).toBeFocused();
});

test("selection faults and a damaged chosen item are explicit and retry without replacement or personal mutation", async ({ page }) => {
  let corrupt = true;
  const requests = await serveLyrics(page, lyricFixture(), () => corrupt);
  await disableHistory(page);
  await catalog(page);
  const before = await personalSnapshot(page);
  await nextChoice(page, 1);
  await choose(page).click();
  await expect(page.getByRole("alert")).toContainText("Invalid lyric choice random value");
  expect(requests).toHaveLength(2);
  expect(await personalSnapshot(page)).toEqual(before);
  await nextChoice(page, 0);
  await choose(page).click();
  await expect(page.getByRole("alert")).toContainText(labels.error);
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(before);
  corrupt = false;
  await page.getByRole("button", { name: labels.retry, exact: true }).click();
  await expect(heading(page, 1)).toBeVisible();
  expect(requests).toHaveLength(4);
  await choose(page).click();
  await expect(heading(page, 2)).toBeVisible();
  expect(requests).toHaveLength(5);
  expect(await personalSnapshot(page)).toEqual(before);
});
