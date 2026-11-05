import { expect, test, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { inspectSnapshot, resumeSnapshot, type SnapshotBundleLimits } from "./snapshot-validation";
import { actualBundledSnapshotFixture, snapshotLimits } from "../tests/snapshot-fixture";

const bounds = (): SnapshotBundleLimits => ({ maxBundleMembers: 100, maxBundleEncodedBytes: 32 * 1024 * 1024 });
function read(fixture: ReturnType<typeof actualBundledSnapshotFixture>) {
  return async (sha256: string) => {
    const bytes = fixture.objects[sha256];
    if (!bytes) throw new Error("Missing synthetic original");
    return new Uint8Array(bytes);
  };
}
async function prepare(options: Parameters<typeof actualBundledSnapshotFixture>[0] = {}) {
  const fixture = actualBundledSnapshotFixture(options);
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read(fixture), snapshotLimits());
  const first = Object.entries(fixture.archives)[0];
  if (!first) throw new Error("Missing synthetic archive");
  return { fixture, candidate, hash: first[0], bytes: first[1] };
}
test("actual strict ZIP bytes yield exactly the admitted original encoded members without changing the candidate", async () => {
  const { fixture, candidate, hash, bytes } = await prepare(), before = candidate.plan();
  const admitted = await candidate.admitBundle(hash, bytes, bounds()), bundle = fixture.bundles[hash];
  if (!bundle) throw new Error("Missing synthetic bundle");
  expect(admitted.map(member => member.sha256)).toEqual(bundle.members);
  for (const member of admitted) {
    expect(member.path).toBe(`objects/${member.sha256}.json.gz`);
    expect(member.bytes).toEqual(fixture.objects[member.sha256]);
    member.bytes.fill(0);
  }
  const repeated = await candidate.admitBundle(hash, bytes, bounds());
  expect(repeated.every(member => member.bytes.some(value => value !== 0))).toBe(true);
  const staged = new Map(candidate.metadataObjects().map(object => [object.sha256, object.bytes]));
  for (const [hash, archive] of Object.entries(fixture.archives)) {
    for (const member of await candidate.admitBundle(hash, archive, bounds())) staged.set(member.sha256, member.bytes);
  }
  await candidate.validate(candidate.plan(), async hash => {
    const bytes = staged.get(hash);
    if (!bytes) throw new Error("Missing actual admitted synthetic member");
    return new Uint8Array(bytes);
  });
  expect(candidate.plan()).toEqual(before);
  expect(before.required.map(object => object.sha256)).not.toContain(hash);
});
test("inclusive archive/count bounds pass equality and reject one below before hashing", async () => {
  const { fixture, candidate, hash, bytes } = await prepare(), bundle = fixture.bundles[hash];
  if (!bundle) throw new Error("Missing synthetic bundle");
  const exact = { maxBundleMembers: bundle.members.length, maxBundleEncodedBytes: bytes.length };
  await expect(candidate.admitBundle(hash, bytes, exact)).resolves.toHaveLength(bundle.members.length);
  const digest = vi.spyOn(crypto.subtle, "digest");
  for (const input of [{ ...exact, maxBundleEncodedBytes: bytes.length - 1 }, { ...exact, maxBundleMembers: bundle.members.length - 1 }]) {
    await expect(candidate.admitBundle(hash, bytes, input)).rejects.toMatchObject({ code: "capacity" });
  }
  expect(digest).not.toHaveBeenCalled();
  digest.mockRestore();
});
test.each(["unknown", "prototype", "malformed"] as const)("an %s bundle identity is refused before byte work", async fault => {
  const { candidate, bytes } = await prepare();
  const hash = fault === "unknown" ? "f".repeat(64) : fault === "prototype" ? "__proto__" : "INVALID";
  await expect(candidate.admitBundle(hash, bytes, bounds())).rejects.toMatchObject({ code: "invalid" });
});
test.each(["length", "hash"] as const)("actual archive %s is required independently of metadata receipts", async fault => {
  if (fault === "hash") {
    const differentHash = (hash: string) => (hash[0] === "0" ? "1" : "0") + hash.slice(1);
    const { candidate, hash, bytes } = await prepare({ manifest: value => ({ ...value,
      bundles: Object.fromEntries(Object.entries(value.bundles).map(([hash, bundle]) => {
        const changed = differentHash(hash);
        return [changed, { ...bundle, path: `bundles/${changed}.zip` }];
      })),
    }) });
    await expect(candidate.admitBundle(differentHash(hash), bytes, bounds())).rejects.toMatchObject({ code: "integrity" });
    return;
  }
  const { candidate, hash, bytes } = await prepare(), input = new Uint8Array(bytes);
  await expect(candidate.admitBundle(hash, input.subarray(0, input.length - 1), bounds()))
    .rejects.toMatchObject({ code: "integrity" });
});
test.each(["crc", "timestamp", "flags", "trailing"] as const)("a rehashed %s archive is still refused by the approved exact container profile", async fault => {
  const { candidate, hash, bytes } = await prepare({ zipBytes: input => {
    if (fault === "trailing") return new Uint8Array([...input, 0]);
    const changed = new Uint8Array(input), index = fault === "crc" ? 14 : fault === "timestamp" ? 10 : 6;
    changed[index] = (changed[index] ?? 0) ^ 1;
    if (fault === "crc") {
      const view = new DataView(changed.buffer), central = view.getUint32(changed.length - 6, true);
      changed[central + 16] = (changed[central + 16] ?? 0) ^ 1;
    }
    return changed;
  } });
  await expect(candidate.admitBundle(hash, bytes, bounds())).rejects.toMatchObject({ code: "integrity" });
});
test("valid framing, matching CRC records and whole archive hash cannot replace each original member SHA", async () => {
  const { candidate, hash, bytes } = await prepare({ zipBytes: input => {
    const changed = new Uint8Array(input), view = new DataView(changed.buffer);
    const start = 30 + view.getUint16(26, true), length = view.getUint32(18, true);
    changed[start] = (changed[start] ?? 0) ^ 1;
    const compressed = gzipSync(changed.subarray(start, start + length));
    const crc = compressed.readUInt32LE(compressed.length - 8), central = view.getUint32(changed.length - 6, true);
    view.setUint32(14, crc, true); view.setUint32(central + 16, crc, true);
    return changed;
  } });
  await expect(candidate.admitBundle(hash, bytes, bounds())).rejects.toMatchObject({ code: "integrity" });
});
test("declared membership cannot substitute another valid original while keeping a valid archive hash", async () => {
  const { candidate, hash, bytes } = await prepare({ manifest: value => {
    const members = value.catalog.map(entry => entry.item).sort();
    return { ...value, bundles: Object.fromEntries(Object.entries(value.bundles).map(([hash, bundle]) => [hash, {
      ...bundle, members: members.filter(member => !bundle.members.includes(member)),
    }])) };
  } });
  await expect(candidate.admitBundle(hash, bytes, bounds())).rejects.toMatchObject({ code: "integrity" });
});
test("valid container/member hashes do not replace gzip/JSON/lyric validation", async () => {
  const { fixture, candidate } = await prepare({ jsonBytes: (role, bytes) =>
    role === "item" ? new Uint8Array([...bytes, 32]) : bytes });
  const staged = new Map(candidate.metadataObjects().map(object => [object.sha256, object.bytes]));
  for (const [hash, bytes] of Object.entries(fixture.archives)) {
    for (const member of await candidate.admitBundle(hash, bytes, bounds())) staged.set(member.sha256, member.bytes);
  }
  await expect(candidate.validate(candidate.plan(), async hash => {
    const bytes = staged.get(hash);
    if (!bytes) throw new Error("Missing staged synthetic member");
    return new Uint8Array(bytes);
  })).rejects.toMatchObject({ code: "integrity" });
});
test("recovered candidates admit the same exact archives without the old in-memory candidate", async () => {
  const { fixture, candidate, hash, bytes } = await prepare();
  const recovered = await resumeSnapshot(candidate.plan(), read(fixture), snapshotLimits());
  expect(await recovered.admitBundle(hash, bytes, bounds())).toEqual(await candidate.admitBundle(hash, bytes, bounds()));
});
test("input bytes and bounds are captured before asynchronous hashes, while pre/post cancellation never yields members", async () => {
  const { fixture, candidate, hash, bytes } = await prepare(), input = new Uint8Array(bytes), limits = bounds();
  const pending = candidate.admitBundle(hash, input, limits);
  input.fill(0); limits.maxBundleEncodedBytes = 1; limits.maxBundleMembers = 1;
  const result = await pending;
  expect(result.every(member => member.bytes.length === fixture.objects[member.sha256]?.length)).toBe(true);
  const controller = new AbortController();
  controller.abort();
  await expect(candidate.admitBundle(hash, bytes, bounds(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  const later = new AbortController(), cancelled = candidate.admitBundle(hash, bytes, bounds(), later.signal);
  later.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
});
test.each(["missing", "extra", "zero", "fractional", "unsafe"] as const)("invalid %s bundle limits are explicit refusals", async fault => {
  const { candidate, hash, bytes } = await prepare();
  if (fault === "missing") {
    // @ts-expect-error Exercise runtime refusal of a missing required bound.
    await expect(candidate.admitBundle(hash, bytes, { maxBundleMembers: 100 })).rejects.toMatchObject({ code: "invalid" });
    return;
  }
  const input = fault === "extra" ? { ...bounds(), extra: true } :
    { ...bounds(), maxBundleEncodedBytes: fault === "zero" ? 0 : fault === "fractional" ? 1.5 : Number.MAX_SAFE_INTEGER + 1 };
  await expect(candidate.admitBundle(hash, bytes, input)).rejects.toMatchObject({ code: "invalid" });
});
