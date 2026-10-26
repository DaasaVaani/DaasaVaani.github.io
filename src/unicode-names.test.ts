import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import vectors from "../shared/fixtures/unicode-name-matching.json";
import { verifyUnicodeResources } from "../tools/unicode-resources";
import { unicodeFullCaseFold, unicodeNameKey, unicodeNameProfile, unicodeNfc, unicodeNfd } from "./unicode-names";
import { defaultHistory, defaultPersonal, newControl, newList, parseStore, PersonalError, saveRecord, type PersonalStore } from "./personal-model";

const string = (values: readonly number[]) => values.map(cp => String.fromCodePoint(cp)).join("");
test.each(vectors.vectors)("official shared name vector: $id", vector => {
  const text = string(vector.input);
  expect(unicodeNameProfile).toBe(vectors.profile);
  expect(unicodeNfc(text)).toBe(string(vector.nfc));
  expect(unicodeNfd(text)).toBe(string(vector.nfd));
  expect(unicodeFullCaseFold(text)).toBe(string(vector.fold));
  expect(unicodeNameKey(text)).toBe(string(vector.key));
});
test("all shared comparisons and invalid UTF16 units use the actual adapter", () => {
  for (const pair of vectors.comparisons) expect(unicodeNameKey(string(pair.left)) === unicodeNameKey(string(pair.right))).toBe(pair.equal);
  for (const units of vectors.invalidUtf16) {
    const input = units.map(unit => String.fromCharCode(unit)).join("");
    for (const operation of [unicodeNfc, unicodeNfd, unicodeFullCaseFold, unicodeNameKey]) expect(() => operation(input)).toThrow("Unicode scalar string");
  }
});
test("name keys do not invoke host normalization", () => {
  const host = vi.spyOn(String.prototype, "normalize").mockImplementation(() => { throw new Error("Host normalization is forbidden"); });
  let actual: string | undefined;
  try { actual = unicodeNameKey("CAFE\u0301"); }
  finally { host.mockRestore(); }
  expect(actual).toBe("caf\u00e9");
});
test("build verification checks the exact table, vectors, settings and distributed license", () => {
  expect(() => verifyUnicodeResources()).not.toThrow();
  for (const name of ["unicode16.json", "unicode-name-matching.json", "LICENSE.txt", "unicode.yml"]) {
    expect(() => verifyUnicodeResources(url => {
      const bytes = readFileSync(url);
      return url.pathname.endsWith("/" + name) ? Buffer.concat([bytes, Buffer.from("!")]) : bytes;
    })).toThrow();
  }
});
test("the adapter passes all official Unicode16 normalization equations", () => {
  const text = readFileSync(new URL("../shared/resources/unicode16/NormalizationTest.txt", import.meta.url), "utf8");
  const convert = (column: string) => string(column.trim().split(/\s+/).filter(Boolean).map(value => parseInt(value, 16)));
  let rows = 0;
  for (const raw of text.split("\n")) {
    const body = raw.split("#")[0]?.trim();
    if (!body || body.startsWith("@")) continue;
    const [a, b, c, d, e] = body.split(";").slice(0, 5).map(convert);
    if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined) throw new Error("Invalid official normalization row");
    for (const input of [a, b, c]) { expect(unicodeNfc(input)).toBe(b); expect(unicodeNfd(input)).toBe(c); }
    for (const input of [d, e]) { expect(unicodeNfc(input)).toBe(d); expect(unicodeNfd(input)).toBe(e); }
    rows++;
  }
  expect(rows).toBe(19965);
}, 30000);
test("full folding covers every scalar against official C/F mappings, not the removed package or host", () => {
  const expected = new Map<number, string>();
  const text = readFileSync(new URL("../shared/resources/unicode16/CaseFolding.txt", import.meta.url), "utf8");
  for (const row of text.split("\n")) {
    const [source, status, mapping] = row.split("#")[0]?.split(";").map(value => value.trim()) ?? [];
    if (source && (status === "C" || status === "F") && mapping) expected.set(parseInt(source, 16), string(mapping.split(/\s+/).map(value => parseInt(value, 16))));
  }
  let count = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const input = String.fromCodePoint(cp), actual = unicodeFullCaseFold(input);
    if (actual !== (expected.get(cp) ?? input)) throw new Error("Folding mismatch at U+" + cp.toString(16));
    count++;
  }
  expect(count).toBe(1112064);
}, 30000);
test("on-demand profile adoption preserves newly equal and formerly equal raw names and all identities", () => {
  const names = [String.fromCodePoint(0x105c9), String.fromCodePoint(0x105d2, 0x307), String.fromCodePoint(122773), "ss"];
  const lists = names.map(name => newList({ format: "daasavaani-list", formatVersion: 1, name, entries: [
    { kind: "placeholder", text: "  Synthetic preserved text  " },
  ] }));
  const state: PersonalStore = { control: newControl(), personal: defaultPersonal(), lists, history: defaultHistory(), learning: { entries: [] },
    recitation: { position: null } }, before = structuredClone(state);
  expect(parseStore([state.control], [state.personal], lists, [{ id: "history", ...state.history }],
    [{ id: "learning", ...state.learning }], [{ id: "recitation", ...state.recitation }])).toEqual(before);
  const [first, second, split] = names;
  if (first === undefined || second === undefined || split === undefined) throw new Error("Missing name fixtures");
  expect(unicodeNameKey(first)).toBe(unicodeNameKey(second));
  expect(unicodeNameKey(split)).not.toBe(unicodeNameKey("ss"));
  const existing = lists[0];
  if (!existing) throw new Error("Missing independent list");
  const edited = saveRecord(state, existing, state.control, true);
  expect(edited.lists).toEqual(before.lists);
  const another = newList({ format: "daasavaani-list", formatVersion: 1, name: existing.name, entries: [] });
  try { saveRecord(state, another, state.control, false); throw new Error("Expected explicit duplicate confirmation"); }
  catch (reason) { expect(reason).toBeInstanceOf(PersonalError); if (reason instanceof PersonalError) expect(reason.code).toBe("duplicate"); }
  const confirmed = saveRecord(state, another, state.control, false, true);
  expect(confirmed.lists.slice(0, lists.length)).toEqual(before.lists);
  expect(confirmed.lists.at(-1)?.id).not.toBe(existing.id);
  expect(state).toEqual(before);
});
