import { expect, test, vi } from "vitest";
import { inspectSnapshot, resumeSnapshot } from "./snapshot-validation";
import { fixtureCanonical, snapshotFixture, snapshotLimits } from "../tests/snapshot-fixture";

function provider(fixture: ReturnType<typeof snapshotFixture>) {
  return vi.fn(async (sha256: string) => {
    const bytes = fixture.objects[sha256];
    if (!bytes) throw new Error("Synthetic object is absent");
    return new Uint8Array(bytes);
  });
}
test("recovery reconstructs a fresh candidate from retained metadata without reading unfinished items", async () => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  const metadata = new Map(candidate.metadataObjects().map(object => [object.sha256, object.bytes]));
  const read = vi.fn(async (hash: string) => {
    const bytes = metadata.get(hash);
    if (!bytes) throw new Error("Recovery must not request incomplete items");
    return new Uint8Array(bytes);
  });
  const recovered = await resumeSnapshot(candidate.plan(), read, snapshotLimits());
  expect(recovered.plan()).toEqual(candidate.plan());
  expect(read.mock.calls.map(([hash]) => hash)).toEqual([
    fixture.descriptor.manifest.sha256, fixture.descriptorHash, fixture.descriptor.manifest.sha256, fixture.manifest.policy,
  ]);
  await recovered.validate(recovered.plan(), provider(fixture));
});
test.each(["missing", "corrupt"] as const)("recovery refuses %s original descriptor bytes rather than manufacturing evidence", async fault => {
  const fixture = snapshotFixture(), read = provider(fixture);
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  await expect(resumeSnapshot(candidate.plan(), async hash => {
    const bytes = await read(hash);
    if (hash !== fixture.descriptorHash) return bytes;
    if (fault === "missing") return new Uint8Array();
    bytes[0] = 0;
    return bytes;
  }, snapshotLimits())).rejects.toMatchObject({ code: "integrity" });
});
test("old generic plans explicitly require original-descriptor admission or restart without mutation", async () => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  const plan = candidate.plan();
  plan.required = plan.required.filter(object => object.sha256 !== fixture.descriptorHash);
  const before = structuredClone(plan);
  await expect(resumeSnapshot(plan, provider(fixture), snapshotLimits())).rejects.toMatchObject({
    code: "unsupported", message: expect.stringContaining("original-descriptor admission or restart"),
  });
  expect(plan).toEqual(before);
});
test.each(["extra", "missing-original", "wrong-length"] as const)("recovery refuses %s receipts before reading descriptor evidence", async fault => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  const plan = candidate.plan(), itemHash = fixture.manifest.catalog[0]?.item;
  if (!itemHash) throw new Error("Missing synthetic item");
  if (fault === "extra") plan.required.push({ sha256: "f".repeat(64), encodedBytes: 1 });
  else if (fault === "missing-original") plan.required = plan.required.filter(object => object.sha256 !== itemHash);
  else {
    const receipt = plan.required.find(object => object.sha256 === itemHash);
    if (!receipt) throw new Error("Missing synthetic receipt");
    receipt.encodedBytes++;
  }
  plan.required.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0);
  const read = provider(fixture);
  await expect(resumeSnapshot(plan, read, snapshotLimits())).rejects.toMatchObject({ code: "invalid" });
  expect(read).toHaveBeenCalledTimes(1);
});
test("a valid original descriptor for another sequence cannot authenticate the retained reference", async () => {
  const fixture = snapshotFixture(), other = snapshotFixture({ sequence: 2 });
  const candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits()), plan = candidate.plan();
  plan.required = plan.required.filter(object => object.sha256 !== fixture.descriptorHash);
  plan.required.push({ sha256: other.descriptorHash, encodedBytes: other.descriptorBytes.length });
  plan.required.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0);
  await expect(resumeSnapshot(plan, provider(other), snapshotLimits())).rejects.toMatchObject({ code: "invalid" });
});
test.each(["encoded", "decoded"] as const)("recovery accounts for descriptor evidence once at the exact %s aggregate boundary", async kind => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  const key = kind === "encoded" ? "maxTotalEncodedBytes" : "maxTotalDecodedBytes";
  const ceiling = kind === "encoded" ? fixture.encodedBytes : fixture.decodedBytes;
  const exact = { ...snapshotLimits(), [key]: ceiling };
  await expect(resumeSnapshot(candidate.plan(), provider(fixture), exact)).resolves.toBeDefined();
  const read = provider(fixture);
  await expect(resumeSnapshot(candidate.plan(), read, { ...exact, [key]: ceiling - 1 })).rejects.toMatchObject({ code: "capacity" });
  expect(read).toHaveBeenCalledTimes(kind === "encoded" ? 0 : 1);
});
test("recovery bounds preliminary inflation, evidence bytes and object count before further acquisition", async () => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  for (const limits of [
    { ...snapshotLimits(), maxManifestDecodedBytes: fixture.descriptor.manifest.decodedBytes - 1 },
    { ...snapshotLimits(), maxDescriptorBytes: fixture.descriptorBytes.length - 1 },
    { ...snapshotLimits(), maxItems: 1 },
  ]) {
    const read = provider(fixture);
    await expect(resumeSnapshot(candidate.plan(), read, limits)).rejects.toMatchObject({ code: "capacity" });
    expect(read.mock.calls.length).toBeLessThanOrEqual(1);
  }
});
test("recovery cannot bypass the original declared manifest decoded length", async () => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  const descriptor = structuredClone(fixture.descriptor);
  descriptor.manifest.decodedBytes--;
  const bytes = new TextEncoder().encode(fixtureCanonical(descriptor) + "\n");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
  const plan = candidate.plan();
  plan.required = plan.required.filter(object => object.sha256 !== fixture.descriptorHash);
  plan.required.push({ sha256: hash, encodedBytes: bytes.length });
  plan.required.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0);
  const read = provider(fixture);
  await expect(resumeSnapshot(plan, async requested => requested === hash ? bytes : read(requested), snapshotLimits()))
    .rejects.toMatchObject({ code: "integrity" });
});
test("recovery captures limits and cancels without reading another object", async () => {
  const fixture = snapshotFixture(), candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), snapshotLimits());
  const abort = new AbortController(), read = provider(fixture), limits = snapshotLimits();
  await expect(resumeSnapshot(candidate.plan(), async hash => {
    limits.maxDescriptorBytes = 1;
    return read(hash);
  }, limits)).resolves.toBeDefined();
  abort.abort();
  read.mockClear();
  await expect(resumeSnapshot(candidate.plan(), read, snapshotLimits(), abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(read).not.toHaveBeenCalled();
});
test("actual staged snapshot bytes bind complete original-object plans, preserve candidates and reverify all stored bytes", async () => {
  const fixture = snapshotFixture(), read = provider(fixture);
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  expect(read.mock.calls.map(([hash]) => hash)).toEqual([fixture.descriptor.manifest.sha256, fixture.manifest.policy]);
  const plan = candidate.plan();
  expect(plan.reference).toEqual({ sequence: 1, manifestSha256: fixture.descriptor.manifest.sha256 });
  expect(plan.required.map(object => object.sha256)).toEqual(Object.keys(fixture.objects).sort());
  plan.reference.sequence = 9;
  candidate.metadataObjects().forEach(object => object.bytes.fill(0));
  expect(candidate.plan().reference.sequence).toBe(1);
  await candidate.validate(candidate.plan(), read);
  expect(read.mock.calls).toHaveLength(7);
});
test("unknown optional nested fields and integer-like JSON keys are inert without losing their canonical byte identity", async () => {
  const fixture = snapshotFixture({
    manifest: value => ({ ...value, extra: { "2": "two", "10": "ten" },
      objects: Object.fromEntries(Object.entries(value.objects).map(([hash, object]) => [hash, { ...object, sha256: "inert" }])) }),
    policy: value => ({ ...value, extra: true, transferPlanning: { ...value.transferPlanning, extra: [] } }),
    item: value => ({ ...value, extra: { nested: true }, lines: value.lines.map(line => ({ ...line, optional: "ignored" })) }),
  });
  const read = provider(fixture), candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  await candidate.validate(candidate.plan(), read);
});
test.each(["encoded", "decoded"] as const)("complete actual %s byte accounting accepts equality and rejects one byte less", async kind => {
  const fixture = snapshotFixture();
  const key = kind === "encoded" ? "maxTotalEncodedBytes" : "maxTotalDecodedBytes";
  const ceiling = kind === "encoded" ? fixture.encodedBytes : fixture.decodedBytes;
  const exact = { ...snapshotLimits(), [key]: ceiling };
  const candidate = await inspectSnapshot(fixture.descriptorBytes, provider(fixture), exact);
  await candidate.validate(candidate.plan(), provider(fixture));
  await expect(inspectSnapshot(fixture.descriptorBytes, provider(fixture), { ...exact, [key]: ceiling - 1 }))
    .rejects.toMatchObject({ code: "capacity" });
});
test("manifest acquisition cannot exceed the known aggregate budget even before metadata admission", async () => {
  const fixture = snapshotFixture(), read = provider(fixture);
  await expect(inspectSnapshot(fixture.descriptorBytes, read, {
    ...snapshotLimits(), maxTotalEncodedBytes: fixture.descriptorBytes.length + fixture.descriptor.manifest.encodedBytes - 1,
  })).rejects.toMatchObject({ code: "capacity" });
  expect(read).not.toHaveBeenCalled();
  await expect(inspectSnapshot(new Uint8Array(), read, snapshotLimits())).rejects.toMatchObject({ code: "integrity" });
  await expect(inspectSnapshot(new Uint8Array(snapshotLimits().maxDescriptorBytes + 1), read, snapshotLimits()))
    .rejects.toMatchObject({ code: "capacity" });
  expect(read).not.toHaveBeenCalled();
});
test.each(["major", "required"] as const)("unsupported %s fails before policy or item access", async kind => {
  const fixture = snapshotFixture({ manifest: value => kind === "major" ? { ...value, formatVersion: 2 }
    : { ...value, requiredCapabilities: [...value.requiredCapabilities, "unimplemented-v1"] } });
  const read = provider(fixture);
  await expect(inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits())).rejects.toMatchObject({ code: "unsupported" });
  expect(read).toHaveBeenCalledTimes(1);
});
test("decoded role ceilings and complete item counts fail before policy/item reads", async () => {
  const fixture = snapshotFixture(), read = provider(fixture);
  await expect(inspectSnapshot(fixture.descriptorBytes, read, { ...snapshotLimits(), maxItemDecodedBytes: 1 }))
    .rejects.toMatchObject({ code: "capacity" });
  expect(read).toHaveBeenCalledTimes(1);
  await expect(inspectSnapshot(fixture.descriptorBytes, provider(fixture), { ...snapshotLimits(), maxItems: 1 }))
    .rejects.toMatchObject({ code: "capacity" });
});
test("actual length and SHA256 are required rather than trusting cached receipts", async () => {
  const fixture = snapshotFixture(), read = provider(fixture);
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  await expect(candidate.validate(candidate.plan(), async hash => {
    const bytes = await read(hash);
    if (hash === fixture.manifest.policy) bytes[0] = 0;
    return bytes;
  })).rejects.toMatchObject({ code: "integrity" });
  await expect(inspectSnapshot(fixture.descriptorBytes, async () => new Uint8Array(1), snapshotLimits()))
    .rejects.toMatchObject({ code: "integrity" });
});
test.each(["trailing", "concatenated", "crc"] as const)("a rehashed %s gzip fault is not valid decoded content", async fault => {
  const fixture = snapshotFixture({ gzipBytes: (role, bytes) => {
    if (role !== "item") return bytes;
    if (fault === "trailing") return new Uint8Array([...bytes, 0]);
    if (fault === "concatenated") return new Uint8Array([...bytes, ...bytes]);
    const corrupted = new Uint8Array(bytes), index = corrupted.length - 8, value = corrupted[index];
    if (value === undefined) throw new Error("Missing synthetic gzip CRC");
    corrupted[index] = value ^ 1;
    return corrupted;
  } });
  const read = provider(fixture), candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  await expect(candidate.validate(candidate.plan(), read)).rejects.toMatchObject({ code: "integrity" });
});
test.each(["whitespace", "duplicate", "utf8", "surrogate"] as const)("rehashed %s JSON is rejected rather than normalized into success", async fault => {
  const fixture = snapshotFixture({ items: snapshotFixture().items.slice(0, 1), jsonBytes: (role, bytes) => {
    if (role !== "item") return bytes;
    if (fault === "utf8") return new Uint8Array([0xff]);
    if (fault === "surrogate") return new TextEncoder().encode('{"x":"\\ud800"}');
    if (fault === "duplicate") return new TextEncoder().encode('{"x":1,"\\u0078":2}');
    return new Uint8Array([...bytes, 32]);
  } });
  const read = provider(fixture), candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  await expect(candidate.validate(candidate.plan(), read)).rejects.toMatchObject({ code: "integrity" });
});
test("compatible gzip header profiles are accepted without requiring the producer's exact recompression bytes", async () => {
  const fixture = snapshotFixture({ gzipBytes: (_role, bytes) => {
    const changed = new Uint8Array(bytes);
    changed[4] = 1; changed[9] = 255;
    return changed;
  } });
  const read = provider(fixture), candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  await candidate.validate(candidate.plan(), read);
});
test("a genuinely decoded unsupported policy major is rejected after its exact bytes are verified", async () => {
  const fixture = snapshotFixture({ policy: value => ({ ...value, formatVersion: 2 }) }), read = provider(fixture);
  await expect(inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits())).rejects.toMatchObject({ code: "unsupported" });
  expect(read).toHaveBeenCalledTimes(2);
});
test("limits have no defaults and supported capabilities are captured before asynchronous byte acquisition", async () => {
  const fixture = snapshotFixture(), read = provider(fixture);
  await expect(inspectSnapshot(fixture.descriptorBytes, read, { ...snapshotLimits(), chunkBytes: 0 }))
    .rejects.toMatchObject({ code: "invalid" });
  expect(read).not.toHaveBeenCalled();
  const limits = snapshotLimits();
  const candidate = await inspectSnapshot(fixture.descriptorBytes, async hash => {
    limits.supportedCapabilities = [];
    return read(hash);
  }, limits);
  await candidate.validate(candidate.plan(), read);
});
test("descriptor canonical JSON plus exactly one LF cannot be replaced with a legacy feed or incidental whitespace", async () => {
  const fixture = snapshotFixture();
  for (const bytes of [
    fixture.descriptorBytes.subarray(0, -1), new Uint8Array([...fixture.descriptorBytes, 10]),
    new TextEncoder().encode(JSON.stringify(fixture.descriptor) + "\n"),
  ]) await expect(inspectSnapshot(bytes, provider(fixture), snapshotLimits())).rejects.toMatchObject({ code: "integrity" });
  const legacy = new TextEncoder().encode(fixtureCanonical({ format: "daasavaani-lyrics", formatVersion: 1,
    manifest: fixture.descriptor.manifest }) + "\n");
  await expect(inspectSnapshot(legacy, provider(fixture), snapshotLimits())).rejects.toThrow();
});
test("valid encoded/schema receipts do not excuse catalog mismatch or globally conflicting lyric line identities", async () => {
  const mismatched = snapshotFixture({ item: value => ({ ...value, title: "Not the catalog title" }) });
  const mismatchRead = provider(mismatched), mismatch = await inspectSnapshot(mismatched.descriptorBytes, mismatchRead, snapshotLimits());
  await expect(mismatch.validate(mismatch.plan(), mismatchRead)).rejects.toMatchObject({ code: "invalid" });
  const conflicting = snapshotFixture({ item: value => ({ ...value,
    lines: value.lines.map(line => line.kind === "line" ? { ...line, lineId: "20000000-0000-4000-8000-000000000001" } : line) }) });
  const read = provider(conflicting), candidate = await inspectSnapshot(conflicting.descriptorBytes, read, snapshotLimits());
  await expect(candidate.validate(candidate.plan(), read)).rejects.toMatchObject({ code: "invalid" });
});
test("candidate/target binding and late cancellation cannot produce successful complete validation", async () => {
  const fixture = snapshotFixture(), read = provider(fixture);
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits()), changed = candidate.plan();
  changed.reference.sequence++;
  await expect(candidate.validate(changed, read)).rejects.toMatchObject({ code: "invalid" });
  const controller = new AbortController();
  await expect(inspectSnapshot(fixture.descriptorBytes, async hash => {
    const bytes = await read(hash); controller.abort(); return bytes;
  }, snapshotLimits(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});
