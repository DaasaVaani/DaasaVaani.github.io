import { expect, test } from "vitest";
import { Publication } from "./artifacts";
import type { Manifest } from "../shared/types/publication";

test("catalog details are exact identifier lookups and preserve metadata independently from user text without requesting lyrics", () => {
  const catalog = [
    { videoId: "known", title: "Synthetic title", tags: [] },
    { videoId: "constructor", title: "Synthetic reserved name", tags: [] },
  ];
  const manifest: Manifest = { formatVersion: 1, fixture: true, requiredCapabilities: ["fixture-catalog-v1"],
    catalog, objects: {}, items: {}, named: { index: "", policy: "" } };
  const publication = new Publication(new URL("https://example.invalid/"), manifest);
  expect(publication.summary("known")).toBe(catalog[0]);
  expect(publication.summary("constructor")).toBe(catalog[1]);
  expect(publication.summary("KNOWN")).toBeUndefined();
  expect(publication.summary("unknown")).toBeUndefined();
  expect(publication.summary("__proto__")).toBeUndefined();
  expect(catalog).toEqual(manifest.catalog);
});
