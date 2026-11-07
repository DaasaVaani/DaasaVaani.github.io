import { expect, test, vi } from "vitest";
import type { ContentStore } from "./content-store";
import { inspectSnapshot } from "./snapshot-validation";
import { readActiveSnapshotCatalog, readActiveSnapshotItem } from "./snapshot-reader";
import { snapshotFixture, snapshotLimits } from "../tests/snapshot-fixture";

async function setup() {
  const fixture = snapshotFixture();
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
