import { expect, test } from "vitest";
import fixtures from "../shared/fixtures/personal/recitation-position.json";
import { resolveRecitation } from "./list-recite";
import {
  defaultHistory, defaultPersonal, jsonBytes, listSnapshot, migrateStoreV7, newControl, newList, parseStore,
  PersonalError, saveRecitationPosition, storageBytes, validateRecitation, validateStore, type PersonalStore,
} from "./personal-model";

const empty = (): PersonalStore => ({ control: newControl(), lists: [], history: defaultHistory(),
  learning: { entries: [] }, recitation: { position: null } });
const list = () => newList({ format: "daasavaani-list", formatVersion: 2, name: "  Synthetic list  ", entries: [
  { kind: "placeholder", text: "  Same raw text  " }, { kind: "placeholder", text: "  Same raw text  " },
] });
const historyRows = (state: PersonalStore) => [{ id: "history", ...state.history }];
const learningRows = (state: PersonalStore) => [{ id: "learning", ...state.learning }];
function refuses(action: () => unknown, code: string) {
  expect(action).toThrow(PersonalError);
  try { action(); } catch (reason) { expect(reason).toMatchObject({ code }); }
}

test("Shared exact-position shapes and resolution vectors preserve raw values without equal-reference fallbacks", () => {
  for (const fixture of fixtures.accepted) expect(() => validateRecitation(fixture.value)).not.toThrow();
  for (const fixture of fixtures.rejected) refuses(() => validateRecitation(fixture.value), "invalid");
  for (const fixture of fixtures.resolution) {
    const before = structuredClone(fixture), state = empty();
    const parsed = parseStore([state.control], [], fixture.lists, historyRows(state), learningRows(state),
      [{ id: "recitation", ...fixture.value }]);
    const resolved = resolveRecitation(parsed.recitation, parsed.lists);
    expect(resolved.status).toBe(fixture.expected.kind);
    if (resolved.status === "available") expect(resolved.index).toBe(fixture.expected.index);
    expect(fixture).toEqual(before);
  }
});
test("only exact existing occurrences replace the single pair; repeated selections are strict no-ops", () => {
  const first = list(), second = list(), state = { ...empty(), personal: defaultPersonal(), lists: [first, second] };
  const before = structuredClone(state), one = { listId: first.id, entryId: first.entries[0]!.id };
  const two = { listId: first.id, entryId: first.entries[1]!.id };
  const saved = saveRecitationPosition(state, one, state.control);
  const repeated = saveRecitationPosition(saved, two, saved.control);
  expect(repeated.recitation).toEqual({ position: two });
  expect(repeated.control.revision).toBe(state.control.revision + 2);
  expect(saveRecitationPosition(repeated, two, repeated.control)).toBe(repeated);
  const replaced = saveRecitationPosition(repeated, { listId: second.id, entryId: second.entries[0]!.id }, repeated.control);
  expect(replaced.recitation.position?.listId).toBe(second.id);
  for (const key of ["personal", "lists", "history", "learning"] as const) expect(replaced[key]).toBe(state[key]);
  refuses(() => saveRecitationPosition(replaced, one, state.control), "stale");
  refuses(() => saveRecitationPosition(state, { listId: first.id, entryId: second.entries[0]!.id }, state.control), "stale");
  refuses(() => saveRecitationPosition(state, { listId: crypto.randomUUID(), entryId: one.entryId }, state.control), "stale");
  expect(state).toEqual(before);
  expect(JSON.stringify(listSnapshot(first))).not.toContain(first.id);
  expect(listSnapshot(first)).not.toHaveProperty("recitation");
});
test("deletion keeps a valid unresolved pair, while reordering and replacement resolve current occurrence contents", () => {
  const record = list(), state = { ...empty(), lists: [record] };
  const saved = saveRecitationPosition(state, { listId: record.id, entryId: record.entries[1]!.id }, state.control);
  const reordered = { ...record, name: "Renamed", entries: [...record.entries].reverse() };
  expect(resolveRecitation(saved.recitation, [reordered])).toMatchObject({ status: "available", index: 0 });
  const replaced = { ...reordered, entries: reordered.entries.map(entry => ({ ...entry, text: "New literal contents" })) };
  expect(resolveRecitation(saved.recitation, [replaced])).toMatchObject({ status: "available", record: replaced, index: 0 });
  for (const lists of [[], [{ ...record, entries: record.entries.slice(0, 1) }], [{ ...record, entries: [] }]]) {
    expect(() => validateStore({ ...saved, lists })).not.toThrow();
    expect(resolveRecitation(saved.recitation, lists).status).toBe(lists.length ? "entryMissing" : "listMissing");
  }
});
test("strict singleton row and complete current envelope include exact position and revision overhead", () => {
  const record = list(), state = { ...empty(), lists: [record] };
  const saved = saveRecitationPosition(state, { listId: record.id, entryId: record.entries[1]!.id }, state.control);
  const rows = [{ id: "recitation", ...saved.recitation }];
  expect(parseStore([saved.control], [], saved.lists, historyRows(saved), learningRows(saved), rows)).toEqual(saved);
  for (const bad of [[], [undefined], [...rows, ...rows], [{ ...rows[0], id: "other" }], [{ ...rows[0], index: 1 }]]) {
    refuses(() => parseStore([saved.control], [], saved.lists, historyRows(saved), learningRows(saved), bad), "invalid");
  }
  const expected = { format: "daasavaani-personal-storage", formatVersion: 8, control: saved.control,
    personal: [], lists: saved.lists.map(record => ({ ...record, entries: record.entries.map(({ id, ...entry }) => ({ id, ...entry })) })),
    recentHistory: historyRows(saved), learningLabels: learningRows(saved), recitationPosition: rows };
  expect(storageBytes(saved)).toBe(new TextEncoder().encode(JSON.stringify(expected)).length);
  const bytes = storageBytes(saved);
  expect(saveRecitationPosition(state, saved.recitation.position!, state.control,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).toEqual(saved);
  refuses(() => saveRecitationPosition(state, saved.recitation.position!, state.control,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 }), "capacity");
  const exhausted = { ...state, control: { ...state.control, revision: Number.MAX_SAFE_INTEGER } };
  refuses(() => saveRecitationPosition(exhausted, saved.recitation.position!, exhausted.control), "capacity");
});
test("v7 migration freezes old accounting and preserves every old value, adding only null and a fresh fence", () => {
  const record = list(), lyric = { kind: "lyric" as const, lyricId: crypto.randomUUID() };
  const state = { ...empty(), personal: { ...defaultPersonal(), favorites: [lyric], fontSize: 42 },
    lists: [record], history: { enabled: false, entries: [lyric] },
    learning: { entries: [{ ...lyric, label: "practising" as const }] } };
  const control = { ...state.control, formatVersion: 7, revision: 31 };
  const history = historyRows(state), learning = learningRows(state);
  const inputs = { control, personal: state.personal, lists: state.lists, history, learning }, before = structuredClone(inputs);
  const migrated = migrateStoreV7([control], [state.personal], state.lists, history, learning);
  expect(migrated).toEqual({ ...state, control: migrated.control });
  expect(migrated.control).toMatchObject({ formatVersion: 8, revision: 0 });
  expect(migrated.control.epoch).not.toBe(control.epoch);
  const oldBytes = jsonBytes({ format: "daasavaani-personal-storage", formatVersion: 7, control, personal: [state.personal],
    lists: state.lists.map(record => ({ ...record, entries: record.entries.map(({ id, ...entry }) => ({ id, ...entry })) })),
    recentHistory: history, learningLabels: learning });
  const bytes = storageBytes(migrated);
  expect(bytes).toBeGreaterThan(oldBytes);
  expect(() => migrateStoreV7([control], [state.personal], state.lists, history, learning,
    { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
  for (const maxPersonalStoredBytes of [oldBytes - 1, oldBytes, bytes - 1]) refuses(() =>
    migrateStoreV7([control], [state.personal], state.lists, history, learning,
      { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes }), "capacity");
  refuses(() => migrateStoreV7([{ ...control, formatVersion: 8 }], [state.personal], state.lists, history, learning), "invalid");
  refuses(() => migrateStoreV7([control], [state.personal], state.lists, history, []), "invalid");
  expect(migrateStoreV7([control], [], [], history, learning).personal).toBeUndefined();
  expect(inputs).toEqual(before);
});
