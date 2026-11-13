import Ajv2020 from "ajv/dist/2020.js";
import schema from "../settings/web.schema.json" with { type: "json" };

export type WebSettings = Omit<WebConfig, "defaultUiLanguage" | "defaultTheme" | "defaultRecentHistoryEnabled" |
  "defaultReadingDensity" | "readingDensities" | "uiLanguages" | "uiThemes" | "maxFavorites">;
const validate = new Ajv2020({ strict: true }).compile<WebSettings>(schema);

export function validateWebSettings(value: unknown): asserts value is WebSettings {
  if (!validate(value)) throw new Error("Invalid web settings: " + JSON.stringify(validate.errors));
  if (new URL(value.descriptorUrl, "http://localhost").pathname !== value.descriptorUrl) {
    throw new Error("Invalid web settings: fixture descriptor path must not require URL normalization");
  }
  if (value.readerFontSizeMin >= value.readerFontSizeMax || value.readerFontSize < value.readerFontSizeMin ||
      value.readerFontSize > value.readerFontSizeMax ||
      value.readerFontSizeStep > value.readerFontSizeMax - value.readerFontSizeMin ||
      value.readerLineHeights.compact >= value.readerLineHeights.normal ||
      value.readerLineHeights.normal >= value.readerLineHeights.relaxed) {
    throw new Error("Inconsistent reader font bounds, step or density line heights");
  }
  for (const [name, address] of [
    ["canonical Website", value.canonicalBaseUrl], ["lyric preview", value.lyricPreview.descriptorUrl],
  ]) {
    if (!address) throw new Error("Missing web endpoint");
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username || url.password || url.href !== address ||
        address.includes("?") || address.includes("#")) {
      throw new Error(`Invalid ${name} URL`);
    }
  }
}
