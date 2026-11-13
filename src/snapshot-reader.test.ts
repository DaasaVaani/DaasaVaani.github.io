import { expect, test, vi } from "vitest";
import type { ContentStore } from "./content-store";
import { ContentError, inspectSnapshot } from "./snapshot-validation";
import { readActiveSnapshotCatalog, readActiveSnapshotItem, verifyActiveSnapshot, inspectActiveSnapshotItems } from "./snapshot-reader";
import { snapshotFixture, snapshotLimits } from "../tests/snapshot-fixture";

async function setup(fixture = snapshotFixture()) {
  const read = vi.fn(async (sha256: string) => {
    const bytes = fixture.objects[sha256];
    if (!bytes) throw new Error("Missing synthetic object");
    return new Uint8Array(bytes);
  });
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  const entered = vi.fn(), store: Pick<ContentStore, "withActiveReader"> = {
    withActiveReader: async (work, signal) => {
      signal?.throwIfAborted();
      entered();
      return work(candidate.plan(), read);
    },
  };
  read.mockClear();
  return { fixture, read, candidate, store, entered };
}
test("active catalog reconstruction reads metadata only and returns copied exact reference and known entries", async () => {
  const { fixture, read, candidate, store } = await setup();
  const result = await readActiveSnapshotCatalog(store, snapshotLimits());
  expect(result).toEqual({ reference: candidate.plan().reference, entries: fixture.manifest.catalog });
  expect(read.mock.calls.map(([sha256]) => sha256)).toEqual([
    fixture.descriptor.manifest.sha256, fixture.descriptorHash, fixture.descriptor.manifest.sha256, fixture.manifest.policy,
  ]);
  if (!result.entries[0]) throw new Error("Missing synthetic entry");
  result.entries[0].tags.push("changed");
  result.reference.sequence++;
  expect((await readActiveSnapshotCatalog(store, snapshotLimits())).entries).toEqual(fixture.manifest.catalog);
});
test("one selected item is decoded literally without reading unrelated item bodies", async () => {
  const { fixture, read, candidate, store } = await setup(), item = fixture.items[0];
  if (!item) throw new Error("Missing synthetic item");
  expect(await readActiveSnapshotItem(store, candidate.plan().reference, item.lyricId, snapshotLimits())).toEqual(item);
  expect(read.mock.calls).toHaveLength(5);
  expect(read.mock.calls.at(-1)?.[0]).toBe(fixture.manifest.catalog[0]?.item);
});
test("a stale displayed snapshot refuses before reading any active bytes", async () => {
  const { read, candidate, store } = await setup();
  await expect(readActiveSnapshotItem(store, { ...candidate.plan().reference, sequence: 2 },
    "10000000-0000-4000-8000-000000000001", snapshotLimits())).rejects.toMatchObject({ code: "stale" });
  expect(read).not.toHaveBeenCalled();
});
test("absent or malformed selected identities fail explicitly without an item lookup or invented fallback", async () => {
  const { read, candidate, store } = await setup();
  for (const id of ["not-an-id", "10000000-0000-4000-8000-000000000099"]) {
    await expect(readActiveSnapshotItem(store, candidate.plan().reference, id, snapshotLimits()))
      .rejects.toMatchObject({ code: "unprepared" });
  }
  expect(read.mock.calls).toHaveLength(8);
});
test.each(["metadata", "item"] as const)("corrupt stored %s bytes are errors, never empty catalogs or successful text", async role => {
  const context = await setup(), item = context.fixture.items[0], entry = context.fixture.manifest.catalog[0];
  if (!item || !entry) throw new Error("Missing synthetic item");
  const original = context.read.getMockImplementation();
  if (!original) throw new Error("Missing synthetic reader");
  context.read.mockImplementation(async sha256 => sha256 === (role === "metadata" ? context.fixture.descriptorHash : entry.item)
    ? new Uint8Array((await original(sha256)).length) : original(sha256));
  await expect(readActiveSnapshotItem(context.store, context.candidate.plan().reference, item.lyricId, snapshotLimits()))
    .rejects.toMatchObject({ code: "integrity" });
});
test("captured validation limits cannot be weakened or damaged during active pin acquisition", async () => {
  const context = await setup(), input = snapshotLimits(), original = context.store.withActiveReader;
  context.store.withActiveReader = async (work, signal) => {
    input.maxItems = 0;
    return original(work, signal);
  };
  expect((await readActiveSnapshotCatalog(context.store, input)).entries).toEqual(context.fixture.manifest.catalog);
});
test("invalid bounds/reference and pre-cancellation do not read bytes", async () => {
  const context = await setup();
  await expect(readActiveSnapshotCatalog(context.store, { ...snapshotLimits(), maxItems: 0 }))
    .rejects.toMatchObject({ code: "invalid" });
  await expect(readActiveSnapshotItem(context.store, { sequence: 0, manifestSha256: "wrong" }, "wrong", snapshotLimits()))
    .rejects.toMatchObject({ code: "invalid" });
  const controller = new AbortController();
  controller.abort();
  await expect(readActiveSnapshotCatalog(context.store, snapshotLimits(), controller.signal)).rejects.toBe(controller.signal.reason);
  expect(context.read).not.toHaveBeenCalled();
});
test("candidate item projections are copied and do not replace mandatory complete activation validation", async () => {
  const { fixture, candidate, read } = await setup(), item = fixture.items[0];
  if (!item) throw new Error("Missing synthetic item");
  const first = await candidate.readItem(item.lyricId, read);
  first.lines.length = 0;
  first.tags.push("changed");
  expect(await candidate.readItem(item.lyricId, read)).toEqual(item);
  read.mockClear();
  const controller = new AbortController();
  controller.abort();
  await expect(candidate.readItem(item.lyricId, read, controller.signal)).rejects.toBe(controller.signal.reason);
  expect(read).not.toHaveBeenCalled();
});
test("unknown optional catalog/item/line fields remain inert and absent from the known reader projection", async () => {
  const fixture = snapshotFixture({
    item: value => ({ ...value, ignored: true, lines: value.lines.map(line => ({ ...line, ignored: "inert" })) }),
    manifest: value => ({ ...value, catalog: value.catalog.map(entry => ({ ...entry, ignored: true })) }),
  });
  const read = async (sha256: string) => {
    const bytes = fixture.objects[sha256];
    if (!bytes) throw new Error("Missing synthetic object");
    return bytes;
  };
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits()), item = fixture.items[0];
  if (!item) throw new Error("Missing synthetic item");
  expect(candidate.catalog()).toEqual(fixture.manifest.catalog);
  expect(await candidate.readItem(item.lyricId, read)).toEqual(item);
});
test("displayed reference is captured before asynchronous active pin acquisition", async () => {
  const context = await setup(), reference = context.candidate.plan().reference, original = context.store.withActiveReader;
  context.store.withActiveReader = async (work, signal) => {
    reference.sequence++;
    return original(work, signal);
  };
  const item = context.fixture.items[0];
  if (!item) throw new Error("Missing synthetic item");
  expect(await readActiveSnapshotItem(context.store, reference, item.lyricId, snapshotLimits())).toEqual(item);
});
test("complete active verification reads all original evidence and items and counts unique actual bytes only", async () => {
  const { fixture, read, candidate, store } = await setup();
  const result = await verifyActiveSnapshot(store, candidate.plan().reference, snapshotLimits());
  expect(result).toEqual({ reference: candidate.plan().reference, verifiedItems: fixture.items.length,
    verifiedObjects: Object.keys(fixture.objects).length, verifiedEncodedBytes: fixture.encodedBytes });
  expect(read.mock.calls.map(([sha256]) => sha256)).toEqual([
    fixture.descriptor.manifest.sha256, fixture.descriptorHash, fixture.descriptor.manifest.sha256, fixture.manifest.policy,
    fixture.descriptorHash, fixture.descriptor.manifest.sha256, fixture.manifest.policy,
    ...fixture.manifest.catalog.map(entry => entry.item),
  ]);
  result.reference.sequence++;
  expect((await verifyActiveSnapshot(store, candidate.plan().reference, snapshotLimits())).reference).toEqual(candidate.plan().reference);
  expect(result).not.toHaveProperty("ready");
});
test.each(["metadata", "item"] as const)("complete active verification fails explicitly on %s damage instead of reporting receipt counts", async role => {
  const context = await setup(), entry = context.fixture.manifest.catalog[1];
  if (!entry) throw new Error("Missing synthetic item");
  const original = context.read.getMockImplementation();
  if (!original) throw new Error("Missing synthetic reader");
  context.read.mockImplementation(async sha256 => sha256 === (role === "metadata" ? context.fixture.descriptorHash : entry.item)
    ? new Uint8Array((await original(sha256)).length) : original(sha256));
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits()))
    .rejects.toMatchObject({ code: "integrity" });
});
test("complete verification detects global line conflicts that independent item reads cannot prove away", async () => {
  const fixture = snapshotFixture(), first = fixture.items[0]?.lines[0], second = fixture.items[1];
  if (!first || !second || first.kind !== "line") throw new Error("Missing synthetic line");
  second.lines = [{ ...first }];
  const context = await setup(snapshotFixture({ items: fixture.items }));
  for (const item of fixture.items) {
    expect(await readActiveSnapshotItem(context.store, context.candidate.plan().reference, item.lyricId, snapshotLimits())).toEqual(item);
  }
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits()))
    .rejects.toMatchObject({ code: "invalid" });
});
test("complete verification rejects hash-valid malformed item schema and layout instead of trusting encoded receipts", async () => {
  const context = await setup(snapshotFixture({ item: item => ({ ...item, canonicalScript: "unsupported" }) }));
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits()))
    .rejects.toMatchObject({ code: "invalid" });
});
test("verification captures displayed identity and limits before waiting for the active pin", async () => {
  const context = await setup(), reference = context.candidate.plan().reference, limits = snapshotLimits();
  const original = context.store.withActiveReader;
  context.store.withActiveReader = async (work, signal) => {
    reference.sequence++;
    limits.maxItems = 0;
    return original(work, signal);
  };
  expect((await verifyActiveSnapshot(context.store, reference, limits)).reference).toEqual(context.candidate.plan().reference);
});
test("stale or invalid selections invalid limits and pre-cancellation produce no verification reads", async () => {
  const context = await setup(), reference = context.candidate.plan().reference;
  await expect(verifyActiveSnapshot(context.store, { ...reference, sequence: 2 }, snapshotLimits()))
    .rejects.toMatchObject({ code: "stale" });
  await expect(verifyActiveSnapshot(context.store, { ...reference, sequence: 0 }, snapshotLimits()))
    .rejects.toMatchObject({ code: "invalid" });
  await expect(verifyActiveSnapshot(context.store, reference, { ...snapshotLimits(), maxItems: 0 }))
    .rejects.toMatchObject({ code: "invalid" });
  const controller = new AbortController();
  controller.abort();
  await expect(verifyActiveSnapshot(context.store, reference, snapshotLimits(), controller.signal)).rejects.toBe(controller.signal.reason);
  expect(context.read).not.toHaveBeenCalled();
});
test("late cancellation and storage failures are not converted into successful verification or empty content", async () => {
  const context = await setup(), controller = new AbortController(), original = context.read.getMockImplementation();
  if (!original) throw new Error("Missing synthetic reader");
  const cancellation = new Error("Synthetic verification cancellation");
  const finalHash = context.fixture.manifest.catalog.at(-1)?.item;
  context.read.mockImplementation(async sha256 => {
    const bytes = await original(sha256);
    if (sha256 === finalHash) controller.abort(cancellation);
    return bytes;
  });
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits(), controller.signal))
    .rejects.toBe(cancellation);
  const failure = new DOMException("Synthetic unavailable storage", "UnknownError");
  context.read.mockRejectedValue(failure);
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits())).rejects.toBe(failure);
});
test("item inspection returns copied catalog-ordered problems only after actual metadata and individual item checks", async () => {
  const { store, candidate, fixture, read } = await setup();
  const result = await inspectActiveSnapshotItems(store, candidate.plan().reference, snapshotLimits());
  expect(result).toEqual({ reference: candidate.plan().reference,
    items: fixture.manifest.catalog.map(entry => ({ lyricId: entry.lyricId, itemSha256: entry.item, problem: null })) });
  expect(read.mock.calls.map(([sha256]) => sha256)).toEqual([
    fixture.descriptor.manifest.sha256, fixture.descriptorHash, fixture.descriptor.manifest.sha256, fixture.manifest.policy,
    ...fixture.manifest.catalog.map(entry => entry.item),
  ]);
  const first = result.items[0];
  if (!first) throw new Error("Missing synthetic inspection");
  first.problem = "integrity";
  result.reference.sequence++;
  expect((await inspectActiveSnapshotItems(store, candidate.plan().reference, snapshotLimits())).items.every(entry => entry.problem === null)).toBe(true);
  expect(result).not.toHaveProperty("ready");
});
test.each(["missing", "corrupt", "invalid", "unsupported"] as const)("item inspection identifies %s evidence without disabling an independently verified item", async fault => {
  const fixture = snapshotFixture({ item: item => !item.lyricId.endsWith("2") ? item
    : fault === "invalid" ? { ...item, title: "Synthetic mismatched title" }
    : fault === "unsupported" ? { ...item, formatVersion: 2 } : item });
  const context = await setup(fixture), selected = fixture.manifest.catalog[1], unaffected = fixture.items[0];
  if (!selected || !unaffected) throw new Error("Missing synthetic selection");
  const original = context.read.getMockImplementation();
  if (!original) throw new Error("Missing synthetic reader");
  context.read.mockImplementation(async sha256 => {
    const bytes = await original(sha256);
    if (sha256 !== selected.item || (fault !== "missing" && fault !== "corrupt")) return bytes;
    return new Uint8Array(fault === "missing" ? 0 : bytes.length);
  });
  const result = await inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits());
  expect(result.items.map(entry => entry.problem)).toEqual([null, fault === "missing" || fault === "corrupt" ? "integrity" : fault]);
  expect(await readActiveSnapshotItem(context.store, result.reference, unaffected.lyricId, snapshotLimits())).toEqual(unaffected);
  await expect(verifyActiveSnapshot(context.store, result.reference, snapshotLimits()))
    .rejects.toMatchObject({ code: fault === "missing" || fault === "corrupt" ? "integrity" : fault });
});
test("identity inspection identifies every owner of a three-way line collision rather than choosing an arbitrary winner", async () => {
  const fixture = snapshotFixture(), first = fixture.items[0], second = fixture.items[1];
  if (!first || !second) throw new Error("Missing synthetic item");
  second.lines = structuredClone(first.lines);
  const third = { ...structuredClone(first), lyricId: "10000000-0000-4000-8000-000000000003", title: "Synthetic storage 3" };
  const context = await setup(snapshotFixture({ items: [...fixture.items, third] }));
  expect((await inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits())).items.map(entry => entry.problem))
    .toEqual(["identity", "identity", "identity"]);
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits()))
    .rejects.toMatchObject({ code: "invalid" });
});
test("a line colliding with a reserved lyric UUID disables only the item containing that line", async () => {
  const fixture = snapshotFixture(), first = fixture.items[0], second = fixture.items[1];
  if (!first || !second) throw new Error("Missing synthetic item");
  first.lines = [{ kind: "line", lineId: second.lyricId, text: "\u0c85" }];
  const context = await setup(snapshotFixture({ items: fixture.items }));
  expect((await inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits())).items.map(entry => entry.problem))
    .toEqual(["identity", null]);
  await expect(verifyActiveSnapshot(context.store, context.candidate.plan().reference, snapshotLimits()))
    .rejects.toMatchObject({ code: "invalid" });
});
test("damaged metadata cannot become an empty successful diagnostic catalog", async () => {
  const context = await setup(), original = context.read.getMockImplementation();
  if (!original) throw new Error("Missing synthetic reader");
  context.read.mockImplementation(async sha256 => sha256 === context.fixture.descriptorHash
    ? new Uint8Array() : original(sha256));
  await expect(inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits()))
    .rejects.toMatchObject({ code: "integrity" });
  for (const entry of context.fixture.manifest.catalog) expect(context.read).not.toHaveBeenCalledWith(entry.item);
});
test("item inspection captures identity and bounds before waiting for a pin and refuses stale selections before bytes", async () => {
  const context = await setup(), reference = context.candidate.plan().reference, limits = snapshotLimits();
  const original = context.store.withActiveReader;
  context.store.withActiveReader = async (work, signal) => {
    reference.sequence++;
    limits.maxItems = 0;
    return original(work, signal);
  };
  expect((await inspectActiveSnapshotItems(context.store, reference, limits)).reference).toEqual(context.candidate.plan().reference);
  context.read.mockClear();
  await expect(inspectActiveSnapshotItems(context.store, reference, snapshotLimits())).rejects.toMatchObject({ code: "stale" });
  await expect(inspectActiveSnapshotItems(context.store, reference, { ...snapshotLimits(), maxItems: 0 }))
    .rejects.toMatchObject({ code: "invalid" });
  expect(context.read).not.toHaveBeenCalled();
});
test("typed integrity cancellation and late storage failures abort inspection rather than fabricating damaged rows", async () => {
  const context = await setup(), original = context.read.getMockImplementation(), controller = new AbortController();
  if (!original) throw new Error("Missing synthetic reader");
  const finalHash = context.fixture.manifest.catalog.at(-1)?.item, cancelled = new ContentError("integrity", "Synthetic cancellation");
  context.read.mockImplementation(async sha256 => {
    const bytes = await original(sha256);
    if (sha256 === finalHash) controller.abort(cancelled);
    return bytes;
  });
  await expect(inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits(), controller.signal))
    .rejects.toBe(cancelled);
  context.read.mockClear();
  await expect(inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits(), controller.signal))
    .rejects.toBe(cancelled);
  expect(context.read).not.toHaveBeenCalled();
  const storageFailure = new DOMException("Synthetic unavailable storage", "UnknownError");
  context.read.mockImplementation(async sha256 => {
    if (sha256 === finalHash) throw storageFailure;
    return original(sha256);
  });
  await expect(inspectActiveSnapshotItems(context.store, context.candidate.plan().reference, snapshotLimits())).rejects.toBe(storageFailure);
});
