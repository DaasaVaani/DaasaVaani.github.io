import { expect, test, type Page } from "@playwright/test";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { config, personalSnapshot, readingDefaults, serveLyrics } from "../lyric-browser";
import { lyricId } from "../lyric-fixture";
import { deflateRawSync } from "node:zlib";

const labels = messages.en;
const setup = (page: Page) => page.getByRole("region", { name: labels.firstUseTitle, exact: true });

test("pending shared-list destinations remain previewable through draft setup and skip without saving the list", async ({ page }) => {
  const snapshot = { format: "daasavaani-list", formatVersion: 2, name: "Synthetic setup link",
    entries: [{ kind: "placeholder", text: "Synthetic pending text" }] };
  const path = `/${config.listLinkPath}#/list/${deflateRawSync(JSON.stringify(snapshot)).toString("base64url")}`;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: snapshot.name, exact: true })).toBeVisible();
  await setup(page).getByRole("button", { name: labels.firstUseStart, exact: true }).click();
  await setup(page).getByRole("combobox", { name: labels.readingDensity, exact: true }).selectOption("relaxed");
  await setup(page).getByRole("button", { name: labels.firstUseSkip, exact: true }).click();
  await expect(setup(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: snapshot.name, exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).hash).toBe(path);
  const state = await personalSnapshot(page);
  expect(state.tables.lists).toEqual([]);
  expect(state.tables.personal).toEqual([]);
  expect(state.tables.control[0].setupStatus).toBe("skipped");
});

test("first-use is non-blocking, keeps direct reading and skip writes no preferences or content requests", async ({ page }) => {
  const requests = await serveLyrics(page);
  await page.goto(`/#/lyrics/${lyricId(1)}`);
  await expect(page.locator('div[lang="kn"] p')).toHaveCount(4);
  await expect(setup(page)).toBeVisible();
  await expect(setup(page)).toContainText(labels.firstUseOffline);
  await expect.poll(async () => (await personalSnapshot(page)).tables.recentHistory[0].entries).toHaveLength(1);
  const before = await personalSnapshot(page), requestCount = requests.length;
  expect(before.version).toBe(90);
  expect(before.tables.control[0].setupStatus).toBe("pending");
  expect(before.tables.personal).toEqual([]);
  await setup(page).getByRole("button", { name: labels.firstUseSkip, exact: true }).click();
  await expect(setup(page)).toHaveCount(0);
  const after = await personalSnapshot(page);
  expect(after.tables).toEqual({ ...before.tables,
    control: [{ ...before.tables.control[0], setupStatus: "skipped", revision: before.tables.control[0].revision + 1 }] });
  expect(requests).toHaveLength(requestCount);
  expect(page.url()).toContain(`/#/lyrics/${lyricId(1)}`);
  await page.reload();
  await expect(page.locator('div[lang="kn"] p')).toHaveCount(4);
  await expect(setup(page)).toHaveCount(0);
  await page.getByRole("link", { name: labels.settings, exact: true }).click();
  await expect(setup(page)).toContainText(labels.firstUseSkippedStatus);
});

test("draft changes cancel without writes and explicit save persists density, font, language and theme together", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(setup(page)).toBeVisible();
  const before = await personalSnapshot(page);
  await setup(page).getByRole("button", { name: labels.firstUseStart, exact: true }).click();
  await setup(page).getByRole("combobox", { name: labels.readingDensity, exact: true }).selectOption("relaxed");
  await setup(page).getByRole("button", { name: labels.warm, exact: true }).click();
  expect(await personalSnapshot(page)).toEqual(before);
  await setup(page).getByRole("button", { name: labels.firstUseCancel, exact: true }).click();
  expect(await personalSnapshot(page)).toEqual(before);
  await setup(page).getByRole("button", { name: labels.firstUseStart, exact: true }).click();
  await setup(page).getByRole("combobox", { name: labels.readingDensity, exact: true }).selectOption("compact");
  await setup(page).getByRole("button", { name: labels.increaseLyricFontSize, exact: true }).click();
  await setup(page).getByRole("button", { name: labels.warm, exact: true }).click();
  await setup(page).getByRole("button", { name: messages.kn.languageName, exact: true }).click();
  const kannada = page.getByRole("region", { name: messages.kn.firstUseTitle, exact: true });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await kannada.getByRole("button", { name: messages.kn.firstUseSave, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  const after = await personalSnapshot(page);
  expect(after.tables.personal).toEqual([{ id: "personal", favorites: [], language: "kn", theme: "warm",
    fontSize: readingDefaults.fontSize + config.readerFontSizeStep, density: "compact" }]);
  expect(after.tables.control).toEqual([{ ...before.tables.control[0], setupStatus: "completed", revision: 1 }]);
  await page.reload();
  await expect(kannada).toContainText(messages.kn.firstUseCompleted);
  expect(await personalSnapshot(page)).toEqual(after);
});

test("peer edits invalidate a setup draft rather than replacing newer choices; cancel reads latest state", async ({ page, context }) => {
  await page.goto("/#/settings");
  await setup(page).getByRole("button", { name: labels.firstUseStart, exact: true }).click();
  await setup(page).getByRole("combobox", { name: labels.readingDensity, exact: true }).selectOption("compact");
  const peer = await context.newPage();
  await peer.goto("/#/settings");
  await expect(setup(peer)).toBeVisible();
  await peer.getByRole("button", { name: labels.warm, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  const before = await personalSnapshot(page);
  await setup(page).getByRole("button", { name: labels.firstUseSave, exact: true }).click();
  await expect(setup(page).getByRole("alert")).toHaveText(labels.firstUseFailed);
  expect(await personalSnapshot(page)).toEqual(before);
  await setup(page).getByRole("button", { name: labels.firstUseCancel, exact: true }).click();
  await setup(page).getByRole("button", { name: labels.firstUseStart, exact: true }).click();
  await expect(setup(page).getByRole("button", { name: labels.warm, exact: true })).toHaveAttribute("aria-pressed", "true");
  await setup(page).getByRole("button", { name: labels.firstUseSave, exact: true }).click();
  await expect(setup(page)).toContainText(labels.firstUseCompleted);
  await expect(setup(peer)).toContainText(labels.firstUseCompleted);
  await peer.close();
});

test("a failed final write rolls back both setup and preferences, and retry commits them once", async ({ page }) => {
  await page.goto("/#/settings");
  await setup(page).getByRole("button", { name: labels.firstUseStart, exact: true }).click();
  await setup(page).getByRole("combobox", { name: labels.readingDensity, exact: true }).selectOption("relaxed");
  const before = await personalSnapshot(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "control") {
        IDBObjectStore.prototype.put = put;
        throw new DOMException("Synthetic setup quota", "QuotaExceededError");
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await setup(page).getByRole("button", { name: labels.firstUseSave, exact: true }).click();
  await expect(setup(page).getByRole("alert")).toHaveText(labels.firstUseFailed);
  expect(await personalSnapshot(page)).toEqual(before);
  await setup(page).getByRole("button", { name: labels.firstUseSave, exact: true }).click();
  await expect(setup(page)).toContainText(labels.firstUseCompleted);
  const after = await personalSnapshot(page);
  expect(after.tables.control[0].revision).toBe(before.tables.control[0].revision + 1);
  expect(after.tables.personal[0].density).toBe("relaxed");
});

test("v8 upgrades behind a fresh fence preserving an exact saved position and every other row", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(setup(page)).toBeVisible();
  const before = await personalSnapshot(page);
  const listId = crypto.randomUUID(), entryId = crypto.randomUUID();
  const reference = { kind: "lyric", lyricId: lyricId(2) };
  const tables = { ...before.tables,
    personal: [{ id: "personal", favorites: [reference], language: "en", theme: "warm", fontSize: 41, density: "relaxed" }],
    lists: [{ id: listId, name: "  Synthetic repeated list  ", entries: [
      { ...reference, id: entryId }, { ...reference, id: crypto.randomUUID() },
      { kind: "placeholder", text: "  <b>literal</b>  ", id: crypto.randomUUID() },
    ] }],
    recentHistory: [{ id: "history", enabled: false, entries: [reference] }],
    learningLabels: [{ id: "learning", entries: [{ ...reference, label: "practising" }] }],
    recitationPosition: [{ id: "recitation", position: { listId, entryId } }],
  };
  await page.goto("about:blank");
  await page.route("**/offline-setup-seed", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local seed</title>" }));
  await page.goto("/offline-setup-seed", { waitUntil: "commit" });
  await page.evaluate(async ({ name, tables }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 80);
      request.onupgradeneeded = () => {
        for (const [name, rows] of Object.entries(tables)) {
          if (!Array.isArray(rows)) throw new Error("Expected source table rows");
          const store = request.result.createObjectStore(name, { keyPath: "id" });
          for (const row of rows) {
            if (name === "control") {
              const { setupStatus: removed, ...old } = row;
              if (removed !== "pending") throw new Error("Unexpected seed");
              store.put({ ...old, formatVersion: 8, revision: 17 });
            } else store.put(row);
          }
        }
      };
      request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
    });
  }, { name: config.databaseName, tables });
  await page.goto("/#/settings");
  await expect(setup(page)).toBeVisible();
  const after = await personalSnapshot(page);
  expect(after.version).toBe(90);
  expect(after.tables).toEqual({ ...tables,
    control: [{ ...before.tables.control[0], epoch: after.tables.control[0].epoch }] });
  expect(after.tables.control[0].epoch).not.toBe(before.tables.control[0].epoch);
});
