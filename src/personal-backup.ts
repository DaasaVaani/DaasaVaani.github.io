import Ajv2020 from "ajv/dist/2020";
import schema from "../shared/schemas/full-personal-backup.schema.json";
import type { FullPersonalBackupV1 } from "../shared/types/personal";
import {
  newControl, PersonalError, referenceKey, validateStore, type PersonalContents, type PersonalStore,
} from "./personal-model";
import { TransferError } from "./list-transfer-types";
import { encodeTransferJson, parseTransferJson, transformTransferBytes } from "./transfer-bytes";

export type WebBackup = Extract<FullPersonalBackupV1, { platform: "web" }>;
const valid = new Ajv2020({ strict: true }).compile<FullPersonalBackupV1>(schema);

export function backupContents(value: WebBackup): PersonalContents {
  const data = value.data, preferences = data.preferences;
  return { personal: preferences === null ? undefined : {
    id: "personal", language: preferences.language, theme: preferences.theme, fontSize: preferences.fontSizePx,
    density: preferences.density, favorites: data.favorites,
  }, lists: data.lists, history: data.history, learning: data.learning, recitation: data.recitation };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function makeBackup(state: PersonalStore, exportedAt: string): WebBackup {
  validateStore(state);
  const saved = state.personal;
  return { format: "daasavaani-personal-backup", formatVersion: 1, platform: "web", exportedAt, data: {
    preferences: saved ? { language: saved.language, theme: saved.theme, fontSizePx: saved.fontSize, density: saved.density } : null,
    favorites: saved?.favorites ?? [], lists: state.lists, history: state.history, learning: state.learning, recitation: state.recitation,
  } };
}
export class PersonalBackupCodec {
  constructor(readonly limits = __BACKUP_LIMITS__) {}
  validate(value: unknown): asserts value is WebBackup {
    if (!valid(value) || value.platform !== "web") throw new TransferError("invalid");
    const date = new Date(value.exportedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.exportedAt) throw new TransferError("invalid");
    const pending: unknown[] = [value];
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === "string" && /[\ud800-\udfff]/u.test(item)) throw new TransferError("invalid");
      if (item && typeof item === "object") pending.push(...Object.values(item));
    }
    const data = value.data;
    if (data.preferences === null && data.favorites.length) throw new TransferError("invalid");
    for (const entries of [data.favorites, data.history.entries, data.learning.entries]) {
      if (new Set(entries.map(referenceKey)).size !== entries.length) throw new TransferError("invalid");
    }
    try { validateStore({ control: newControl(), ...backupContents(value) }); }
    catch (reason) {
      if (reason instanceof PersonalError) throw new TransferError(reason.code === "capacity" ? "decodedLimit" : "invalid");
      throw reason;
    }
    encodeTransferJson(canonical(data), __PERSONAL_LIMITS__.maxPersonalStoredBytes);
    encodeTransferJson(canonical(value), this.limits.maxBackupDecodedBytes);
  }
  decode(bytes: Uint8Array): WebBackup {
    if (bytes.length > this.limits.maxBackupEncodedBytes) throw new TransferError("encodedLimit");
    const decoded = transformTransferBytes(bytes, true, true, this.limits.maxBackupDecodedBytes,
      __WEB_CONFIG__.transferChunkBytes, __WEB_CONFIG__.listCompressionLevel);
    const value = parseTransferJson(decoded);
    this.validate(value);
    return value;
  }
  encode(value: unknown): Uint8Array {
    this.validate(value);
    return transformTransferBytes(encodeTransferJson(canonical(value), this.limits.maxBackupDecodedBytes), true, false,
      this.limits.maxBackupEncodedBytes, __WEB_CONFIG__.transferChunkBytes, __WEB_CONFIG__.listCompressionLevel);
  }
}
