import { describe, expect, test } from "vitest";
import { lyricLink } from "./LyricShare";

const id = "12345678-1234-4234-8234-123456789abc";
describe("public lyric links", () => {
  test("uses only the configured canonical base and exact lyric UUID", () => {
    for (const base of ["https://example.test/", "https://example.test/site/"]) {
      expect(lyricLink(id, base)).toBe(`${base}#/lyrics/${id}`);
      const url = new URL(lyricLink(id, base));
      expect(url.search).toBe("");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
    }
    expect(lyricLink(id, __WEB_CONFIG__.canonicalBaseUrl)).toBe(`${__WEB_CONFIG__.canonicalBaseUrl}#/lyrics/${id}`);
  });
  test("refuses legacy, malformed, noncanonical and path-injection identities", () => {
    for (const value of ["legacy-video", id.toUpperCase(), id.replace("-4234-", "-1234-"), "", `${id}/../other`,
      `${id}?private=1`, `${id}\n`, `${id}\r`]) {
      expect(() => lyricLink(value, "https://example.test/")).toThrow("Invalid lyric identity");
    }
  });
  test("refuses unsafe or ambiguous canonical bases instead of falling back to the current host", () => {
    for (const base of ["/", "http://example.test/", "https://user:password@example.test/", "https://example.test/?private=1",
      "https://example.test/#/settings", "https://example.test/site", "javascript:alert(1)"]) {
      expect(() => lyricLink(id, base)).toThrow();
    }
  });
});
