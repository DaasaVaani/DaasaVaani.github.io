import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import webSchema from "../settings/web.schema.json" with { type: "json" };
import personalSchema from "../shared/schemas/personal-transfer-settings.schema.json" with { type: "json" };
import defaultsSchema from "../shared/schemas/ui-defaults.schema.json" with { type: "json" };
import { lyricFixture } from "./lyric-fixture";

const raw = strictYaml(readFileSync(new URL("../settings/web.yml", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: true }).compile<Pick<WebConfig, "lyricPreview" | "databaseName" | "readerFontSize" |
  "readerFontSizeMin" | "readerFontSizeMax" | "readerFontSizeStep" | "readerLineHeights" |
  "base" | "listLinkPath" | "appShell" | "themes">>(webSchema);
if (!validate(raw)) throw new Error("Invalid configured lyric browser settings");
export const config = raw;
const defaults = strictYaml(readFileSync(new URL("../shared/settings/defaults.yml", import.meta.url), "utf8"));
const validateDefaults = new Ajv2020({ strict: true }).compile<{
  readingDensity: WebConfig["defaultReadingDensity"]; uiLanguage: WebConfig["defaultUiLanguage"];
}>(defaultsSchema);
if (!validateDefaults(defaults)) throw new Error("Invalid portable reading defaults");
export const readingDefaults = { fontSize: config.readerFontSize, density: defaults.readingDensity };
export const defaultUiLanguage = defaults.uiLanguage;
const limits = strictYaml(readFileSync(new URL("../shared/settings/personal-transfer.yml", import.meta.url), "utf8"));
const validateLimits = new Ajv2020({ strict: true }).compile<Pick<PersonalLimits, "maxRecents" | "maxLearningLabels" | "maxFavorites">>(personalSchema);
if (!validateLimits(limits)) throw new Error("Invalid configured personal history limits");
export const maxRecents = limits.maxRecents;
export const maxLearningLabels = limits.maxLearningLabels, maxFavorites = limits.maxFavorites;
const base = new URL(".", config.lyricPreview.descriptorUrl);
export async function serveLyrics(page: Page, fixture = lyricFixture(), corrupt: () => boolean = () => false) {
  const requests: string[] = [];
  const first = fixture.manifest.catalog[0];
  if (!first) throw new Error("Missing synthetic first item");
  await page.route(base.href + "**", route => {
    const url = new URL(route.request().url()), key = url.pathname.slice(base.pathname.length);
    const bytes = fixture.files.get(key);
    if (!bytes) throw new Error("Unexpected synthetic lyric artifact request");
    requests.push(key);
    return route.fulfill({ body: corrupt() && key === first.item.path ? Buffer.from("corrupt") : bytes,
      contentType: key === "latest.json" ? "application/json" : "application/octet-stream",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
  });
  return requests;
}
export async function personalSnapshot(page: Page) {
  return page.evaluate(async databaseName => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = [...database.objectStoreNames], transaction = database.transaction(names, "readonly");
      return { version: database.version, schema: Object.fromEntries(names.map(name => {
        const store = transaction.objectStore(name);
        return [name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: [...store.indexNames] }];
      })), tables: Object.fromEntries(await Promise.all(names.map(async name => [name,
        await new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        })]))) };
    } finally { database.close(); }
  }, config.databaseName);
}
