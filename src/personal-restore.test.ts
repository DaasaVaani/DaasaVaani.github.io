import { expect, test } from "vitest";
import {
  defaultHistory, defaultPersonal, newControl, newList, PersonalError, replacePersonalContents, saveRecord,
  storageBytes, validateStore, type PersonalContents, type PersonalStore,
} from "./personal-model";

const initial = (): PersonalStore => ({ control: newControl(), personal: defaultPersonal(), lists: [],
  history: defaultHistory(), learning: { entries: [] }, recitation: { position: null } });
function contents(): PersonalContents {
  const lyric = { kind: "lyric" as const, lyricId: crypto.randomUUID() };
  const legacy = { kind: "legacyVideo" as const, videoId: lyric.lyricId };
  const list = newList({ format: "daasavaani-list", formatVersion: 2, name: "  Raw replacement  ",
    entries: [lyric, lyric, { kind: "placeholder", text: "  <b>literal</b>  " }] });
  return { personal: { ...defaultPersonal(), language: "kn", theme: "warm", fontSize: 42, density: "relaxed", favorites: [legacy, lyric] },
    lists: [list], history: { enabled: false, entries: [lyric, legacy] },
    learning: { entries: [{ ...legacy, label: "practising" }, { ...lyric, label: "wantToLearn" }] },
    recitation: { position: { listId: list.id, entryId: list.entries[1]!.id } } };
}
function refuses(action: () => unknown, code: string) {
  expect(action).toThrow(PersonalError);
  try { action(); } catch (reason) { expect(reason).toMatchObject({ code }); }
}
test("confirmed replacement copies the complete allowlist without merging or importing writer fences", () => {
  const state = initial(), candidate = contents(), before = structuredClone({ state, candidate });
  const next = replacePersonalContents(state, candidate, state.control);
  expect(next).toEqual({ ...candidate, control: next.control });
  expect(next.control).toMatchObject({ formatVersion: 8, revision: 0 });
  expect(next.control.epoch).not.toBe(state.control.epoch);
  expect(next.lists).not.toBe(candidate.lists); expect(next.personal).not.toBe(candidate.personal);
  candidate.lists[0]!.name = "Mutated after selection";
  expect(next.lists).toEqual(before.candidate.lists);
  expect(state).toEqual(before.state);
  const foreign = Object.assign(contents(), { control: state.control, cache: "not personal data" });
  const restored = replacePersonalContents(state, foreign, state.control);
  expect(restored).not.toHaveProperty("cache");
  expect(restored.control.epoch).not.toBe(foreign.control.epoch);
});
test("old preview revisions and epochs are refused, and a completed replacement fences every old writer", () => {
  const state = initial(), candidate = contents();
  refuses(() => replacePersonalContents(state, candidate, { ...state.control, revision: state.control.revision + 1 }), "stale");
  refuses(() => replacePersonalContents(state, candidate, { ...state.control, epoch: crypto.randomUUID() }), "stale");
  const next = replacePersonalContents(state, candidate, state.control);
  refuses(() => saveRecord(next, next.lists[0]!, state.control, true), "stale");
  refuses(() => replacePersonalContents(next, candidate, state.control), "stale");
  const exhausted = { ...state, control: { ...state.control, revision: Number.MAX_SAFE_INTEGER } };
  expect(replacePersonalContents(exhausted, candidate, exhausted.control).control.revision).toBe(0);
});
test("replacement preserves unset preferences, duplicate raw names and valid unresolved positions without repair guesses", () => {
  const state = initial(), candidate = contents(), first = candidate.lists[0]!;
  const second = newList({ format: "daasavaani-list", formatVersion: 2, name: first.name, entries: [] });
  const proposed: PersonalContents = { ...candidate, personal: undefined, lists: [first, second],
    recitation: { position: { listId: crypto.randomUUID(), entryId: crypto.randomUUID() } } };
  const next = replacePersonalContents(state, proposed, state.control);
  expect(next.personal).toBeUndefined();
  expect(next.lists).toEqual([first, second]); expect(next.recitation).toEqual(proposed.recitation);
  expect(() => validateStore(next)).not.toThrow();
});
test("all malformed collections and full prospective byte admission fail without changing current or candidate data", () => {
  const state = initial(), candidate = contents(), before = structuredClone({ state, candidate });
  const bytes = storageBytes(replacePersonalContents(state, candidate, state.control));
  expect(() => replacePersonalContents(state, candidate, state.control,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
  refuses(() => replacePersonalContents(state, candidate, state.control,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
  const invalid = structuredClone(candidate);
  invalid.lists[0]!.entries[1]!.id = invalid.lists[0]!.entries[0]!.id;
  refuses(() => replacePersonalContents(state, invalid, state.control), "invalid");
  refuses(() => replacePersonalContents(state, { ...candidate, history: { enabled: true, entries: [...candidate.history.entries, ...candidate.history.entries] } },
    state.control), "invalid");
  expect({ state, candidate }).toEqual(before);
});
