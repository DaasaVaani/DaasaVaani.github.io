import Ajv2020 from "ajv/dist/2020";
import legacyRecordSchema from "../shared/schemas/list-record.schema.json";
import recordSchema from "../shared/schemas/list-record-v2.schema.json";
import transferSchema from "../shared/schemas/list-transfer.schema.json";
import transferSchemaV2 from "../shared/schemas/list-transfer-v2.schema.json";
import referenceSchema from "../shared/schemas/personal-reference.schema.json";
import historySchema from "../shared/schemas/recent-history.schema.json";
import learningSchema from "../shared/schemas/learning-labels.schema.json";
import recitationSchema from "../shared/schemas/recitation-position.schema.json";
import type { LearningLabel, LearningLabelsV1, ReadingDensity, RecentHistoryV1, RecitationPositionV1 } from "../shared/types/personal";
export type { RecitationPositionV1 } from "../shared/types/personal";
export type { LearningLabel, LearningLabelsV1 } from "../shared/types/personal";
export type { RecentHistoryV1 } from "../shared/types/personal";
import { typedEntry, type ListSnapshot, type ListSnapshotV1, type ListEntryV2, type ListTransferV2, type PersonalReference } from "./list-transfer-types";
import { unicodeNameKey as listNameKey } from "./unicode-names";
export { unicodeNameKey as listNameKey, unicodeNameProfile } from "./unicode-names";

export interface Personal {
  id: "personal"; favorites: PersonalReference[]; language: "en" | "kn"; theme: WebConfig["defaultTheme"];
  fontSize: number; density: ReadingDensity;
}
export type ListEntry = ListEntryV2 & { id: string };
export interface ListRecord { id: string; name: string; entries: ListEntry[] }
export interface Revision { epoch: string; revision: number }
export interface Control extends Revision { id: "state"; formatVersion: 8 }
export interface PersonalStore {
  control: Control; personal?: Personal; lists: ListRecord[]; history: RecentHistoryV1;
  learning: LearningLabelsV1; recitation: RecitationPositionV1;
}
export type PersonalContents = Omit<PersonalStore, "control">;
export type PersonalErrorCode = "invalid" | "listInvalid" | "capacity" | "stale" | "duplicate";
export class PersonalError extends Error {
  constructor(readonly code: PersonalErrorCode) {
    super(code === "invalid" ? "Invalid personal database record; existing data was not replaced."
      : code === "listInvalid" ? "Invalid list name or entry."
      : code === "capacity" ? "Personal storage or collection limit reached."
      : code === "stale" ? "Personal data changed; review it and try again."
      : "Another list already uses this name; explicit confirmation is required.");
  }
}
const ajv = new Ajv2020({ strict: true });
const validList = ajv.compile<ListRecord>(recordSchema);
type PreviousPersonal = Pick<Personal, "id" | "favorites" | "language" | "theme">;
type LegacyPersonal = Omit<PreviousPersonal, "favorites"> & { favorites: string[] };
type LegacyList = Omit<ListRecord, "entries"> & { entries: (ListSnapshotV1["entries"][number] & { id: string })[] };
const validLegacyList = ajv.compile<LegacyList>(legacyRecordSchema);
const validReference = ajv.compile<PersonalReference>(referenceSchema);
const validHistory = ajv.compile<RecentHistoryV1>(historySchema);
const validLearning = ajv.compile<LearningLabelsV1>(learningSchema);
const validRecitation = ajv.compile<RecitationPositionV1>(recitationSchema);
const validSnapshotV1 = ajv.compile<ListSnapshotV1>(transferSchema), validSnapshotV2 = ajv.compile<ListTransferV2>(transferSchemaV2);
const validSnapshot = (value: unknown): value is ListSnapshot => validSnapshotV1(value) || validSnapshotV2(value);
const uuid = new RegExp(recordSchema.properties.id.pattern, "u");
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
export function referenceKey(reference: PersonalReference): string {
  return reference.kind === "lyric" ? `lyric:${reference.lyricId}` : `legacyVideo:${reference.videoId}`;
}
export function hasFavorite(personal: Personal, reference: PersonalReference): boolean {
  const key = referenceKey(reference);
  return personal.favorites.some(value => referenceKey(value) === key);
}
export function toggleFavorite(personal: Personal, reference: PersonalReference): Personal {
  const key = referenceKey(reference);
  return { ...personal, favorites: hasFavorite(personal, reference)
    ? personal.favorites.filter(value => referenceKey(value) !== key) : [...personal.favorites, reference] };
}
export function defaultHistory(): RecentHistoryV1 {
  return { enabled: __WEB_CONFIG__.defaultRecentHistoryEnabled, entries: [] };
}
export const learningChoices = ["wantToLearn", "practising", "comfortableReciting"] as const;
export function validateLearning(value: unknown, limits = __PERSONAL_LIMITS__): asserts value is LearningLabelsV1 {
  if (!object(value) || !Array.isArray(value.entries)) throw new PersonalError("invalid");
  if (value.entries.length > limits.maxLearningLabels) throw new PersonalError("capacity");
  if (Object.keys(value.entries).length !== value.entries.length || !validLearning(value) ||
      new Set(value.entries.map(referenceKey)).size !== value.entries.length) throw new PersonalError("invalid");
}
export function learningLabelFor(learning: LearningLabelsV1, reference: PersonalReference): LearningLabel | undefined {
  const key = referenceKey(reference);
  return learning.entries.find(entry => referenceKey(entry) === key)?.label;
}
export function saveLearningLabel(state: PersonalStore, reference: PersonalReference, label: LearningLabel | undefined,
  expected: Revision, limits = __PERSONAL_LIMITS__): PersonalStore {
  assertRevision(state.control, expected);
  validateLearning(state.learning, limits);
  if (!validReference(reference) || (label !== undefined && !learningChoices.some(value => value === label))) throw new PersonalError("invalid");
  if (learningLabelFor(state.learning, reference) === label) return state;
  const key = referenceKey(reference);
  const index = state.learning.entries.findIndex(entry => referenceKey(entry) === key);
  const entries = [...state.learning.entries];
  if (label === undefined) entries.splice(index, 1);
  else {
    const entry = reference.kind === "lyric" ? { kind: reference.kind, lyricId: reference.lyricId, label }
      : { kind: reference.kind, videoId: reference.videoId, label };
    if (index < 0) entries.push(entry); else entries[index] = entry;
  }
  const next = { ...nextRevision(state, expected), learning: { entries } };
  validateStore(next, limits);
  return next;
}
export function validateHistory(value: unknown, limits = __PERSONAL_LIMITS__): asserts value is RecentHistoryV1 {
  if (!object(value) || !Array.isArray(value.entries)) throw new PersonalError("invalid");
  if (value.entries.length > limits.maxRecents) throw new PersonalError("capacity");
  if (Object.keys(value.entries).length !== value.entries.length || !validHistory(value)) throw new PersonalError("invalid");
}
export function promoteRecent(history: RecentHistoryV1, reference: PersonalReference, limits = __PERSONAL_LIMITS__): RecentHistoryV1 {
  validateHistory(history, limits);
  if (!validReference(reference)) throw new PersonalError("invalid");
  const key = referenceKey(reference);
  if (!history.enabled || (history.entries[0] && referenceKey(history.entries[0]) === key)) return history;
  return { ...history, entries: [reference, ...history.entries.filter(value => referenceKey(value) !== key)].slice(0, limits.maxRecents) };
}

export function validateRecitation(value: unknown): asserts value is RecitationPositionV1 {
  if (!validRecitation(value)) throw new PersonalError("invalid");
}
export function saveRecitationPosition(state: PersonalStore, position: NonNullable<RecitationPositionV1["position"]>,
  expected: Revision, limits = __PERSONAL_LIMITS__): PersonalStore {
  assertRevision(state.control, expected);
  validateRecitation({ position });
  const record = state.lists.find(record => record.id === position.listId);
  if (!record?.entries.some(entry => entry.id === position.entryId)) throw new PersonalError("stale");
  if (state.recitation.position?.listId === position.listId && state.recitation.position.entryId === position.entryId) return state;
  const next = { ...nextRevision(state, expected),
    recitation: { position: { listId: position.listId, entryId: position.entryId } } };
  validateStore(next, limits);
  return next;
}

export function defaultPersonal(preferredLanguages: readonly string[] = []): Personal {
  for (const tag of preferredLanguages) {
    const language = __WEB_CONFIG__.uiLanguages.find(value => value === tag.split("-")[0]?.toLowerCase());
    if (language) return { id: "personal", favorites: [], language, theme: __WEB_CONFIG__.defaultTheme, ...readingDefaults() };
  }
  return { id: "personal", favorites: [], language: __WEB_CONFIG__.defaultUiLanguage, theme: __WEB_CONFIG__.defaultTheme, ...readingDefaults() };
}
function readingDefaults() {
  return { fontSize: __WEB_CONFIG__.readerFontSize, density: __WEB_CONFIG__.defaultReadingDensity };
}
function validatePreferenceFields(value: unknown, fields: string[], limits: PersonalLimits): asserts value is PreviousPersonal & Record<string, unknown> {
  if (!object(value) || !keys(value, fields) || value.id !== "personal" ||
      !Array.isArray(value.favorites) || Object.keys(value.favorites).length !== value.favorites.length ||
      !Array.from(value.favorites).every(value => validReference(value)) ||
      new Set(value.favorites.map(referenceKey)).size !== value.favorites.length ||
      (value.language !== "en" && value.language !== "kn") ||
      (value.theme !== "light" && value.theme !== "dark" && value.theme !== "warm" && value.theme !== "device")) {
    throw new PersonalError("invalid");
  }
  if (value.favorites.length > limits.maxFavorites) throw new PersonalError("capacity");
}
export function validatePersonal(value: unknown, limits = __PERSONAL_LIMITS__): asserts value is Personal {
  validatePreferenceFields(value, ["id", "favorites", "language", "theme", "fontSize", "density"], limits);
  if (typeof value.fontSize !== "number" || !Number.isInteger(value.fontSize) ||
      value.fontSize < __WEB_CONFIG__.readerFontSizeMin || value.fontSize > __WEB_CONFIG__.readerFontSizeMax ||
      !__WEB_CONFIG__.readingDensities.some(density => density === value.density)) throw new PersonalError("invalid");
}
export function adjustFontSize(personal: Personal, direction: -1 | 1): Personal {
  const fontSize = Math.max(__WEB_CONFIG__.readerFontSizeMin,
    Math.min(__WEB_CONFIG__.readerFontSizeMax, personal.fontSize + direction * __WEB_CONFIG__.readerFontSizeStep));
  return fontSize === personal.fontSize ? personal : { ...personal, fontSize };
}
export function setReadingDensity(personal: Personal, value: unknown): Personal {
  const density = __WEB_CONFIG__.readingDensities.find(density => density === value);
  if (!density) throw new PersonalError("invalid");
  return personal.density === density ? personal : { ...personal, density };
}
export function newControl(): Control {
  return { id: "state", formatVersion: 8, epoch: crypto.randomUUID(), revision: 0 };
}
function controlRevision(controls: unknown[], version: number): Revision {
  const control = controls[0];
  if (controls.length !== 1 || !object(control) || !keys(control, ["id", "formatVersion", "epoch", "revision"]) ||
      control.id !== "state" || control.formatVersion !== version || typeof control.epoch !== "string" || !uuid.test(control.epoch) ||
      typeof control.revision !== "number" || !Number.isSafeInteger(control.revision) || control.revision < 0) throw new PersonalError("invalid");
  return { epoch: control.epoch, revision: control.revision };
}
function preferenceRow(personal: unknown[]) {
  if (personal.length > 1) throw new PersonalError("invalid");
  const preferences = personal[0];
  if (preferences === undefined && personal.length !== 0) throw new PersonalError("invalid");
  return preferences;
}
function typedRecords(lists: unknown[]): ListRecord[] {
  const records: ListRecord[] = [];
  for (const list of lists) {
    if (!validList(list)) throw new PersonalError("invalid");
    records.push(list);
  }
  return records;
}
function previousContents(personal: unknown[], lists: unknown[], limits: PersonalLimits) {
  const preferences = preferenceRow(personal);
  if (preferences !== undefined) validatePreferenceFields(preferences, ["id", "favorites", "language", "theme"], limits);
  return { personal: preferences, lists: typedRecords(lists) };
}
function historyRow(histories: unknown[]): RecentHistoryV1 {
  const row = histories[0];
  if (histories.length !== 1 || !object(row) || !keys(row, ["id", "enabled", "entries"]) || row.id !== "history") {
    throw new PersonalError("invalid");
  }
  const history = { enabled: row.enabled, entries: row.entries };
  validateHistory(history);
  return history;
}
function learningRow(rows: unknown[]): LearningLabelsV1 {
  const row = rows[0];
  if (rows.length !== 1 || !object(row) || !keys(row, ["id", "entries"]) || row.id !== "learning") throw new PersonalError("invalid");
  const learning = { entries: row.entries };
  validateLearning(learning);
  return learning;
}
function recitationRow(rows: unknown[]): RecitationPositionV1 {
  const row = rows[0];
  if (rows.length !== 1 || !object(row) || !keys(row, ["id", "position"]) || row.id !== "recitation") throw new PersonalError("invalid");
  const recitation = { position: row.position };
  validateRecitation(recitation);
  return recitation;
}
export function parseStore(controls: unknown[], personal: unknown[], lists: unknown[], histories: unknown[], learning: unknown[],
  recitation: unknown[]): PersonalStore {
  const control = controlRevision(controls, 8), preferences = preferenceRow(personal);
  if (preferences !== undefined) validatePersonal(preferences);
  const state: PersonalStore = { control: { id: "state", formatVersion: 8, ...control },
    personal: preferences, lists: typedRecords(lists), history: historyRow(histories), learning: learningRow(learning),
    recitation: recitationRow(recitation) };
  validateStore(state);
  return state;
}
export function migrateStoreV7(controls: unknown[], personal: unknown[], lists: unknown[], histories: unknown[], learning: unknown[],
  limits = __PERSONAL_LIMITS__): PersonalStore {
  const control = controlRevision(controls, 7), preferences = preferenceRow(personal);
  if (preferences !== undefined) validatePersonal(preferences, limits);
  const old = { control, personal: preferences, lists: typedRecords(lists), history: historyRow(histories), learning: learningRow(learning) };
  validateCollections(old, limits);
  validateHistory(old.history, limits);
  validateLearning(old.learning, limits);
  storedBytes(old, 7, limits.maxPersonalStoredBytes, old.history, old.learning);
  const state = { ...old, control: newControl(), recitation: { position: null } };
  validateStore(state, limits);
  return state;
}
export function migrateStoreV6(controls: unknown[], personal: unknown[], lists: unknown[], histories: unknown[],
  limits = __PERSONAL_LIMITS__): PersonalStore {
  const control = controlRevision(controls, 6), preferences = preferenceRow(personal);
  if (preferences !== undefined) validatePersonal(preferences, limits);
  const old = { control, personal: preferences, lists: typedRecords(lists) }, history = historyRow(histories);
  validateCollections(old, limits);
  validateHistory(history, limits);
  storedBytes(old, 6, limits.maxPersonalStoredBytes, history);
  const state = { ...old, control: newControl(), history, learning: { entries: [] }, recitation: { position: null } };
  validateStore(state, limits);
  return state;
}
export function migrateStoreV4(controls: unknown[], personal: unknown[], lists: unknown[], limits = __PERSONAL_LIMITS__): PersonalStore {
  const old = { control: controlRevision(controls, 4), ...previousContents(personal, lists, limits) };
  validateCollections(old, limits);
  storedBytes(old, 4, limits.maxPersonalStoredBytes);
  const state: PersonalStore = { ...old, personal: old.personal && { ...old.personal, ...readingDefaults() },
    control: newControl(), history: defaultHistory(), learning: { entries: [] }, recitation: { position: null } };
  validateStore(state, limits);
  return state;
}
export function migrateStoreV5(controls: unknown[], personal: unknown[], lists: unknown[], histories: unknown[],
  limits = __PERSONAL_LIMITS__): PersonalStore {
  const old = { control: controlRevision(controls, 5), ...previousContents(personal, lists, limits) }, history = historyRow(histories);
  validateCollections(old, limits);
  validateHistory(history, limits);
  storedBytes(old, 5, limits.maxPersonalStoredBytes, history);
  const state: PersonalStore = { ...old, personal: old.personal && { ...old.personal, ...readingDefaults() },
    control: newControl(), history, learning: { entries: [] }, recitation: { position: null } };
  validateStore(state, limits);
  return state;
}
function legacyPreferences(personal: unknown[], version: 1 | 2 | 3, limits: typeof __PERSONAL_LIMITS__): LegacyPersonal | undefined {
  if (personal.length > 1) throw new PersonalError("invalid");
  if (personal.length === 0) return undefined;
  const value = personal[0];
  if (!object(value) || !keys(value, ["id", "favorites", "language", "theme"]) || value.id !== "personal" ||
      !Array.isArray(value.favorites) || Object.keys(value.favorites).length !== value.favorites.length ||
      (value.language !== "en" && value.language !== "kn") ||
      (value.theme !== "light" && value.theme !== "dark" && !(version === 3 && (value.theme === "warm" || value.theme === "device")))) {
    throw new PersonalError("invalid");
  }
  const favorites: string[] = [];
  for (const id of value.favorites) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new PersonalError("invalid");
    favorites.push(id);
  }
  if (new Set(favorites).size !== favorites.length) throw new PersonalError("invalid");
  if (favorites.length > limits.maxFavorites) throw new PersonalError("capacity");
  return { id: "personal", favorites, language: value.language, theme: value.theme };
}
export function migratePersonalV1(personal: unknown[]): PersonalStore {
  return migrateLegacy([], personal, [], 1);
}
export function migrateStoreV2(controls: unknown[], personal: unknown[], lists: unknown[]): PersonalStore {
  return migrateLegacy(controls, personal, lists, 2);
}
export function migrateStoreV3(controls: unknown[], personal: unknown[], lists: unknown[], limits = __PERSONAL_LIMITS__): PersonalStore {
  return migrateLegacy(controls, personal, lists, 3, limits);
}
function migrateLegacy(controls: unknown[], personal: unknown[], lists: unknown[], version: 1 | 2 | 3,
  limits = __PERSONAL_LIMITS__): PersonalStore {
  const control = version === 1 ? newControl() : controlRevision(controls, version);
  const preferences = legacyPreferences(personal, version, limits), records: LegacyList[] = [];
  for (const list of lists) {
    if (!validLegacyList(list)) throw new PersonalError("invalid");
    jsonBytes({ format: "daasavaani-list", formatVersion: 1, name: list.name, entries: list.entries.map(wireEntry) },
      limits.maxListDecodedBytes);
    records.push(list);
  }
  if (version !== 1) storedBytes({ control, personal: preferences, lists: records }, version, limits.maxPersonalStoredBytes);
  const state: PersonalStore = { control: newControl(), history: defaultHistory(), learning: { entries: [] }, recitation: { position: null }, personal: preferences && { ...preferences,
    favorites: preferences.favorites.map(videoId => ({ kind: "legacyVideo", videoId })), ...readingDefaults() },
    lists: records.map(list => ({ ...list, entries: list.entries.map(entry => ({ ...typedEntry(entry), id: entry.id })) })) };
  validateStore(state, limits);
  return state;
}
function wireEntry(entry: ListSnapshot["entries"][number]): ListSnapshot["entries"][number] {
  if (entry.kind === "placeholder") return { kind: "placeholder", text: entry.text };
  const fallback = entry.fallback === undefined ? {} : { fallback: entry.fallback };
  return entry.kind === "lyric" ? { kind: "lyric", lyricId: entry.lyricId, ...fallback }
    : entry.kind === "item" ? { kind: "item", videoId: entry.videoId, ...fallback }
    : { kind: "legacyVideo", videoId: entry.videoId, ...fallback };
}
export function listSnapshot(record: ListRecord): ListTransferV2 {
  return { format: "daasavaani-list", formatVersion: 2, name: record.name,
    entries: record.entries.map(entry => typedEntry(wireEntry(entry))) };
}
export function newList(snapshot: ListSnapshot, name = snapshot.name): ListRecord {
  if (!validSnapshot(snapshot)) throw new PersonalError("listInvalid");
  const record = { id: crypto.randomUUID(), name, entries: snapshot.entries.map(entry => ({ ...typedEntry(entry), id: crypto.randomUUID() })) };
  if (!validList(record)) throw new PersonalError("listInvalid");
  return record;
}
function entryIndex(record: ListRecord, id: string): number {
  const index = record.entries.findIndex(entry => entry.id === id);
  if (index < 0) throw new PersonalError("stale");
  return index;
}
export function editEntry(record: ListRecord, id: string | undefined, value: ListEntryV2): ListRecord {
  const index = id === undefined ? record.entries.length : entryIndex(record, id);
  if (id === undefined && record.entries.length >= __PERSONAL_LIMITS__.maxEntriesPerList) throw new PersonalError("capacity");
  const entries = [...record.entries];
  entries.splice(index, id === undefined ? 0 : 1, { ...value, id: id ?? crypto.randomUUID() });
  const next = { ...record, entries };
  if (!validList(next)) throw new PersonalError("listInvalid");
  return next;
}
export function moveEntry(record: ListRecord, id: string, direction: -1 | 1): ListRecord {
  const index = entryIndex(record, id), target = index + direction, entry = record.entries[index];
  if (!entry || target < 0 || target >= record.entries.length) throw new PersonalError("listInvalid");
  const entries = [...record.entries];
  entries.splice(index, 1); entries.splice(target, 0, entry);
  return { ...record, entries };
}
export function removeEntry(record: ListRecord, id: string): ListRecord {
  const index = entryIndex(record, id), entries = [...record.entries];
  entries.splice(index, 1);
  return { ...record, entries };
}
export function jsonBytes(value: unknown, limit = Number.MAX_SAFE_INTEGER): number {
  const text = JSON.stringify(value);
  if (text === undefined) throw new PersonalError("invalid");
  let bytes = 0;
  for (const character of text) {
    const code = character.charCodeAt(0);
    bytes += character.length === 2 ? 4 : code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
    if (bytes > limit) throw new PersonalError("capacity");
  }
  return bytes;
}
export function storageBytes(state: PersonalStore, limit = Number.MAX_SAFE_INTEGER): number {
  return storedBytes(state, 8, limit, state.history, state.learning, state.recitation);
}
function storedBytes(state: { control: Revision; personal?: PreviousPersonal | LegacyPersonal; lists: (ListRecord | LegacyList)[] },
  version: number, limit: number, history?: RecentHistoryV1, learning?: LearningLabelsV1, recitation?: RecitationPositionV1): number {
  const personal = state.personal;
  return jsonBytes({
    format: version >= 4 ? "daasavaani-personal-storage" : "fixture-personal-storage", formatVersion: version,
    control: { id: "state", formatVersion: version, epoch: state.control.epoch, revision: state.control.revision },
    personal: personal ? [{ id: "personal", favorites: personal.favorites.map(reference => typeof reference === "string" ? reference
      : reference.kind === "lyric" ? { kind: "lyric", lyricId: reference.lyricId } : { kind: "legacyVideo", videoId: reference.videoId }),
      language: personal.language, theme: personal.theme,
      ...(version >= 6 && "fontSize" in personal && "density" in personal ? { fontSize: personal.fontSize, density: personal.density } : {}) }] : [],
    lists: [...state.lists].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(list => ({
      id: list.id, name: list.name, entries: list.entries.map(entry => ({ id: entry.id, ...wireEntry(entry) })),
    })),
    ...(history ? { recentHistory: [{ id: "history", enabled: history.enabled, entries: history.entries.map(reference =>
      reference.kind === "lyric" ? { kind: "lyric", lyricId: reference.lyricId } : { kind: "legacyVideo", videoId: reference.videoId }) }] } : {}),
    ...(learning ? { learningLabels: [{ id: "learning", entries: learning.entries.map(entry => entry.kind === "lyric"
      ? { kind: "lyric", lyricId: entry.lyricId, label: entry.label }
      : { kind: "legacyVideo", videoId: entry.videoId, label: entry.label }) }] } : {}),
    ...(recitation ? { recitationPosition: [{ id: "recitation", position: recitation.position
      ? { listId: recitation.position.listId, entryId: recitation.position.entryId } : null }] } : {}),
  }, limit);
}
function validateCollections(state: { personal?: PreviousPersonal; lists: ListRecord[] }, limits: PersonalLimits): void {
  if (state.lists.length > limits.maxLists) throw new PersonalError("capacity");
  const lists = new Set<string>(), occurrences = new Set<string>();
  let total = 0;
  for (const list of state.lists) {
    if (!validList(list) || lists.has(list.id)) throw new PersonalError("invalid");
    lists.add(list.id);
    total += list.entries.length;
    if (list.entries.length > limits.maxEntriesPerList || total > limits.maxTotalEntries) throw new PersonalError("capacity");
    for (const entry of list.entries) {
      if (occurrences.has(entry.id)) throw new PersonalError("invalid");
      occurrences.add(entry.id);
    }
    jsonBytes(listSnapshot(list), limits.maxListDecodedBytes);
  }
}
export function validateStore(state: PersonalStore, limits = __PERSONAL_LIMITS__): void {
  if (state.personal) validatePersonal(state.personal, limits);
  validateCollections(state, limits);
  validateHistory(state.history, limits);
  validateLearning(state.learning, limits);
  validateRecitation(state.recitation);
  storageBytes(state, limits.maxPersonalStoredBytes);
}
export function nextRevision(state: PersonalStore, expected: Revision): PersonalStore {
  assertRevision(state.control, expected);
  if (state.control.revision === Number.MAX_SAFE_INTEGER) throw new PersonalError("capacity");
  return { ...state, control: { ...state.control, revision: state.control.revision + 1 } };
}
function assertRevision(actual: Revision, expected: Revision): void {
  if (actual.epoch !== expected.epoch || actual.revision !== expected.revision) throw new PersonalError("stale");
}
export function replacePersonalContents(state: PersonalStore, contents: PersonalContents, expected: Revision,
  limits = __PERSONAL_LIMITS__): PersonalStore {
  assertRevision(state.control, expected);
  const snapshot = structuredClone({ personal: contents.personal, lists: contents.lists, history: contents.history,
    learning: contents.learning, recitation: contents.recitation });
  const next: PersonalStore = { control: newControl(), ...snapshot };
  validateStore(next, limits);
  return next;
}
export function exportListSnapshot(state: PersonalStore, id: string, expected: Revision): ListSnapshot {
  assertRevision(state.control, expected);
  const record = state.lists.find(list => list.id === id);
  if (!record) throw new PersonalError("stale");
  return listSnapshot(record);
}
export function saveRecord(state: PersonalStore, record: ListRecord, expected: Revision, existing: boolean, confirmDuplicate = false): PersonalStore {
  if (!validList(record)) throw new PersonalError("listInvalid");
  const previous = state.lists.find(list => list.id === record.id);
  if (Boolean(previous) !== existing) throw new PersonalError("invalid");
  const next = nextRevision(state, expected);
  const name = listNameKey(record.name);
  if (!confirmDuplicate && (!previous || previous.name !== record.name) &&
      state.lists.some(list => list.id !== record.id && listNameKey(list.name) === name)) {
    throw new PersonalError("duplicate");
  }
  next.lists = existing ? state.lists.map(list => list.id === record.id ? record : list) : [...state.lists, record];
  validateStore(next);
  return next;
}
