import { expect, test } from "vitest";
import fixtures from "../shared/fixtures/personal/learning-labels.json";
import {
  defaultHistory, defaultPersonal, jsonBytes, learningChoices, learningLabelFor, listSnapshot, migrateStoreV6,
  newControl, newList, parseStore, PersonalError, saveLearningLabel, storageBytes, validateLearning, validateStore,
  type LearningLabelsV1, type PersonalStore,
} from "./personal-model";
import type { PersonalReference } from "./list-transfer-types";

const id = "00000000-0000-4000-8000-000000000001";
const lyric: PersonalReference = { kind: "lyric", lyricId: id }, legacy: PersonalReference = { kind: "legacyVideo", videoId: id };
const empty = (): PersonalStore => ({ control: newControl(), lists: [], history: defaultHistory(), learning: { entries: [] }, recitation: { position: null } });
function refuses(action: () => unknown, code: string) {
  expect(action).toThrow(PersonalError);
  try { action(); } catch (reason) { expect(reason).toMatchObject({ code }); }
}
test("Shared learning vectors have strict shapes and linear typed identity uniqueness without mutating data", () => {
  for (const fixture of fixtures.accepted) {
    const before = structuredClone(fixture.value);
    expect(() => validateLearning(fixture.value)).not.toThrow();
    expect(fixture.value).toEqual(before);
  }
  for (const fixture of [...fixtures.rejected, ...fixtures.rejectedSemantic]) refuses(() => validateLearning(fixture.value), "invalid");
  refuses(() => validateLearning({ entries: new Array(1) }), "invalid");
});
test("all self-assigned states retain assignment order, distinct identities and no-op identity", () => {
  const initial = empty(), before = structuredClone(initial);
  expect(saveLearningLabel(initial, lyric, undefined, initial.control)).toBe(initial);
  const one = saveLearningLabel(initial, lyric, "wantToLearn", initial.control);
  const two = saveLearningLabel(one, legacy, "practising", one.control);
  expect(two.learning.entries).toEqual([{ ...lyric, label: "wantToLearn" }, { ...legacy, label: "practising" }]);
  for (const label of learningChoices) {
    const changed = saveLearningLabel(two, lyric, label, two.control);
    expect(changed.learning.entries).toEqual([{ ...lyric, label }, { ...legacy, label: "practising" }]);
    expect(learningLabelFor(changed.learning, lyric)).toBe(label);
    expect(saveLearningLabel(changed, lyric, label, changed.control)).toBe(changed);
    expect(changed.personal).toBe(two.personal); expect(changed.lists).toBe(two.lists); expect(changed.history).toBe(two.history);
  }
  const cleared = saveLearningLabel(two, lyric, undefined, two.control);
  expect(cleared.learning.entries).toEqual([{ ...legacy, label: "practising" }]);
  expect(saveLearningLabel(cleared, lyric, undefined, cleared.control)).toBe(cleared);
  refuses(() => saveLearningLabel(two, lyric, "comfortableReciting", initial.control), "stale");
  expect(initial).toEqual(before);
});
test("actual configured label limit, full prospective byte ceiling and revision fence never trim or partially mutate", () => {
  const entries: LearningLabelsV1["entries"] = Array.from({ length: __PERSONAL_LIMITS__.maxLearningLabels }, (_, index) =>
    ({ kind: "legacyVideo", videoId: `synthetic-${index}`, label: "wantToLearn" }));
  const state = { ...empty(), learning: { entries } }, before = structuredClone(state);
  expect(() => validateStore(state)).not.toThrow();
  refuses(() => saveLearningLabel(state, lyric, "practising", state.control), "capacity");
  const replaced = saveLearningLabel(state, entries[0]!.kind === "legacyVideo"
    ? { kind: "legacyVideo", videoId: entries[0]!.videoId } : lyric, "practising", state.control);
  expect(replaced.learning.entries).toHaveLength(__PERSONAL_LIMITS__.maxLearningLabels);
  const initial = empty(), next = saveLearningLabel(initial, lyric, "wantToLearn", initial.control), bytes = storageBytes(next);
  expect(saveLearningLabel(initial, lyric, "wantToLearn", initial.control,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).toEqual(next);
  refuses(() => saveLearningLabel(initial, lyric, "wantToLearn", initial.control,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
  const fullRevision = { ...initial, control: { ...initial.control, revision: Number.MAX_SAFE_INTEGER } };
  refuses(() => saveLearningLabel(fullRevision, lyric, "wantToLearn", fullRevision.control), "capacity");
  expect(state).toEqual(before);
});
test("v6 upgrade preserves every value and frozen old accounting, starts unlabelled and refuses incompatible or over-capacity inputs", () => {
  const control = { ...newControl(), formatVersion: 6, revision: 31 };
  const personal = { ...defaultPersonal(), favorites: [lyric, legacy], theme: "warm" as const, fontSize: 42 };
  const list = newList({ format: "daasavaani-list", formatVersion: 2, name: "  Synthetic raw  ",
    entries: [lyric, { kind: "placeholder", text: "<b>literal</b>" }, lyric] });
  const history = { enabled: false, entries: [legacy, lyric] }, rows = [{ id: "history", ...history }];
  const before = structuredClone({ control, personal, list, rows });
  const migrated = migrateStoreV6([control], [personal], [list], rows);
  expect(migrated.personal).toEqual(personal); expect(migrated.lists).toEqual([list]); expect(migrated.history).toEqual(history);
  expect(migrated.learning).toEqual({ entries: [] });
  expect(migrated.control).toMatchObject({ formatVersion: 8, revision: 0 });
  expect(migrated.control.epoch).not.toBe(control.epoch);
  const oldBytes = jsonBytes({ format: "daasavaani-personal-storage", formatVersion: 6, control, personal: [personal],
    lists: [{ ...list, entries: list.entries.map(({ id, ...entry }) => ({ id, ...entry })) }], recentHistory: rows });
  const bytes = storageBytes(migrated);
  expect(bytes).toBeGreaterThan(oldBytes);
  expect(() => migrateStoreV6([control], [personal], [list], rows,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
  for (const maxPersonalStoredBytes of [oldBytes - 1, oldBytes, bytes - 1]) refuses(() =>
    migrateStoreV6([control], [personal], [list], rows, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes }), "capacity");
  refuses(() => migrateStoreV6([{ ...control, formatVersion: 7 }], [personal], [list], rows), "invalid");
  refuses(() => migrateStoreV6([control], [{ ...personal, learning: [] }], [list], rows), "invalid");
  refuses(() => migrateStoreV6([control], [personal], [list], []), "invalid");
  expect(migrateStoreV6([control], [], [], rows).personal).toBeUndefined();
  expect({ control, personal, list, rows }).toEqual(before);
});
test("current learning row is required, strictly allowlisted and counted exactly with its envelope", () => {
  const initial = empty(), state = saveLearningLabel(initial, lyric, "comfortableReciting", initial.control);
  const history = [{ id: "history", ...state.history }], learning = [{ id: "learning", ...state.learning }];
  const recitation = [{ id: "recitation", ...state.recitation }];
  expect(parseStore([state.control], [], [], history, learning, recitation)).toEqual(state);
  for (const rows of [[], [undefined], [...learning, ...learning], [{ ...learning[0], id: "other" }],
    [{ ...learning[0], score: 100 }]]) refuses(() => parseStore([state.control], [], [], history, rows, recitation), "invalid");
  refuses(() => parseStore([{ ...state.control, formatVersion: 9 }], [], [], history, learning, recitation), "invalid");
  expect(storageBytes(state)).toBe(jsonBytes({ format: "daasavaani-personal-storage", formatVersion: 8,
    control: state.control, personal: [], lists: [], recentHistory: history, learningLabels: learning, recitationPosition: recitation }));
});
test("learning never leaks into minimal list snapshots or mutates any other personal collection", () => {
  const list = newList({ format: "daasavaani-list", formatVersion: 2, name: "Synthetic", entries: [lyric, legacy] });
  const initial = { ...empty(), personal: { ...defaultPersonal(), favorites: [lyric] }, lists: [list] };
  const exported = listSnapshot(list), before = structuredClone(initial);
  const labelled = saveLearningLabel(initial, lyric, "wantToLearn", initial.control);
  expect(listSnapshot(labelled.lists[0]!)).toEqual(exported);
  expect(exported).not.toHaveProperty("learning"); expect(exported).not.toHaveProperty("learningLabels");
  expect(labelled.personal).toBe(initial.personal); expect(labelled.lists).toBe(initial.lists); expect(labelled.history).toBe(initial.history);
  expect(initial).toEqual(before);
});
test("learning admission reaches the actual aggregate ceiling exactly and refuses its first extra byte", () => {
  const state = empty(), count = 40000;
  let identity = 0;
  const nextId = () => `00000000-0000-4000-8000-${(++identity).toString(16).padStart(12, "0")}`;
  state.lists = Array.from({ length: 20 }, () => ({ id: nextId(), name: "Synthetic label capacity",
    entries: Array.from({ length: count / 20 }, () => ({ id: nextId(), kind: "placeholder" as const, text: "" })) }));
  const proposed = { ...state, control: { ...state.control, revision: state.control.revision + 1 },
    learning: { entries: [{ ...lyric, label: "wantToLearn" as const }] } };
  const ceiling = __PERSONAL_LIMITS__.maxPersonalStoredBytes;
  const base = storageBytes(proposed), characters = Math.floor((ceiling - base) / (4 * count));
  let remainder = ceiling - base - 4 * characters * count;
  expect(characters).toBeGreaterThan(0); expect(characters).toBeLessThan(__PERSONAL_LIMITS__.maxEntryTextCodePoints);
  for (const list of state.lists) for (const entry of list.entries) {
    if (entry.kind !== "placeholder") throw new Error("Invalid synthetic capacity occurrence");
    const extra = Math.min(remainder, __PERSONAL_LIMITS__.maxEntryTextCodePoints - characters);
    entry.text = String.fromCodePoint(0x1f600).repeat(characters) + "x".repeat(extra);
    remainder -= extra;
  }
  expect(remainder).toBe(0); expect(storageBytes(proposed)).toBe(ceiling);
  const exact = saveLearningLabel(state, lyric, "wantToLearn", state.control);
  expect(storageBytes(exact)).toBe(ceiling);
  const final = state.lists.at(-1)?.entries.at(-1);
  if (!final || final.kind !== "placeholder") throw new Error("Missing synthetic capacity occurrence");
  final.text += "x";
  expect(storageBytes(proposed)).toBe(ceiling + 1);
  expect(() => validateStore(state)).not.toThrow();
  refuses(() => saveLearningLabel(state, lyric, "wantToLearn", state.control), "capacity");
  expect(state.learning.entries).toEqual([]); expect(state.control.revision).toBe(0);
}, 30000);
