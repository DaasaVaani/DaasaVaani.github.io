import { test, expect, type Page } from "@playwright/test";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { strictYaml } from "../../shared/tools/generate-catalog.mjs";
import { replaceWorkerScript } from "../worker-script";

const fixtures = JSON.parse(readFileSync(new URL("../../shared/fixtures/personal/list-transfer.json", import.meta.url), "utf8"));
const snapshot = fixtures.accepted[1].value;
const limits = strictYaml(readFileSync(new URL("../../shared/settings/personal-transfer.yml", import.meta.url), "utf8"));
if (!limits || typeof limits !== "object" || !("maxListEncodedBytes" in limits) ||
    typeof limits.maxListEncodedBytes !== "number") throw new Error("Invalid transfer test limits");
const encodedLimit = limits.maxListEncodedBytes;
const file = (buffer: Buffer) => ({ name: "untrusted.txt", mimeType: "text/plain", buffer });
async function records(page: Page) {
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).some(entry => entry.name))).toBe(true);
  return page.evaluate(async () => {
    const [entry] = await indexedDB.databases();
    if (!entry?.name) throw new Error("Personal database not initialized");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(entry.name!);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const values: Record<string, unknown[]> = {};
      for (const name of database.objectStoreNames) {
        values[name] = await new Promise<unknown[]>((resolve, reject) => {
          const request = database.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return values;
    } finally { database.close(); }
  });
}
test("worker preview preserves ordered plain text, exports a file/link and opens the static link entry", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "List snapshot preview" })).toBeVisible();
  const before = await records(page);
  await page.getByLabel("Choose a list file").setInputFiles(file(gzipSync(JSON.stringify(snapshot))));
  await expect(page.getByRole("heading", { level: 3 })).toContainText("Synthetic");
  await expect(page.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("listitem").nth(1)).toContainText("<b>Test only</b>");
  await expect(page.locator("main b")).toHaveCount(0);
  expect(requests.filter(url => url.endsWith(".json.gz"))).toHaveLength(1);
  expect(requests.some(url => url.includes("unknown_fixture") || url.includes("example.invalid"))).toBe(false);
  expect(await records(page)).toEqual(before);
  await page.getByRole("button", { name: "Download list file", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("link", { name: "Download list file", exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("List download did not complete");
  expect(JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"))).toEqual(snapshot);
  await page.getByRole("button", { name: "Create snapshot link", exact: true }).click();
  const output = page.locator("input[readonly]");
  await expect(output).toBeVisible();
  const url = new URL(await output.inputValue());
  expect(url.protocol).toBe("https:");
  expect(url.href.length).toBeLessThanOrEqual(2048);
  await page.goto(url.pathname + url.hash);
  await expect(page.getByRole("heading", { level: 3 })).toContainText("Synthetic");
  await expect(page.getByRole("listitem")).toHaveCount(4);
  expect(await records(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const notices = await page.request.get("/third-party-licenses.md");
  expect(notices.status()).toBe(200);
  expect(await notices.text()).toContain("pako");
  expect(await notices.text()).toContain("Unicode 16.0.0 personal-name data");
  expect(await notices.text()).not.toContain("unicode-case-folding");
  const workerNotice = await page.request.get("/pako-license.txt");
  expect(workerNotice.status()).toBe(200);
  expect(await workerNotice.text()).toContain("Copyright");
});
test("malformed, newer and oversized inputs show errors and leave personal data unchanged", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "List snapshot preview" })).toBeVisible();
  const before = await records(page);
  for (const buffer of [Buffer.from("not gzip"), gzipSync(JSON.stringify({ ...snapshot, formatVersion: 3 }))]) {
    await page.getByLabel("Choose a list file").setInputFiles(file(buffer));
    await expect(page.getByRole("alert")).toContainText("Invalid or unsupported");
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  }
  await page.getByLabel("Choose a list file").setInputFiles(file(Buffer.alloc(encodedLimit + 1)));
  await expect(page.getByRole("alert")).toContainText("byte limit");
  expect(await records(page)).toEqual(before);
  await page.getByLabel("List snapshot link", { exact: true }).fill("https://example.invalid/#/list/AAAA");
  await page.getByRole("button", { name: "Preview link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid or unsupported");
  expect(await records(page)).toEqual(before);
});
test("cancelling a pending worker terminates it without saving a preview", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "List snapshot preview" })).toBeVisible();
  const before = await records(page);
  const restoreWorker = await replaceWorkerScript(page, "list-transfer.worker", "self.onmessage = () => {};");
  const workerCreated = page.waitForEvent("worker");
  await page.getByLabel("Choose a list file").setInputFiles(file(gzipSync(JSON.stringify(snapshot))));
  const worker = await workerCreated;
  const closed = worker.waitForEvent("close");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await closed;
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  expect(await records(page)).toEqual(before);
  await restoreWorker();
});
test("list preview remains usable when the library endpoint is unavailable", async ({ page }) => {
  await page.route("**/demo/latest.json", route => route.abort());
  await page.goto("/#/settings");
  await expect(page.getByRole("alert")).toBeVisible();
  const before = await records(page);
  await page.getByLabel("Choose a list file").setInputFiles(file(gzipSync(JSON.stringify(snapshot))));
  await expect(page.getByRole("heading", { level: 3 })).toContainText("Synthetic");
  await expect(page.getByRole("listitem")).toHaveCount(4);
  expect(await records(page)).toEqual(before);
});
