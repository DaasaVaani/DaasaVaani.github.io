import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import { validateWebSettings } from "../tools/validate-web-settings";

const original: unknown = strictYaml(readFileSync(new URL("../settings/web.yml", import.meta.url), "utf8"));
validateWebSettings(original);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected settings object");
  return Object.fromEntries(Object.entries(value));
}
function change(path: string[], value: unknown, remove = false): unknown {
  const root = object(structuredClone(original));
  let parent = root;
  for (const part of path.slice(0, -1)) {
    const child = object(parent[part]);
    parent[part] = child;
    parent = child;
  }
  const key = path.at(-1);
  if (!key) throw new Error("Missing settings path");
  if (remove) delete parent[key];
  else parent[key] = value;
  return root;
}
function paths(value: unknown, prefix: string[] = []): string[][] {
  return Object.entries(object(value)).flatMap(([key, child]) => {
    const path = [...prefix, key];
    return child && typeof child === "object" && !Array.isArray(child) ? [path, ...paths(child, path)] : [path];
  });
}

describe("owned web settings admission", () => {
  test("accepts the complete current settings without mutation or adding defaults", () => {
    const candidate: unknown = structuredClone(original);
    validateWebSettings(candidate);
    expect(candidate).toEqual(original);
    expect(candidate).not.toHaveProperty("defaultTheme");
    for (const base of ["/", "/site/"]) validateWebSettings(change(["base"], base));
  });
  test("every current root and nested field is mandatory; no silent fallback", () => {
    for (const path of paths(original)) {
      expect(() => validateWebSettings(change(path, undefined, true)), path.join(".")).toThrow("Invalid web settings");
    }
  });
  test("every settings object rejects unknown fields and null replacements", () => {
    expect(() => validateWebSettings(change(["unknown"], true))).toThrow("Invalid web settings");
    for (const path of paths(original)) {
      expect(() => validateWebSettings(change(path, null)), path.join(".")).toThrow("Invalid web settings");
      let value: unknown = original;
      for (const part of path) value = object(value)[part];
      if (value && typeof value === "object") {
        expect(() => validateWebSettings(change([...path, "unknown"], true)), path.join(".")).toThrow("Invalid web settings");
      }
    }
  });
  test("fixture endpoint remains a dedicated absolute local path, not real content or arbitrary URLs", () => {
    for (const address of ["/demo/latest.json", "/site/demo/latest.json"]) {
      validateWebSettings(change(["descriptorUrl"], address));
    }
    for (const address of ["https://example.test/demo/latest.json", "//example.test/demo/latest.json",
      "demo/latest.json", "/latest.json", "/demo/../latest.json", "/demo/%2e%2e/latest.json",
      "/demo/latest.json?", "/demo/latest.json#", "/demo/latest.json?x=1", "/demo\\latest.json",
      "/demo/latest.json\n", "/demo/latest.json\r"]) {
      expect(() => validateWebSettings(change(["descriptorUrl"], address)), address).toThrow("Invalid web settings");
    }
  });
  test("public endpoints refuse credentials normalization query fragments and unsafe transport", () => {
    for (const path of [["canonicalBaseUrl"], ["lyricPreview", "descriptorUrl"]]) {
      const suffix = path.length === 1 ? "/" : "/lyrics/latest.json";
      for (const host of ["http://example.test", "https://user:synthetic@example.test",
        "https://EXAMPLE.test", "https://example.test:443", "https://example.test\\unsafe"]) {
        expect(() => validateWebSettings(change(path, host + suffix))).toThrow();
      }
      for (const tail of ["?", "#", "?x=1", "#fragment"]) {
        expect(() => validateWebSettings(change(path, "https://example.test" + suffix + tail))).toThrow();
      }
      validateWebSettings(change(path, "https://example.test" + suffix));
      validateWebSettings(change(path, "https://example.test/site" + suffix));
    }
  });
  test("configured integer budgets reject fractional nonfinite and one-below/above schema bounds", () => {
    for (const [path, min, max] of [
      [["lyricPreview", "pageSize"], 1, 1000],
      [["lyricPreview", "maxItems"], 1, 100000],
      [["lyricPreview", "maxEncodedBytes"], 1, Number.MAX_SAFE_INTEGER],
      [["lyricPreview", "maxDecodedBytes"], 1, Number.MAX_SAFE_INTEGER],
      [["lyricPreview", "concurrentRequests"], 1, 32],
      [["transferChunkBytes"], 1, 1048576],
      [["listCompressionLevel"], 0, 9],
      [["demoPort"], 1024, 65535],
      [["appShell", "maxPrecacheBytes"], 1, 67108864],
      [["appShell", "updateCheckIntervalMs"], 1000, 2147483647],
    ] as const) {
      for (const value of [min, max]) validateWebSettings(change([...path], value));
      for (const value of [min - 1, max + 1, min + 0.5, NaN, Infinity, String(min)]) {
        expect(() => validateWebSettings(change([...path], value)), path.join(".")).toThrow("Invalid web settings");
      }
    }
  });
  test("reader bounds step and density order reject schema-valid inconsistencies", () => {
    for (const [path, value] of [
      [["readerFontSizeMin"], 30], [["readerFontSizeMax"], 26], [["readerLineHeights", "compact"], 2.3],
      [["readerLineHeights", "relaxed"], 2.3],
    ] as const) {
      expect(() => validateWebSettings(change([...path], value))).toThrow("Inconsistent reader");
    }
    const candidate = object(change(["readerFontSizeMin"], 18));
    candidate.readerFontSizeStep = 64;
    expect(() => validateWebSettings(candidate)).toThrow("Inconsistent reader");
    candidate.readerFontSizeStep = 2;
    candidate.readerFontSize = 16;
    expect(() => validateWebSettings(candidate)).toThrow("Inconsistent reader");
  });
});
