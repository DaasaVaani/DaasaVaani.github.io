import { describe, expect, test } from "vitest";
import {
  adjustFontSize, defaultHistory, defaultPersonal, editEntry, exportListSnapshot, hasFavorite, jsonBytes, listNameKey, listSnapshot, migratePersonalV1, migrateStoreV2, migrateStoreV3, migrateStoreV4, migrateStoreV5, moveEntry, newControl, newList, nextRevision, parseStore, promoteRecent, removeEntry, setReadingDensity, toggleFavorite, validateHistory,
  PersonalError, saveRecord, storageBytes, validatePersonal, validateStore, type PersonalStore,
} from "./personal-model";
import { typedEntry, type ListSnapshotV1, type ListTransferV2 } from "./list-transfer-types";

const legacySnapshot: ListSnapshotV1 = { format: "daasavaani-list", formatVersion: 1, name: "  Synthetic  ", entries: [
  { kind: "item", videoId: "fixture_ref", fallback: "  User label  " },
  { kind: "placeholder", text: "<b>Plain text</b>" }, { kind: "item", videoId: "fixture_ref" },
] };
const snapshot: ListTransferV2 = { ...legacySnapshot, formatVersion: 2, entries: legacySnapshot.entries.map(typedEntry) };
const legacyList = () => ({ id: crypto.randomUUID(), name: legacySnapshot.name,
  entries: legacySnapshot.entries.map(entry => ({ ...entry, id: crypto.randomUUID() })) });
const empty = (): PersonalStore => ({ control: newControl(), lists: [], history: defaultHistory(), learning: { entries: [] }, recitation: { position: null } });
const historyRows = () => [{ id: "history", ...defaultHistory() }];
const learningRows = () => [{ id: "learning", entries: [] }];
const recitationRows = () => [{ id: "recitation", position: null }];
const previousPersonal = () => ({ id: "personal" as const, favorites: [], language: "en" as const, theme: "light" as const });
const readingDefaults = () => ({ fontSize: __WEB_CONFIG__.readerFontSize, density: __WEB_CONFIG__.defaultReadingDensity });
function code(action: () => unknown, expected: string) {
  try { action(); throw new Error("Expected an explicit personal error"); }
  catch (reason) {
    expect(reason).toBeInstanceOf(PersonalError);
    if (reason instanceof PersonalError) expect(reason.code).toBe(expected);
  }
}
describe("transactional personal model", () => {
  test("font controls clamp to actual configured bounds, density choices are strict and unchanged choices retain identity", () => {
    const personal = defaultPersonal(["kn"]), before = structuredClone(personal);
    expect(personal).toMatchObject(readingDefaults());
    expect(adjustFontSize(personal, 1)).toEqual({ ...personal, fontSize: personal.fontSize + __WEB_CONFIG__.readerFontSizeStep });
    expect(adjustFontSize(personal, -1)).toEqual({ ...personal, fontSize: personal.fontSize - __WEB_CONFIG__.readerFontSizeStep });
    for (const [fontSize, direction] of [[__WEB_CONFIG__.readerFontSizeMin, -1], [__WEB_CONFIG__.readerFontSizeMax, 1]] as const) {
      const bound = { ...personal, fontSize };
      expect(adjustFontSize(bound, direction)).toBe(bound);
    }
    for (const density of __WEB_CONFIG__.readingDensities) {
      const changed = setReadingDensity(personal, density);
      expect(changed).toEqual({ ...personal, density });
      expect(setReadingDensity(changed, density)).toBe(changed);
      expect(() => validatePersonal(changed)).not.toThrow();
    }
    for (const density of ["cozy", "", null, 0, undefined]) {
      code(() => setReadingDensity(personal, density), "invalid");
      code(() => validatePersonal({ ...personal, density }), "invalid");
    }
    for (const fontSize of [__WEB_CONFIG__.readerFontSizeMin - 1, __WEB_CONFIG__.readerFontSizeMax + 1, 28.5, NaN, "28", null]) {
      code(() => validatePersonal({ ...personal, fontSize }), "invalid");
      const state = { ...empty(), personal: structuredClone(personal) };
      Reflect.set(state.personal, "fontSize", fontSize);
      code(() => validateStore(state), "invalid");
    }
    code(() => validatePersonal(previousPersonal()), "invalid");
    expect(personal).toEqual(before);
  });
  test("v5 migration freezes old accounting and adds only reading defaults while preserving disabled typed history and every identity", () => {
    const id = "abcdef01-2345-4678-9abc-def012345678", list = newList(snapshot);
    const control = { ...newControl(), formatVersion: 5, revision: 17 };
    const personal = { ...previousPersonal(), favorites: [
      { kind: "lyric" as const, lyricId: id }, { kind: "legacyVideo" as const, videoId: id },
    ] };
    const history = { enabled: false, entries: [...personal.favorites].reverse() }, rows = [{ id: "history", ...history }];
    const before = structuredClone({ control, personal, list, rows });
    const migrated = migrateStoreV5([control], [personal], [list], rows);
    expect(migrated.personal).toEqual({ ...personal, ...readingDefaults() });
    expect(migrated.lists).toEqual([list]); expect(migrated.history).toEqual(history);
    expect(migrated.control).toMatchObject({ formatVersion: 8, revision: 0 });
    expect(migrated.control.epoch).not.toBe(control.epoch);
    const oldBytes = jsonBytes({ format: "daasavaani-personal-storage", formatVersion: 5, control, personal: [personal],
      lists: [{ ...list, entries: list.entries.map(({ id, ...entry }) => ({ id, ...entry })) }], recentHistory: rows });
    const bytes = storageBytes(migrated);
    expect(bytes).toBeGreaterThan(oldBytes);
    expect(bytes).toBe(jsonBytes({ format: "daasavaani-personal-storage", formatVersion: 8, control: migrated.control,
      personal: [migrated.personal], lists: [{ ...list, entries: list.entries.map(({ id, ...entry }) => ({ id, ...entry })) }],
      recentHistory: rows, learningLabels: learningRows(), recitationPosition: recitationRows() }));
    expect(() => migrateStoreV5([control], [personal], [list], rows, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
    for (const maxPersonalStoredBytes of [oldBytes - 1, oldBytes, bytes - 1]) {
      code(() => migrateStoreV5([control], [personal], [list], rows, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes }), "capacity");
    }
    code(() => migrateStoreV5([control], [{ ...personal, ...readingDefaults() }], [list], rows), "invalid");
    code(() => migrateStoreV5([{ ...control, formatVersion: 6 }], [personal], [list], rows), "invalid");
    code(() => migrateStoreV5([control], [personal], [list], [{ ...rows[0], hidden: true }]), "invalid");
    code(() => migrateStoreV5([control], [personal], [list], []), "invalid");
    expect(migrateStoreV5([control], [], [list], rows).personal).toBeUndefined();
    expect({ control, personal, list, rows }).toEqual(before);
  });
  test("recent history is initially enabled and keeps the actual latest distinct typed window without mutating inputs", () => {
    const initial = defaultHistory(), before = structuredClone(initial);
    expect(initial).toEqual({ enabled: true, entries: [] });
    let history = initial;
    for (let index = 0; index <= __PERSONAL_LIMITS__.maxRecents; index++) {
      history = promoteRecent(history, { kind: "legacyVideo", videoId: `synthetic_${index}` });
    }
    expect(history.entries).toHaveLength(__PERSONAL_LIMITS__.maxRecents);
    expect(history.entries[0]).toEqual({ kind: "legacyVideo", videoId: `synthetic_${__PERSONAL_LIMITS__.maxRecents}` });
    expect(history.entries.at(-1)).toEqual({ kind: "legacyVideo", videoId: "synthetic_1" });
    const repeated = history.entries.at(-1)!;
    const promoted = promoteRecent(history, repeated);
    expect(promoted.entries[0]).toEqual(repeated);
    expect(promoted.entries).toHaveLength(__PERSONAL_LIMITS__.maxRecents);
    expect(promoteRecent(promoted, repeated)).toBe(promoted);
    const disabled = { ...promoted, enabled: false };
    expect(promoteRecent(disabled, { kind: "legacyVideo", videoId: "not_recorded" })).toBe(disabled);
    const id = "abcdef01-2345-4678-9abc-def012345678";
    const mixed = promoteRecent(promoteRecent(initial, { kind: "legacyVideo", videoId: id }), { kind: "lyric", lyricId: id });
    expect(mixed.entries).toEqual([{ kind: "lyric", lyricId: id }, { kind: "legacyVideo", videoId: id }]);
    expect(initial).toEqual(before);
    expect(() => validateHistory(history)).not.toThrow();
    code(() => validateHistory({ ...history, entries: [...history.entries, { kind: "legacyVideo", videoId: "extra" }] }), "capacity");
    code(() => validateHistory({ enabled: true, entries: [repeated, repeated] }), "invalid");
    code(() => validateHistory({ enabled: true, entries: new Array(1) }), "invalid");
    code(() => validateHistory({ enabled: "true", entries: [] }), "invalid");
    code(() => promoteRecent(initial, { kind: "lyric", lyricId: "invalid" }), "invalid");
  });
  test("v4 migration preserves every typed value and identity, adds only default reading preferences, empty history and a fresh v6 fence", () => {
    const control = { ...newControl(), formatVersion: 4, revision: 9 }, list = newList(snapshot);
    const personal = { ...previousPersonal(), favorites: [
      { kind: "lyric" as const, lyricId: "abcdef01-2345-4678-9abc-def012345678" },
      { kind: "legacyVideo" as const, videoId: "abcdef01-2345-4678-9abc-def012345678" },
    ] };
    const before = structuredClone({ control, personal, list });
    const migrated = migrateStoreV4([control], [personal], [list]);
    expect(migrated.personal).toEqual({ ...personal, ...readingDefaults() }); expect(migrated.lists).toEqual([list]);
    expect(migrated.history).toEqual(defaultHistory());
    expect(migrated.control).toMatchObject({ formatVersion: 8, revision: 0 });
    expect(migrated.control.epoch).not.toBe(control.epoch);
    expect({ control, personal, list }).toEqual(before);
    const bytes = storageBytes(migrated);
    expect(() => migrateStoreV4([control], [personal], [list], { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
    code(() => migrateStoreV4([control], [personal], [list], { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
    code(() => migrateStoreV4([{ ...control, formatVersion: 5 }], [personal], [list]), "invalid");
    code(() => migrateStoreV4([control], [{ ...personal, ignored: true }], [list]), "invalid");
  });
  test("the current history row is mandatory, strictly typed and counted in exact complete-envelope bytes", () => {
    const state = empty(), reference = { kind: "legacyVideo" as const, videoId: "synthetic" };
    state.history = { enabled: false, entries: [reference] };
    const rows = [{ id: "history", ...state.history }];
    expect(parseStore([state.control], [], [], rows, learningRows(), recitationRows())).toEqual(state);
    for (const invalid of [[], [undefined], [...rows, ...rows], [{ ...rows[0], id: "other" }], [{ ...rows[0], title: "private" }]]) {
      code(() => parseStore([state.control], [], [], invalid, learningRows(), recitationRows()), "invalid");
    }
    const expected = { format: "daasavaani-personal-storage", formatVersion: 8, control: state.control,
      personal: [], lists: [], recentHistory: rows, learningLabels: learningRows(), recitationPosition: recitationRows() };
    expect(storageBytes(state)).toBe(new TextEncoder().encode(JSON.stringify(expected)).length);
    const bytes = storageBytes(state);
    expect(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
    code(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
    const afterOpen = { ...state, history: promoteRecent({ ...state.history, enabled: true }, { kind: "legacyVideo", videoId: "next" }) };
    expect(afterOpen.personal).toBe(state.personal); expect(afterOpen.lists).toBe(state.lists);
    expect(listSnapshot(newList(snapshot))).not.toHaveProperty("recentHistory");
  });
  test("typed favorites compare kind plus identity, preserve order and never reinterpret UUID-looking legacy values", () => {
    const id = "abcdef01-2345-4678-9abc-def012345678";
    const lyric = { kind: "lyric" as const, lyricId: id }, legacy = { kind: "legacyVideo" as const, videoId: id };
    const emptyPersonal = defaultPersonal(), one = toggleFavorite(emptyPersonal, legacy), both = toggleFavorite(one, lyric);
    expect(both.favorites).toEqual([legacy, lyric]);
    expect(hasFavorite(one, lyric)).toBe(false);
    expect(hasFavorite(both, lyric)).toBe(true);
    expect(toggleFavorite(both, legacy).favorites).toEqual([lyric]);
    expect(one.favorites).toEqual([legacy]); expect(emptyPersonal.favorites).toEqual([]);
    expect(() => validatePersonal(both)).not.toThrow();
    code(() => validatePersonal({ ...both, favorites: [lyric, lyric] }), "invalid");
    code(() => validatePersonal({ ...both, favorites: [{ ...lyric, videoId: id }] }), "invalid");
    code(() => validatePersonal({ ...both, favorites: [{ ...lyric, lyricId: id.toUpperCase() }] }), "invalid");
    expect(() => validatePersonal(both, { ...__PERSONAL_LIMITS__, maxFavorites: 2 })).not.toThrow();
    code(() => validatePersonal(both, { ...__PERSONAL_LIMITS__, maxFavorites: 1 }), "capacity");
  });
  test("the actual typed favorite ceiling accepts every distinct reference and rejects limit plus one", () => {
    const personal = { ...defaultPersonal(), favorites: Array.from({ length: __PERSONAL_LIMITS__.maxFavorites },
      (_, index) => ({ kind: "legacyVideo" as const, videoId: `synthetic_${index}` })) };
    expect(() => validatePersonal(personal)).not.toThrow();
    code(() => validatePersonal({ ...personal, favorites: [...personal.favorites,
      { kind: "lyric", lyricId: "abcdef01-2345-4678-9abc-def012345678" }] }), "capacity");
  });
  test("v3 structural upgrade preserves raw names, IDs, repetitions, fallbacks, all themes and UUID-looking legacy references", () => {
    const id = "abcdef01-2345-4678-9abc-def012345678";
    const control = { ...newControl(), formatVersion: 3, revision: 19 };
    const list = legacyList(); list.entries.push({ id: crypto.randomUUID(), kind: "item", videoId: id });
    for (const theme of __WEB_CONFIG__.uiThemes) {
      const personal = { ...previousPersonal(), theme, favorites: [id, "Case_Sensitive"] };
      const before = structuredClone({ control, personal, list });
      const next = migrateStoreV3([control], [personal], [list]);
      expect(next.control).toMatchObject({ formatVersion: 8, revision: 0 });
      expect(next.control.epoch).not.toBe(control.epoch);
      expect(next.personal).toEqual({ ...personal, favorites: personal.favorites.map(videoId => ({ kind: "legacyVideo", videoId })), ...readingDefaults() });
      expect(next.lists).toEqual([{ ...list, entries: list.entries.map(entry => ({ ...typedEntry(entry), id: entry.id })) }]);
      expect({ control, personal, list }).toEqual(before);
      code(() => exportListSnapshot(next, list.id, control), "stale");
    }
    code(() => migrateStoreV3([control], [{ ...defaultPersonal(), favorites: [{ kind: "lyric", lyricId: id }] }], [list]), "invalid");
    code(() => migrateStoreV3([control], [], [newList(snapshot)]), "invalid");
    code(() => migrateStoreV3([{ ...control, formatVersion: 4 }], [], []), "invalid");
  });
  test("migration accounts for both old and larger typed envelopes and fails at exact capacity minus one without mutation", () => {
    const control = { ...newControl(), formatVersion: 3 }, personal = { ...previousPersonal(), favorites: ["fixture_ref"] };
    const list = legacyList(), before = structuredClone({ control, personal, list });
    const target = migrateStoreV3([control], [personal], [list]), bytes = storageBytes(target);
    expect(() => migrateStoreV3([control], [personal], [list], { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
    code(() => migrateStoreV3([control], [personal], [list], { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
    const transferBytes = jsonBytes(listSnapshot(target.lists[0]!));
    expect(() => migrateStoreV3([control], [personal], [list], { ...__PERSONAL_LIMITS__, maxListDecodedBytes: transferBytes })).not.toThrow();
    code(() => migrateStoreV3([control], [personal], [list], { ...__PERSONAL_LIMITS__, maxListDecodedBytes: transferBytes - 1 }), "capacity");
    expect({ control, personal, list }).toEqual(before);
  });
  test("v1 import adapts only the discriminant and v2 lyric edits/export retain every occurrence without local or catalog fields", () => {
    const imported = newList(legacySnapshot), first = imported.entries[0]!;
    expect(listSnapshot(imported)).toEqual(snapshot);
    const lyric = { kind: "lyric" as const, lyricId: "00000000-0000-4000-8000-000000000001", fallback: "  User text  " };
    const edited = editEntry(imported, first.id, lyric);
    const repeated = editEntry(edited, undefined, lyric), exported = listSnapshot(repeated);
    expect(repeated.entries[0]).toEqual({ ...lyric, id: first.id });
    expect(repeated.entries.at(-1)?.id).not.toBe(first.id);
    expect(exported.formatVersion).toBe(2); expect(exported.entries[0]).toEqual(lyric);
    expect(exported.entries.at(-1)).toEqual(lyric);
    for (const id of [repeated.id, ...repeated.entries.map(entry => entry.id)]) expect(JSON.stringify(exported)).not.toContain(id);
    const independent = newList(exported);
    expect(listSnapshot(independent)).toEqual(exported);
    expect(independent.id).not.toBe(repeated.id);
    expect(independent.entries.every(entry => !repeated.entries.some(other => other.id === entry.id))).toBe(true);
  });
  test("v2 migration preserves every identity/value while structurally typing references behind a fresh current fence", () => {
    const control = { ...newControl(), formatVersion: 2, revision: 7 };
    const personal = { ...previousPersonal(), favorites: ["fixture_ref"] }, lists = [legacyList(), legacyList()];
    const before = structuredClone({ control, personal, lists });
    const migrated = migrateStoreV2([control], [personal], lists);
    expect(migrated.personal).toEqual({ ...personal, favorites: [{ kind: "legacyVideo", videoId: "fixture_ref" }], ...readingDefaults() });
    expect(migrated.lists).toEqual(lists.map(list => ({ ...list, entries: list.entries.map(entry => ({ ...typedEntry(entry), id: entry.id })) })));
    expect(migrated.control).toMatchObject({ id: "state", formatVersion: 8, revision: 0 });
    expect(migrated.control.epoch).not.toBe(control.epoch);
    expect(parseStore([migrated.control], [migrated.personal], migrated.lists, historyRows(), learningRows(), recitationRows())).toEqual(migrated);
    code(() => exportListSnapshot(migrated, lists[0]!.id, control), "stale");
    expect({ control, personal, lists }).toEqual(before);
  });
  test("legacy migrations refuse malformed headers and new-mode values mislabeled as older schemas", () => {
    const control = { ...newControl(), formatVersion: 2 }, personal = previousPersonal();
    expect(migratePersonalV1([personal]).personal).toEqual({ ...personal, ...readingDefaults() });
    for (const theme of ["warm", "device", "unknown"]) {
      code(() => migratePersonalV1([{ ...personal, theme }]), "invalid");
      code(() => migrateStoreV2([control], [{ ...personal, theme }], []), "invalid");
    }
    code(() => migrateStoreV2([], [personal], []), "invalid");
    code(() => migrateStoreV2([control, control], [personal], []), "invalid");
    code(() => migrateStoreV2([{ ...control, ignored: true }], [personal], []), "invalid");
    code(() => migrateStoreV2([{ ...control, revision: -1 }], [personal], []), "invalid");
    code(() => migrateStoreV2([{ ...control, formatVersion: 3 }], [personal], []), "invalid");
    code(() => parseStore([control], [personal], [], historyRows(), learningRows(), recitationRows()), "invalid");
  });
  test("all declared theme tokens are valid current personal values and exact accounting includes the longer device token", () => {
    const personal = defaultPersonal(); personal.theme = "light";
    const state = { ...empty(), personal }, bytes = storageBytes(state);
    for (const theme of __WEB_CONFIG__.uiThemes) {
      expect(() => validatePersonal({ ...personal, theme })).not.toThrow();
    }
    const device = { ...state, personal: { ...personal, theme: "device" as const } };
    expect(storageBytes(device)).toBe(bytes + 1);
    code(() => validateStore(device, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes }), "capacity");
    code(() => validatePersonal({ ...personal, theme: "unknown" }), "invalid");
  });
  test("first-use language follows the first supported browser preference and configured fallback without changing canonical text settings", () => {
    expect(defaultPersonal(["fr-FR", "kn-IN", "en-US"]).language).toBe("kn");
    expect(defaultPersonal(["en-GB", "kn"]).language).toBe("en");
    expect(defaultPersonal(["KN-IN"]).language).toBe("kn");
    expect(defaultPersonal(["fr-FR", "de"]).language).toBe(__WEB_CONFIG__.defaultUiLanguage);
    expect(defaultPersonal([])).toEqual({ id: "personal", favorites: [], language: __WEB_CONFIG__.defaultUiLanguage,
      theme: __WEB_CONFIG__.defaultTheme, ...readingDefaults() });
    expect(defaultPersonal(["kn-IN"]).theme).toBe(__WEB_CONFIG__.defaultTheme);
  });
  test("stable-read exports project only minimal fields without writing, allocating identities or wrapping revision counters", () => {
    const record = newList(snapshot), state = { ...empty(), personal: defaultPersonal(), lists: [record] };
    const before = structuredClone(state);
    expect(exportListSnapshot(state, record.id, state.control)).toEqual(snapshot);
    code(() => exportListSnapshot(state, record.id, { ...state.control, revision: state.control.revision + 1 }), "stale");
    code(() => exportListSnapshot(state, record.id, { ...state.control, epoch: crypto.randomUUID() }), "stale");
    code(() => exportListSnapshot(state, "missing", state.control), "stale");
    const maximum = { ...state, control: { ...state.control, revision: Number.MAX_SAFE_INTEGER } };
    expect(exportListSnapshot(maximum, record.id, maximum.control)).toEqual(snapshot);
    const copy = exportListSnapshot(state, record.id, state.control);
    copy.name = "Changed copy"; copy.entries.splice(0, 1);
    expect(state).toEqual(before);
  });
  test("entry edits, moves, manual replacements and removals preserve independent identities and never mutate the source", () => {
    const record = newList(snapshot), before = structuredClone(record);
    const first = record.entries[0], placeholder = record.entries[1], last = record.entries[2];
    if (!first || !placeholder || !last) throw new Error("Missing occurrence fixture");
    const edited = editEntry(record, placeholder.id, { kind: "placeholder", text: "  Edited  " });
    expect(edited.entries[1]).toEqual({ id: placeholder.id, kind: "placeholder", text: "  Edited  " });
    const moved = moveEntry(edited, placeholder.id, -1);
    expect(moved.entries.map(entry => entry.id)).toEqual([placeholder.id, first.id, last.id]);
    const replaced = editEntry(moved, placeholder.id, { kind: "legacyVideo", videoId: "replacement", fallback: "  Edited  " });
    expect(replaced.entries[0]).toEqual({ id: placeholder.id, kind: "legacyVideo", videoId: "replacement", fallback: "  Edited  " });
    const removed = removeEntry(replaced, first.id);
    expect(removed.entries.map(entry => entry.id)).toEqual([placeholder.id, last.id]);
    expect(removed.entries[1]).toEqual(last);
    const added = editEntry(editEntry(removed, undefined, { kind: "placeholder", text: "Repeat" }), undefined, { kind: "placeholder", text: "Repeat" });
    expect(new Set(added.entries.map(entry => entry.id)).size).toBe(4);
    expect(record).toEqual(before);
    code(() => editEntry(record, placeholder.id, { kind: "placeholder", text: "" }), "listInvalid");
    code(() => editEntry(record, "missing", { kind: "placeholder", text: "Text" }), "stale");
    code(() => removeEntry(record, "missing"), "stale");
    code(() => moveEntry(record, first.id, -1), "listInvalid");
    expect(record).toEqual(before);
  });
  test("entry mutations accept the actual per-list ceiling and do not rewarn for an unchanged previously confirmed duplicate name", () => {
    const record = newList(snapshot, "Straße"), other = newList(snapshot, "STRASSE");
    const state = { ...empty(), lists: [record, other] };
    const changed = editEntry(record, undefined, { kind: "placeholder", text: "Extra" });
    expect(() => saveRecord(state, changed, state.control, true)).not.toThrow();
    code(() => saveRecord(state, { ...changed, name: "strasse" }, state.control, true), "duplicate");
    const full = { ...record, entries: Array.from({ length: __PERSONAL_LIMITS__.maxEntriesPerList },
      () => ({ id: crypto.randomUUID(), kind: "placeholder" as const, text: "Repeat" })) };
    expect(() => validateStore({ ...empty(), lists: [full] })).not.toThrow();
    code(() => editEntry(full, undefined, { kind: "placeholder", text: "Repeat" }), "capacity");
    expect(full.entries).toHaveLength(__PERSONAL_LIMITS__.maxEntriesPerList);
  });
  test("new independent identities and minimal export preserve every ordered occurrence and user character", () => {
    const first = newList(snapshot), second = newList(snapshot);
    expect(listSnapshot(first)).toEqual(snapshot);
    expect(listSnapshot(second)).toEqual(snapshot);
    const ids = [first.id, second.id, ...first.entries.map(entry => entry.id), ...second.entries.map(entry => entry.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(listSnapshot(first))).not.toContain(first.id);
    const state = empty(), before = structuredClone(state);
    const next = saveRecord(state, first, state.control, false);
    expect(next.control.revision).toBe(1);
    expect(next.lists).toEqual([first]);
    expect(state).toEqual(before);
  });
  test("duplicate-name comparison uses NFC and full default Unicode case folding without rewriting names", () => {
    expect(listNameKey("Straße")).toBe(listNameKey("STRASSE"));
    expect(listNameKey("Σ")).toBe(listNameKey("ς"));
    expect(listNameKey("CAFÉ")).toBe(listNameKey("cafe\u0301"));
    expect(listNameKey("I")).not.toBe(listNameKey("ı"));
    expect(listNameKey("É")).not.toBe(listNameKey("e"));
    const first = newList(snapshot, "Straße"), second = newList(snapshot, "STRASSE");
    const state = { ...empty(), lists: [first] }, before = structuredClone(state);
    code(() => saveRecord(state, second, state.control, false), "duplicate");
    expect(state).toEqual(before);
    const next = saveRecord(state, second, state.control, false, true);
    expect(next.lists.map(list => list.name)).toEqual(["Straße", "STRASSE"]);
    expect(listNameKey(" Name ")).not.toBe(listNameKey("Name"));
  });
  test("stale revisions, epochs, missing edit targets and revision overflow are explicit without mutation", () => {
    const state = empty(), record = newList(snapshot), before = structuredClone(state);
    code(() => saveRecord(state, record, { ...state.control, revision: 1 }, false), "stale");
    code(() => saveRecord(state, record, { ...state.control, epoch: crypto.randomUUID() }, false), "stale");
    code(() => saveRecord(state, record, state.control, true), "invalid");
    const full = { ...state, control: { ...state.control, revision: Number.MAX_SAFE_INTEGER } };
    code(() => nextRevision(full, full.control), "capacity");
    expect(state).toEqual(before);
  });
  test("list and occurrence UUID uniqueness is global while repeated references remain valid", () => {
    const first = newList(snapshot), second = newList(snapshot);
    const state = { ...empty(), lists: [first, second] };
    expect(() => validateStore(state)).not.toThrow();
    code(() => validateStore({ ...state, lists: [first, first] }), "invalid");
    const firstEntry = first.entries[0], secondEntry = second.entries[0];
    if (!firstEntry || !secondEntry) throw new Error("Missing repeated-reference fixture");
    const collision = { ...second, entries: [{ ...secondEntry, id: firstEntry.id }] };
    code(() => validateStore({ ...state, lists: [first, collision] }), "invalid");
    code(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxLists: 1 }), "capacity");
    code(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxTotalEntries: 5 }), "capacity");
    code(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxEntriesPerList: 2 }), "capacity");
  });
  test("strict stored envelopes reject corruption rather than discarding unknown records or fields", () => {
    const state = empty(), personal = defaultPersonal();
    expect(parseStore([state.control], [], [], historyRows(), learningRows(), recitationRows()).personal).toBeUndefined();
    expect(parseStore([state.control], [personal], [], historyRows(), learningRows(), recitationRows()).personal).toEqual(personal);
    for (const bad of [{ ...personal, ignored: true }, { ...personal, favorites: ["same", "same"] },
      { ...personal, favorites: ["../unsafe"] }, { ...personal, favorites: new Array(1) },
      { ...personal, id: "another" }, { ...personal, language: "other" }]) {
      code(() => validatePersonal(bad), "invalid");
    }
    code(() => parseStore([], [], [], historyRows(), learningRows(), recitationRows()), "invalid");
    code(() => parseStore([state.control], [undefined], [], historyRows(), learningRows(), recitationRows()), "invalid");
    code(() => parseStore([state.control], [personal, personal], [], historyRows(), learningRows(), recitationRows()), "invalid");
    code(() => parseStore([{ ...state.control, revision: -1 }], [], [], historyRows(), learningRows(), recitationRows()), "invalid");
    code(() => parseStore([{ ...state.control, ignored: true }], [], [], historyRows(), learningRows(), recitationRows()), "invalid");
  });
  test("deterministic UTF8 accounting includes escaping, metadata, revision digits and exact capacity boundaries", () => {
    for (const text of ["", "\u0000", "é", "ಕ", "😀", "e\u0301", "\ud800", "\n", '"\\']) {
      expect(jsonBytes(text)).toBe(new TextEncoder().encode(JSON.stringify(text)).length);
    }
    const state = { ...empty(), personal: defaultPersonal(), lists: [newList(snapshot)] };
    const bytes = storageBytes(state);
    expect(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
    code(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
    const reordered = { ...state, lists: state.lists.map(list => ({ entries: list.entries, name: list.name, id: list.id })) };
    expect(storageBytes(reordered)).toBe(bytes);
    const nine = { ...state, control: { ...state.control, revision: 9 } };
    expect(storageBytes(nextRevision(nine, nine.control))).toBe(storageBytes(nine) + 1);
    const transferBytes = jsonBytes(snapshot);
    expect(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxListDecodedBytes: transferBytes })).not.toThrow();
    code(() => validateStore(state, { ...__PERSONAL_LIMITS__, maxListDecodedBytes: transferBytes - 1 }), "capacity");
  });
  test("actual production personal byte ceiling accepts a complete valid envelope and rejects exactly one more byte", () => {
    const state = empty();
    state.history.entries = Array.from({ length: __PERSONAL_LIMITS__.maxRecents },
      (_, index) => ({ kind: "legacyVideo", videoId: `synthetic_history_${index}` }));
    state.personal = { ...defaultPersonal(), favorites: [
      { kind: "lyric", lyricId: "abcdef01-2345-4678-9abc-def012345678" },
      { kind: "legacyVideo", videoId: "abcdef01-2345-4678-9abc-def012345678" },
    ] };
    const total = 40000;
    let identity = 0;
    const id = () => `00000000-0000-4000-8000-${(++identity).toString(16).padStart(12, "0")}`;
    state.lists = Array.from({ length: 20 }, () => ({ id: id(), name: "Synthetic capacity", entries:
      Array.from({ length: total / 20 }, () => ({ id: id(), kind: "placeholder" as const, text: "" })) }));
    const ceiling = __PERSONAL_LIMITS__.maxPersonalStoredBytes;
    const base = storageBytes(state);
    const characters = Math.floor((ceiling - base) / (4 * total));
    expect(characters).toBeGreaterThan(0);
    expect(characters).toBeLessThan(__PERSONAL_LIMITS__.maxEntryTextCodePoints);
    let remainder = ceiling - base - 4 * characters * total;
    for (const list of state.lists) for (const entry of list.entries) {
      if (entry.kind !== "placeholder") throw new Error("Invalid capacity fixture");
      const extra = Math.min(remainder, __PERSONAL_LIMITS__.maxEntryTextCodePoints - characters);
      entry.text = "😀".repeat(characters) + "x".repeat(extra);
      remainder -= extra;
    }
    expect(remainder).toBe(0);
    expect(storageBytes(state)).toBe(ceiling);
    expect(() => validateStore(state)).not.toThrow();
    const oldControl = { ...state.control, formatVersion: 5 };
    const oldPersonal = { id: state.personal.id, favorites: state.personal.favorites,
      language: state.personal.language, theme: state.personal.theme };
    const histories = [{ id: "history", ...state.history }];
    expect(storageBytes(migrateStoreV5([oldControl], [oldPersonal], state.lists, histories))).toBe(ceiling);
    const entry = state.lists.at(-1)?.entries.at(-1);
    if (!entry || entry.kind !== "placeholder") throw new Error("Missing capacity occurrence");
    entry.text += "x";
    expect(storageBytes(state)).toBe(ceiling + 1);
    code(() => validateStore(state), "capacity");
    code(() => migrateStoreV5([oldControl], [oldPersonal], state.lists, histories), "capacity");
  }, 30000);
});
