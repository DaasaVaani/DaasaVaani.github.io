import { test, expect, type Page } from "@playwright/test";
import { gzipSync, gunzipSync, deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strictYaml } from "../../shared/tools/generate-catalog.mjs";
import { typedEntry, type ListSnapshot } from "../../src/list-transfer-types";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };
import { readingDefaults } from "../lyric-browser";
import { replaceWorkerScript } from "../worker-script";

const web = strictYaml(readFileSync(new URL("../../settings/web.yml", import.meta.url), "utf8"));
const limits = strictYaml(readFileSync(new URL("../../shared/settings/personal-transfer.yml", import.meta.url), "utf8"));
if (!web || typeof web !== "object" || !("databaseName" in web) || typeof web.databaseName !== "string" ||
    !("listFileName" in web) || typeof web.listFileName !== "string" ||
    !limits || typeof limits !== "object" || !("maxLists" in limits) || typeof limits.maxLists !== "number" ||
    !("maxListNameCodePoints" in limits) || typeof limits.maxListNameCodePoints !== "number" ||
    !("maxEntryTextCodePoints" in limits) || typeof limits.maxEntryTextCodePoints !== "number") {
  throw new Error("Invalid list browser test configuration");
}
const databaseName = web.databaseName, fileName = web.listFileName, maxLists = limits.maxLists;
function background(theme: string) {
  if (!web || typeof web !== "object" || !("themes" in web) || !web.themes || typeof web.themes !== "object") {
    throw new Error("Missing configured palettes");
  }
  const value: unknown = Object.entries(web.themes).find(([key]) => key === theme)?.[1];
  if (!value || typeof value !== "object" || !("background" in value) || typeof value.background !== "string") {
    throw new Error("Invalid configured theme background");
  }
  return value.background;
}
const maxName = limits.maxListNameCodePoints, maxText = limits.maxEntryTextCodePoints;
const snapshot: ListSnapshot = { format: "daasavaani-list", formatVersion: 1, name: "Straße", entries: [
  { kind: "item", videoId: "fixture_ref", fallback: "  User note  " },
  { kind: "placeholder", text: "<b>Plain text</b>" }, { kind: "item", videoId: "fixture_ref" },
] };
const storedSnapshot = (value: ListSnapshot) => ({ ...value, formatVersion: 2, entries: value.entries.map(typedEntry) });
declare global {
  interface Window {
    syntheticShares: { url?: string; files?: { name: string; type: string; bytes: number[] }[] }[];
    syntheticCopies: string[];
    syntheticShareMode: "success" | "cancel" | "denied" | "unsupported" | "pending";
    finishSyntheticShare?: () => void;
  }
}
async function platformAdapters(page: Page) {
  await page.addInitScript(() => {
    window.syntheticShares = []; window.syntheticCopies = []; window.syntheticShareMode = "success";
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      if (window.syntheticShareMode === "cancel") throw new DOMException("Synthetic cancellation", "AbortError");
      if (window.syntheticShareMode === "denied") throw new DOMException("Synthetic denial", "NotAllowedError");
      if (window.syntheticShareMode === "pending") await new Promise<void>(resolve => { window.finishSyntheticShare = resolve; });
      window.syntheticShares.push({ url: data.url, files: data.files && await Promise.all(data.files.map(async file => ({
        name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())],
      }))) });
    } });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => window.syntheticShareMode !== "unsupported" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => {
      if (window.syntheticShareMode === "denied") throw new DOMException("Synthetic denial", "NotAllowedError");
      window.syntheticCopies.push(text);
    } } });
  });
}
test("explicit platform adapters copy and share exact minimal snapshots without personal writes or delivery claims", async ({ page }) => {
  await platformAdapters(page); await upload(page);
  const before = await records(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  const link = page.locator("input[readonly]"); await expect(link).toBeVisible();
  const value = await link.inputValue();
  await page.getByRole("button", { name: "Copy snapshot link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Snapshot link copied.");
  expect(await page.evaluate(() => window.syntheticCopies)).toEqual([value]);
  await page.getByRole("button", { name: "Share snapshot link", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Handed to the system sharing interface. Delivery is not confirmed.");
  expect(await page.evaluate(() => window.syntheticShares)).toEqual([{ url: value }]);
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download list file", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share list file", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Handed to the system sharing interface. Delivery is not confirmed.");
  const shared = await page.evaluate(() => window.syntheticShares.at(-1)?.files);
  expect(shared).toHaveLength(1);
  expect(shared?.[0]).toMatchObject({ name: fileName, type: "application/gzip" });
  expect(JSON.parse(gunzipSync(Buffer.from(shared?.[0]?.bytes ?? [])).toString("utf8"))).toEqual(snapshot);
  expect(await records(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("platform cancellation denial and unsupported files retain manual fallbacks and never save", async ({ page }) => {
  await platformAdapters(page); await upload(page); const before = await records(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  const link = page.locator("input[readonly]"); await expect(link).toBeVisible(); const value = await link.inputValue();
  await page.evaluate(() => { window.syntheticShareMode = "cancel"; });
  await page.getByRole("button", { name: "Share snapshot link", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Sharing cancelled. Nothing was changed.");
  await page.evaluate(() => { window.syntheticShareMode = "denied"; });
  await page.getByRole("button", { name: "Copy snapshot link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Use the displayed link or download the file instead.");
  await page.getByRole("button", { name: "Share snapshot link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Use the displayed link or download the file instead.");
  await expect(link).toHaveValue(value);
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download list file", exact: true })).toBeVisible();
  await page.evaluate(() => { window.syntheticShareMode = "unsupported"; });
  await page.getByRole("button", { name: "Share list file", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("This browser cannot share this file. Download the complete list file instead.");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download list file", exact: true }).click();
  const downloaded = await download; const path = await downloaded.path();
  if (!path) throw new Error("Missing complete fallback download");
  expect(JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"))).toEqual(snapshot);
  expect(await page.evaluate(() => window.syntheticShares)).toEqual([]);
  expect(await records(page)).toEqual(before);
});
test("platform sharing blocks concurrent save and stale completion cannot affect a replacement preview", async ({ page }) => {
  await platformAdapters(page); await upload(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  await expect(page.locator("input[readonly]")).toBeVisible();
  await page.evaluate(() => { window.syntheticShareMode = "pending"; });
  await page.getByRole("button", { name: "Share snapshot link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save to My Library", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create snapshot link", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.evaluate(() => window.finishSyntheticShare?.());
  await expect(page.getByText("Handed to the system sharing interface. Delivery is not confirmed.", { exact: true })).toHaveCount(0);
  await upload(page, { ...snapshot, name: "Replacement preview" });
  await expect(page.getByRole("button", { name: "Save to My Library", exact: true })).toBeEnabled();
  await expect(page.locator("input[readonly]")).toHaveCount(0);
  expect((await records(page)).values.lists).toEqual([]);
});
test("platform sharing dismisses pending duplicate confirmation and saved snapshots use the same exact adapter", async ({ page }) => {
  await platformAdapters(page); await upload(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByText("Saved as an independent local list.", { exact: true })).toBeVisible();
  const before = await records(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  await expect(page.locator("input[readonly]")).toBeVisible();
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share snapshot link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Delivery is not confirmed.");
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true }).click();
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download list file", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share list file", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Delivery is not confirmed.");
  const bytes = await page.evaluate(() => window.syntheticShares.at(-1)?.files?.[0]?.bytes);
  if (!bytes) throw new Error("Missing saved snapshot file handoff");
  expect(JSON.parse(gunzipSync(Buffer.from(bytes)).toString("utf8"))).toEqual(storedSnapshot(snapshot));
  expect(await records(page)).toEqual(before);
});
test("absent platform APIs keep selectable links and complete downloads available", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
  await upload(page); const before = await records(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  const link = page.locator("input[readonly]"); await expect(link).toBeVisible();
  const value = await link.inputValue(); await link.focus();
  expect(await link.evaluate(input => input instanceof HTMLInputElement && input.selectionEnd !== null && input.selectionStart !== null
    ? input.selectionEnd - input.selectionStart : -1)).toBe(value.length);
  await expect(page.getByRole("button", { name: "Copy snapshot link", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share snapshot link", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download list file", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share list file", exact: true })).toHaveCount(0);
  expect(await records(page)).toEqual(before);
});
async function records(page: Page) {
  return page.evaluate(async name => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const values: Record<string, unknown[]> = {};
      const layout: Record<string, { keyPath: string | string[] | null; autoIncrement: boolean; indexes: string[] }> = {};
      for (const store of database.objectStoreNames) values[store] = await new Promise<unknown[]>((resolve, reject) => {
        const object = database.transaction(store).objectStore(store);
        layout[store] = { keyPath: object.keyPath, autoIncrement: object.autoIncrement, indexes: [...object.indexNames] };
        const request = object.getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return { version: database.version, values, layout };
    } finally { database.close(); }
  }, databaseName);
}
const listIdentities = (value: unknown) => [...JSON.stringify(value).matchAll(
  /"id":"([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"/g,
)].map(match => match[1]);
async function upload(page: Page, value = snapshot, canSave = true) {
  await page.goto("/#/settings");
  await page.getByLabel("Choose a list file").setInputFiles({ name: "synthetic.gz", mimeType: "application/gzip", buffer: gzipSync(JSON.stringify(value)) });
  await expect(page.getByRole("heading", { name: value.name, exact: true })).toBeVisible();
  const save = page.getByRole("button", { name: "Save to My Library", exact: true });
  if (canSave) await expect(save).toBeEnabled(); else await expect(save).toBeDisabled();
}
async function create(page: Page, name: string) {
  const form = page.getByRole("form", { name: "Create empty list", exact: true });
  await form.getByLabel("List name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Create empty list", exact: true }).click();
}
async function seedLegacy(page: Page, value: unknown, version = 10) {
  await page.route("**/personal-fixture-seed", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Synthetic personal fixture</title>",
  }));
  await page.goto("/personal-fixture-seed");
  await page.evaluate(async input => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(input.name, input.version);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("personal", { keyPath: "id" });
        if (input.version > 30) request.result.createObjectStore("future", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const stores = [...database.objectStoreNames];
        const transaction = database.transaction(stores, "readwrite");
        transaction.objectStore("personal").put(input.value);
        if (stores.includes("future")) transaction.objectStore("future").put({ id: "synthetic-future", text: "Preserve me" });
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }, { name: databaseName, value, version });
  await page.unroute("**/personal-fixture-seed");
}
async function seedVersion2(page: Page, theme = "dark", unexpectedIndex = false, version: 2 | 3 = 2) {
  await page.route("**/personal-v2-seed", route => route.fulfill({ contentType: "text/html",
    body: "<!doctype html><title>Synthetic personal v2 fixture</title>" }));
  await page.goto("/personal-v2-seed");
  await page.evaluate(async input => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(input.name, input.version * 10);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("personal", { keyPath: "id" });
        request.result.createObjectStore("control", { keyPath: "id" });
        const lists = request.result.createObjectStore("lists", { keyPath: "id" });
        if (input.unexpectedIndex) lists.createIndex("unexpected", "name");
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["control", "personal", "lists"], "readwrite");
        tx.objectStore("control").put({ id: "state", formatVersion: input.version, revision: 7,
          epoch: "00000000-0000-4000-8000-000000000001" });
        tx.objectStore("personal").put({ id: "personal", favorites: ["fixture-one"], language: "en", theme: input.theme });
        tx.objectStore("lists").put({ id: "00000000-0000-4000-8000-000000000002", name: "Synthetic v2 list", entries: [
          { id: "00000000-0000-4000-8000-000000000003", kind: "item", videoId: "fixture-one", fallback: "  Preserve this  " },
          { id: "00000000-0000-4000-8000-000000000004", kind: "placeholder", text: "<b>Keep literal</b>" },
          { id: "00000000-0000-4000-8000-000000000005", kind: "item", videoId: "fixture-one" },
        ] });
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { name: databaseName, theme, unexpectedIndex, version });
  await page.unroute("**/personal-v2-seed");
}
for (const theme of ["warm", "device"]) {
  test(`v3 typed upgrade retains ${theme} preferences, every occurrence and raw user text behind a fresh writer fence`, async ({ page }) => {
    await seedVersion2(page, theme, false, 3);
    const before = await records(page);
    expect(before.version).toBe(30);
    await page.goto("/#/lists");
    await expect(page.getByRole("heading", { name: "Lists", exact: true })).toBeVisible();
    const after = await records(page);
    expect(after.version).toBe(80);
    expect(after.layout).toEqual({ ...before.layout, recentHistory: { keyPath: "id", autoIncrement: false, indexes: [] },
      learningLabels: { keyPath: "id", autoIncrement: false, indexes: [] },
      recitationPosition: { keyPath: "id", autoIncrement: false, indexes: [] } });
    expect(after.values.learningLabels).toEqual([{ id: "learning", entries: [] }]);
    expect(after.values.recentHistory).toEqual([{ id: "history", enabled: true, entries: [] }]);
    expect(after.values.personal).toEqual([{ id: "personal", favorites: [{ kind: "legacyVideo", videoId: "fixture-one" }], language: "en", theme, ...readingDefaults }]);
    expect(after.values.control).toMatchObject([{ id: "state", formatVersion: 8, revision: 0 }]);
    expect(after.values.recitationPosition).toEqual([{ id: "recitation", position: null }]);
    expect(after.values.control).not.toEqual(before.values.control);
    expect(listIdentities(after.values.lists)).toEqual(listIdentities(before.values.lists));
    expect(after.values.lists).toMatchObject([{ name: "Synthetic v2 list", entries: [
      { kind: "legacyVideo", videoId: "fixture-one", fallback: "  Preserve this  " },
      { kind: "placeholder", text: "<b>Keep literal</b>" }, { kind: "legacyVideo", videoId: "fixture-one" },
    ] }]);
    await page.reload(); await expect(page.getByRole("heading", { name: "Lists", exact: true })).toBeVisible();
    expect(await records(page)).toEqual(after);
  });
}
test("v3 migration rejects typed favorites mislabeled as legacy and rolls every store and native version back", async ({ page }) => {
  await seedVersion2(page, "warm", false, 3);
  await page.evaluate(async name => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 30);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const tx = database.transaction("personal", "readwrite");
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      tx.objectStore("personal").put({ id: "personal", favorites: [
        { kind: "lyric", lyricId: "00000000-0000-4000-8000-000000000001" },
      ], language: "en", theme: "warm" });
      await done;
    } finally { database.close(); }
  }, databaseName);
  const before = await records(page);
  await page.goto("/#/lists");
  await expect(page.getByRole("alert")).toContainText("Invalid personal database record");
  expect(await records(page)).toEqual(before);
});
test("explicit lyric editing and placeholder replacement retain occurrence identities and literal user fallback text", async ({ page }) => {
  const labels = messages.en, lyricId = "abcdef01-2345-4678-9abc-def012345678";
  await page.goto("/#/lists"); await create(page, "Synthetic typed editor");
  await page.getByRole("list", { name: labels.lists, exact: true }).getByRole("button", { name: "Synthetic typed editor", exact: true }).click();
  const editor = page.getByRole("form", { name: labels.editEntry, exact: true }), before = await records(page);
  await page.getByRole("button", { name: labels.addLyricReference, exact: true }).click();
  await editor.getByLabel(labels.lyricIdentifier, { exact: true }).fill("fixture_ref");
  await editor.getByRole("button", { name: labels.saveEntry, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(labels.listInvalid);
  expect(await records(page)).toEqual(before);
  await editor.getByLabel(labels.lyricIdentifier, { exact: true }).fill(lyricId);
  await editor.getByLabel(labels.fallbackLabel, { exact: true }).fill("  User fallback  ");
  await editor.getByRole("button", { name: labels.saveEntry, exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(1);
  const first = listIdentities((await records(page)).values.lists);
  await page.getByRole("button", { name: labels.addPlaceholder, exact: true }).click();
  await editor.getByLabel(labels.placeholderText, { exact: true }).fill("<b>Only text</b>");
  await editor.getByRole("button", { name: labels.saveEntry, exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(2);
  const added = await records(page), addedIds = listIdentities(added.values.lists);
  expect(addedIds.slice(0, 2)).toEqual(first);
  await page.getByRole("group", { name: "Entry 2 of 2", exact: true }).getByRole("button", { name: labels.replaceWithLyric, exact: true }).click();
  await expect(editor.getByLabel(labels.fallbackLabel, { exact: true })).toHaveValue("<b>Only text</b>");
  await editor.getByLabel(labels.lyricIdentifier, { exact: true }).fill(lyricId);
  await editor.getByRole("button", { name: labels.saveEntry, exact: true }).click();
  await expect(page.locator("main ol > li").last().locator("code")).toHaveText(lyricId);
  const replaced = await records(page);
  expect(listIdentities(replaced.values.lists)).toEqual(addedIds);
  expect(replaced.values.lists).toMatchObject([{ entries: [
    { kind: "lyric", lyricId, fallback: "  User fallback  " }, { kind: "lyric", lyricId, fallback: "<b>Only text</b>" },
  ] }]);
  await expect(page.locator("main b")).toHaveCount(0);
  await page.getByRole("group", { name: "Entry 1 of 2", exact: true }).getByRole("button", { name: labels.editEntry, exact: true }).click();
  await expect(editor.getByLabel(labels.lyricIdentifier, { exact: true })).toHaveValue(lyricId);
  await editor.getByLabel(labels.lyricIdentifier, { exact: true }).fill(lyricId.toUpperCase());
  await editor.getByRole("button", { name: labels.saveEntry, exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(labels.listInvalid);
  expect(await records(page)).toEqual(replaced);
  await editor.getByRole("button", { name: labels.cancel, exact: true }).click();
  expect(await records(page)).toEqual(replaced);
});
test("appearance follows device changes only when chosen and preserves every personal table without automatic writes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" }); await page.goto("/#/settings");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Follow device", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Follow device", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await root.evaluate(element => getComputedStyle(element).getPropertyValue("--background").trim())).toBe(background("dark"));
  const following = await records(page);
  await page.emulateMedia({ colorScheme: "light" }); await expect(root).toHaveAttribute("data-theme", "light");
  expect(await root.evaluate(element => getComputedStyle(element).getPropertyValue("--background").trim())).toBe(background("light"));
  expect(await records(page)).toEqual(following);
  await page.emulateMedia({ colorScheme: "dark" }); await expect(root).toHaveAttribute("data-theme", "dark");
  expect(await records(page)).toEqual(following);
  await page.reload(); await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Follow device", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Warm", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "warm");
  expect(await root.evaluate(element => getComputedStyle(element).getPropertyValue("--background").trim())).toBe(background("warm"));
  const warm = await records(page);
  await page.emulateMedia({ colorScheme: "light" }); await expect(root).toHaveAttribute("data-theme", "warm");
  expect(await records(page)).toEqual(warm);
  await page.reload(); await expect(root).toHaveAttribute("data-theme", "warm");
  await page.getByRole("button", { name: "ಕನ್ನಡ", exact: true }).click();
  await expect(root).toHaveAttribute("lang", "kn"); await expect(root).toHaveAttribute("data-theme", "warm");
  await page.goto("/#/item/fixture-one");
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  await expect(root).toHaveAttribute("data-theme", "warm");
});
test("v2 migration retains every favorite list and occurrence while fencing old revisions before new appearance writes", async ({ page }) => {
  await seedVersion2(page); const before = await records(page);
  expect(before.version).toBe(20);
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  const migrated = await records(page);
  expect(migrated.version).toBe(80);
  expect(migrated.values.personal).toEqual([{ id: "personal", favorites: [{ kind: "legacyVideo", videoId: "fixture-one" }], language: "en", theme: "dark", ...readingDefaults }]);
  expect(migrated.values.lists).toEqual([{ id: "00000000-0000-4000-8000-000000000002", name: "Synthetic v2 list", entries: [
    { id: "00000000-0000-4000-8000-000000000003", kind: "legacyVideo", videoId: "fixture-one", fallback: "  Preserve this  " },
    { id: "00000000-0000-4000-8000-000000000004", kind: "placeholder", text: "<b>Keep literal</b>" },
    { id: "00000000-0000-4000-8000-000000000005", kind: "legacyVideo", videoId: "fixture-one" },
  ] }]);
  expect(migrated.layout).toEqual({ ...before.layout, recentHistory: { keyPath: "id", autoIncrement: false, indexes: [] },
    learningLabels: { keyPath: "id", autoIncrement: false, indexes: [] },
    recitationPosition: { keyPath: "id", autoIncrement: false, indexes: [] } });
  expect(migrated.values.learningLabels).toEqual([{ id: "learning", entries: [] }]);
  expect(migrated.values.recentHistory).toEqual([{ id: "history", enabled: true, entries: [] }]);
  expect(migrated.values.control).toMatchObject([{ id: "state", formatVersion: 8, revision: 0 }]);
  expect(migrated.values.recitationPosition).toEqual([{ id: "recitation", position: null }]);
  expect(JSON.stringify(migrated.values.control)).not.toContain("00000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Warm", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "warm");
  const changed = await records(page);
  expect(changed.values.lists).toEqual(migrated.values.lists);
  expect(changed.values.personal).toMatchObject([{ favorites: [{ kind: "legacyVideo", videoId: "fixture-one" }], language: "en", theme: "warm" }]);
  expect(changed.values.control).toMatchObject([{ revision: 1 }]);
  await page.reload(); await expect(page.getByRole("button", { name: "Warm", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Synthetic v2 list", exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(3);
  expect(await records(page)).toEqual(changed);
});
for (const example of [{ name: "invalid v2 mode", theme: "warm", index: false },
  { name: "unexpected v2 index", theme: "dark", index: true }]) {
  test(`v2 migration refusal preserves the complete database for ${example.name}`, async ({ page }) => {
    await seedVersion2(page, example.theme, example.index); const before = await records(page);
    await page.goto("/#/settings");
    await expect(page.getByRole("alert")).toContainText("Invalid personal database record");
    expect(await records(page)).toEqual(before);
    await upload(page, snapshot, false);
    await expect(page.getByRole("button", { name: "Save to My Library", exact: true })).toBeDisabled();
    expect(await records(page)).toEqual(before);
  });
}
test("confirmed import persists plain text and repeated independent occurrences without the Library endpoint", async ({ page }) => {
  await page.route("**/demo/latest.json", route => route.abort());
  await upload(page);
  const before = await records(page);
  await expect(page.locator("main b")).toHaveCount(0);
  expect(await records(page)).toEqual(before);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByText("Saved as an independent local list.", { exact: true })).toBeVisible();
  const saved = await records(page);
  expect(saved.values.lists).toHaveLength(1);
  const ids = listIdentities(saved.values.lists);
  expect(ids).toHaveLength(4); expect(new Set(ids).size).toBe(4);
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(3);
  await expect(page.locator("main ol > li").nth(1).locator(":scope > span").nth(1)).toHaveText("<b>Plain text</b>");
  await expect(page.getByText("Lyrics unavailable in DaasaVaani.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true })).toBeVisible();
  expect(await records(page)).toEqual(saved);
});
test("official Unicode16 separates an old-package collision, retains rename confirmation and distributes the complete data license", async ({ page }) => {
  const license = await page.request.get("/unicode16-license.txt");
  expect(license.status()).toBe(200);
  expect(await license.body()).toEqual(readFileSync(new URL("../../shared/resources/unicode16/LICENSE.txt", import.meta.url)));
  expect(await (await page.request.get("/third-party-licenses.md")).text()).toContain("unicode16-license.txt");
  await page.goto("/#/lists"); await create(page, "ss");
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "ss", exact: true })).toBeVisible();
  const name = String.fromCodePoint(122773);
  await create(page, name);
  const choose = page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name, exact: true });
  await expect(choose).toBeVisible();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toHaveCount(0);
  await choose.click();
  const before = await records(page), rename = page.getByRole("form", { name: "Rename list", exact: true });
  await rename.getByLabel("List name", { exact: true }).fill("ss");
  await rename.getByRole("button", { name: "Rename list", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await records(page)).toEqual(before);
});
test("new Unicode16 equivalence never rewrites existing lists, identities or the current database before explicit independent reuse", async ({ page }) => {
  await page.goto("/#/lists");
  await expect(page.getByRole("form", { name: "Create empty list", exact: true })).toBeVisible();
  const before = await records(page), names = [String.fromCodePoint(0x105c9), String.fromCodePoint(0x105d2, 0x307)];
  const lists = names.map(name => ({ id: crypto.randomUUID(), name, entries: [
    { id: crypto.randomUUID(), kind: "placeholder", text: "  Synthetic preserved occurrence  " },
  ] }));
  await page.evaluate(async input => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(input.name, 80);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("lists", "readwrite");
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); transaction.onerror = () => reject(transaction.error);
      });
      for (const list of input.lists) transaction.objectStore("lists").put(list);
      await done;
    } finally { database.close(); }
  }, { name: databaseName, lists });
  const seeded = await records(page);
  await page.reload();
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button")).toHaveCount(2);
  expect(await records(page)).toEqual(seeded);
  const name = names[0];
  if (name === undefined) throw new Error("Missing Unicode16 name");
  await create(page, name);
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  expect(await records(page)).toEqual(seeded);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await records(page)).toEqual(seeded);
  await create(page, name);
  await page.getByRole("button", { name: "Save with same name", exact: true }).click();
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button")).toHaveCount(3);
  const saved = await records(page);
  expect(saved.values.lists).toEqual(expect.arrayContaining(lists));
  expect(saved.values.personal).toEqual(before.values.personal);
  expect(saved.version).toBe(before.version); expect(saved.layout).toEqual(before.layout);
});
test("duplicate-name cancellation is no-write and a changed revision requires renewed confirmation across tabs", async ({ page, context }) => {
  await upload(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByText("Saved as an independent local list.", { exact: true })).toBeVisible();
  await page.getByLabel("List name", { exact: true }).fill("STRASSE");
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  const before = await records(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await records(page)).toEqual(before);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  const other = await context.newPage(); await other.goto("/#/lists");
  await create(other, "Other");
  await expect(other.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Other", exact: true })).toBeVisible();
  const changed = await records(page);
  await page.getByRole("button", { name: "Save with same name", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Personal data changed.");
  expect(await records(page)).toEqual(changed);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("button", { name: "Save with same name", exact: true }).click();
  await expect.poll(async () => (await records(page)).values.lists?.length).toBe(3);
  await other.reload();
  await expect(other.getByRole("list", { name: "Lists", exact: true }).getByRole("button")).toHaveCount(3);
  const saved = await records(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  await expect(page.locator("input[readonly]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toHaveCount(0);
  expect(await records(page)).toEqual(saved);
});
test("occurrence editing, movement, manual replacement and removal retain IDs, text, repetitions and persisted order", async ({ page }) => {
  await upload(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  const choose = () => page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true }).click();
  await choose();
  const before = await records(page), ids = listIdentities(before.values.lists);
  const editor = page.getByRole("form", { name: "Edit entry", exact: true });
  await page.getByRole("button", { name: "Add placeholder", exact: true }).click();
  await editor.getByLabel("Placeholder text", { exact: true }).fill("<b>Plain text</b>");
  await editor.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(4);
  const added = listIdentities((await records(page)).values.lists);
  expect(added.slice(0, 4)).toEqual(ids); expect(new Set(added).size).toBe(5);
  await page.getByRole("group", { name: "Entry 4 of 4", exact: true }).getByRole("button", { name: "Move up", exact: true }).click();
  await expect.poll(async () => listIdentities((await records(page)).values.lists)).toEqual([ids[0], ids[1], ids[2], added[4], ids[3]]);
  await expect(page.getByRole("group", { name: "Entry 3 of 4", exact: true })).toBeFocused();
  await page.getByRole("group", { name: "Entry 2 of 4", exact: true }).getByRole("button", { name: "Replace with library reference", exact: true }).click();
  await expect(editor.getByLabel("User fallback label (optional; leave empty to remove)", { exact: true })).toHaveValue("<b>Plain text</b>");
  await editor.getByLabel("Library video identifier", { exact: true }).fill("replacement_ref");
  await editor.getByLabel("User fallback label (optional; leave empty to remove)", { exact: true }).fill("  Replacement label  ");
  await editor.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.locator("main ol > li").nth(1).locator("code")).toHaveText("replacement_ref");
  expect(listIdentities((await records(page)).values.lists)).toEqual([ids[0], ids[1], ids[2], added[4], ids[3]]);
  await page.getByRole("group", { name: "Entry 1 of 4", exact: true }).getByRole("button", { name: "Remove this occurrence", exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(3);
  const saved = await records(page);
  expect(listIdentities(saved.values.lists)).toEqual([ids[0], ids[2], added[4], ids[3]]);
  expect(saved.values.lists).toMatchObject([{ entries: [
    { kind: "legacyVideo", videoId: "replacement_ref", fallback: "  Replacement label  " },
    { kind: "placeholder", text: "<b>Plain text</b>" }, { kind: "legacyVideo", videoId: "fixture_ref" },
  ] }]);
  expect(saved.values.personal).toEqual(before.values.personal);
  await expect(page.locator("main b")).toHaveCount(0);
  await page.reload(); await choose();
  expect(await records(page)).toEqual(saved);
});
test("entry input bounds, cancellation and cross-tab stale edits never partially mutate personal data", async ({ page, context }) => {
  await page.goto("/#/lists"); await create(page, "Editing");
  const choose = () => page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Editing", exact: true }).click();
  await choose(); const before = await records(page);
  const editor = page.getByRole("form", { name: "Edit entry", exact: true });
  await page.getByRole("button", { name: "Add placeholder", exact: true }).click();
  await editor.getByLabel("Placeholder text", { exact: true }).fill("😀".repeat(maxText + 1));
  await editor.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("List name or entry is invalid");
  expect(await records(page)).toEqual(before);
  await editor.getByLabel("Placeholder text", { exact: true }).fill("😀".repeat(maxText));
  await editor.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit entry", exact: true }).click();
  await editor.getByLabel("Placeholder text", { exact: true }).fill("Cancelled");
  const saved = await records(page);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await records(page)).toEqual(saved);
  await page.getByRole("button", { name: "Edit entry", exact: true }).click();
  await editor.getByLabel("Placeholder text", { exact: true }).fill("Draft");
  const other = await context.newPage(); await other.goto("/#/lists"); await create(other, "Other");
  await expect(other.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Other", exact: true })).toBeVisible();
  const changed = await records(page);
  await editor.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Personal data changed.");
  expect(await records(page)).toEqual(changed);
});
test("entry changes do not repeat duplicate-name warnings but an actual rename still requires confirmation", async ({ page }) => {
  await page.goto("/#/lists"); await create(page, "Same"); await create(page, "SAME");
  await page.getByRole("button", { name: "Save with same name", exact: true }).click();
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "SAME", exact: true })).toBeVisible();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Same", exact: true }).click();
  await page.getByRole("button", { name: "Add library reference", exact: true }).click();
  const editor = page.getByRole("form", { name: "Edit entry", exact: true });
  await editor.getByLabel("Library video identifier", { exact: true }).fill("fixture_ref");
  await editor.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.locator("main ol > li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toHaveCount(0);
  const before = await records(page);
  const rename = page.getByRole("form", { name: "Rename list", exact: true });
  await rename.getByLabel("List name", { exact: true }).fill("same");
  await rename.getByRole("button", { name: "Rename list", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await records(page)).toEqual(before);
});
test("saved-list exports use the stored name and exact minimal snapshot without writes or library downloads", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await page.route("**/demo/latest.json", route => route.abort());
  await upload(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  const choose = () => page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true }).click();
  await choose(); await page.reload(); await choose();
  await page.getByRole("form", { name: "Rename list", exact: true }).getByLabel("List name", { exact: true }).fill("Unsaved draft name");
  const before = await records(page);
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"),
    page.getByRole("link", { name: "Download list file", exact: true }).click()]);
  const path = await download.path(); if (!path) throw new Error("Saved-list download did not complete");
  expect(JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"))).toEqual(storedSnapshot(snapshot));
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  const output = page.locator("input[readonly]"); await expect(output).toBeVisible();
  const url = new URL(await output.inputValue()); expect(url.protocol).toBe("https:");
  expect(await records(page)).toEqual(before);
  await page.goto(url.pathname + url.hash);
  await expect(page.getByRole("heading", { name: snapshot.name, exact: true })).toBeVisible();
  expect(await records(page)).toEqual(before);
  expect(requests.filter(url => url.endsWith(".json.gz"))).toHaveLength(0);
});
test("same-document open-path export navigation decodes the current route, not an old lists hash", async ({ page }) => {
  const original = { ...snapshot, name: "Synthetic route regression" };
  await page.goto("/open/#/list/" + deflateRawSync(JSON.stringify(original)).toString("base64url"));
  await expect(page.getByRole("heading", { name: original.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: original.name, exact: true }).click();
  await page.getByRole("group", { name: "Entry 2 of 3", exact: true }).getByRole("button", { name: "Move up", exact: true }).click();
  await expect(page.getByRole("group", { name: "Entry 1 of 3", exact: true })).toBeFocused();
  const before = await records(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  const output = page.locator("input[readonly]"); await expect(output).toBeVisible();
  const url = new URL(await output.inputValue());
  await page.goto(url.pathname + url.hash);
  await expect(page.getByRole("heading", { name: original.name, exact: true })).toBeVisible();
  await expect(page.locator("main ol > li").first()).toContainText("<b>Plain text</b>");
  expect(await records(page)).toEqual(before);
  await page.goto(url.pathname + url.hash + "?unexpected=1");
  await expect(page.getByRole("alert")).toContainText("Invalid or unsupported");
  expect(await records(page)).toEqual(before);
});
test("available catalog resolves only exact known references without lyric requests or personal writes", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().endsWith(".json.gz")) requests.push(request.url()); });
  const value: ListSnapshot = { ...snapshot, name: "Synthetic catalog details", entries: [
    { kind: "item", videoId: "fixture-one", fallback: "  User label, not a title  " },
    { kind: "item", videoId: "unknown_fixture", fallback: "<b>Still unknown</b>" },
    { kind: "placeholder", text: "fixture-one" }, { kind: "item", videoId: "fixture-one" },
  ] };
  await upload(page, value);
  const preview = page.getByRole("region", { name: "List snapshot preview", exact: true });
  await expect(preview.getByText("In the available catalog. Offline readiness is not established.", { exact: true })).toHaveCount(2);
  await expect(preview.getByText("ಕನ್ನಡ ಓದು — ಪರೀಕ್ಷೆ ೧", { exact: true })).toHaveCount(2);
  await expect(preview.getByText("Lyrics unavailable in DaasaVaani.", { exact: true })).toHaveCount(2);
  await expect(preview.getByRole("link", { name: "Read", exact: true })).toHaveCount(0);
  await expect(page.locator("main b")).toHaveCount(0);
  const before = await records(page); expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  await expect(page.locator("input[readonly]")).toBeVisible();
  expect(await records(page)).toEqual(before); expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: value.name, exact: true }).click();
  const rows = page.locator("main ol > li");
  await expect(rows).toHaveCount(4); await expect(rows.nth(1).getByRole("link")).toHaveCount(0);
  await expect(rows.nth(2).getByRole("link")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await rows.first().getByRole("link", { name: "Read", exact: true }).click();
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  const saved = await records(page);
  expect(saved.values.lists).toMatchObject([{ entries: value.entries.map(typedEntry) }]);
  expect(JSON.stringify(saved.values.lists)).not.toContain("ಕನ್ನಡ ಓದು");
  expect(saved.values.personal).toEqual(before.values.personal);
});
test("unavailable catalog reports pending resolution until explicit retry without rewriting the supplied list", async ({ page }) => {
  await page.route("**/demo/latest.json", route => route.abort());
  const value: ListSnapshot = { ...snapshot, name: "Synthetic pending details", entries: [
    { kind: "item", videoId: "fixture-one" }, { kind: "item", videoId: "unknown_fixture" },
    { kind: "placeholder", text: "<b>Unchanged</b>" },
  ] };
  await upload(page, value);
  const preview = page.getByRole("region", { name: "List snapshot preview", exact: true });
  await expect(preview.getByText("Library details are not yet resolved.", { exact: false })).toHaveCount(2);
  await expect(preview.getByText("Lyrics unavailable in DaasaVaani.", { exact: true })).toHaveCount(1);
  const before = await records(page);
  await page.unroute("**/demo/latest.json");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(preview.getByText("In the available catalog.", { exact: false })).toHaveCount(1);
  await expect(preview.getByText("Library details are not yet resolved.", { exact: false })).toHaveCount(0);
  await expect(preview.getByText("Lyrics unavailable in DaasaVaani.", { exact: true })).toHaveCount(2);
  expect(await records(page)).toEqual(before);
  await expect(page.locator("main b")).toHaveCount(0);
});
test("list-origin reading and return retain chosen list, unsaved editor name, scroll and exact occurrence focus", async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 400 });
  const value: ListSnapshot = { ...snapshot, name: "Synthetic reading context", entries: [
    ...Array.from({ length: 12 }, (_, index) => ({ kind: "placeholder" as const, text: `Synthetic pause ${index}` })),
    { kind: "item", videoId: "fixture-one" },
  ] };
  await upload(page, value); await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: value.name, exact: true }).click();
  const rename = page.getByRole("form", { name: "Rename list", exact: true }).getByLabel("List name", { exact: true });
  await rename.fill("Unsaved list name");
  const read = page.locator("main ol > li").last().getByRole("link", { name: "Read", exact: true });
  await read.focus();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  const position = await page.evaluate(() => scrollY), before = await records(page);
  await read.press("Enter");
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to list", exact: false }).click();
  await expect(rename).toHaveValue("Unsaved list name"); await expect(read).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
  const after = await records(page), header = before.values.control?.[0];
  if (!header || typeof header !== "object" || !("revision" in header) || typeof header.revision !== "number") {
    throw new Error("Missing verified personal revision");
  }
  expect(after).toEqual({ ...before, values: { ...before.values,
    control: [{ ...header, revision: header.revision + 1 }],
    recentHistory: [{ id: "history", enabled: true, entries: [{ kind: "legacyVideo", videoId: "fixture-one" }] }],
  } });
  await page.goForward();
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(rename).toHaveValue("Unsaved list name"); await expect(read).toBeFocused();
  expect(await records(page)).toEqual(after);
});
test("reader adds repeated independent references only after explicit list selection and never copies catalog titles", async ({ page }) => {
  await page.goto("/#/lists"); await create(page, "Reader target");
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Reader target", exact: true })).toBeVisible();
  await page.goto("/#/item/fixture-one");
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  const form = page.getByRole("form", { name: "Add to a saved list", exact: true });
  const choice = form.getByLabel("Choose a saved list", { exact: true });
  const option = await choice.getByRole("option", { name: /^Reader target · / }).getAttribute("value");
  if (!option) throw new Error("Missing chosen saved-list identity");
  const before = await records(page);
  await expect(form.getByRole("button", { name: "Add this occurrence", exact: true })).toBeDisabled();
  await choice.selectOption(option); expect(await records(page)).toEqual(before);
  await form.getByRole("button", { name: "Add this occurrence", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("A new independent occurrence was added to the selected list.");
  await choice.selectOption(option);
  await form.getByRole("button", { name: "Add this occurrence", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("A new independent occurrence was added to the selected list.");
  const saved = await records(page);
  expect(saved.values.lists).toMatchObject([{ entries: [{ kind: "legacyVideo", videoId: "fixture-one" }, { kind: "legacyVideo", videoId: "fixture-one" }] }]);
  const ids = listIdentities(saved.values.lists); expect(ids).toHaveLength(3); expect(new Set(ids).size).toBe(3);
  expect(JSON.stringify(saved.values.lists)).not.toContain("ಕನ್ನಡ ಓದು");
  expect(saved.values.personal).toEqual(before.values.personal);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("reader list selection is revision-bound and an intervening tab mutation requires a new selection", async ({ page, context }) => {
  await page.goto("/#/lists"); await create(page, "Stale reader target");
  await expect(page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Stale reader target", exact: true })).toBeVisible();
  await page.goto("/#/item/fixture-one");
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  const form = page.getByRole("form", { name: "Add to a saved list", exact: true });
  const choice = form.getByLabel("Choose a saved list", { exact: true });
  const option = await choice.getByRole("option", { name: /^Stale reader target · / }).getAttribute("value");
  if (!option) throw new Error("Missing selected list");
  await choice.selectOption(option);
  const other = await context.newPage(); await other.goto("/#/lists"); await create(other, "Concurrent mutation");
  await expect(other.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Concurrent mutation", exact: true })).toBeVisible();
  const before = await records(page);
  await form.getByRole("button", { name: "Add this occurrence", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Personal data changed.");
  expect(await records(page)).toEqual(before);
  await expect(choice).toHaveValue("");
  await expect(choice).toBeFocused();
  await choice.selectOption(option);
  await form.getByRole("button", { name: "Add this occurrence", exact: true }).click();
  await expect(page.getByText("A new independent occurrence was added to the selected list.", { exact: true })).toBeVisible();
});
test("an export changed during encoding is refused until a fresh list selection", async ({ page, context }) => {
  await upload(page); await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  const choose = () => page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true }).click();
  await choose();
  const restoreWorker = await replaceWorkerScript(page, "list-transfer.worker", "self.onmessage = () => {};");
  const created = page.waitForEvent("worker");
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  const worker = await created;
  const other = await context.newPage(); await other.goto("/#/lists"); await create(other, "Concurrent change");
  await expect(other.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: "Concurrent change", exact: true })).toBeVisible();
  const changed = await records(page);
  await worker.evaluate(bytes => { setTimeout(() => self.postMessage({ result: { kind: "file", bytes: new Uint8Array(bytes) } }), 100); },
    [...gzipSync(JSON.stringify(snapshot))]);
  await expect(page.getByRole("alert")).toContainText("Personal data changed.");
  await expect(page.getByRole("link", { name: "Download list file", exact: true })).toHaveCount(0);
  expect(await records(page)).toEqual(changed);
  await restoreWorker(); await choose();
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  await expect(page.locator("input[readonly]")).toBeVisible();
  expect(await records(page)).toEqual(changed);
});
test("cancelling saved-list encoding terminates its worker and leaves all tables unchanged", async ({ page }) => {
  await upload(page); await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: snapshot.name, exact: true }).click();
  const before = await records(page);
  const restoreWorker = await replaceWorkerScript(page, "list-transfer.worker", "self.onmessage = () => {};");
  const created = page.waitForEvent("worker");
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  const worker = await created, closed = worker.waitForEvent("close");
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await closed;
  await expect(page.getByRole("link", { name: "Download list file", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download list file", exact: true })).toBeEnabled();
  expect(await records(page)).toEqual(before);
  await restoreWorker();
});
test("oversized saved links retain a lossless file fallback without database writes", async ({ page }) => {
  const large: ListSnapshot = { ...snapshot, name: "Large synthetic export", entries: Array.from({ length: 64 }, (_, index) => ({
    kind: "placeholder", text: Array.from({ length: 8 }, (_, part) => createHash("sha256").update(`${index}:${part}`).digest("hex")).join(""),
  })) };
  await upload(page, large); await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: large.name, exact: true }).click();
  const before = await records(page);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The complete link exceeds");
  await expect(page.locator("input[readonly]")).toHaveCount(0);
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"),
    page.getByRole("link", { name: "Download list file", exact: true }).click()]);
  const path = await download.path(); if (!path) throw new Error("Lossless fallback download did not complete");
  expect(JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"))).toEqual(storedSnapshot(large));
  expect(await records(page)).toEqual(before);
});
test("rename, independent duplication and confirmed deletion preserve unrelated lists", async ({ page }) => {
  await upload(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  const menu = page.getByRole("list", { name: "Lists", exact: true });
  await menu.getByRole("button", { name: snapshot.name, exact: true }).click();
  const rename = page.getByRole("form", { name: "Rename list", exact: true });
  await rename.getByLabel("List name", { exact: true }).fill("Renamed");
  await rename.getByRole("button", { name: "Rename list", exact: true }).click();
  await menu.getByRole("button", { name: "Renamed", exact: true }).click();
  await rename.getByLabel("List name", { exact: true }).fill("Copy");
  await page.getByRole("button", { name: "Duplicate list", exact: true }).click();
  await menu.getByRole("button", { name: "Copy", exact: true }).click();
  const before = await records(page);
  const ids = JSON.stringify(before.values.lists).match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g) ?? [];
  expect(ids).toHaveLength(8); expect(new Set(ids).size).toBe(8);
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await records(page)).toEqual(before);
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("button", { name: "Confirm list deletion", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Renamed", exact: true })).toBeVisible();
  expect((await records(page)).values.lists).toHaveLength(1);
});
test("maximum-length user names and text wrap; invalid name input is actionable and never mutates data", async ({ page }) => {
  const value: ListSnapshot = { ...snapshot, name: "N".repeat(maxName), entries: [{ kind: "placeholder", text: "P".repeat(maxText) }] };
  await upload(page, value);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await page.getByRole("link", { name: "View saved lists", exact: true }).click();
  await page.getByRole("list", { name: "Lists", exact: true }).getByRole("button", { name: value.name, exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const before = await records(page);
  const rename = page.getByRole("form", { name: "Rename list", exact: true });
  await rename.getByLabel("List name", { exact: true }).fill(value.name + "X");
  await rename.getByRole("button", { name: "Rename list", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("List name or entry is invalid");
  expect(await records(page)).toEqual(before);
});
test("v1 migration preserves favorites and preferences", async ({ page }) => {
  const value = { id: "personal", favorites: ["fixture_ref"], language: "kn", theme: "dark" };
  await seedLegacy(page, value);
  await page.goto("/#/lists");
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await expect(page.getByRole("heading", { name: "ಪಟ್ಟಿಗಳು", exact: true })).toBeVisible();
  const after = await records(page);
  expect(after.version).toBe(80);
  expect(after.values.personal).toEqual([{ ...value, favorites: [{ kind: "legacyVideo", videoId: "fixture_ref" }], ...readingDefaults }]);
  expect(after.values.lists).toEqual([]); expect(after.values.control).toHaveLength(1);
});
test("UUID-looking legacy favorites remain visible and removable without inferred lyric resolution or downloads", async ({ page }) => {
  const id = "abcdef01-2345-4678-9abc-def012345678", labels = messages.en, requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/library/lyrics/")) requests.push(request.url()); });
  await seedLegacy(page, { id: "personal", favorites: [id], language: "en", theme: "dark" });
  await page.goto("/#/favorites");
  const region = page.getByRole("region", { name: labels.legacyReference, exact: true });
  await expect(region.locator("code")).toHaveText(id);
  await expect(region.getByText(labels.lyricsUnavailable, { exact: true })).toBeVisible();
  await expect(region.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("region", { name: labels.ownerLyrics, exact: true })).toHaveCount(0);
  const before = await records(page);
  expect(before.values.personal).toMatchObject([{ favorites: [{ kind: "legacyVideo", videoId: id }] }]);
  await region.getByRole("button", { name: labels.removeFavorite, exact: true }).click();
  await expect(page.getByText(labels.emptyFavorites, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Favorites/, level: 1 })).toBeFocused();
  const after = await records(page);
  expect(after.values.personal).toMatchObject([{ favorites: [], language: "en", theme: "dark" }]);
  expect(after.values.lists).toEqual(before.values.lists); expect(requests).toEqual([]);
});
test("over-capacity legacy favorites refuse migration without partially upgrading any personal stores", async ({ page }) => {
  if (!("maxFavorites" in limits) || typeof limits.maxFavorites !== "number") throw new Error("Invalid configured favorite ceiling");
  const personal = { id: "personal", favorites: Array.from({ length: limits.maxFavorites + 1 },
    (_, index) => `synthetic_${index}`), language: "en", theme: "dark" };
  await seedLegacy(page, personal);
  const before = await records(page);
  await page.goto("/#/lists");
  await expect(page.getByRole("alert")).toContainText("Personal storage or collection limit reached");
  expect(await records(page)).toEqual(before); expect(before.version).toBe(10);
});
test("invalid legacy migration rolls back the schema and refuses personal writes", async ({ page }) => {
  const value = { id: "personal", favorites: ["duplicate", "duplicate"], language: "en", theme: "light" };
  await seedLegacy(page, value);
  const before = await records(page);
  await page.goto("/#/settings");
  await expect(page.getByRole("alert")).toContainText("Invalid personal database record");
  expect(await records(page)).toEqual(before);
  await page.getByLabel("Choose a list file").setInputFiles({ name: "synthetic.gz", mimeType: "application/gzip", buffer: gzipSync(JSON.stringify(snapshot)) });
  await expect(page.getByRole("heading", { name: snapshot.name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to My Library", exact: true })).toBeDisabled();
  expect(await records(page)).toEqual(before);
});
test("newer personal schemas are refused without deleting unfamiliar stores even when the fixture endpoint fails", async ({ page }) => {
  await seedLegacy(page, { id: "personal", favorites: [], language: "en", theme: "light" }, 90);
  const before = await records(page);
  await page.route("**/demo/latest.json", route => route.abort());
  await page.goto("/#/settings");
  await expect(page.getByRole("alert").filter({ hasText: "newer personal database schema" })).toHaveCount(1);
  expect(await records(page)).toEqual(before);
});
test("an already-open old client cannot commit a pending confirmation into a future schema", async ({ page }) => {
  await upload(page);
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByText("Saved as an independent local list.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save to My Library", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save with same name", exact: true })).toBeVisible();
  await page.evaluate(async name => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 90);
      request.onupgradeneeded = () => request.result.createObjectStore("future", { keyPath: "id" }).put({ id: "synthetic-future" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    database.close();
  }, databaseName);
  const before = await records(page);
  await page.getByRole("button", { name: "Save with same name", exact: true }).click();
  await expect(page.getByText("Personal storage failed. Try again; do not delete your data.", { exact: true })).toBeVisible();
  expect(await records(page)).toEqual(before);
});
test("a blocked non-destructive migration reports recovery and can retry after the old connection closes", async ({ page, context }) => {
  const value = { id: "personal", favorites: ["fixture_ref"], language: "en", theme: "dark" };
  await seedLegacy(page, value);
  const held = await page.evaluateHandle(async name => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }), databaseName);
  try {
    const app = await context.newPage(); await app.goto("/");
    await expect(app.getByRole("alert")).toContainText("Personal database upgrade is blocked");
    await held.evaluate(database => database.close());
    await app.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(app.getByRole("heading", { name: /^Library/, level: 1 })).toBeVisible();
    expect((await records(app)).values.personal).toEqual([{ ...value, favorites: [{ kind: "legacyVideo", videoId: "fixture_ref" }], ...readingDefaults }]);
  } finally { await held.evaluate(database => database.close()); await held.dispose(); }
});
test("the actual configured list-count ceiling accepts the last list then rejects limit plus one without mutation", async ({ page }) => {
  await page.goto("/#/lists");
  await expect(page.getByRole("heading", { name: "Lists", exact: true })).toBeVisible();
  await page.evaluate(async input => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(input.name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("lists", "readwrite");
        for (let position = 1; position < input.limit; position++) transaction.objectStore("lists").put({
          id: `00000000-0000-4000-8000-${position.toString(16).padStart(12, "0")}`, name: `Synthetic ${position}`, entries: [],
        });
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }, { name: databaseName, limit: maxLists });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lists", exact: true })).toBeVisible();
  await create(page, "Last permitted list");
  await expect(page.getByText("Saved as an independent local list.", { exact: true })).toBeVisible();
  const before = await records(page); expect(before.values.lists).toHaveLength(maxLists);
  await create(page, "One list too many");
  await expect(page.getByRole("alert")).toContainText("storage limit would be exceeded");
  expect(await records(page)).toEqual(before);
});
