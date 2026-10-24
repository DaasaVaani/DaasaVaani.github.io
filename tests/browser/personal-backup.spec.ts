import { test, expect, type Page } from "@playwright/test";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import type { FullPersonalBackupV1 } from "../../shared/types/personal";
import { config, personalSnapshot, serveLyrics } from "../lyric-browser";
import { lyricFixture } from "../lyric-fixture";
import { replaceWorkerScript } from "../worker-script";

const labels = messages.en;
declare global { interface Window { holdBackupTransaction: boolean } }
const vectors: { accepted: { value: FullPersonalBackupV1 }[] } =
  JSON.parse(readFileSync(new URL("../../shared/fixtures/personal/full-backup.json", import.meta.url), "utf8"));
const absent = vectors.accepted[0]!.value, full = vectors.accepted[1]!.value, native = vectors.accepted[2]!.value;
const region = (page: Page) => page.getByRole("region", { name: labels.backupTitle, exact: true });
const replace = (page: Page) => region(page).getByRole("button", { name: labels.backupReplace, exact: true });
async function ready(page: Page) {
  await page.goto("/#/settings"); await expect(region(page)).toBeVisible();
}
async function choose(page: Page, value: unknown) {
  await region(page).getByLabel(labels.backupChoose, { exact: true }).setInputFiles({
    name: "synthetic.dvbackup.json.gz", mimeType: "application/gzip", buffer: gzipSync(Buffer.from(JSON.stringify(value))),
  });
}
async function download(page: Page) {
  await region(page).getByRole("button", { name: labels.backupExport, exact: true }).click();
  const [file] = await Promise.all([
    page.waitForEvent("download"), region(page).getByRole("link", { name: labels.backupExport, exact: true }).click(),
  ]);
  const path = await file.path(); if (!path) throw new Error("Missing downloaded backup");
  expect(file.suggestedFilename()).toMatch(/\.dvbackup\.json\.gz$/u);
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
}
test("stable export preserves absence and writes nothing; validated complete preview requires confirmed replacement", async ({ page }) => {
  await ready(page); const before = await personalSnapshot(page);
  const empty = await download(page);
  expect(empty.data.preferences).toBeNull(); expect(empty.data.favorites).toEqual([]);
  expect(empty).not.toHaveProperty("control"); expect(empty.data).not.toHaveProperty("epoch");
  expect(await personalSnapshot(page)).toEqual(before);
  await choose(page, full);
  await expect(replace(page)).toBeEnabled();
  const text = region(page).getByRole("textbox", { name: labels.backupPreview, exact: true });
  expect(JSON.parse(await text.inputValue())).toEqual(full);
  expect(await personalSnapshot(page)).toEqual(before);
  await replace(page).click();
  await expect(page.getByRole("region", { name: messages.kn.backupTitle, exact: true }).getByRole("status"))
    .toHaveText(messages.kn.backupRestored);
  const restored = await personalSnapshot(page), data = full.data;
  if (full.platform !== "web" || !full.data.preferences) throw new Error("Expected web preferences fixture");
  expect(restored.tables.lists).toEqual(data.lists);
  expect(restored.tables.recentHistory).toEqual([{ id: "history", ...full.data.history }]);
  expect(restored.tables.learningLabels).toEqual([{ id: "learning", ...data.learning }]);
  expect(restored.tables.recitationPosition).toEqual([{ id: "recitation", ...data.recitation }]);
  expect(restored.tables.control[0].epoch).not.toBe(before.tables.control[0].epoch);
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await expect(page.getByRole("button", { name: messages.kn.exitRecite, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: messages.en.languageName, exact: true }).click();
  const exported = await download(page);
  expect(exported.data).toEqual({ ...full.data, preferences: { ...full.data.preferences, language: "en" } });
  expect(JSON.stringify(exported)).not.toMatch(/epoch|revision|"id":"personal"/u);
});
test("cancelled preview and native/newer/malformed files preserve every table", async ({ page }) => {
  await ready(page); const before = await personalSnapshot(page);
  await choose(page, full); await expect(replace(page)).toBeEnabled();
  await region(page).getByRole("button", { name: labels.cancel, exact: true }).click();
  await expect(region(page).getByRole("status")).toHaveText(labels.backupCancelled);
  for (const value of [native, { ...full, formatVersion: 2 }, { ...full, data: { ...full.data, control: {} } }]) {
    await choose(page, value); await expect(region(page).getByRole("alert")).toHaveText(labels.backupInvalid);
    expect(await personalSnapshot(page)).toEqual(before);
  }
});
test("another tab invalidates the exact preview and forces new review before replacement", async ({ page, context }) => {
  await ready(page); await choose(page, full); await expect(replace(page)).toBeEnabled();
  const peer = await context.newPage(); await ready(peer);
  await peer.getByRole("button", { name: labels.warm, exact: true }).click();
  await expect(region(page).getByRole("alert")).toHaveText(labels.backupStale);
  await expect(replace(page)).toBeDisabled();
  const changed = await personalSnapshot(page);
  await region(page).getByRole("button", { name: labels.cancel, exact: true }).click();
  expect(await personalSnapshot(page)).toEqual(changed);
  await choose(page, absent); await expect(replace(page)).toBeEnabled(); await replace(page).click();
  await expect(region(page).getByRole("status")).toHaveText(labels.backupRestored);
  expect((await personalSnapshot(page)).tables.personal).toEqual([]);
  await peer.close();
});
test("quota at the last write preserves the old complete database and permits explicit retry", async ({ page }) => {
  await ready(page); await page.getByRole("button", { name: labels.dark, exact: true }).click();
  await choose(page, absent); await expect(replace(page)).toBeEnabled();
  const before = await personalSnapshot(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "control") { IDBObjectStore.prototype.put = original; throw new DOMException("Synthetic backup quota", "QuotaExceededError"); }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await replace(page).click(); await expect(region(page).getByRole("alert")).toHaveText(labels.backupFailed);
  expect(await personalSnapshot(page)).toEqual(before);
  await replace(page).click(); await expect(region(page).getByRole("status")).toHaveText(labels.backupRestored);
  expect((await personalSnapshot(page)).tables.personal).toEqual([]);
});
test("installed interface can preview and restore a backup offline without fetching content", async ({ page, context }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/library/")) requests.push(request.url()); });
  await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload(); await expect(region(page)).toBeVisible();
  await choose(page, absent); await expect(replace(page)).toBeEnabled(); await replace(page).click();
  await expect(region(page).getByRole("status")).toHaveText(labels.backupRestored);
  expect((await personalSnapshot(page)).tables.recitationPosition).toEqual([{ id: "recitation", ...absent.data.recitation }]);
  expect(requests).toEqual([]);
  await context.setOffline(false);
});
test("worker failure and cancellation leave all data unchanged; departure cannot reopen preview", async ({ page }) => {
  await ready(page); const before = await personalSnapshot(page);
  const restore = await replaceWorkerScript(page, "personal-backup.worker", 'self.onmessage=()=>{throw new Error("Synthetic worker failure")}');
  await choose(page, full); await expect(region(page).getByRole("alert")).toHaveText(labels.backupFailed); await restore();
  const unblock = await replaceWorkerScript(page, "personal-backup.worker", "self.onmessage=()=>{}");
  await choose(page, full); await expect(region(page).getByRole("status")).toHaveText(labels.transferWorking);
  await region(page).getByRole("button", { name: labels.cancel, exact: true }).click();
  await expect(region(page).getByRole("status")).toHaveText(labels.backupCancelled);
  expect(await personalSnapshot(page)).toEqual(before);
  await choose(page, full); await expect(region(page).getByRole("status")).toHaveText(labels.transferWorking);
  await page.getByRole("link", { name: labels.lists, exact: true }).click();
  await unblock(); await page.getByRole("link", { name: labels.settings, exact: true }).click();
  await expect(replace(page)).toHaveCount(0); expect(await personalSnapshot(page)).toEqual(before);
});
for (const action of ["cancel", "depart"] as const) {
  test(`${action} while the actual database is locked cannot commit or reopen the restore workflow`, async ({ page }) => {
    await ready(page); await choose(page, full); await expect(replace(page)).toBeEnabled();
    const before = await personalSnapshot(page);
    await page.evaluate(async name => {
      window.holdBackupTransaction = true;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("recitationPosition", "readwrite"), store = transaction.objectStore("recitationPosition");
      transaction.oncomplete = transaction.onabort = () => database.close();
      const keep = () => { store.get("recitation").onsuccess = () => { if (window.holdBackupTransaction) keep(); }; };
      keep();
    }, config.databaseName);
    try {
      await replace(page).click(); await expect(region(page).getByText(labels.transferWorking, { exact: true })).toBeVisible();
      if (action === "cancel") await region(page).getByRole("button", { name: labels.cancel, exact: true }).click();
      else await page.getByRole("link", { name: labels.lists, exact: true }).click();
    } finally { await page.evaluate(() => { window.holdBackupTransaction = false; }); }
    if (action === "cancel") await expect(region(page).getByRole("status").filter({ hasText: labels.backupCancelled }))
      .toHaveText(labels.backupCancelled);
    else await page.getByRole("link", { name: labels.settings, exact: true }).click();
    expect(await personalSnapshot(page)).toEqual(before);
    await expect(region(page).getByText(labels.backupRestored, { exact: true })).toHaveCount(0);
  });
}

test("a reader that completes after peer replacement cannot add old activity to restored history", async ({ page, context }) => {
  const fixture = lyricFixture(), item = fixture.manifest.catalog[0]!;
  await serveLyrics(page, fixture);
  await ready(page);
  const before = await personalSnapshot(page);
  let release!: () => void, requested = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/" + item.item.path, async route => {
    requested = true; await held;
    const bytes = fixture.files.get(item.item.path);
    if (!bytes) throw new Error("Missing synthetic held lyric");
    await route.fulfill({ body: bytes, contentType: "application/octet-stream",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
  });
  try {
    await page.goto("/#/lyrics/" + item.lyricId);
    await expect.poll(() => requested).toBe(true);
    const peer = await context.newPage(); await ready(peer);
    if (absent.platform !== "web") throw new Error("Expected web fixture");
    await choose(peer, { ...absent, data: { ...absent.data, history: { enabled: true, entries: [] } } });
    await expect(replace(peer)).toBeEnabled(); await replace(peer).click();
    await expect(region(peer).getByText(labels.backupRestored, { exact: true })).toBeVisible();
    const restored = await personalSnapshot(peer);
    expect(restored.tables.control[0].epoch).not.toBe(before.tables.control[0].epoch);
    release();
    await expect(page.getByRole("alert")).toContainText("Personal data changed");
    expect(await personalSnapshot(page)).toEqual(restored);
    await peer.close();
  } finally { release(); }
});

test("a cold reader records its initial open after delayed personal hydration without blocking text", async ({ page, context }) => {
  const fixture = lyricFixture(), item = fixture.manifest.catalog[0]!;
  await ready(page);
  await page.evaluate(async name => {
    window.holdBackupTransaction = true;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("recitationPosition", "readwrite"), store = transaction.objectStore("recitationPosition");
    transaction.oncomplete = transaction.onabort = () => database.close();
    const keep = () => { store.get("recitation").onsuccess = () => { if (window.holdBackupTransaction) keep(); }; };
    keep();
  }, config.databaseName);
  const reader = await context.newPage();
  try {
    await serveLyrics(reader, fixture);
    await reader.goto("/#/lyrics/" + item.lyricId);
    await expect(reader.locator("div[lang=kn] > p").first()).toBeVisible();
    await page.evaluate(() => { window.holdBackupTransaction = false; });
    await expect.poll(async () => (await personalSnapshot(reader)).tables.recentHistory[0]?.entries)
      .toEqual([{ kind: "lyric", lyricId: item.lyricId }]);
    await expect(reader.getByRole("alert")).toHaveCount(0);
  } finally {
    await page.evaluate(() => { window.holdBackupTransaction = false; });
    await reader.close();
  }
});
