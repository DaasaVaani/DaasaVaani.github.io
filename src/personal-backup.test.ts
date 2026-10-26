import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { backupContents, makeBackup, PersonalBackupCodec, type WebBackup } from "./personal-backup";
import { defaultHistory, newControl, type PersonalStore } from "./personal-model";
import { TransferError } from "./list-transfer-types";

const vectors: { accepted: { value: unknown }[]; rejected: { base: number; path: string[]; value: unknown }[] } =
  JSON.parse(readFileSync(new URL("../shared/fixtures/personal/full-backup.json", import.meta.url), "utf8"));
const codec = new PersonalBackupCodec(), bytes = (value: unknown) => gzipSync(Buffer.from(JSON.stringify(value)));
const samples = vectors.accepted.map(({ value }) => value);
function refuses(action: () => unknown, code: TransferError["code"] = "invalid") {
  expect(action).toThrow(TransferError);
  try { action(); } catch (reason) { expect(reason).toMatchObject({ code }); }
}
test("all Shared web vectors round trip losslessly with independent gzip; native vectors are refused", () => {
  for (const sample of samples) {
    const before = structuredClone(sample);
    if (typeof sample === "object" && sample !== null && "platform" in sample && sample.platform === "web") {
      const value = codec.decode(bytes(sample));
      expect(value).toEqual(sample);
      expect(JSON.parse(gunzipSync(codec.encode(value)).toString("utf8"))).toEqual(sample);
      expect(codec.encode(value)).toEqual(codec.encode(value));
      expect(makeBackup({ control: newControl(), ...backupContents(value) }, value.exportedAt)).toEqual(value);
    } else {
      refuses(() => codec.decode(bytes(sample)));
      refuses(() => codec.encode(sample));
    }
    expect(sample).toEqual(before);
  }
});
test("all Shared rejected field mutations fail without changing the candidate", () => {
  for (const vector of vectors.rejected) {
    const value = structuredClone(samples[vector.base]) as Record<string, unknown>;
    let parent = value;
    for (const key of vector.path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    parent[vector.path.at(-1)!] = vector.value;
    const before = structuredClone(value);
    refuses(() => codec.decode(bytes(value)));
    refuses(() => codec.encode(value));
    expect(value).toEqual(before);
  }
});
test("unset preferences remain absent rather than saving rendered defaults or writer metadata", () => {
  const state: PersonalStore = { control: newControl(), lists: [], history: defaultHistory(),
    learning: { entries: [] }, recitation: { position: null } };
  const value = makeBackup(state, "2026-10-24T00:00:00.000Z");
  expect(value.data.preferences).toBeNull(); expect(value.data.favorites).toEqual([]);
  expect(backupContents(codec.decode(codec.encode(value))).personal).toBeUndefined();
  expect(JSON.stringify(value)).not.toMatch(/epoch|revision|"id":"state"|"id":"personal"/u);
});
test("rejects duplicate typed references, globally duplicate occurrences, invalid dates and lone surrogates", () => {
  const sample = codec.decode(bytes(samples[1]));
  const invalid: WebBackup[] = [
    { ...sample, exportedAt: "2026-02-30T00:00:00.000Z" },
    { ...sample, data: { ...sample.data, favorites: [...sample.data.favorites, sample.data.favorites[0]!] } },
    { ...sample, data: { ...sample.data, history: { enabled: false, entries: [...sample.data.history.entries, ...sample.data.history.entries] } } },
    { ...sample, data: { ...sample.data, learning: { entries: [...sample.data.learning.entries, ...sample.data.learning.entries] } } },
    { ...sample, data: { ...sample.data, lists: [sample.data.lists[0]!, { ...sample.data.lists[0]!, id: crypto.randomUUID() }] } },
    { ...sample, data: { ...sample.data, lists: [{ ...sample.data.lists[0]!, name: "\ud800" }] } },
  ];
  for (const value of invalid) { refuses(() => codec.decode(bytes(value))); refuses(() => codec.encode(value)); }
});
test("single-member gzip framing, CRC, ISIZE, optional headers, JSON ambiguity and fatal UTF8 are enforced", () => {
  const value = samples[0], file = bytes(value);
  for (let size = 0; size < file.length; size++) refuses(() => codec.decode(file.subarray(0, size)));
  for (const suffix of [file, Buffer.from([0])]) refuses(() => codec.decode(Buffer.concat([file, suffix])));
  for (const offset of [3, file.length - 8, file.length - 4]) {
    const corrupt = Buffer.from(file); corrupt[offset] = corrupt[offset]! ^ (offset === 3 ? 32 : 1);
    refuses(() => codec.decode(corrupt));
  }
  const optional = Buffer.concat([file.subarray(0, 10), Buffer.from("synthetic.gz\0"), file.subarray(10)]);
  optional[3] = 8;
  expect(codec.decode(optional)).toEqual(value);
  const text = JSON.stringify(value);
  for (const malformed of [text.replace('"formatVersion":1', '"formatVersion":2,"format\\u0056ersion":1'),
    text.replace('"preferences":null', '"preferences":{},"preferences":null')]) {
    refuses(() => codec.decode(gzipSync(Buffer.from(malformed))));
  }
  refuses(() => codec.decode(gzipSync(Buffer.from([0xc3, 0x28]))));
  expect(codec.decode(gzipSync(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])))).toEqual(value);
});
test("encoded/decoded exact caps and cap+1 use real bytes, including whitespace and BOM", () => {
  const value = samples[0], text = Buffer.from(JSON.stringify(value)), file = bytes(value);
  const exact = new PersonalBackupCodec({ maxBackupEncodedBytes: file.length, maxBackupDecodedBytes: text.length });
  expect(exact.decode(file)).toEqual(value);
  refuses(() => new PersonalBackupCodec({ ...exact.limits, maxBackupEncodedBytes: file.length - 1 }).decode(file), "encodedLimit");
  refuses(() => new PersonalBackupCodec({ ...exact.limits, maxBackupDecodedBytes: text.length - 1 }).decode(file), "decodedLimit");
  for (const prefix of [Buffer.from(" "), Buffer.from([0xef, 0xbb, 0xbf])]) {
    refuses(() => new PersonalBackupCodec({ ...__BACKUP_LIMITS__, maxBackupDecodedBytes: text.length })
      .decode(gzipSync(Buffer.concat([prefix, text]))), "decodedLimit");
  }
  const produced = codec.encode(value);
  expect(new PersonalBackupCodec({ ...__BACKUP_LIMITS__, maxBackupEncodedBytes: produced.length }).encode(value)).toEqual(produced);
  refuses(() => new PersonalBackupCodec({ ...__BACKUP_LIMITS__, maxBackupEncodedBytes: produced.length - 1 }).encode(value), "encodedLimit");
  refuses(() => new PersonalBackupCodec({ ...__BACKUP_LIMITS__, maxBackupDecodedBytes: 64 })
    .decode(gzipSync(Buffer.alloc(1000000, 32))), "decodedLimit");
});
test("actual production 64MiB decoded and 65MiB encoded bounds admit equality without a ratio limit", () => {
  const value = samples[0], text = Buffer.from(JSON.stringify(value));
  const decoded = Buffer.alloc(__BACKUP_LIMITS__.maxBackupDecodedBytes, 32); text.copy(decoded);
  expect(codec.decode(gzipSync(decoded))).toEqual(value);
  refuses(() => codec.decode(gzipSync(Buffer.concat([decoded, Buffer.from(" ")]))), "decodedLimit");
  const file = bytes(value), padded = Buffer.alloc(__BACKUP_LIMITS__.maxBackupEncodedBytes, 120);
  file.copy(padded, 0, 0, 10); padded[3] = 16;
  const bodyOffset = padded.length - (file.length - 10);
  padded[bodyOffset - 1] = 0; file.copy(padded, bodyOffset, 10);
  expect(codec.decode(padded)).toEqual(value);
  refuses(() => codec.decode(Buffer.concat([padded, Buffer.from([0])])), "encodedLimit");
});
