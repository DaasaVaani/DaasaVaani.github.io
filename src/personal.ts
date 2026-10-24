import Dexie, { liveQuery, type Transaction } from "dexie";
import {
  defaultPersonal, exportListSnapshot, migratePersonalV1, migrateStoreV2, migrateStoreV3, migrateStoreV4, migrateStoreV5, migrateStoreV6, migrateStoreV7, nextRevision, parseStore, PersonalError,
  promoteRecent, replacePersonalContents, saveLearningLabel, saveRecitationPosition, saveRecord, validatePersonal, validateStore,
  type ListRecord, type Personal, type PersonalContents, type PersonalStore, type Revision, type RecentHistoryV1,
} from "./personal-model";
import type { PersonalReference } from "./list-transfer-types";
import type { LearningLabel } from "../shared/types/personal";
import { sameRecitationList } from "./list-recite";
export type { Personal, PersonalStore } from "./personal-model";
export const browserDefaultPersonal = () => defaultPersonal(navigator.languages.length ? navigator.languages : [navigator.language]);

const db = new Dexie(__WEB_CONFIG__.databaseName);
db.version(1).stores({ personal: "id" });
db.version(2).stores({ personal: "id", lists: "id", control: "id" });
db.version(3).stores({ personal: "id", lists: "id", control: "id" });
db.version(4).stores({ personal: "id", lists: "id", control: "id" });
db.version(5).stores({ personal: "id", lists: "id", control: "id", recentHistory: "id" });
db.version(6).stores({ personal: "id", lists: "id", control: "id", recentHistory: "id" });
db.version(7).stores({ personal: "id", lists: "id", control: "id", recentHistory: "id", learningLabels: "id" });
db.version(8).stores({ personal: "id", lists: "id", control: "id", recentHistory: "id", learningLabels: "id", recitationPosition: "id" });
const nativeVersion = 80;
const newerSchema = () => new Error("A newer personal database schema is present. Use a compatible app; existing data was not changed.");
function inspectNative(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(__WEB_CONFIG__.databaseName, nativeVersion);
    let upgradeFailure: unknown;
    let stopped = false;
    request.onblocked = () => {
      stopped = true;
      upgradeFailure = new Error("Personal database upgrade is blocked. Close other DaasaVaani tabs and try again; do not delete your data.");
      reject(upgradeFailure);
    };
    request.onupgradeneeded = event => {
      const transaction = request.transaction, database = request.result;
      if (!transaction) { reject(new PersonalError("invalid")); return; }
      const abort = (reason: unknown) => { upgradeFailure = reason; transaction.abort(); };
      if (stopped) { transaction.abort(); return; }
      if ([20, 30, 40, 50, 60, 70].includes(event.oldVersion)) {
        const expected = event.oldVersion === 70 ? ["control", "lists", "personal", "recentHistory", "learningLabels"]
          : event.oldVersion >= 50 ? ["control", "lists", "personal", "recentHistory"] : ["control", "lists", "personal"];
        const names = [...database.objectStoreNames];
        if (names.length !== expected.length || expected.some(name => !names.includes(name)) || names.some(name => {
          const store = transaction.objectStore(name);
          return store.keyPath !== "id" || store.autoIncrement || store.indexNames.length !== 0;
        })) { abort(new PersonalError("invalid")); return; }
        const rows = { control: transaction.objectStore("control").getAll(),
          personal: transaction.objectStore("personal").getAll(), lists: transaction.objectStore("lists").getAll() };
        const histories = event.oldVersion >= 50 ? transaction.objectStore("recentHistory").getAll() : undefined;
        const learning = event.oldVersion === 70 ? transaction.objectStore("learningLabels").getAll() : undefined;
        const requests = [...Object.values(rows), ...(histories ? [histories] : []), ...(learning ? [learning] : [])];
        let pending = requests.length;
        for (const request of requests) {
          request.onerror = () => abort(request.error);
          request.onsuccess = () => {
            if (--pending !== 0) return;
            try {
              const migrate = event.oldVersion === 20 ? migrateStoreV2 : event.oldVersion === 30 ? migrateStoreV3 : migrateStoreV4;
              const current = event.oldVersion === 60 ? migrateStoreV6 : migrateStoreV5;
              const state = learning && histories
                ? migrateStoreV7(rows.control.result, rows.personal.result, rows.lists.result, histories.result, learning.result)
                : histories ? current(rows.control.result, rows.personal.result, rows.lists.result, histories.result)
                : migrate(rows.control.result, rows.personal.result, rows.lists.result);
              if (!histories) database.createObjectStore("recentHistory", { keyPath: "id" }).put({ id: "history", ...state.history });
              if (!learning) database.createObjectStore("learningLabels", { keyPath: "id" }).put({ id: "learning", ...state.learning });
              database.createObjectStore("recitationPosition", { keyPath: "id" }).put({ id: "recitation", ...state.recitation });
              if (state.personal) transaction.objectStore("personal").put(state.personal);
              for (const list of state.lists) transaction.objectStore("lists").put(list);
              transaction.objectStore("control").put(state.control);
            } catch (reason) { abort(reason); }
          };
        }
        return;
      }
      if (event.oldVersion !== 0 && event.oldVersion !== 10) { abort(new PersonalError("invalid")); return; }
      const initialize = (legacy: unknown[]) => {
        try {
          const state = migratePersonalV1(legacy);
          if (event.oldVersion === 0) database.createObjectStore("personal", { keyPath: "id" });
          if (state.personal) transaction.objectStore("personal").put(state.personal);
          database.createObjectStore("lists", { keyPath: "id" });
          database.createObjectStore("control", { keyPath: "id" }).put(state.control);
          database.createObjectStore("recentHistory", { keyPath: "id" }).put({ id: "history", ...state.history });
          database.createObjectStore("learningLabels", { keyPath: "id" }).put({ id: "learning", ...state.learning });
          database.createObjectStore("recitationPosition", { keyPath: "id" }).put({ id: "recitation", ...state.recitation });
        } catch (reason) { abort(reason); }
      };
      if (event.oldVersion === 0) initialize([]);
      else {
        const names = [...database.objectStoreNames];
        if (names.length !== 1 || names[0] !== "personal") { abort(new PersonalError("invalid")); return; }
        const store = transaction.objectStore("personal");
        if (store.keyPath !== "id" || store.autoIncrement || store.indexNames.length) { abort(new PersonalError("invalid")); return; }
        const legacy = store.getAll();
        legacy.onsuccess = () => initialize(legacy.result);
        legacy.onerror = () => abort(legacy.error);
      }
    };
    request.onerror = () => {
      reject(upgradeFailure ?? (request.error?.name === "VersionError" ? newerSchema() : request.error));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (stopped) { database.close(); return; }
      const expected = ["control", "lists", "personal", "recentHistory", "learningLabels", "recitationPosition"];
      const stores = [...database.objectStoreNames];
      if (database.version !== nativeVersion || stores.length !== expected.length || expected.some(name => !stores.includes(name))) {
        database.close(); reject(new PersonalError("invalid")); return;
      }
      const transaction = database.transaction(stores);
      if (stores.some(name => {
        const store = transaction.objectStore(name);
        return store.keyPath !== "id" || store.autoIncrement || store.indexNames.length !== 0;
      })) { database.close(); reject(new PersonalError("invalid")); return; }
      resolve(database);
    };
  });
}
async function ready(): Promise<void> {
  const guard = await inspectNative();
  return new Promise((resolve, reject) => {
    function release() { guard?.close(); db.on.blocked.unsubscribe(blocked); }
    const blocked = () => {
      release();
      reject(new Error("Personal database upgrade is blocked. Close other DaasaVaani tabs and try again; do not delete your data."));
    };
    guard.onversionchange = event => {
      db.close(); release();
      reject(event.newVersion !== null && event.newVersion > nativeVersion ? newerSchema() : new PersonalError("stale"));
    };
    db.on("blocked", blocked);
    // Dexie otherwise retries VersionError against the newer schema and may patch it.
    db.open().then(() => {
      if (db.backendDB().version !== nativeVersion) { db.close(); release(); reject(newerSchema()); return; }
      release(); resolve();
    },
      reason => {
        release();
        reject(reason instanceof Error && reason.name === "VersionError" ? newerSchema() : reason);
      });
  });
}
const personal = db.table<unknown, string>("personal");
const lists = db.table<unknown, string>("lists");
const control = db.table<unknown, string>("control");
const recentHistory = db.table<unknown, string>("recentHistory");
const learningLabels = db.table<unknown, string>("learningLabels");
const recitationPosition = db.table<unknown, string>("recitationPosition");
async function stored(transaction: Transaction): Promise<PersonalStore> {
  const [headers, preferences, records, histories, learning, recitation] = await Promise.all([
    transaction.table("control").toArray(), transaction.table("personal").toArray(), transaction.table("lists").toArray(),
    transaction.table("recentHistory").toArray(), transaction.table("learningLabels").toArray(),
    transaction.table("recitationPosition").toArray(),
  ]);
  return parseStore(headers, preferences, records, histories, learning, recitation);
}
export async function readStore(): Promise<PersonalStore> {
  await ready();
  return db.transaction("r", [personal, lists, control, recentHistory, learningLabels, recitationPosition], stored);
}
export async function readListSnapshot(id: string, expected: Revision) {
  return exportListSnapshot(await readStore(), id, expected);
}
export function watchPersonal(next: (state: PersonalStore) => void, error: (reason: unknown) => void): () => void {
  const subscription = liveQuery(readStore).subscribe({ next, error });
  return () => subscription.unsubscribe();
}
export async function readPersonal(): Promise<Personal> {
  return (await readStore()).personal ?? browserDefaultPersonal();
}
export async function updatePersonal(change: (value: Personal) => Personal, expectedEpoch: string | undefined): Promise<Personal> {
  await ready();
  return db.transaction("rw", [personal, lists, control, recentHistory, learningLabels, recitationPosition], async transaction => {
    const state = await stored(transaction);
    if (state.control.epoch !== expectedEpoch) throw new PersonalError("stale");
    const previous = state.personal ?? browserDefaultPersonal();
    const value = change(previous);
    validatePersonal(value);
    if (value === previous) return value;
    const next = { ...nextRevision(state, state.control), personal: value };
    validateStore(next);
    await personal.put(value);
    await control.put(next.control);
    return value;
  });
}
export async function saveList(record: ListRecord, expected: Revision, existing = false, confirmDuplicate = false): Promise<Revision> {
  await ready();
  return db.transaction("rw", [personal, lists, control, recentHistory, learningLabels, recitationPosition], async transaction => {
    const next = saveRecord(await stored(transaction), record, expected, existing, confirmDuplicate);
    await lists.put(record);
    await control.put(next.control);
    return next.control;
  });
}
export async function deleteList(id: string, expected: Revision): Promise<void> {
  await ready();
  return db.transaction("rw", [personal, lists, control, recentHistory, learningLabels, recitationPosition], async transaction => {
    const state = await stored(transaction);
    if (!state.lists.some(list => list.id === id)) throw new PersonalError("stale");
    const next = { ...nextRevision(state, expected), lists: state.lists.filter(list => list.id !== id) };
    validateStore(next);
    await lists.delete(id);
    await control.put(next.control);
  });
}
export async function updateHistory(change: (history: RecentHistoryV1) => RecentHistoryV1, expectedEpoch: string | undefined): Promise<void> {
  await ready();
  await db.transaction("rw", [personal, lists, control, recentHistory, learningLabels, recitationPosition], async transaction => {
    const state = await stored(transaction);
    if (state.control.epoch !== expectedEpoch) throw new PersonalError("stale");
    const history = change(state.history);
    if (history === state.history) return;
    const next = { ...nextRevision(state, state.control), history };
    validateStore(next);
    await recentHistory.put({ id: "history", ...history });
    await control.put(next.control);
  });
}
export function recordOpened(reference: PersonalReference, expectedEpoch: string | undefined): Promise<void> {
  return updateHistory(history => promoteRecent(history, reference), expectedEpoch);
}
export async function updateLearningLabel(reference: PersonalReference, label: LearningLabel | undefined, expected: Revision): Promise<void> {
  await ready();
  await db.transaction("rw", [personal, lists, control, recentHistory, learningLabels, recitationPosition], async transaction => {
    const state = await stored(transaction), next = saveLearningLabel(state, reference, label, expected);
    if (next === state) return;
    await learningLabels.put({ id: "learning", ...next.learning });
    await control.put(next.control);
  });
}
export interface RecitationReceipt { before: Revision; after: Revision }
async function cancellablePersonalWrite<T>(signal: AbortSignal, change: (state: PersonalStore) => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  await ready();
  signal.throwIfAborted();
  let active: Transaction | undefined;
  const abort = () => { if (active?.active) active.abort(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await db.transaction("rw", [personal, lists, control, recentHistory, learningLabels, recitationPosition], async transaction => {
      active = transaction;
      signal.throwIfAborted();
      const state = await stored(transaction);
      signal.throwIfAborted();
      const result = await change(state);
      signal.throwIfAborted();
      return result;
    });
  } finally { signal.removeEventListener("abort", abort); }
}
export async function rememberRecitation(record: ListRecord, entryId: string, epoch: string,
  signal: AbortSignal): Promise<RecitationReceipt> {
  return cancellablePersonalWrite(signal, async state => {
      if (state.control.epoch !== epoch || !sameRecitationList(record, state.lists.find(list => list.id === record.id))) {
        throw new PersonalError("stale");
      }
      const next = saveRecitationPosition(state, { listId: record.id, entryId }, state.control);
      if (next !== state) {
        await recitationPosition.put({ id: "recitation", ...next.recitation });
        await control.put(next.control);
      }
      return { before: state.control, after: next.control };
  });
}
export async function restorePersonalContents(contents: PersonalContents, expected: Revision, signal: AbortSignal): Promise<Revision> {
  const candidate = structuredClone(contents);
  return cancellablePersonalWrite(signal, async state => {
    const next = replacePersonalContents(state, candidate, expected);
    await personal.clear();
    await lists.clear();
    await recentHistory.clear();
    await learningLabels.clear();
    await recitationPosition.clear();
    if (next.personal) await personal.put(next.personal);
    await lists.bulkAdd(next.lists);
    await recentHistory.put({ id: "history", ...next.history });
    await learningLabels.put({ id: "learning", ...next.learning });
    await recitationPosition.put({ id: "recitation", ...next.recitation });
    await control.put(next.control);
    return next.control;
  });
}
