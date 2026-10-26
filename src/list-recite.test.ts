import { describe, expect, it } from "vitest";
import { sameRecitationList } from "./list-recite";
import type { ListRecord } from "./personal-model";

const id = "10000000-0000-4000-8000-000000000001";
const record: ListRecord = { id: "list", name: "  Literal list  ", entries: [
  { id: "one", kind: "lyric", lyricId: id, fallback: "  Exact fallback  " },
  { id: "two", kind: "lyric", lyricId: id },
  { id: "three", kind: "placeholder", text: "<b>Literal</b>" },
  { id: "four", kind: "placeholder", text: "<b>Literal</b>" },
] };
describe("an active Recite session's exact saved list", () => {
  it("accepts an independent equal value, not only the same object or property order", () => {
    const copy = structuredClone(record);
    copy.entries[0] = { fallback: "  Exact fallback  ", lyricId: id, kind: "lyric", id: "one" };
    expect(sameRecitationList(record, copy)).toBe(true);
    expect(sameRecitationList(record, record)).toBe(true);
  });
  it("refuses missing, deleted, renamed or replaced lists", () => {
    expect(sameRecitationList(record, undefined)).toBe(false);
    expect(sameRecitationList(record, { ...record, id: "another" })).toBe(false);
    expect(sameRecitationList(record, { ...record, name: record.name.trim() })).toBe(false);
    expect(sameRecitationList(record, { ...record, entries: record.entries.slice(1) })).toBe(false);
  });
  it("distinguishes consecutive repeated occurrences even when their text or reference matches", () => {
    const moved = structuredClone(record);
    [moved.entries[2], moved.entries[3]] = [moved.entries[3]!, moved.entries[2]!];
    expect(sameRecitationList(record, moved)).toBe(false);
    const replaced = structuredClone(record);
    replaced.entries[1] = { ...replaced.entries[1]!, id: "replacement" };
    expect(sameRecitationList(record, replaced)).toBe(false);
  });
  it("preserves typed identity without inferring UUID-looking legacy matches", () => {
    const legacy = structuredClone(record);
    legacy.entries[0] = { id: "one", kind: "legacyVideo", videoId: id, fallback: "  Exact fallback  " };
    expect(sameRecitationList(record, legacy)).toBe(false);
  });
  it("compares raw placeholder and fallback text, including absence, without normalizing user data", () => {
    for (const entry of [
      { id: "one", kind: "lyric" as const, lyricId: id },
      { id: "one", kind: "lyric" as const, lyricId: id, fallback: "Exact fallback" },
    ]) expect(sameRecitationList(record, { ...record, entries: [entry, ...record.entries.slice(1)] })).toBe(false);
    const changed = structuredClone(record);
    changed.entries[2] = { id: "three", kind: "placeholder", text: "Literal" };
    expect(sameRecitationList(record, changed)).toBe(false);
  });
  it("handles empty lists without inventing an occurrence", () => {
    expect(sameRecitationList({ id: "empty", name: "Empty", entries: [] },
      { name: "Empty", entries: [], id: "empty" })).toBe(true);
  });
});
