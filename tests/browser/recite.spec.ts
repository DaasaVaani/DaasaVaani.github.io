import { test, expect, type Page } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, personalSnapshot, serveLyrics } from "../lyric-browser";
import { lyricId } from "../lyric-fixture";
import { installScreenAwakeAdapter as adapter } from "../screen-awake";

const labels = messages.en;
const recite = (page: Page) => page.getByRole("button", { name: labels.recite, exact: true });
const exit = (page: Page) => page.getByRole("button", { name: labels.exitRecite, exact: true });
const awake = (page: Page) => page.getByRole("button", { name: labels.keepScreenAwake, exact: true });
const navigation = (page: Page) => page.getByRole("navigation", { name: labels.appName, exact: true });
const layout = (page: Page) => page.locator("div[lang=kn] > p").evaluateAll(elements =>
  elements.map(element => [element.id, element.textContent, element.hasAttribute("data-layout"), element.innerHTML]));
async function prepare(page: Page, fixture = false) {
  const requests = await serveLyrics(page);
  await page.goto("/#/settings");
  const history = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(history).toBeChecked(); await history.click(); await expect(history).not.toBeChecked();
  await page.goto(fixture ? "/#/item/fixture-one" : `/#/lyrics/${lyricId(1)}`);
  await expect(recite(page)).toBeVisible();
  return requests;
}
test("focused canonical Recite preserves literal layout preferences personal state and online/offline reading", async ({ page, context }) => {
  const requests = await prepare(page), before = await personalSnapshot(page), original = await layout(page);
  const font = await page.locator("div[lang=kn]").evaluate(element => [getComputedStyle(element).fontSize, getComputedStyle(element).lineHeight]);
  await recite(page).focus(); await recite(page).press("Enter");
  await expect(exit(page)).toBeFocused(); await expect(navigation(page)).toBeHidden();
  await expect(page.getByRole("group", { name: labels.readingPreferences, exact: true })).toBeHidden();
  await expect(page.getByRole("combobox", { name: labels.learningLabel, exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: labels.addFavorite, exact: true })).toBeHidden();
  await expect(page.getByText(labels.reciteNotice, { exact: true })).toBeVisible();
  expect(await layout(page)).toEqual(original);
  expect(await page.locator("div[lang=kn]").evaluate(element => [getComputedStyle(element).fontSize, getComputedStyle(element).lineHeight])).toEqual(font);
  const restore = page.getByRole("button", { name: labels.showReadingControls, exact: true });
  await restore.click(); await expect(navigation(page)).toBeVisible();
  await expect(page.getByRole("group", { name: labels.readingPreferences, exact: true })).toBeVisible();
  await page.getByRole("button", { name: labels.hideReadingControls, exact: true }).click();
  await expect(navigation(page)).toBeHidden();
  await context.setOffline(true);
  await exit(page).press("Escape");
  await expect(recite(page)).toBeFocused(); await expect(navigation(page)).toBeVisible();
  await recite(page).click(); await exit(page).click();
  expect(await layout(page)).toEqual(original);
  expect(await personalSnapshot(page)).toEqual(before); expect(requests).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(false);
});
test("fixture Recite shares controls and preserves literal selected lines without fabricating personal state", async ({ page }) => {
  await prepare(page, true); const original = await layout(page), before = await personalSnapshot(page);
  await recite(page).click(); await expect(navigation(page)).toBeHidden();
  expect(await layout(page)).toEqual(original);
  await exit(page).click(); await expect(navigation(page)).toBeVisible();
  expect(await personalSnapshot(page)).toEqual(before);
});
test("unsupported screen awake retains functional Kannada Recite and explicit exit without requesting support", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined }); });
  await prepare(page);
  await navigation(page).getByRole("link", { name: labels.settings, exact: true }).click();
  await page.getByRole("button", { name: messages.kn.languageName, exact: true }).click();
  await page.goBack(); await expect(page.getByRole("button", { name: messages.kn.recite, exact: true })).toBeVisible();
  const before = await personalSnapshot(page);
  await page.getByRole("button", { name: messages.kn.recite, exact: true }).click();
  await expect(page.getByRole("button", { name: messages.kn.keepScreenAwake, exact: true })).toBeDisabled();
  await expect(page.getByText(messages.kn.screenAwakeUnsupported, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: messages.kn.exitRecite, exact: true }).click();
  expect(await personalSnapshot(page)).toEqual(before);
});
test("explicit platform requests report actual active and system-released states and release on exit", async ({ page }) => {
  await adapter(page); const requests = await prepare(page), before = await personalSnapshot(page);
  await recite(page).click(); await expect(awake(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.reciteWakeTest.requests)).toBe(0);
  await awake(page).click(); await expect(awake(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(labels.screenAwakeActive, { exact: true })).toBeVisible();
  await page.evaluate(() => window.reciteWakeTest.end());
  await expect(page.getByText(labels.screenAwakeReleased, { exact: true })).toBeVisible();
  await expect(awake(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.reciteWakeTest.requests)).toBe(1);
  await awake(page).click(); await expect(awake(page)).toHaveAttribute("aria-pressed", "true");
  await exit(page).click();
  await expect.poll(() => page.evaluate(() => [window.reciteWakeTest.active, window.reciteWakeTest.releases])).toEqual([false, 1]);
  expect(await personalSnapshot(page)).toEqual(before); expect(requests).toHaveLength(3);
});
test("request and release failures are visible retryable and never fabricate an off or active state", async ({ page }) => {
  await adapter(page); await prepare(page); const before = await personalSnapshot(page);
  await recite(page).click(); await page.evaluate(() => { window.reciteWakeTest.mode = "deny"; });
  await awake(page).click(); await expect(page.getByRole("alert")).toContainText(labels.screenAwakeFailed);
  await expect(awake(page)).toHaveAttribute("aria-pressed", "false"); await expect(awake(page)).toBeFocused();
  await page.evaluate(() => { window.reciteWakeTest.mode = "normal"; });
  await awake(page).click(); await expect(awake(page)).toHaveAttribute("aria-pressed", "true");
  for (const mode of ["release-fail", "unconfirmed"] as const) {
    await page.evaluate(mode => { window.reciteWakeTest.mode = mode; }, mode);
    await awake(page).click(); await expect(page.getByRole("alert")).toContainText(labels.screenAwakeFailed);
    await expect(awake(page)).toHaveAttribute("aria-pressed", "true");
  }
  await page.evaluate(() => { window.reciteWakeTest.mode = "normal"; });
  await awake(page).click(); await expect(awake(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await personalSnapshot(page)).toEqual(before);
});
for (const destination of ["exit", "settings", "replacement"] as const) {
  test(`pending acquisition is released after ${destination} and cannot reactivate or overwrite the new reader`, async ({ page }) => {
    await adapter(page); await prepare(page); const before = await personalSnapshot(page);
    await recite(page).click(); await page.evaluate(() => { window.reciteWakeTest.mode = "pending"; });
    await awake(page).click(); await expect(awake(page)).toBeDisabled();
    await expect(page.getByText(labels.screenAwakePending, { exact: true })).toBeVisible();
    if (destination === "exit") await exit(page).click();
    else {
      await page.getByRole("button", { name: labels.showReadingControls, exact: true }).click();
      if (destination === "settings") await navigation(page).getByRole("link", { name: labels.settings, exact: true }).click();
      else await page.getByRole("button", { name: labels.showAnotherLyric, exact: true }).click();
    }
    await page.evaluate(() => window.reciteWakeTest.settle());
    await expect.poll(() => page.evaluate(() => [window.reciteWakeTest.active, window.reciteWakeTest.releases])).toEqual([false, 1]);
    await expect(page.locator("body")).not.toHaveAttribute("data-recite");
    if (destination === "settings") { await page.goBack(); }
    await expect(recite(page)).toBeVisible(); await expect(exit(page)).toHaveCount(0);
    expect(await personalSnapshot(page)).toEqual(before);
  });
}
test("background releases an active request without silent foreground reacquisition or extra history", async ({ page }) => {
  await adapter(page); await prepare(page); const before = await personalSnapshot(page);
  await recite(page).click(); await awake(page).click(); await expect(awake(page)).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => { window.reciteWakeTest.hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(awake(page)).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => { window.reciteWakeTest.hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  expect(await page.evaluate(() => [window.reciteWakeTest.requests, window.reciteWakeTest.releases])).toEqual([1, 1]);
  await expect(page.getByText(labels.screenAwakeReleased, { exact: true })).toBeVisible();
  expect(await personalSnapshot(page)).toEqual(before);
});
