import { test, expect, type Page } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { lyricFixture, lyricId } from "../lyric-fixture";
import { config, serveLyrics, personalSnapshot } from "../lyric-browser";

const labels = messages.en;
declare global {
  interface Window {
    publicLyricShares: ShareData[];
    publicLyricCopies: string[];
    publicLyricMode: "success" | "cancel" | "denied" | "unsupported" | "pending";
    finishPublicLyricShare?: () => void;
  }
}
async function adapters(page: Page, supported = true) {
  await page.addInitScript(supported => {
    window.publicLyricShares = []; window.publicLyricCopies = []; window.publicLyricMode = "success";
    Object.defineProperty(navigator, "share", { configurable: true, value: supported ? async (data: ShareData) => {
      if (window.publicLyricMode === "cancel") throw new DOMException("Synthetic cancellation", "AbortError");
      if (window.publicLyricMode === "denied") throw new DOMException("Synthetic denial", "NotAllowedError");
      if (window.publicLyricMode === "pending") await new Promise<void>(resolve => { window.finishPublicLyricShare = resolve; });
      window.publicLyricShares.push(data);
    } : undefined });
    Object.defineProperty(navigator, "canShare", { configurable: true,
      value: supported ? () => window.publicLyricMode !== "unsupported" : undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: supported ? { writeText: async (text: string) => {
      if (window.publicLyricMode === "denied") throw new DOMException("Synthetic denial", "NotAllowedError");
      window.publicLyricCopies.push(text);
    } } : undefined });
  }, supported);
}
async function open(page: Page, supported = true) {
  await adapters(page, supported);
  const requests = await serveLyrics(page, lyricFixture());
  await page.goto("/#/settings");
  const recording = page.getByRole("checkbox", { name: labels.recentHistoryEnabled, exact: true });
  await expect(recording).toBeChecked();
  await recording.click();
  await expect(recording).not.toBeChecked();
  await page.goto(`/#/lyrics/${lyricId(1)}`);
  await expect(page.locator("div[lang=kn] > p")).toHaveCount(4);
  expect(requests).toHaveLength(3);
  return requests;
}
function canonical(id: string) {
  return `${config.canonicalBaseUrl}#/lyrics/${id}`;
}
test("public sharing and copying contain only the configured lyric URL and never change personal/content state", async ({ page }) => {
  const requests = await open(page), before = await personalSnapshot(page), link = canonical(lyricId(1));
  const panel = page.getByRole("region", { name: labels.lyricLink, exact: true });
  await expect(panel.getByRole("textbox", { name: labels.lyricLink, exact: true })).toHaveValue(link);
  await panel.getByRole("button", { name: labels.copyLyricLink, exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(labels.lyricLinkCopied);
  await panel.getByRole("button", { name: labels.shareLyricLink, exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(labels.lyricLinkShared);
  expect(await page.evaluate(() => window.publicLyricCopies)).toEqual([link]);
  expect(await page.evaluate(() => window.publicLyricShares)).toEqual([{ url: link }]);
  expect(await personalSnapshot(page)).toEqual(before);
  expect(requests).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("cancelled, denied and unsupported sharing retain a complete manual fallback with truthful retry", async ({ page }) => {
  const requests = await open(page), before = await personalSnapshot(page);
  const panel = page.getByRole("region", { name: labels.lyricLink, exact: true });
  const share = panel.getByRole("button", { name: labels.shareLyricLink, exact: true });
  await page.evaluate(() => { window.publicLyricMode = "cancel"; });
  await share.click();
  await expect(panel.getByRole("status")).toHaveText(labels.lyricShareCancelled);
  await page.evaluate(() => { window.publicLyricMode = "denied"; });
  await share.click();
  await expect(panel.getByRole("alert")).toHaveText(labels.lyricShareFailed);
  await panel.getByRole("button", { name: labels.copyLyricLink, exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText(labels.lyricShareFailed);
  await page.evaluate(() => { window.publicLyricMode = "unsupported"; });
  await share.click();
  await expect(panel.getByRole("alert")).toHaveText(labels.lyricShareFailed);
  expect(await page.evaluate(() => window.publicLyricShares)).toEqual([]);
  expect(await page.evaluate(() => window.publicLyricCopies)).toEqual([]);
  await expect(panel.getByRole("textbox")).toHaveValue(canonical(lyricId(1)));
  await page.evaluate(() => { window.publicLyricMode = "success"; });
  await share.click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("status")).toHaveText(labels.lyricLinkShared);
  expect(await personalSnapshot(page)).toEqual(before);
  expect(requests).toHaveLength(3);
});
test("unavailable platform APIs leave a selectable readonly link and focused Recite hides sharing", async ({ page }) => {
  const requests = await open(page, false), before = await personalSnapshot(page);
  const panel = page.getByRole("region", { name: labels.lyricLink, exact: true }), field = panel.getByRole("textbox");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await field.focus();
  expect(await field.evaluate((input: HTMLInputElement) => ({
    readonly: input.readOnly, selected: input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0),
  }))).toEqual({ readonly: true, selected: canonical(lyricId(1)) });
  await page.getByRole("button", { name: labels.recite, exact: true }).click();
  await expect(field).not.toBeVisible();
  await page.getByRole("button", { name: labels.exitRecite, exact: true }).click();
  await expect(field).toHaveValue(canonical(lyricId(1)));
  expect(await personalSnapshot(page)).toEqual(before);
  expect(requests).toHaveLength(3);
});
test("a late platform result cannot label another lyric or duplicate a pending share", async ({ page }) => {
  const requests = await open(page), before = await personalSnapshot(page);
  await page.evaluate(() => { window.publicLyricMode = "pending"; });
  const share = page.getByRole("button", { name: labels.shareLyricLink, exact: true });
  await share.click();
  await expect(share).toBeDisabled();
  await expect(page.getByRole("button", { name: labels.copyLyricLink, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: labels.showAnotherLyric, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lyrics/${lyricId(2)}$`, "u"));
  await expect(page.getByRole("textbox", { name: labels.lyricLink, exact: true })).toHaveValue(canonical(lyricId(2)));
  await page.evaluate(() => {
    if (!window.finishPublicLyricShare) throw new Error("Missing pending synthetic share");
    window.finishPublicLyricShare();
  });
  await expect.poll(() => page.evaluate(() => window.publicLyricShares.length)).toBe(1);
  await expect(page.getByRole("region", { name: labels.lyricLink, exact: true }).getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => window.publicLyricShares)).toEqual([{ url: canonical(lyricId(1)) }]);
  expect(await personalSnapshot(page)).toEqual(before);
  expect(requests).toHaveLength(4);
  await page.goto(`/#/lyrics/${lyricId(99)}`);
  await expect(page.getByText(labels.lyricsUnavailable, { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: labels.lyricLink, exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(4);
  expect(await personalSnapshot(page)).toEqual(before);
});
