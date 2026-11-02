import { expect, test } from "vitest";
import { gzipSync } from "node:zlib";
import {
  defaultHistory, defaultPersonal, finishFirstUse, migrateStoreV8, newControl, parseStore,
  replacePersonalContents, storageBytes, validateStore, type PersonalStore,
} from "./personal-model";
import { backupContents, makeBackup, PersonalBackupCodec } from "./personal-backup";

const initial = (): PersonalStore => ({ control: newControl(), personal: defaultPersonal(), lists: [],
  history: defaultHistory(), learning: { entries: [] }, recitation: { position: null } });

test("completion saves exact preferences atomically, while skip preserves saved or absent preferences", () => {
  for (const saved of [undefined, defaultPersonal()]) {
    const state = { ...initial(), personal: saved }, before = structuredClone(state);
    const draft = { ...(saved ?? defaultPersonal()), language: "kn" as const, density: "relaxed" as const, fontSize: 41 };
    const complete = finishFirstUse(state, "completed", draft, state.control);
    expect(complete).toEqual({ ...state, personal: draft,
      control: { ...state.control, setupStatus: "completed", revision: state.control.revision + 1 } });
    const skip = finishFirstUse(state, "skipped", draft, state.control);
    expect(skip).toEqual({ ...state, control: { ...state.control, setupStatus: "skipped", revision: state.control.revision + 1 } });
    expect(state).toEqual(before);
    expect(() => finishFirstUse(state, "completed", undefined, state.control)).toThrow();
    expect(() => finishFirstUse(state, "completed", { ...draft, favorites: [{ kind: "legacyVideo", videoId: "injected" }] },
      state.control)).toThrow();
    const bytes = storageBytes(complete);
    expect(() => finishFirstUse(state, "completed", draft, state.control, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes })).not.toThrow();
    expect(() => finishFirstUse(state, "completed", draft, state.control, { ...__PERSONAL_LIMITS__, maxPersonalStoredBytes: bytes - 1 })).toThrow();
    expect(() => finishFirstUse(state, "skipped", undefined, { ...state.control, epoch: crypto.randomUUID() })).toThrow();
    expect(() => finishFirstUse(state, "completed", draft, { ...state.control, revision: 1 })).toThrow();
  }
});

test("v8 migration preserves all content, adds pending setup and renews the writer fence without changing inputs", () => {
  const state = initial(), control = { id: "state", formatVersion: 8, epoch: state.control.epoch, revision: 29 };
  const args: [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]] =
    [[control], [state.personal], state.lists, [{ id: "history", ...state.history }],
      [{ id: "learning", ...state.learning }], [{ id: "recitation", ...state.recitation }]];
  const before = structuredClone(args);
  const [, personal, lists, history, learning, recitation] = args;
  const next = migrateStoreV8(...args);
  expect(next).toEqual({ ...state, control: next.control });
  expect(next.control).toMatchObject({ formatVersion: 9, revision: 0, setupStatus: "pending" });
  expect(next.control.epoch).not.toBe(control.epoch);
  expect(args).toEqual(before);
  expect(() => migrateStoreV8([{ ...control, setupStatus: "completed" }], personal, lists, history, learning, recitation)).toThrow();
  for (const setupStatus of ["ready", null, undefined, true]) {
    expect(() => parseStore([{ ...next.control, setupStatus }], personal, lists, history, learning, recitation)).toThrow();
  }
});

test("full backup v2 preserves each setup state and v1 explicitly adapts to pending with no readiness", () => {
  const codec = new PersonalBackupCodec();
  for (const setupStatus of ["pending", "completed", "skipped"] as const) {
    const state = { ...initial(), control: newControl(setupStatus) };
    const value = makeBackup(state, "2026-10-31T00:00:00.000Z");
    const decoded = codec.decode(codec.encode(value));
    expect(decoded).toEqual(value);
    const contents = backupContents(decoded);
    const target = initial(), restored = replacePersonalContents(target, contents, target.control);
    expect(restored.control.setupStatus).toBe(setupStatus);
    expect(() => validateStore(restored)).not.toThrow();
    const { setupStatus: removed, ...oldData } = value.data;
    expect(removed).toBe(setupStatus);
    const old = codec.decode(gzipSync(JSON.stringify({ ...value, formatVersion: 1, data: oldData })));
    expect(backupContents(old).setupStatus).toBe("pending");
    expect(JSON.stringify(value)).not.toMatch(/readiness|download|snapshot|epoch|revision/);
  }
});
