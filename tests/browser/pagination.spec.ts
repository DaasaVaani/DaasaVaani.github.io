import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../../shared/tools/generate-catalog.mjs";
import schema from "../../shared/schemas/search-policy.schema.json" with { type: "json" };
import type { Descriptor, FixtureItem, Manifest, SearchIndex, SearchPolicy } from "../../shared/types/publication";
import { replaceWorkerScript } from "../worker-script";

const raw = strictYaml(readFileSync(new URL("../../shared/settings/search.yml", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: true }).compile<SearchPolicy>(schema);
if (!validate(raw)) throw new Error("Invalid configured pagination policy");
const policy = raw, total = policy.pageSize * 2 + 1;
const web = strictYaml(readFileSync(new URL("../../settings/web.yml", import.meta.url), "utf8"));
if (!web || typeof web !== "object" || !("databaseName" in web) || typeof web.databaseName !== "string") {
  throw new Error("Invalid pagination test database configuration");
}
const databaseName = web.databaseName;
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, sorted(entry)]));
  return value;
}
async function syntheticPublication(page: Page) {
  const bytes = new Map<string, Buffer>();
  function artifact(value: unknown) {
    const decoded = Buffer.from(JSON.stringify(sorted(value))), encoded = gzipSync(decoded);
    const sha256 = createHash("sha256").update(encoded).digest("hex"), path = `objects/${sha256}.json.gz`;
    bytes.set(path, encoded);
    return { path, sha256, encodedBytes: encoded.length, decodedBytes: decoded.length };
  }
  const manifest: Manifest = { formatVersion: 1, fixture: true, requiredCapabilities: ["fixture-catalog-v1"],
    catalog: [], objects: {}, items: {}, named: { policy: "", index: "" } };
  function object(value: unknown, role: "policy" | "item" | "index") {
    const ref = artifact(value);
    manifest.objects[ref.sha256] = { path: ref.path, encodedBytes: ref.encodedBytes, decodedBytes: ref.decodedBytes, role };
    return ref.sha256;
  }
  manifest.named.policy = object(policy, "policy");
  const index: SearchIndex = { formatVersion: 1, policyHash: manifest.named.policy, tokens: [], postings: {} };
  for (let position = 0; position < total; position++) {
    const id = `synthetic-${String(position).padStart(3, "0")}`;
    const item: FixtureItem = { formatVersion: 1, fixture: true, videoId: id, title: `Synthetic needle ${position}`,
      tags: ["synthetic"], description: "Pagination fixture only; not a song or verified video.",
      lines: [{ id: `00000000-0000-4000-8000-${(position + 1).toString(16).padStart(12, "0")}`, text: "ರಾಮ ಕೃಷ್ಣ" }] };
    manifest.items[id] = object(item, "item");
    manifest.catalog.push({ videoId: id, title: item.title, description: item.description, tags: item.tags });
    index.tokens.push({ value: "needle", itemId: id, field: "title" });
  }
  const letters = [..."needle"];
  for (let size = 1; size <= 3; size++) {
    const counts = new Map<string, number>();
    for (let offset = 0; offset + size <= letters.length; offset++) {
      const gram = letters.slice(offset, offset + size).join("");
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
    for (const [gram, count] of counts) index.postings[`${size}:${gram}`] = index.tokens.map((_, id): [number, number] => [id, count]);
  }
  manifest.named.index = object(index, "index");
  const descriptor: Descriptor = { formatVersion: 1, fixture: true, manifest: artifact(manifest) };
  await page.route("**/demo/latest.json", route => route.fulfill({ json: descriptor }));
  await page.route("**/demo/objects/*.json.gz", route => {
    const pathname = new URL(route.request().url()).pathname, value = bytes.get(pathname.slice(pathname.indexOf("objects/")));
    if (!value) throw new Error("Unexpected synthetic artifact request");
    return route.fulfill({ body: value, contentType: "application/octet-stream" });
  });
}
test("configured result pages expose every ranked hit and retain pagination through reading and history", async ({ page }) => {
  await syntheticPublication(page); await page.goto("/");
  await page.getByRole("button", { name: "Load search", exact: false }).click();
  const query = page.getByRole("searchbox"), cards = page.getByRole("article");
  await query.fill("needle");
  await expect(cards).toHaveCount(policy.pageSize);
  await expect(page.getByRole("status")).toHaveText(`Showing ${policy.pageSize} of ${total}`);
  const more = page.getByRole("button", { name: "Show more results", exact: true });
  await more.click();
  await expect(cards).toHaveCount(policy.pageSize * 2);
  const newlyRevealed = cards.nth(policy.pageSize).getByRole("link", { name: "Read", exact: true });
  await expect(newlyRevealed).toBeFocused(); await newlyRevealed.click();
  await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  await page.goBack(); await expect(query).toHaveValue("needle");
  await expect(cards).toHaveCount(policy.pageSize * 2); await expect(newlyRevealed).toBeFocused();
  await page.goForward(); await expect(page.getByText("ರಾಮ ಕೃಷ್ಣ", { exact: true })).toBeVisible();
  await page.goBack(); await expect(cards).toHaveCount(policy.pageSize * 2);
  await more.click(); await expect(cards).toHaveCount(total);
  await expect(cards.last().getByRole("link", { name: "Read", exact: true })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(`Showing ${total} of ${total}`);
  await expect(more).toHaveCount(0);
  await query.fill("notfound"); await expect(cards).toHaveCount(0);
  await query.fill("needle"); await expect(cards).toHaveCount(policy.pageSize);
  await more.focus(); await more.press("Enter");
  await expect(cards).toHaveCount(policy.pageSize * 2); await expect(newlyRevealed).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("favorites have independent complete pagination and clearing the query resets the page", async ({ page }) => {
  await syntheticPublication(page);
  await page.route("**/pagination-fixture-seed", route => route.fulfill({ contentType: "text/html",
    body: "<!doctype html><title>Synthetic pagination seed</title>" }));
  await page.goto("/pagination-fixture-seed");
  await page.evaluate(async input => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(input.name, 10);
      request.onupgradeneeded = () => request.result.createObjectStore("personal", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("personal", "readwrite");
        transaction.objectStore("personal").put({ id: "personal", language: "en", theme: "light",
        favorites: Array.from({ length: input.total }, (_, index) => `synthetic-${String(index).padStart(3, "0")}`) });
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }, { name: databaseName, total });
  await page.goto("/#/favorites");
  await page.getByRole("button", { name: "Load search", exact: false }).click();
  const query = page.getByRole("searchbox"), cards = page.getByRole("article");
  await query.fill("needle"); await expect(cards).toHaveCount(policy.pageSize);
  await page.getByRole("button", { name: "Show more results", exact: true }).click();
  await expect(cards).toHaveCount(policy.pageSize * 2);
  await query.fill(""); await expect(cards).toHaveCount(policy.pageSize);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Load search", exact: false }).click();
  await query.fill("needle"); await expect(cards).toHaveCount(policy.pageSize);
  await page.getByRole("link", { name: "Favorites", exact: true }).click();
  await expect(query).toHaveValue(""); await expect(cards).toHaveCount(policy.pageSize);
});
test("search worker failure removes stale pages without claiming no matches and a fresh query recovers", async ({ page }) => {
  await syntheticPublication(page); await page.goto("/");
  await page.getByRole("button", { name: "Load search", exact: false }).click();
  const query = page.getByRole("searchbox"), cards = page.getByRole("article");
  await query.fill("needle"); await expect(cards).toHaveCount(policy.pageSize);
  await page.getByRole("button", { name: "Show more results", exact: true }).click();
  await expect(cards).toHaveCount(policy.pageSize * 2);
  const restoreWorker = await replaceWorkerScript(page, "search.worker", 'throw new Error("Synthetic pagination worker failure");');
  await query.fill("needles");
  await expect(page.getByRole("alert")).toContainText("Synthetic pagination worker failure");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("No matching records. Try another word.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show more results", exact: true })).toHaveCount(0);
  await restoreWorker();
  await query.fill("needle"); await expect(cards).toHaveCount(policy.pageSize);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
