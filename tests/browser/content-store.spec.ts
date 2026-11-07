import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { ContentPlan, ContentDataset } from "../../shared/types/content";
import {
  contentLogicalBytes, claimContentWriter, setContentTargetPhase, recordContentObject,
} from "../../shared/tools/content-state.mjs";
import type { ContentStoreConfig } from "../../src/content-store";
import { personalSnapshot } from "../lyric-browser";
import { actualBundledSnapshotFixture, bundledSnapshotFixture, snapshotFixture, snapshotLimits, snapshotPacket } from "../snapshot-fixture";
import messages from "../../shared/generated/web/ui.json" with { type: "json" };

type FixtureObject = { sha256: string; encodedBytes: number; bytes: number[] };
type Fixture = { plan: ContentPlan; objects: FixtureObject[]; first: FixtureObject; bytes: Record<string, number[]> };
declare global {
  interface Window {
    isolatedContentRace?: { release: () => void; reader: Promise<number>; blocker: Promise<void>; pin: string };
    isolatedAttemptController?: AbortController;
  }
}
let compiled: Promise<string> | undefined;
async function bundle() {
  return compiled ??= (async () => {
    const result = await build({ configFile: false, logLevel: "silent", build: {
      write: false, minify: false, lib: { entry: resolve("tests", "isolated-content.ts"), formats: ["es"], fileName: "content-store" },
    } });
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs.flatMap(output => "output" in output ? output.output : []).filter(output => output.type === "chunk");
    const chunk = chunks[0];
    if (chunks.length !== 1 || !chunk) throw new Error("Isolated content test requires one complete backend module");
    return chunk.code;
  })();
}
function fixture(sequence: number): Fixture {
  const encoded = [`storage-fixture/manifest/${sequence}`, "storage-fixture/shared", `storage-fixture/item/${sequence}`]
    .map(text => gzipSync(Buffer.from(text)));
  const objects = encoded.map(bytes => ({
    sha256: createHash("sha256").update(bytes).digest("hex"), encodedBytes: bytes.length, bytes: [...bytes],
  }));
  const manifest = objects[0];
  if (!manifest) throw new Error("Missing fixture manifest");
  objects.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0);
  const first = objects[0];
  if (!first) throw new Error("Missing fixture object");
  return { plan: { reference: { sequence, manifestSha256: manifest.sha256 },
    required: objects.map(({ sha256, encodedBytes }) => ({ sha256, encodedBytes })) },
  objects, first, bytes: Object.fromEntries(objects.map(object => [object.sha256, object.bytes])) };
}
function config(): ContentStoreConfig {
  return { databaseName: `fixture-content-${randomUUID()}`, maxLogicalBytes: 1000000,
    maxObjects: 20, maxSnapshots: 8, maxObjectBytes: 4096 };
}
async function setup(page: Page) {
  const script = await bundle();
  await page.route("**/isolated-content-store.js", route => route.fulfill({ body: script, contentType: "text/javascript" }));
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: messages.en.light, exact: true })).toBeVisible();
}

test("real content transactions reopen interrupted progress and activate only after complete actual-byte validation without personal writes", async ({ page }) => {
  await setup(page);
  const personal = await personalSnapshot(page);
  const result = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    let store = await backend.ContentStore.open(config);
    const first = fixture.first;
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      await writer.putObject(first.sha256, new Uint8Array(first.bytes));
      await writer.phase("paused");
    });
    store.close();
    store = await backend.ContentStore.open(config);
    const reopened = await store.snapshot();
    let incomplete = "";
    try {
      await store.withWriter(reopened.control, async writer => {
        await writer.activate(async () => {});
      });
    } catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      incomplete = reason.code;
    }
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.phase("downloading");
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(async (plan, read) => {
        for (const object of plan.required) {
          const bytes = await read(object.sha256);
          const text = await new Response(new Blob([new Uint8Array(bytes)]).stream()
            .pipeThrough(new DecompressionStream("gzip"))).text();
          if (!text.startsWith("storage-fixture/")) throw new Error("Invalid permitted storage fixture");
        }
      });
    });
    store.close();
    store = await backend.ContentStore.open(config);
    const active = await store.snapshot();
    const actual = await store.withActiveReader(async (plan, read) => {
      const bytes = await read(plan.reference.manifestSha256);
      return [...bytes];
    });
    store.close();
    return { reopened, incomplete, active, actual };
  }, { config: config(), fixture: fixture(1) });
  expect(result.reopened.control.active).toBeNull();
  expect(result.reopened.control.target?.phase).toBe("paused");
  expect(result.reopened.objects).toHaveLength(1);
  expect(result.incomplete).toBe("integrity");
  expect(result.active.control.active).toEqual(fixture(1).plan.reference);
  expect(result.active.control.target).toBeNull();
  expect(result.actual).toEqual(fixture(1).bytes[fixture(1).plan.reference.manifestSha256]);
  expect(await personalSnapshot(page)).toEqual(personal);
});

test("wrong bytes and failed complete validation preserve verified target progress and the previous active pointer", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async ({ config, a, b }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    const verify = async (plan: typeof a.plan, read: import("../../src/content-store").ContentReader) => {
      for (const object of plan.required) await read(object.sha256);
    };
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(a.plan);
      for (const object of a.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(verify);
    });
    const errors: string[] = [];
    try {
      await store.withWriter((await store.snapshot()).control, async writer => {
        await writer.begin(b.plan);
        const object = b.first, bytes = new Uint8Array(object.bytes), firstByte = bytes[0];
        if (firstByte === undefined) throw new Error("Missing gzip fixture byte");
        bytes[0] = firstByte ^ 1;
        await writer.putObject(object.sha256, bytes);
      });
    } catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      errors.push(reason.code);
    }
    const rejected = await store.snapshot();
    try {
      await store.withWriter(rejected.control, async writer => {
        await writer.phase("downloading");
        for (const object of b.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
        await writer.activate(async (plan, read) => {
          await verify(plan, read);
          throw new Error("Synthetic decoded/capability validation failure");
        });
      });
    } catch (reason) {
      if (!(reason instanceof Error) || reason.message !== "Synthetic decoded/capability validation failure") throw reason;
      errors.push("validator");
    }
    try {
      await store.withWriter((await store.snapshot()).control, async writer => {
        await writer.phase("downloading");
        await writer.activate(async (plan, read) => { await verify(plan, read); await writer.phase("paused"); });
      });
    } catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      errors.push(reason.code);
    }
    try {
      await store.withWriter((await store.snapshot()).control, async writer => {
        await writer.phase("downloading");
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          if (this.name === "control" && value && typeof value === "object" && "active" in value &&
              value.active && typeof value.active === "object" && "sequence" in value.active && value.active.sequence === 2) {
            throw new DOMException("Synthetic activation failure", "QuotaExceededError");
          }
          return key === undefined ? original.call(this, value) : original.call(this, value, key);
        };
        try { await writer.activate(verify); }
        finally { IDBObjectStore.prototype.put = original; }
      });
    } catch (reason) {
      if (!(reason instanceof Error) || reason.name !== "QuotaExceededError") throw reason;
      errors.push("terminal");
    }
    const after = await store.snapshot();
    await store.withWriter(after.control, async writer => {
      await writer.phase("downloading"); await writer.activate(verify);
    });
    const retry = await store.snapshot();
    store.close();
    return { errors, rejected, after, retry };
  }, { config: config(), a: fixture(1), b: fixture(2) });
  expect(result.errors).toEqual(["integrity", "validator", "stale", "terminal"]);
  expect(result.rejected.control.active).toEqual(fixture(1).plan.reference);
  expect(result.rejected.objects).toHaveLength(3);
  expect(result.after.control.active).toEqual(fixture(1).plan.reference);
  expect(result.after.control.target?.phase).toBe("paused");
  expect(result.after.objects).toHaveLength(5);
  expect(result.after.control.retired).toEqual([]);
  expect(result.retry.control.active).toEqual(fixture(2).plan.reference);
  expect(result.retry.control.target).toBeNull();
  expect(result.retry.control.retired).toEqual([fixture(1).plan.reference]);
});

test("an actual terminal IndexedDB write failure rolls back the whole object checkpoint and a retry succeeds", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    await store.withWriter((await store.snapshot()).control, async writer => { await writer.begin(fixture.plan); });
    const before = await store.snapshot(), object = fixture.first;
    let failure = "";
    try {
      await store.withWriter(before.control, async writer => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          if (this.name === "control") throw new DOMException("Synthetic terminal failure", "QuotaExceededError");
          return key === undefined ? original.call(this, value) : original.call(this, value, key);
        };
        try { await writer.putObject(object.sha256, new Uint8Array(object.bytes)); }
        finally { IDBObjectStore.prototype.put = original; }
      });
    } catch (reason) {
      if (!(reason instanceof Error) || reason.name !== "QuotaExceededError") throw reason;
      failure = reason.name;
    }
    const failed = await store.snapshot();
    await store.withWriter(failed.control, async writer => {
      await writer.phase("downloading");
      await writer.putObject(object.sha256, new Uint8Array(object.bytes));
    });
    const retry = await store.snapshot();
    store.close();
    return { failure, before, failed, retry };
  }, { config: config(), fixture: fixture(1) });
  expect(result.failure).toBe("QuotaExceededError");
  expect(result.failed.objects).toEqual(result.before.objects);
  expect(result.failed.snapshots).toEqual(result.before.snapshots);
  expect(result.failed.control.active).toBeNull();
  expect(result.failed.control.target?.phase).toBe("paused");
  expect(result.retry.objects).toHaveLength(1);
});

test("whole-operation locking reports busy and stale operations cannot write after their scope ends", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    const before = await store.snapshot();
    let release!: () => void, started!: () => void;
    let saved: import("../../src/content-store").ContentWriteScope | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    const holding = store.withWriter(before.control, async writer => {
      saved = writer;
      await writer.begin(fixture.plan);
      started();
      await gate;
      await writer.phase("paused");
    });
    await ready;
    const errors: string[] = [];
    try { await store.withWriter((await store.snapshot()).control, async () => {}); }
    catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      errors.push(reason.code);
    }
    release(); await holding;
    const committed = await store.snapshot();
    try {
      if (!saved) throw new Error("Missing captured writer scope");
      const object = fixture.first;
      await saved.putObject(object.sha256, new Uint8Array(object.bytes));
    } catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      errors.push(reason.code);
    }
    try { await store.withWriter(before.control, async () => {}); }
    catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      errors.push(reason.code);
    }
    const after = await store.snapshot();
    try {
      await store.withWriter(after.control, async writer => {
        void writer.putObject(fixture.first.sha256, new Uint8Array(fixture.first.bytes));
      });
    } catch (reason) {
      if (!(reason instanceof AggregateError) || !reason.errors.some(error => error instanceof backend.ContentError && error.code === "stale")) throw reason;
      errors.push("unawaited");
    }
    const unawaited = await store.snapshot();
    store.close();
    return { errors, committed, after, unawaited };
  }, { config: config(), fixture: fixture(1) });
  expect(result.errors).toEqual(["busy", "stale", "stale", "unawaited"]);
  expect(result.after).toEqual(result.committed);
  expect(result.unawaited.control.target?.phase).toBe("paused");
  expect(result.unawaited.objects).toEqual([]);
});

test("pinned readers defer retirement cleanup and removal preserves them without making new reads available", async ({ page }) => {
  await setup(page);
  const personal = await personalSnapshot(page);
  const result = await page.evaluate(async ({ config, a, b }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    const prepare = async (fixture: typeof a) => store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(async (plan, read) => { for (const object of plan.required) await read(object.sha256); });
    });
    await prepare(a);
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
    const reading = store.withActiveReader(async (plan, read) => {
      started(); await gate;
      return [...await read(plan.reference.manifestSha256)];
    });
    await ready;
    await prepare(b);
    const deferred = await store.withWriter((await store.snapshot()).control, writer => writer.collect());
    const retained = await store.snapshot();
    const removing = await store.withWriter(retained.control, async writer => { await writer.remove(); return writer.collect(); });
    let unavailable = "";
    try { await store.withActiveReader(async () => {}); }
    catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      unavailable = reason.code;
    }
    const removed = await store.snapshot();
    release();
    const original = await reading;
    await store.withWriter(removed.control, writer => writer.collect());
    const collected = await store.snapshot();
    store.close();
    return { deferred, retained, removing, unavailable, removed, original, collected };
  }, { config: config(), a: fixture(1), b: fixture(2) });
  expect(result.deferred.deferred).toEqual([fixture(1).plan.reference]);
  expect(result.retained.objects).toHaveLength(5);
  expect(result.removing.deferred).toEqual([fixture(1).plan.reference]);
  expect(result.unavailable).toBe("unprepared");
  expect(result.removed.control.active).toBeNull();
  expect(result.removed.objects).toHaveLength(3);
  expect(result.original).toEqual(fixture(1).bytes[fixture(1).plan.reference.manifestSha256]);
  expect(result.collected.objects).toEqual([]);
  expect(result.collected.snapshots).toEqual([]);
  expect(result.collected.control.retired).toEqual([]);
  expect(await personalSnapshot(page)).toEqual(personal);
});

test("actual prospective complete-byte accounting accepts the exact ceiling and refuses one byte less without partial object writes", async ({ page }) => {
  await setup(page);
  const sample = fixture(1), baselineConfig = config();
  const baseline: ContentDataset = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      await writer.phase("paused");
    });
    const state = await store.snapshot();
    store.close();
    return state;
  }, { config: baselineConfig, fixture: sample });
  const limits = { maxLogicalBytes: baselineConfig.maxLogicalBytes, maxObjects: baselineConfig.maxObjects,
    maxSnapshots: baselineConfig.maxSnapshots, maxObjectBytes: baselineConfig.maxObjectBytes };
  const expected = (value: ContentDataset) => ({ epoch: value.control.epoch, revision: value.control.revision });
  const claimed = claimContentWriter(baseline, expected(baseline), randomUUID(), limits);
  const resumed = setContentTargetPhase(claimed, expected(claimed), "downloading", limits);
  const receipt = sample.plan.required[0];
  if (!receipt) throw new Error("Missing fixture receipt");
  const candidate = recordContentObject(resumed, expected(resumed), receipt, limits);
  const ceiling = contentLogicalBytes(candidate);
  for (const difference of [0, 1]) {
    const result = await page.evaluate(async ({ config, fixture, ceiling, difference }) => {
      const path = "/isolated-content-store.js";
      const backend: typeof import("../../src/content-store") = await import(path);
      const initial = await backend.ContentStore.open(config);
      await initial.withWriter((await initial.snapshot()).control, async writer => {
        await writer.begin(fixture.plan); await writer.phase("paused");
      });
      initial.close();
      const store = await backend.ContentStore.open({ ...config, maxLogicalBytes: ceiling - difference });
      let failure = "";
      try {
        await store.withWriter((await store.snapshot()).control, async writer => {
          await writer.phase("downloading");
          const object = fixture.first;
          await writer.putObject(object.sha256, new Uint8Array(object.bytes));
        });
      } catch (reason) {
        if (!(reason instanceof backend.ContentError)) throw reason;
        failure = reason.code;
      }
      const state = await store.snapshot();
      store.close();
      return { failure, state };
    }, { config: config(), fixture: sample, ceiling, difference });
    expect(result.failure).toBe(difference ? "capacity" : "");
    expect(result.state.objects).toHaveLength(difference ? 0 : 1);
    if (!difference) expect(contentLogicalBytes(result.state)).toBe(ceiling);
    expect(result.state.control.active).toBeNull();
  }
});

test("explicit reader departure releases its real pin and rejects retained reads before retirement collection", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async ({ config, a, b }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    const prepare = async (fixture: typeof a) => store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(async (plan, read) => { for (const object of plan.required) await read(object.sha256); });
    });
    await prepare(a);
    const controller = new AbortController();
    let started!: () => void, lateRead: import("../../src/content-store").ContentReader | undefined;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const reading = store.withActiveReader(async (_plan, read) => {
      lateRead = read; started();
      await new Promise<void>(() => {});
    }, controller.signal);
    await ready;
    await prepare(b);
    const deferred = await store.withWriter((await store.snapshot()).control, writer => writer.collect());
    controller.abort();
    let departure = "";
    try { await reading; }
    catch (reason) {
      if (!(reason instanceof DOMException) || reason.name !== "AbortError") throw reason;
      departure = reason.name;
    }
    let stale = "";
    try {
      if (!lateRead) throw new Error("Missing retained reader");
      await lateRead(a.plan.reference.manifestSha256);
    } catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      stale = reason.code;
    }
    const collected = await store.withWriter((await store.snapshot()).control, writer => writer.collect());
    const after = await store.snapshot();
    store.close();
    return { departure, stale, deferred, collected, after };
  }, { config: config(), a: fixture(1), b: fixture(2) });
  expect(result.departure).toBe("AbortError");
  expect(result.stale).toBe("stale");
  expect(result.deferred.deferred).toEqual([fixture(1).plan.reference]);
  expect(result.collected.removed).toEqual([fixture(1).plan.reference]);
  expect(result.after.control.active).toEqual(fixture(2).plan.reference);
  expect(result.after.objects).toHaveLength(3);
});

test("closing an actual writer page releases its lock and leaves resumable committed progress without changing personal data", async ({ page, context }) => {
  await setup(page);
  const personal = await personalSnapshot(page), settings = config(), sample = fixture(1);
  const writerPage = await context.newPage();
  await setup(writerPage);
  await writerPage.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const writing = store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      started();
      await new Promise<void>(() => {});
    });
    await Promise.race([ready, writing.then(() => { throw new Error("Writer unexpectedly completed"); })]);
  }, { config: settings, fixture: sample });
  const busy = await page.evaluate(async config => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    try { const store = await backend.ContentStore.open(config); store.close(); return "opened"; }
    catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      return reason.code;
    }
  }, settings);
  expect(busy).toBe("busy");
  await writerPage.close();
  await expect.poll(() => page.evaluate(async name =>
    (await navigator.locks.query()).held?.some(lock => lock.name === `DaasaVaani-content-writer:${name}`),
  settings.databaseName)).toBe(false);
  const result = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    const interrupted = await store.snapshot();
    await store.withWriter(interrupted.control, async writer => {
      await writer.phase("downloading");
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(async (plan, read) => { for (const object of plan.required) await read(object.sha256); });
    });
    const resumed = await store.snapshot();
    store.close();
    return { interrupted, resumed };
  }, { config: settings, fixture: sample });
  expect(result.interrupted.control.target?.phase).toBe("downloading");
  expect(result.interrupted.control.active).toBeNull();
  expect(result.resumed.control.active).toEqual(sample.plan.reference);
  expect(await personalSnapshot(page)).toEqual(personal);
});

test("a reader whose pin acquisition was delayed rechecks the pointer and never exposes the retired snapshot", async ({ page }) => {
  await setup(page);
  const settings = config(), a = fixture(1), b = fixture(2);
  await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(async (plan, read) => { for (const object of plan.required) await read(object.sha256); });
    });
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
    const pin = store.pinLock(fixture.plan.reference);
    const blocker = (async () => { await navigator.locks.request(pin, { mode: "exclusive" }, async () => { started(); await gate; }); })();
    await ready;
    const reader = store.withActiveReader(async plan => plan.reference.sequence).finally(() => store.close());
    window.isolatedContentRace = { release, reader, blocker, pin };
  }, { config: settings, fixture: a });
  await expect.poll(() => page.evaluate(async () => {
    const race = window.isolatedContentRace;
    if (!race) throw new Error("Missing isolated pin race");
    return (await navigator.locks.query()).pending?.some(lock => lock.name === race.pin && lock.mode === "shared");
  })).toBe(true);
  const selected = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      await writer.activate(async (plan, read) => { for (const object of plan.required) await read(object.sha256); });
    });
    store.close();
    const race = window.isolatedContentRace;
    if (!race) throw new Error("Missing delayed reader");
    race.release();
    const result = await race.reader;
    await race.blocker;
    return result;
  }, { config: settings, fixture: b });
  expect(selected).toBe(2);
});

test("future or changed database schemas and missing controls are refused without replacing existing rows; unsupported locks create no cache", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const unsupportedName = config.databaseName + "-unsupported", originalLocks = navigator.locks;
    let unsupported = "";
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    try { await backend.ContentStore.open({ ...config, databaseName: unsupportedName }); }
    catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      unsupported = reason.code;
    } finally { Object.defineProperty(navigator, "locks", { configurable: true, value: originalLocks }); }
    const unexpectedCache = (await indexedDB.databases()).some(database => database.name === unsupportedName);
    const checks = [];
    for (const mode of ["future", "schema", "missing"]) {
      const name = `${config.databaseName}-${mode}`, version = mode === "future" ? 20 : 10;
      const created = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          const database = request.result;
          const control = database.createObjectStore("control");
          database.createObjectStore("snapshots");
          const objects = database.createObjectStore("objects", { keyPath: "sha256" });
          if (mode === "schema") database.createObjectStore("unexpected");
          if (mode !== "missing") control.put({ marker: "preserve" }, "state");
          const object = fixture.first;
          objects.put({ ...object, bytes: new Blob([new Uint8Array(object.bytes)]) });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      created.close();
      let failure = "";
      try { await backend.ContentStore.open({ ...config, databaseName: name }); }
      catch (reason) {
        if (!(reason instanceof backend.ContentError)) throw reason;
        failure = reason.code;
      }
      const retained = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const request = retained.transaction("objects", "readonly").objectStore("objects").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      checks.push({ mode, failure, version: retained.version, count });
      retained.close();
    }
    return { unsupported, unexpectedCache, checks };
  }, { config: config(), fixture: fixture(1) });
  expect(result.unsupported).toBe("unsupported");
  expect(result.unexpectedCache).toBe(false);
  expect(result.checks).toEqual([
    { mode: "future", failure: "unsupported", version: 20, count: 1 },
    { mode: "schema", failure: "unsupported", version: 10, count: 1 },
    { mode: "missing", failure: "invalid", version: 10, count: 1 },
  ]);
});

test("the actual tolerant snapshot validator resumes real stored canonical bytes and activates without app or personal changes",async ({ page }) => {
  await setup(page);
  const personal=await personalSnapshot(page),fixture=snapshotFixture({
    manifest: value => ({ ...value,optional: { "2": true,"10": false } }),
  });
  const result=await page.evaluate(async ({ config,packet,limits }) => {
    const path="/isolated-content-store.js";
    const backend: typeof import("../isolated-content")=await import(path);
    const lookup=async (sha256: string) => {
      const bytes=packet.objects[sha256];
      if(!bytes) throw new Error("Missing synthetic snapshot bytes");
      return new Uint8Array(bytes);
    };
    const candidate=await backend.inspectSnapshot(new Uint8Array(packet.descriptor),lookup,limits);
    let store=await backend.ContentStore.open(config);
    await store.withWriter((await store.snapshot()).control,async writer => {
      await writer.begin(candidate.plan());
      for(const object of candidate.metadataObjects()) await writer.putObject(object.sha256,object.bytes);
      await writer.phase("paused");
    });
    store.close();
    store=await backend.ContentStore.open(config);
    let incomplete="";
    try {
      await store.withWriter((await store.snapshot()).control,writer =>
        writer.activate((plan,read) => candidate.validate(plan,read)));
    } catch(reason) {
      if(!(reason instanceof backend.ContentError)) throw reason;
      incomplete=reason.code;
    }
    const interrupted=await store.snapshot();
    await store.withWriter(interrupted.control,async writer => {
      await writer.phase("downloading");
      for(const [hash,bytes] of Object.entries(packet.objects)) await writer.putObject(hash,new Uint8Array(bytes));
      await writer.activate((plan,read) => candidate.validate(plan,read));
    });
    store.close();
    store=await backend.ContentStore.open(config);
    const active=await store.snapshot();
    store.close();
    return { interrupted,incomplete,active };
  },{ config: config(),packet: snapshotPacket(fixture),limits: snapshotLimits() });
  expect(result.incomplete).toBe("integrity");
  expect(result.interrupted.control.active).toBeNull();
  expect(result.interrupted.objects).toHaveLength(3);
  expect(result.active.control.active).toEqual({ sequence: 1,manifestSha256: fixture.descriptor.manifest.sha256 });
  expect(result.active.control.target).toBeNull();
  expect(result.active.objects).toHaveLength(Object.keys(fixture.objects).length);
  expect(await personalSnapshot(page)).toEqual(personal);
});

test("a new page recovers original descriptor evidence after actual writer-page death and completes the same target", async ({ page, context }) => {
  await setup(page);
  const personal = await personalSnapshot(page), settings = config(), a = snapshotFixture();
  const b = snapshotFixture({ sequence: 2, items: a.items.map(item => ({ ...item, title: item.title + " next" })) });
  const writerPage = await context.newPage();
  await setup(writerPage);
  await writerPage.evaluate(async ({ config, a, b, limits }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../isolated-content") = await import(path);
    const store = await backend.ContentStore.open(config);
    const inspect = (packet: typeof a) => backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
      const bytes = packet.objects[hash];
      if (!bytes) throw new Error("Missing synthetic metadata");
      return new Uint8Array(bytes);
    }, limits);
    const active = await inspect(a);
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(active.plan());
      for (const [hash, bytes] of Object.entries(a.objects)) await writer.putObject(hash, new Uint8Array(bytes));
      await writer.activate((plan, read) => active.validate(plan, read));
    });
    const candidate = await inspect(b);
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const writing = store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(candidate.plan());
      for (const object of candidate.metadataObjects()) await writer.putObject(object.sha256, object.bytes);
      started();
      await new Promise<void>(() => {});
    });
    await Promise.race([ready, writing.then(() => { throw new Error("Writer unexpectedly completed"); })]);
  }, { config: settings, a: snapshotPacket(a), b: snapshotPacket(b), limits: snapshotLimits() });
  await writerPage.close();
  await expect.poll(() => page.evaluate(async name =>
    (await navigator.locks.query()).held?.some(lock => lock.name === `DaasaVaani-content-writer:${name}`),
  settings.databaseName)).toBe(false);
  const freshPage = await context.newPage();
  await setup(freshPage);
  const remaining = Object.fromEntries(b.manifest.catalog.map(entry => {
    const bytes = b.objects[entry.item];
    if (!bytes) throw new Error("Missing synthetic remaining item");
    return [entry.item, [...bytes]];
  }));
  const result = await freshPage.evaluate(async ({ config, remaining, limits }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../isolated-content") = await import(path);
    const store = await backend.ContentStore.open(config), interrupted = await store.snapshot();
    const reference = interrupted.control.target?.reference;
    const plan = interrupted.snapshots.find(plan => plan.reference.sequence === reference?.sequence &&
      plan.reference.manifestSha256 === reference.manifestSha256);
    if (!plan) throw new Error("Missing retained target");
    await store.withWriter(interrupted.control, async writer => {
      const candidate = await backend.resumeSnapshot(plan, hash => writer.readObject(hash), limits);
      await writer.phase("downloading");
      for (const [hash, bytes] of Object.entries(remaining)) await writer.putObject(hash, new Uint8Array(bytes));
      await writer.activate((target, read) => candidate.validate(target, read));
    });
    const active = await store.snapshot();
    const encoded = await store.withActiveReader(async (plan, read) => {
      const values: Record<string, number[]> = {};
      for (const object of plan.required) values[object.sha256] = [...await read(object.sha256)];
      return values;
    });
    store.close();
    return { interrupted, active, encoded };
  }, { config: settings, remaining, limits: snapshotLimits() });
  expect(result.interrupted.control.active).toEqual({ sequence: 1, manifestSha256: a.descriptor.manifest.sha256 });
  expect(result.interrupted.control.target?.phase).toBe("downloading");
  expect(result.active.control.active).toEqual({ sequence: 2, manifestSha256: b.descriptor.manifest.sha256 });
  expect(result.active.control.target).toBeNull();
  expect(result.encoded).toEqual(snapshotPacket(b).objects);
  expect(await personalSnapshot(freshPage)).toEqual(personal);
  await freshPage.close();
});

for (const fault of ["missing", "corrupt"] as const) {
  test(`failed recovery with ${fault} descriptor evidence preserves the previous active snapshot and target progress`, async ({ page }) => {
    await setup(page);
    const personal = await personalSnapshot(page), a = snapshotFixture(), b = snapshotFixture({ sequence: 2 });
    const result = await page.evaluate(async ({ config, a, b, descriptorHash, fault, limits }) => {
      const path = "/isolated-content-store.js";
      const backend: typeof import("../isolated-content") = await import(path);
      let store = await backend.ContentStore.open(config);
      const inspect = (packet: typeof a) => backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
        const bytes = packet.objects[hash];
        if (!bytes) throw new Error("Missing synthetic metadata");
        return new Uint8Array(bytes);
      }, limits);
      const previous = await inspect(a), candidate = await inspect(b);
      await store.withWriter((await store.snapshot()).control, async writer => {
        await writer.begin(previous.plan());
        for (const [hash, bytes] of Object.entries(a.objects)) await writer.putObject(hash, new Uint8Array(bytes));
        await writer.activate((plan, read) => previous.validate(plan, read));
        await writer.begin(candidate.plan());
        for (const object of candidate.metadataObjects()) {
          if (fault !== "missing" || object.sha256 !== descriptorHash) await writer.putObject(object.sha256, object.bytes);
        }
      });
      store.close();
      if (fault === "corrupt") {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(config.databaseName);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("objects", "readwrite");
          const bytes = new Uint8Array(b.descriptor); bytes[0] = 0;
          transaction.objectStore("objects").put({ sha256: descriptorHash, encodedBytes: bytes.length, bytes: new Blob([bytes]) });
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      }
      store = await backend.ContentStore.open(config);
      const before = await store.snapshot(), target = before.control.target;
      const plan = before.snapshots.find(plan => plan.reference.sequence === target?.reference.sequence &&
        plan.reference.manifestSha256 === target.reference.manifestSha256);
      if (!plan) throw new Error("Missing retained target");
      let failure = "";
      try {
        await store.withWriter(before.control, async writer => {
          await backend.resumeSnapshot(plan, hash => writer.readObject(hash), limits);
        });
      } catch (reason) {
        if (!(reason instanceof backend.ContentError)) throw reason;
        failure = reason.code;
      }
      const after = await store.snapshot();
      const readable = await store.withActiveReader(async (plan, read) => {
        for (const object of plan.required) await read(object.sha256);
        return plan.reference;
      });
      store.close();
      return { before, after, failure, readable };
    }, { config: config(), a: snapshotPacket(a), b: snapshotPacket(b), descriptorHash: b.descriptorHash, fault, limits: snapshotLimits() });
    expect(result.failure).toBe("integrity");
    expect(result.after.control.active).toEqual(result.before.control.active);
    expect(result.readable).toEqual(result.before.control.active);
    expect(result.after.control.target?.phase).toBe("paused");
    expect(result.after.snapshots).toEqual(result.before.snapshots);
    expect(result.after.objects).toEqual(result.before.objects);
    expect(await personalSnapshot(page)).toEqual(personal);
  });
}

test("scoped target reads verify actual bytes without revision writes and reject late, aborted, corrupt and stale reads", async ({ page }) => {
  await setup(page);
  const sample = fixture(1);
  const result = await page.evaluate(async ({ config, fixture }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../../src/content-store") = await import(path);
    const store = await backend.ContentStore.open(config);
    let late: (() => Promise<Uint8Array>) | undefined;
    const success = await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(fixture.plan);
      for (const object of fixture.objects) await writer.putObject(object.sha256, new Uint8Array(object.bytes));
      const before = await store.snapshot(), bytes = await writer.readObject(fixture.first.sha256);
      bytes.fill(0);
      const again = [...await writer.readObject(fixture.first.sha256)], after = await store.snapshot();
      late = () => writer.readObject(fixture.first.sha256);
      return { before, after, again };
    });
    let stale = "";
    try { if (!late) throw new Error("Missing retained scope"); await late(); }
    catch (reason) {
      if (!(reason instanceof backend.ContentError)) throw reason;
      stale = reason.code;
    }
    const failures: Record<string, string[]> = {};
    const errors = (reason: unknown): string[] => reason instanceof AggregateError ? reason.errors.flatMap(errors) :
      reason instanceof backend.ContentError ? [reason.code] : reason instanceof Error ? [reason.name] : [String(reason)];
    for (const mode of ["missing", "fence", "abort", "corrupt"]) {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(config.databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const original = Blob.prototype.arrayBuffer;
      const controller = new AbortController();
      try {
        await store.withWriter((await store.snapshot()).control, async writer => {
          if (mode === "fence") Blob.prototype.arrayBuffer = async function () {
            const bytes = await original.call(this);
            await new Promise<void>((resolve, reject) => {
              const transaction = database.transaction("control", "readwrite"), table = transaction.objectStore("control");
              const request = table.get("state");
              request.onsuccess = () => { const state = request.result; state.revision++; table.put(state, "state"); };
              transaction.oncomplete = () => resolve();
              transaction.onabort = () => reject(transaction.error);
            });
            return bytes;
          };
          if (mode === "corrupt") {
            await new Promise<void>((resolve, reject) => {
              const transaction = database.transaction("objects", "readwrite");
              transaction.objectStore("objects").put({ sha256: fixture.first.sha256,
                encodedBytes: fixture.first.encodedBytes, bytes: new Blob([new Uint8Array(fixture.first.encodedBytes)]) });
              transaction.oncomplete = () => resolve();
              transaction.onabort = () => reject(transaction.error);
            });
          }
          if (mode === "abort") controller.abort();
          await writer.readObject(mode === "missing" ? "f".repeat(64) : fixture.first.sha256);
        }, controller.signal);
      } catch (reason) { failures[mode] = errors(reason); }
      finally {
        Blob.prototype.arrayBuffer = original;
        database.close();
      }
    }
    store.close();
    return { success, stale, failures };
  }, { config: config(), fixture: sample });
  expect(result.success.before).toEqual(result.success.after);
  expect(result.success.again).toEqual(sample.first.bytes);
  expect(result.stale).toBe("stale");
  expect(result.failures.missing).toContain("integrity");
  expect(result.failures.corrupt).toContain("integrity");
  expect(result.failures.fence).toContain("stale");
  expect(result.failures.abort).toContain("AbortError");
});

test("browser-admitted transfer planning uses actual verified metadata, reports exclusions and never downloads or activates content", async ({ page }) => {
  await setup(page);
  const personal = await personalSnapshot(page), fixture = bundledSnapshotFixture();
  const network: string[] = [];
  page.on("request", request => {
    if (/(?:objects|bundles)\/[0-9a-f]{64}\./.test(request.url())) network.push(request.url());
  });
  const sizes = Object.values(fixture.bundles).map(bundle => bundle.encodedBytes).sort((a, b) => a - b);
  const maximum = sizes[0];
  if (!maximum) throw new Error("Missing synthetic bundle size");
  const result = await page.evaluate(async ({ config, packet, limits, maximum }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../isolated-content") = await import(path);
    const store = await backend.ContentStore.open(config);
    const candidate = await backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
      const bytes = packet.objects[hash];
      if (!bytes) throw new Error("Missing synthetic metadata");
      return new Uint8Array(bytes);
    }, limits);
    const planning = { maxBundleMembers: 100, maxBundleEncodedBytes: 32 * 1024 * 1024,
      maxExtraBytes: 8 * 1024 * 1024, maxExtraPercent: 25, maxTransferEncodedBytes: 131072 };
    const planned = await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(candidate.plan());
      const verified: string[] = [];
      for (const object of candidate.metadataObjects()) {
        await writer.putObject(object.sha256, object.bytes);
        await writer.readObject(object.sha256);
        verified.push(object.sha256);
      }
      const before = await store.snapshot();
      const all = candidate.transferPlan(verified, planning);
      const bounded = candidate.transferPlan(verified, { ...planning, maxBundleEncodedBytes: maximum });
      const recovered = await backend.resumeSnapshot(candidate.plan(), hash => writer.readObject(hash), limits);
      const resumed = recovered.transferPlan(verified, planning);
      let refusal = "";
      try { candidate.transferPlan(verified, { ...planning, maxTransferEncodedBytes: all.plan.missingEncodedBytes - 1 }); }
      catch (reason) {
        if (!(reason instanceof backend.ContentError)) throw reason;
        refusal = reason.code;
      }
      const after = await store.snapshot();
      return { before, after, all, bounded, resumed, refusal };
    });
    store.close();
    return planned;
  }, { config: config(), packet: snapshotPacket(fixture), limits: snapshotLimits(), maximum });
  expect(result.all.plan.requests.map(request => request.kind)).toEqual(["bundle", "bundle"]);
  expect(result.bounded.excludedBundles).toHaveLength(1);
  expect(result.bounded.plan.requests.filter(request => request.kind === "bundle")).toHaveLength(1);
  expect(result.bounded.plan.requests.filter(request => request.kind === "object")).toHaveLength(2);
  expect(result.all.plan.requests.flatMap(request => request.covers).sort()).toEqual(fixture.manifest.catalog.map(entry => entry.item).sort());
  expect(result.all.plan.requests.flatMap(request => request.covers)).not.toContain(fixture.descriptorHash);
  expect(result.resumed).toEqual(result.all);
  expect(result.refusal).toBe("capacity");
  expect(result.after).toEqual(result.before);
  expect(result.after.control.active).toBeNull();
  expect(result.after.control.target).not.toBeNull();
  expect(network).toEqual([]);
  expect(await personalSnapshot(page)).toEqual(personal);
});

for (const transport of ["local", "https", "retry"] as const) {
test(`actual selected strict ZIP archives via ${transport} checkpoint only verified originals and complete full decoder activation`, async ({ page }) => {
  await setup(page);
  const personal = await personalSnapshot(page), fixture = actualBundledSnapshotFixture();
  const fetched: string[] = [];
  if (transport !== "local") await page.route("https://snapshot.invalid/bundles/*", route => {
    const hash = new URL(route.request().url()).pathname.split("/").pop()?.replace(/\.zip$/, "");
    const bytes = hash ? fixture.archives[hash] : undefined;
    if (!hash || !bytes) throw new Error("Unexpected synthetic archive request");
    const first = !fetched.includes(hash);
    fetched.push(hash);
    if (transport === "retry" && first) return route.fulfill({ status: 503,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After", "Retry-After": "0" } });
    return route.fulfill({ status: 200, body: Buffer.from(bytes),
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/zip" } });
  });
  const result = await page.evaluate(async ({ config, packet, archives, limits, transport }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../isolated-content") = await import(path);
    const store = await backend.ContentStore.open(config);
    const candidate = await backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
      const bytes = packet.objects[hash];
      if (!bytes) throw new Error("Missing synthetic metadata");
      return new Uint8Array(bytes);
    }, limits);
    const requests = await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(candidate.plan());
      const verified: string[] = [];
      for (const object of candidate.metadataObjects()) {
        await writer.putObject(object.sha256, object.bytes);
        await writer.readObject(object.sha256);
        verified.push(object.sha256);
      }
      const plan = candidate.transferPlan(verified, { maxBundleMembers: 100, maxBundleEncodedBytes: 32 * 1024 * 1024,
        maxExtraBytes: 8 * 1024 * 1024, maxExtraPercent: 25, maxTransferEncodedBytes: 131072 });
      for (const request of plan.plan.requests) {
        if (request.kind !== "bundle") throw new Error("Synthetic fixture must select its actual archives");
        const bytes = archives[request.sha256];
        if (!bytes) throw new Error("Missing selected synthetic archive");
        const artifact = {
          url: `https://snapshot.invalid/bundles/${request.sha256}.zip`, sha256: request.sha256,
          encodedBytes: request.encodedBytes,
        };
        const httpLimits = { maxEncodedBytes: 32 * 1024 * 1024, noProgressTimeoutMs: 30000, totalTimeoutMs: 1200000 };
        const encoded = transport === "https" ? await backend.fetchSnapshotArtifact(artifact, httpLimits)
          : transport === "retry" ? (await backend.fetchSnapshotWithRetries(artifact, {
            httpLimits, maxAttemptEncodedBytes: request.encodedBytes * 3, retryAfterReadable: true,
            isTransientNetworkError: () => false,
            retryPolicy: { maxAttempts: 3, backoffMs: [20, 40], jitterPercent: 0, maxAutomaticWaitMs: 120000 },
          })).bytes : new Uint8Array(bytes);
        const members = await candidate.admitBundle(request.sha256, encoded,
          { maxBundleMembers: 100, maxBundleEncodedBytes: 32 * 1024 * 1024 });
        for (const member of members) await writer.putObject(member.sha256, member.bytes);
      }
      await writer.activate((plan, read) => candidate.validate(plan, read));
      return plan.plan.requests;
    });
    const active = await store.snapshot();
    const original = await store.withActiveReader(async (plan, read) => {
      const bytes: Record<string, number[]> = {};
      for (const object of plan.required) bytes[object.sha256] = [...await read(object.sha256)];
      return bytes;
    });
    store.close();
    return { requests, active, original };
  }, { config: config(), packet: snapshotPacket(fixture), limits: snapshotLimits(), transport,
    archives: Object.fromEntries(Object.entries(fixture.archives).map(([hash, bytes]) => [hash, [...bytes]])) });
  expect(result.requests).toHaveLength(2);
  expect(result.requests.every(request => request.kind === "bundle")).toBe(true);
  expect(result.active.control.active).toEqual({ sequence: 1, manifestSha256: fixture.descriptor.manifest.sha256 });
  expect(result.active.control.target).toBeNull();
  expect(result.original).toEqual(snapshotPacket(fixture).objects);
  expect(result.active.objects.some(object => Object.hasOwn(fixture.archives, object.sha256))).toBe(false);
  expect(fetched.sort()).toEqual(transport === "local" ? [] : result.requests.flatMap(request =>
    transport === "retry" ? [request.sha256, request.sha256] : [request.sha256]).sort());
  expect(await personalSnapshot(page)).toEqual(personal);
});
}

test("cancelling native retry backoff durably pauses the target without another request or loss of the active reader", async ({ page }) => {
  await setup(page);
  const personal = await personalSnapshot(page), a = snapshotFixture(), b = snapshotFixture({ sequence: 2 });
  let requests = 0;
  await page.route("https://snapshot.invalid/retry-cancel", route => {
    requests++;
    return route.fulfill({ status: 503, headers: {
      "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Retry-After", "Retry-After": "1",
    } });
  });
  const response = page.waitForResponse("https://snapshot.invalid/retry-cancel");
  const work = page.evaluate(async ({ config, a, b, limits }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../isolated-content") = await import(path);
    const store = await backend.ContentStore.open(config);
    const inspect = (packet: typeof a) => backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
      const bytes = packet.objects[hash];
      if (!bytes) throw new Error("Missing synthetic metadata");
      return new Uint8Array(bytes);
    }, limits);
    const previous = await inspect(a), target = await inspect(b);
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(previous.plan());
      for (const [hash, bytes] of Object.entries(a.objects)) await writer.putObject(hash, new Uint8Array(bytes));
      await writer.activate((plan, read) => previous.validate(plan, read));
      await writer.begin(target.plan());
      for (const object of target.metadataObjects()) await writer.putObject(object.sha256, object.bytes);
    });
    const before = await store.snapshot(), controller = new AbortController();
    window.isolatedAttemptController = controller;
    const original = Object.entries(b.objects)[0];
    if (!original) throw new Error("Missing synthetic original");
    let error = "";
    try {
      await store.withWriter(before.control, async () => {
        await backend.fetchSnapshotWithRetries({ url: "https://snapshot.invalid/retry-cancel",
          sha256: original[0], encodedBytes: original[1].length }, {
          httpLimits: { maxEncodedBytes: 65536, noProgressTimeoutMs: 30000, totalTimeoutMs: 1200000 },
          retryPolicy: { maxAttempts: 3, backoffMs: [1000, 2000], jitterPercent: 0, maxAutomaticWaitMs: 120000 },
          maxAttemptEncodedBytes: 196608, retryAfterReadable: true, isTransientNetworkError: () => false,
        }, controller.signal);
      }, controller.signal);
    } catch (reason) {
      if (reason !== controller.signal.reason) throw reason;
      error = reason instanceof Error ? reason.name : String(reason);
    }
    const after = await store.snapshot();
    const readable = await store.withActiveReader(async (plan, read) => {
      await previous.validate(plan, read);
      return true;
    });
    delete window.isolatedAttemptController;
    store.close();
    return { before, after, error, readable };
  }, { config: config(), a: snapshotPacket(a), b: snapshotPacket(b), limits: snapshotLimits() });
  await response;
  await page.evaluate(() => {
    if (!window.isolatedAttemptController) throw new Error("Missing native attempt controller");
    window.isolatedAttemptController.abort();
  });
  const result = await work;
  expect(result.error).toBe("AbortError");
  expect(requests).toBe(1);
  expect(result.after.control.active).toEqual(result.before.control.active);
  expect(result.after.control.target).toEqual({ ...result.before.control.target, phase: "paused" });
  expect(result.after.objects).toEqual(result.before.objects);
  expect(result.after.snapshots).toEqual(result.before.snapshots);
  expect(result.readable).toBe(true);
  expect(await personalSnapshot(page)).toEqual(personal);
});

test("native Fetch rejects redirects without contacting the landing address and failed HTTP artifacts preserve active content", async ({ page }) => {
  await setup(page);
  const personal = await personalSnapshot(page), packet = snapshotPacket(snapshotFixture()), visited: string[] = [];
  const bytes = new Uint8Array([31, 139, 8, 0, 1, 2]);
  await page.route("https://snapshot.invalid/**", route => {
    const path = new URL(route.request().url()).pathname;
    visited.push(path);
    const headers = { "Access-Control-Allow-Origin": "*" };
    if (path === "/redirect") return route.fulfill({ status: 302,
      headers: { ...headers, Location: "https://snapshot.invalid/landing" } });
    if (path === "/unavailable" || path === "/unavailable-hidden") return route.fulfill({ status: 503,
      headers: { ...headers, "Retry-After": "121", ...(path === "/unavailable" ? { "Access-Control-Expose-Headers": "Retry-After" } : {}) } });
    return route.fulfill({ status: 200, headers, body: Buffer.from(path === "/overlong" ? [...bytes, 0]
      : path === "/valid" ? [...bytes] : [...bytes].reverse()) });
  });
  const result = await page.evaluate(async ({ config, packet, bytes, sha256, limits }) => {
    const path = "/isolated-content-store.js";
    const backend: typeof import("../isolated-content") = await import(path);
    const store = await backend.ContentStore.open(config);
    const candidate = await backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
      const bytes = packet.objects[hash];
      if (!bytes) throw new Error("Missing synthetic metadata");
      return new Uint8Array(bytes);
    }, limits);
    await store.withWriter((await store.snapshot()).control, async writer => {
      await writer.begin(candidate.plan());
      for (const [hash, bytes] of Object.entries(packet.objects)) await writer.putObject(hash, new Uint8Array(bytes));
      await writer.activate((plan, read) => candidate.validate(plan, read));
    });
    const before = await store.snapshot(), failures: { code: string; status?: number; retryAfter?: string | null }[] = [];
    const decisions: ReturnType<typeof backend.snapshotRetryDecision>[] = [];
    for (const path of ["redirect", "overlong", "wrong", "unavailable", "unavailable-hidden"]) {
      try {
        await backend.fetchSnapshotArtifact({ url: `https://snapshot.invalid/${path}`, sha256, encodedBytes: bytes.length },
          { maxEncodedBytes: bytes.length, noProgressTimeoutMs: 30000, totalTimeoutMs: 1200000 });
        throw new Error("Synthetic invalid HTTP artifact unexpectedly succeeded");
      } catch (reason) {
        if (!(reason instanceof backend.SnapshotHttpError)) throw reason;
        failures.push({ code: reason.code, ...(reason.status ? { status: reason.status, retryAfter: reason.retryAfter } : {}) });
        decisions.push(backend.snapshotRetryDecision(reason, { attempt: 1, nowMs: 0, jitterUnit: 0.5,
          networkTransient: false, retryAfterReadable: path !== "unavailable-hidden" },
        { maxAttempts: 3, backoffMs: [1000, 2000], jitterPercent: 20, maxAutomaticWaitMs: 120000 }));
      }
    }
    const sharedBudget = new backend.SnapshotAttemptBudget(bytes.length * 2);
    const shared = await Promise.allSettled([1, 2, 3].map(() => backend.fetchSnapshotWithRetries({
      url: "https://snapshot.invalid/valid", sha256, encodedBytes: bytes.length,
    }, {
      httpLimits: { maxEncodedBytes: bytes.length, noProgressTimeoutMs: 30000, totalTimeoutMs: 1200000 },
      retryPolicy: { maxAttempts: 3, backoffMs: [1000, 2000], jitterPercent: 0, maxAutomaticWaitMs: 120000 },
      maxAttemptEncodedBytes: bytes.length * 3, retryAfterReadable: true, isTransientNetworkError: () => false,
    }, undefined, sharedBudget)));
    const sharedResults = shared.map(result => {
      if (result.status === "fulfilled") return { status: result.status, attempts: result.value.attempts,
        bytes: [...result.value.bytes] };
      if (!(result.reason instanceof backend.SnapshotAttemptError)) throw result.reason;
      return { status: result.status, code: result.reason.code, attempts: result.reason.attempts };
    });
    const after = await store.snapshot();
    const readable = await store.withActiveReader(async (plan, read) => {
      for (const object of plan.required) await read(object.sha256);
      return true;
    });
    store.close();
    return { before, after, failures, decisions, sharedResults, sharedBudget: sharedBudget.snapshot(), readable };
  }, { config: config(), packet, bytes: [...bytes], sha256: createHash("sha256").update(bytes).digest("hex"), limits: snapshotLimits() });
  expect(result.failures).toEqual([{ code: "network" }, { code: "integrity" }, { code: "integrity" },
    { code: "http", status: 503, retryAfter: "121" }, { code: "http", status: 503, retryAfter: null }]);
  expect(visited).toEqual(["/redirect", "/overlong", "/wrong", "/unavailable", "/unavailable-hidden", "/valid", "/valid"]);
  expect(result.sharedResults).toEqual([{ status: "fulfilled", attempts: 1, bytes: [...bytes] },
    { status: "fulfilled", attempts: 1, bytes: [...bytes] }, { status: "rejected", code: "capacity", attempts: 0 }]);
  expect(result.sharedBudget).toEqual({ maxEncodedBytes: bytes.length * 2, reservedEncodedBytes: bytes.length * 2,
    remainingEncodedBytes: 0 });
  expect(result.decisions).toEqual([{ action: "fail", reason: "permanent" }, { action: "fail", reason: "permanent" },
    { action: "fail", reason: "permanent" }, { action: "pause", reason: "wait-limit", delayMs: 121000 },
    { action: "pause", reason: "retry-after-unavailable", delayMs: null }]);
  expect(result.after).toEqual(result.before);
  expect(result.readable).toBe(true);
  expect(await personalSnapshot(page)).toEqual(personal);
});

for (const fault of ["zip-crc", "item-json"] as const) {
  test(`a rehashed ${fault} bundle attempt preserves the previous active snapshot and never implies readiness`, async ({ page }) => {
    await setup(page);
    const personal = await personalSnapshot(page), a = snapshotFixture();
    const b = actualBundledSnapshotFixture({ sequence: 2, ...(fault === "zip-crc" ? {
      zipBytes: (bytes: Uint8Array) => {
        const changed = new Uint8Array(bytes), view = new DataView(changed.buffer);
        const central = view.getUint32(changed.length - 6, true);
        changed[14] = (changed[14] ?? 0) ^ 1;
        changed[central + 16] = (changed[central + 16] ?? 0) ^ 1;
        return changed;
      },
    } : { jsonBytes: (role, bytes) => role === "item" ? new Uint8Array([...bytes, 32]) : bytes }) });
    const result = await page.evaluate(async ({ config, a, b, archives, limits }) => {
      const path = "/isolated-content-store.js";
      const backend: typeof import("../isolated-content") = await import(path);
      const store = await backend.ContentStore.open(config);
      const inspect = (packet: typeof a) => backend.inspectSnapshot(new Uint8Array(packet.descriptor), async hash => {
        const bytes = packet.objects[hash];
        if (!bytes) throw new Error("Missing synthetic metadata");
        return new Uint8Array(bytes);
      }, limits);
      const previous = await inspect(a), candidate = await inspect(b);
      await store.withWriter((await store.snapshot()).control, async writer => {
        await writer.begin(previous.plan());
        for (const [hash, bytes] of Object.entries(a.objects)) await writer.putObject(hash, new Uint8Array(bytes));
        await writer.activate((plan, read) => previous.validate(plan, read));
        await writer.begin(candidate.plan());
        for (const object of candidate.metadataObjects()) await writer.putObject(object.sha256, object.bytes);
      });
      const before = await store.snapshot();
      let failure = "", kind = "";
      try {
        await store.withWriter(before.control, async writer => {
          for (const [hash, bytes] of Object.entries(archives)) {
            const members = await candidate.admitBundle(hash, new Uint8Array(bytes),
              { maxBundleMembers: 100, maxBundleEncodedBytes: 32 * 1024 * 1024 });
            for (const member of members) await writer.putObject(member.sha256, member.bytes);
          }
          await writer.activate((plan, read) => candidate.validate(plan, read));
        });
      } catch (reason) {
        if (reason instanceof backend.SnapshotZipConsumerError) { kind = "zip"; failure = reason.code; }
        else if (reason instanceof backend.ContentError) { kind = "decoded"; failure = reason.code; }
        else throw reason;
      }
      const after = await store.snapshot();
      const readable = await store.withActiveReader(async (plan, read) => {
        for (const object of plan.required) await read(object.sha256);
        return plan.reference;
      });
      store.close();
      return { before, after, failure, kind, readable };
    }, { config: config(), a: snapshotPacket(a), b: snapshotPacket(b), limits: snapshotLimits(),
      archives: Object.fromEntries(Object.entries(b.archives).map(([hash, bytes]) => [hash, [...bytes]])) });
    expect(result.failure).toBe("integrity");
    expect(result.kind).toBe(fault === "zip-crc" ? "zip" : "decoded");
    expect(result.after.control.active).toEqual(result.before.control.active);
    expect(result.readable).toEqual(result.before.control.active);
    expect(result.after.control.target?.phase).toBe("paused");
    expect(result.after.snapshots).toEqual(result.before.snapshots);
    if (fault === "zip-crc") expect(result.after.objects).toEqual(result.before.objects);
    else expect(result.after.objects.length).toBeGreaterThan(result.before.objects.length);
    expect(result.after.objects.some(object => Object.hasOwn(b.archives, object.sha256))).toBe(false);
    expect(await personalSnapshot(page)).toEqual(personal);
  });
}

for(const fault of ["json","gzip"] as const) {
  test(`actual encoded receipts cannot activate a rehashed invalid ${fault} replacement or destroy the previous snapshot`,async ({ page }) => {
    await setup(page);
    const personal=await personalSnapshot(page),a=snapshotFixture(),b=snapshotFixture({
      sequence: 2,
      ...(fault==="json"? {
        jsonBytes: (role: string,bytes: Uint8Array) =>
          role==="item"? new Uint8Array([...bytes,32]):bytes
      }:{
        gzipBytes: (role: string,bytes: Uint8Array) => role==="item"? new Uint8Array([...bytes,0]):bytes,
      }),
    });
    const result=await page.evaluate(async ({ config,a,b,limits }) => {
      const path="/isolated-content-store.js";
      const backend: typeof import("../isolated-content")=await import(path);
      const store=await backend.ContentStore.open(config);
      const prepare=async (packet: typeof a) => {
        const candidate=await backend.inspectSnapshot(new Uint8Array(packet.descriptor),async sha256 => {
          const bytes=packet.objects[sha256];
          if(!bytes) throw new Error("Missing synthetic snapshot object");
          return new Uint8Array(bytes);
        },limits);
        return store.withWriter((await store.snapshot()).control,async writer => {
          await writer.begin(candidate.plan());
          for(const [hash,bytes] of Object.entries(packet.objects)) await writer.putObject(hash,new Uint8Array(bytes));
          await writer.activate((plan,read) => candidate.validate(plan,read));
        });
      };
      await prepare(a);
      const previous=await store.snapshot();
      let failure="";
      try { await prepare(b); }
      catch(reason) {
        if(!(reason instanceof backend.ContentError)) throw reason;
        failure=reason.code;
      }
      const rejected=await store.snapshot();
      store.close();
      return { failure,previous,rejected };
    },{ config: config(),a: snapshotPacket(a),b: snapshotPacket(b),limits: snapshotLimits() });
    expect(result.failure).toBe("integrity");
    expect(result.rejected.control.active).toEqual(result.previous.control.active);
    expect(result.rejected.control.target?.reference).toEqual({ sequence: 2,manifestSha256: b.descriptor.manifest.sha256 });
    expect(result.rejected.control.target?.phase).toBe("paused");
    expect(result.rejected.objects).toHaveLength(new Set([...Object.keys(a.objects),...Object.keys(b.objects)]).size);
    expect(await personalSnapshot(page)).toEqual(personal);
  });
}
