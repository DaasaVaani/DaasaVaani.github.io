import { describe, expect, it } from "vitest";
import { gzipSync, gunzipSync, deflateRawSync, inflateRawSync, deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { ListCodec } from "./list-transfer";
import { type ListSnapshot, TransferError } from "./list-transfer-types";

const config = { ...__WEB_CONFIG__, ...__TRANSFER_LIMITS__ };
const codec = new ListCodec(config);
const fixtures: { accepted: { value: ListSnapshot }[]; rejected: { label: string; value: unknown }[] } =
  JSON.parse(readFileSync(new URL("../shared/fixtures/personal/list-transfer.json", import.meta.url), "utf8"));
const typedFixtures: { accepted: { value: ListSnapshot }[]; rejectedEntries: unknown[] } =
  JSON.parse(readFileSync(new URL("../shared/fixtures/personal/list-transfer-v2.json", import.meta.url), "utf8"));
const sample = fixtures.accepted[1]!.value;
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const link = (bytes: Uint8Array) => new URL(config.listLinkPath, config.canonicalBaseUrl).href + "#/list/" + Buffer.from(bytes).toString("base64url");
function errorCode(action: () => unknown, code: TransferError["code"]) {
  try { action(); throw new Error("Expected codec rejection"); }
  catch (error) {
    expect(error).toBeInstanceOf(TransferError);
    if (!(error instanceof TransferError)) throw error;
    expect(error.code).toBe(code);
  }
}
describe("minimal list transport", () => {
  it("round trips every Shared typed fixture with independent gzip/raw deflate, without downgrade or mutation", () => {
    for (const { value } of typedFixtures.accepted) {
      const before = structuredClone(value), decoded = json(value);
      expect(codec.decodeFile(gzipSync(decoded))).toEqual(value);
      expect(codec.decodeLink(link(deflateRawSync(decoded)))).toEqual(value);
      expect(JSON.parse(gunzipSync(codec.encodeFile(value)).toString("utf8"))).toEqual(value);
      expect(codec.decodeLink(codec.encodeLink(value))).toEqual(value);
      expect(new ListCodec({ ...config, maxListDecodedBytes: decoded.length }).decodeFile(gzipSync(decoded))).toEqual(value);
      errorCode(() => new ListCodec({ ...config, maxListDecodedBytes: decoded.length - 1 }).decodeFile(gzipSync(decoded)), "decodedLimit");
      expect(value).toEqual(before);
    }
  });
  it("rejects all typed invalid entries, mixed version identities and future versions through both decode and encode", () => {
    const empty = typedFixtures.accepted[1]!.value;
    for (const value of [...typedFixtures.rejectedEntries.map(entry => ({ ...empty, entries: [entry] })),
      { ...empty, formatVersion: 3 }, { ...empty, formatVersion: 1, entries: typedFixtures.accepted[0]!.value.entries }]) {
      errorCode(() => codec.decodeFile(gzipSync(json(value))), "invalid");
      errorCode(() => codec.decodeLink(link(deflateRawSync(json(value)))), "invalid");
      errorCode(() => codec.encodeFile(value), "invalid");
      errorCode(() => codec.encodeLink(value), "invalid");
    }
  });
  it("round trips accepted fixtures losslessly and interoperates with independent Node gzip/raw deflate", () => {
    for (const { value } of fixtures.accepted) {
      const before = structuredClone(value);
      const file = codec.encodeFile(value);
      expect(codec.encodeFile(value)).toEqual(file);
      expect(JSON.parse(gunzipSync(file).toString("utf8"))).toEqual(value);
      expect(file[9]).toBe(255);
      expect(codec.decodeFile(gzipSync(json(value)))).toEqual(value);
      expect(codec.decodeLink(codec.encodeLink(value))).toEqual(value);
      expect(codec.decodeLink(link(deflateRawSync(json(value))))).toEqual(value);
      const payload = codec.encodeLink(value).split("#/list/")[1]!;
      expect(JSON.parse(inflateRawSync(Buffer.from(payload, "base64url")).toString("utf8"))).toEqual(value);
      expect(value).toEqual(before);
    }
  });
  it("rejects every truncated file, concatenated members, trailing data, bad CRC and wrong length/wrapper", () => {
    const file = gzipSync(json(sample));
    for (let length = 0; length < file.length; length++) errorCode(() => codec.decodeFile(file.subarray(0, length)), "invalid");
    for (const suffix of [file, Buffer.from([0]), Buffer.from("garbage")]) {
      errorCode(() => codec.decodeFile(Buffer.concat([file, suffix])), "invalid");
    }
    for (const offset of [file.length - 8, file.length - 4]) {
      const corrupt = Buffer.from(file); corrupt[offset] = corrupt[offset]! ^ 1;
      errorCode(() => codec.decodeFile(corrupt), "invalid");
    }
    errorCode(() => codec.decodeFile(deflateSync(json(sample))), "invalid");
    errorCode(() => codec.decodeLink(link(Buffer.concat([deflateRawSync(json(sample)), Buffer.from([0])]))), "invalid");
  });
  it("accepts one BOM within the decoded cap and rejects invalid UTF8, JSON and schema versions", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    expect(codec.decodeFile(gzipSync(Buffer.concat([bom, json(sample)])))).toEqual(sample);
    for (const data of [Buffer.from([0xc3, 0x28]), Buffer.concat([bom, bom, json(sample)]), Buffer.from("{bad json")]) {
      errorCode(() => codec.decodeFile(gzipSync(data)), "invalid");
    }
    for (const { label, value } of fixtures.rejected) {
      if (label === "newer version") expect(codec.decodeFile(gzipSync(json(value)))).toEqual(value);
      else errorCode(() => codec.decodeFile(gzipSync(json(value))), "invalid");
    }
    const duplicate = '{"format":"daasavaani-list","formatVersion":2,"formatVersion":1,"name":"Test","entries":[]}';
    errorCode(() => codec.decodeFile(gzipSync(Buffer.from(duplicate))), "invalid");
    errorCode(() => codec.decodeFile(gzipSync(Buffer.from(duplicate.replace('"formatVersion":1', '"format\\u0056ersion":1')))), "invalid");
  });
  it("enforces exact encoded and decoded ceilings including BOM and highly compressible data", () => {
    const decoded = json(sample), file = gzipSync(decoded);
    const exact = new ListCodec({ ...config, maxListEncodedBytes: file.length, maxListDecodedBytes: decoded.length, transferChunkBytes: 7 });
    expect(exact.decodeFile(file)).toEqual(sample);
    errorCode(() => exact.decodeFile(Buffer.concat([file, Buffer.from([0])])), "encodedLimit");
    errorCode(() => new ListCodec({ ...config, maxListDecodedBytes: decoded.length - 1 }).decodeFile(file), "decodedLimit");
    errorCode(() => new ListCodec({ ...config, maxListDecodedBytes: decoded.length }).decodeFile(
      gzipSync(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), decoded]))), "decodedLimit");
    const reduced = new ListCodec({ ...config, maxListDecodedBytes: decoded.length - 1 });
    errorCode(() => reduced.encodeFile(sample), "decodedLimit");
    const produced = codec.encodeFile(sample);
    expect(new ListCodec({ ...config, maxListEncodedBytes: produced.length, maxListDecodedBytes: decoded.length }).encodeFile(sample)).toEqual(produced);
    errorCode(() => new ListCodec({ ...config, maxListEncodedBytes: produced.length - 1 }).encodeFile(sample), "encodedLimit");
    errorCode(() => new ListCodec({ ...config, maxListEncodedBytes: 1 }).encodeFile(sample), "encodedLimit");
    errorCode(() => new ListCodec({ ...config, maxListDecodedBytes: 64 }).decodeFile(gzipSync(Buffer.alloc(1000000, 32))), "decodedLimit");
    const padded = Buffer.alloc(config.maxListEncodedBytes, 120);
    file.copy(padded, 0, 0, 10);
    padded[3] = 16;
    const bodyOffset = padded.length - (file.length - 10);
    padded[bodyOffset - 1] = 0;
    file.copy(padded, bodyOffset, 10);
    expect(codec.decodeFile(padded)).toEqual(sample);
    errorCode(() => codec.decodeFile(Buffer.concat([padded, Buffer.from([0])])), "encodedLimit");
  });
  it("accepts exactly the production decoded-byte ceiling without a compression-ratio cap", () => {
    const empty = { ...sample, entries: [] };
    const entry = { kind: "placeholder" as const, text: "" };
    const header = json(empty).length, overhead = json(entry).length + 1;
    const fullText = "\u{1f600}".repeat(512);
    const count = Math.floor((config.maxListDecodedBytes - header + 1) / (overhead + 2048)) - 2;
    const entries = Array.from({ length: count }, () => ({ ...entry, text: fullText }));
    let remaining = config.maxListDecodedBytes - (header + (count + 3) * overhead - 1 + count * 2048);
    for (let index = 0; index < 3; index++) {
      const bytes = Math.min(2048, remaining - (2 - index));
      entries.push({ ...entry, text: "\u{1f600}".repeat(Math.floor(bytes / 4)) + ["", "a", "\u00e9", "\u0c95"][bytes % 4]! });
      remaining -= bytes;
    }
    expect(remaining).toBe(0);
    const value = { ...empty, entries }, decoded = json(value);
    expect(decoded.length).toBe(config.maxListDecodedBytes);
    expect(codec.decodeFile(gzipSync(decoded))).toEqual(value);
    expect(JSON.parse(gunzipSync(codec.encodeFile(value)).toString("utf8"))).toEqual(value);
    errorCode(() => codec.decodeFile(gzipSync(Buffer.concat([decoded, Buffer.from(" ")]))), "decodedLimit");
  });
  it("uses the complete ASCII URL ceiling exactly and never truncates oversized links", () => {
    const encoded = codec.encodeLink(sample);
    const exact = new ListCodec({ ...config, maxSharedUrlAscii: encoded.length });
    expect(exact.encodeLink(sample)).toBe(encoded);
    expect(exact.decodeLink(encoded)).toEqual(sample);
    const smaller = new ListCodec({ ...config, maxSharedUrlAscii: encoded.length - 1 });
    errorCode(() => smaller.encodeLink(sample), "linkLimit");
    errorCode(() => smaller.decodeLink(encoded), "linkLimit");
    const large = { ...sample, entries: Array.from({ length: 100 }, (_, i) => ({ kind: "placeholder" as const,
      text: Array.from({ length: 512 }, (_, j) => String.fromCharCode(33 + (i * 17 + j * 37) % 90)).join("") })) };
    const uncompressed = new ListCodec({ ...config, listCompressionLevel: 0 });
    errorCode(() => uncompressed.encodeLink(large), "linkLimit");
    expect(uncompressed.decodeFile(uncompressed.encodeFile(large))).toEqual(large);
    const boundary = { ...sample, entries: [
      { kind: "placeholder" as const, text: "a".repeat(512) },
      { kind: "placeholder" as const, text: "a".repeat(512) },
      { kind: "placeholder" as const, text: "" },
    ] };
    boundary.entries[2]!.text = "a".repeat(1500 - json(boundary).length);
    const boundaryLink = uncompressed.encodeLink(boundary);
    expect(boundaryLink.length).toBe(2048);
    expect(codec.decodeLink(boundaryLink)).toEqual(boundary);
    errorCode(() => codec.decodeLink(boundaryLink + "A"), "linkLimit");
  });
  it("rejects noncanonical base64url, untrusted origins, URL extras and unsupported payloads", () => {
    const valid = codec.encodeLink(sample);
    for (const invalid of [valid + "=", valid + "%20", valid.replace("https:", "http:"), valid.replace("daasavaani.github.io", "example.invalid"),
      valid.replace("/open/", "/other/"), valid.replace("#", "?extra=1#"), " " + valid, valid.replace("#/list/", "#/list/A/")]) {
      errorCode(() => codec.decodeLink(invalid), "invalid");
    }
    errorCode(() => codec.decodeLink(link(deflateSync(json(sample)))), "invalid");
    expect(codec.decodeLink(valid.replace("/open/", "/"))).toEqual(sample);
  });
});
