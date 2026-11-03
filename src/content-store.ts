import Dexie, { type Table } from "dexie";
import {
  ContentError, assertContent, initialContent, contentKey, claimContentWriter, beginContentTarget,
  setContentTargetPhase, recordContentObject, planContentActivation, removeContentRoots,
  dropContentTarget, collectContent,
} from "../shared/tools/content-state.mjs";
import type {
  ContentDataset, ContentState, ContentPlan, ContentReference, ContentLimits, ExpectedContent,
} from "../shared/types/content";
export { ContentError } from "../shared/tools/content-state.mjs";

export type ContentStoreConfig = ContentLimits & { databaseName: string };
export type ContentReader = (sha256: string) => Promise<Uint8Array>;
type StoredObject = { sha256: string; encodedBytes: number; bytes: Blob };
type Transition = (before: ContentDataset, expected: ExpectedContent) => ContentDataset;
type WriterHost = {
  config: Readonly<ContentLimits>;
  snapshot: () => Promise<ContentDataset>;
  commit: (expected: ExpectedContent, transition: Transition, guard: () => void, added?: StoredObject) => Promise<ContentDataset>;
  reader: (plan: ContentPlan) => Promise<ContentReader>;
  object: (sha256: string) => Promise<StoredObject | undefined>;
  pinLock: (reference: ContentReference) => string;
};
export interface ContentWriteScope {
  begin(plan: ContentPlan): Promise<ContentDataset>;
  phase(phase: "downloading" | "paused"): Promise<ContentDataset>;
  remove(): Promise<ContentDataset>;
  dropTarget(): Promise<ContentDataset>;
  putObject(sha256: string, bytes: Uint8Array): Promise<ContentDataset>;
  activate(validate: (plan: ContentPlan, read: ContentReader) => Promise<void>): Promise<ContentDataset>;
  collect(): Promise<{ removed: ContentReference[]; deferred: ContentReference[] }>;
}
const expectedFor = (state: ContentState): ExpectedContent => ({ epoch: state.epoch, revision: state.revision });
const limitsFor = (config: ContentStoreConfig): ContentLimits => ({
  maxLogicalBytes: config.maxLogicalBytes, maxObjects: config.maxObjects,
  maxSnapshots: config.maxSnapshots, maxObjectBytes: config.maxObjectBytes,
});

class ContentDatabase extends Dexie {
  control!: Table<ContentState, string>;
  snapshots!: Table<ContentPlan, string>;
  objects!: Table<StoredObject, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ control: "", snapshots: "", objects: "&sha256" });
    this.on("populate", transaction => transaction.table("control").put(initialContent(crypto.randomUUID()).control, "state"));
  }
}

async function dataset(database: ContentDatabase, limits: ContentLimits): Promise<ContentDataset> {
  return database.transaction("r", database.control, database.snapshots, database.objects, async () => {
    const [control, controlCount, snapshots, keys, rows] = await Promise.all([
      database.control.get("state"), database.control.count(), database.snapshots.toArray(),
      database.snapshots.toCollection().primaryKeys(), database.objects.toArray(),
    ]);
    if (!control || controlCount !== 1) throw new ContentError("invalid", "Content control is missing or duplicated");
    const objects = rows.map(row => {
      if (!row || Object.keys(row).sort().join(",") !== "bytes,encodedBytes,sha256") throw new ContentError("invalid", "Unexpected stored object fields");
      if (!(row.bytes instanceof Blob) || row.bytes.size !== row.encodedBytes) throw new ContentError("integrity", "Stored object length differs from its receipt");
      return { sha256: row.sha256, encodedBytes: row.encodedBytes };
    });
    const value = { control, snapshots, objects };
    assertContent(value, limits);
    if (keys.some((key, index) => {
      const plan = snapshots[index];
      return !plan || key !== contentKey(plan.reference);
    })) throw new ContentError("invalid", "Stored snapshot key differs from its reference");
    return value;
  });
}

function schema(database: ContentDatabase) {
  const native = database.backendDB(), names = [...native.objectStoreNames];
  if (native.version !== 10 || JSON.stringify(names) !== JSON.stringify(["control", "objects", "snapshots"])) {
    throw new ContentError("unsupported", "Unsupported content database version or stores");
  }
  const transaction = native.transaction(names, "readonly");
  for (const name of names) {
    const store = transaction.objectStore(name);
    if (store.keyPath !== (name === "objects" ? "sha256" : null) || store.autoIncrement || store.indexNames.length) {
      throw new ContentError("unsupported", "Unsupported content database key or indexes");
    }
  }
}

async function hash(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
}
function untilDeparture<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    work.then(value => {
      signal.removeEventListener("abort", abort); resolve(value);
    }, reason => {
      signal.removeEventListener("abort", abort); reject(reason);
    });
  });
}

export class ContentStore {
  private readonly limits: Readonly<ContentLimits>;
  private constructor(private readonly database: ContentDatabase, readonly config: Readonly<ContentStoreConfig>) {
    this.limits = Object.freeze(limitsFor(config));
  }
  private writerLock() { return `DaasaVaani-content-writer:${this.config.databaseName}`; }
  pinLock(reference: ContentReference) {
    return `DaasaVaani-content-reader:${this.config.databaseName}:${reference.manifestSha256}`;
  }
  static async open(config: ContentStoreConfig): Promise<ContentStore> {
    if (!config || typeof config.databaseName !== "string" || !config.databaseName ||
        Object.keys(config).sort().join(",") !== "databaseName,maxLogicalBytes,maxObjectBytes,maxObjects,maxSnapshots") {
      throw new ContentError("invalid", "Explicit content database name and limits are required");
    }
    assertContent(initialContent(crypto.randomUUID()), limitsFor(config));
    if (!navigator.locks?.request) throw new ContentError("unsupported", "Exclusive content coordination requires Web Locks");
    const database = new ContentDatabase(config.databaseName), store = new ContentStore(database, Object.freeze({ ...config }));
    try {
      await navigator.locks.request(store.writerLock(), { ifAvailable: true }, async lock => {
        if (!lock) throw new ContentError("busy", "Another content writer owns this database");
        await database.open();
        schema(database);
        await dataset(database, store.limits);
      });
      return store;
    } catch (reason) {
      database.close();
      if (reason instanceof Error && reason.name === "VersionError") throw new ContentError("unsupported", "Existing content database uses a future version");
      throw reason;
    }
  }
  close() { this.database.close(); }
  snapshot() { return dataset(this.database, this.limits); }
  async withWriter<T>(expected: ExpectedContent, work: (writer: ContentWriteScope) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return navigator.locks.request(this.writerLock(), { ifAvailable: true, ...(signal ? { signal } : {}) }, async lock => {
      if (!lock) throw new ContentError("busy", "Another content writer owns this database");
      signal?.throwIfAborted();
      const captured = await this.commit({ epoch: expected.epoch, revision: expected.revision },
        (before, fence) => claimContentWriter(before, fence, crypto.randomUUID(), this.limits), () => signal?.throwIfAborted());
      const writer = new ContentWriter({
        config: this.limits, snapshot: () => this.snapshot(),
        commit: (fence, transition, guard, added) => this.commit(fence, transition, guard, added),
        reader: plan => this.reader(plan), object: sha256 => this.object(sha256),
        pinLock: reference => this.pinLock(reference),
      }, expectedFor(captured.control), signal);
      const scope: ContentWriteScope = {
        begin: plan => writer.run(() => writer.begin(plan)),
        phase: phase => writer.run(() => writer.phase(phase)),
        remove: () => writer.run(() => writer.remove()),
        dropTarget: () => writer.run(() => writer.dropTarget()),
        putObject: (sha256, bytes) => writer.run(() => writer.putObject(sha256, bytes)),
        activate: validate => writer.run(() => writer.activate(validate)),
        collect: () => writer.run(() => writer.collect()),
      };
      try {
        const value = await work(scope);
        await writer.finish();
        return value;
      }
      catch (reason) {
        let failure = reason;
        try { await writer.finish({ reason }); }
        catch (drainFailure) { failure = new AggregateError([reason, drainFailure], "Content callback and unfinished operations failed"); }
        try { await writer.pauseAfterFailure(); }
        catch (pauseFailure) { throw new AggregateError([failure, pauseFailure], "Content operation and pause checkpoint failed"); }
        throw failure;
      } finally { writer.release(); }
    });
  }
  private async commit(expected: ExpectedContent, transition: Transition, guard: () => void, added?: StoredObject): Promise<ContentDataset> {
    return this.database.transaction("rw", this.database.control, this.database.snapshots, this.database.objects, async () => {
      const before = await dataset(this.database, this.limits), after = transition(before, expected);
      guard();
      assertContent(after, this.limits);
      const plans = new Map(after.snapshots.map(plan => [contentKey(plan.reference), plan]));
      const priorPlans = new Map(before.snapshots.map(plan => [contentKey(plan.reference), plan]));
      for (const key of priorPlans.keys()) if (!plans.has(key)) await this.database.snapshots.delete(key);
      for (const [key, plan] of plans) {
        if (JSON.stringify(plan) !== JSON.stringify(priorPlans.get(key))) await this.database.snapshots.put(plan, key);
      }
      const objects = new Set(after.objects.map(row => row.sha256)), priorObjects = new Set(before.objects.map(row => row.sha256));
      for (const key of priorObjects) if (!objects.has(key)) await this.database.objects.delete(key);
      for (const row of after.objects) {
        if (!priorObjects.has(row.sha256)) {
          if (!added || added.sha256 !== row.sha256 || added.encodedBytes !== row.encodedBytes) throw new ContentError("integrity", "New object receipt has no matching bytes");
          await this.database.objects.add(added);
        }
      }
      guard();
      if (JSON.stringify(after.control) !== JSON.stringify(before.control)) await this.database.control.put(after.control, "state");
      return after;
    });
  }
  private async reader(plan: ContentPlan): Promise<ContentReader> {
    const required = new Map(plan.required.map(object => [object.sha256, object.encodedBytes]));
    return async sha256 => {
      const size = required.get(sha256), row = await this.database.objects.get(sha256);
      if (size === undefined || !row || !(row.bytes instanceof Blob) || row.bytes.size !== size || row.encodedBytes !== size) {
        throw new ContentError("integrity", "Required object is absent or has an incorrect length");
      }
      const bytes = new Uint8Array(await row.bytes.arrayBuffer());
      if (await hash(bytes) !== sha256) throw new ContentError("integrity", "Stored object digest differs from its identity");
      return bytes;
    };
  }
  private async object(sha256: string) { return this.database.objects.get(sha256); }
  async withActiveReader<T>(work: (plan: ContentPlan, read: ContentReader) => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (;;) {
      signal?.throwIfAborted();
      const before = await this.snapshot(), reference = before.control.active;
      if (!reference) throw new ContentError("unprepared", "No active content snapshot");
      const result = await navigator.locks.request(this.pinLock(reference), { mode: "shared", ...(signal ? { signal } : {}) }, async () => {
        const current = await this.snapshot();
        if (!current.control.active || contentKey(current.control.active) !== contentKey(reference)) return { retry: true } as const;
        const plan = current.snapshots.find(value => contentKey(value.reference) === contentKey(reference));
        if (!plan) throw new ContentError("invalid", "Active snapshot has no stored plan");
        signal?.throwIfAborted();
        const read = await this.reader(plan);
        let readable = true;
        try {
          const value = await untilDeparture(work(structuredClone(plan), async sha256 => {
            if (!readable) throw new ContentError("stale", "Reader scope has departed");
            signal?.throwIfAborted();
            const bytes = await read(sha256);
            if (!readable) throw new ContentError("stale", "Reader scope has departed");
            signal?.throwIfAborted();
            return bytes;
          }), signal);
          return { retry: false, value } as const;
        } finally { readable = false; }
      });
      if (!result.retry) return result.value;
    }
  }
}

class ContentWriter implements ContentWriteScope {
  private active = true;
  private accepting = true;
  private finished = false;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly failures: unknown[] = [];
  constructor(private readonly store: WriterHost, private expected: ExpectedContent, private readonly signal?: AbortSignal) {}
  release() { this.active = false; }
  private guard() {
    if (!this.active || !this.accepting) throw new ContentError("stale", "Writer callback has completed");
    this.signal?.throwIfAborted();
  }
  run<T>(work: () => Promise<T>): Promise<T> {
    this.guard();
    const result = work();
    this.pending.add(result);
    void result.then(() => this.pending.delete(result), reason => {
      this.pending.delete(result); this.failures.push(reason);
    });
    return result;
  }
  async finish(originalFailure?: { reason: unknown }) {
    if (this.finished) return;
    this.accepting = false;
    const pending = [...this.pending];
    await Promise.allSettled(pending);
    this.finished = true;
    const failures = this.failures.filter(reason => !originalFailure || reason !== originalFailure.reason);
    if (pending.length) failures.unshift(new ContentError("stale", "Writer callback left unawaited operations"));
    if (failures.length) throw new AggregateError(failures, "Content writer scope failed");
    this.signal?.throwIfAborted();
  }
  private async change(transition: Transition, added?: StoredObject) {
    this.guard();
    const after = await this.store.commit(this.expected, transition, () => this.guard(), added);
    this.guard();
    this.expected = expectedFor(after.control);
    return after;
  }
  begin(plan: ContentPlan) { return this.change((before, expected) => beginContentTarget(before, expected, plan, this.store.config)); }
  phase(phase: "downloading" | "paused") {
    return this.change((before, expected) => setContentTargetPhase(before, expected, phase, this.store.config));
  }
  remove() { return this.change((before, expected) => removeContentRoots(before, expected, this.store.config)); }
  dropTarget() { return this.change((before, expected) => dropContentTarget(before, expected, this.store.config)); }
  async putObject(sha256: string, input: Uint8Array) {
    this.guard();
    const bytes = new Uint8Array(input), before = await this.store.snapshot();
    const target = before.control.target;
    const plan = target && before.snapshots.find(value => contentKey(value.reference) === contentKey(target.reference));
    const required = plan?.required.find(value => value.sha256 === sha256);
    if (!required || bytes.length !== required.encodedBytes || bytes.length > this.store.config.maxObjectBytes || await hash(bytes) !== sha256) {
      throw new ContentError("integrity", "Object does not match the target's required digest or length");
    }
    const existing = await this.store.object(sha256);
    if (existing && (!(existing.bytes instanceof Blob) || await hash(new Uint8Array(await existing.bytes.arrayBuffer())) !== sha256)) {
      throw new ContentError("integrity", "Existing immutable object has an incorrect digest");
    }
    return this.change((value, expected) => recordContentObject(value, expected, { sha256, encodedBytes: bytes.length }, this.store.config),
      { sha256, encodedBytes: bytes.length, bytes: new Blob([bytes]) });
  }
  async activate(validate: (plan: ContentPlan, read: ContentReader) => Promise<void>) {
    this.guard();
    const captured = { ...this.expected }, before = await this.store.snapshot(), target = before.control.target;
    const plan = target && before.snapshots.find(value => contentKey(value.reference) === contentKey(target.reference));
    if (!plan) throw new ContentError("target", "Activation requires a target plan");
    const read = await this.store.reader(plan), observed = new Set<string>();
    await validate(structuredClone(plan), async sha256 => {
      const bytes = await read(sha256);
      observed.add(sha256);
      return bytes;
    });
    this.guard();
    if (observed.size !== plan.required.length) throw new ContentError("integrity", "Validation did not read every required object");
    const after = await this.store.commit(captured,
      (current, expected) => planContentActivation(current, expected, this.store.config), () => this.guard());
    this.guard();
    this.expected = expectedFor(after.control);
    return after;
  }
  async collect() {
    this.guard();
    const before = await this.store.snapshot(), removed: ContentReference[] = [], deferred: ContentReference[] = [];
    for (const reference of before.control.retired) {
      await navigator.locks.request(this.store.pinLock(reference), { mode: "exclusive", ifAvailable: true }, async lock => {
        if (!lock) { deferred.push(reference); return; }
        await this.change((current, expected) => collectContent(current, expected, [reference], this.store.config));
        removed.push(reference);
      });
    }
    await this.change((current, expected) => collectContent(current, expected, [], this.store.config));
    return { removed, deferred };
  }
  async pauseAfterFailure() {
    if (!this.active) throw new ContentError("stale", "Writer lock has been released");
    const before = await this.store.snapshot();
    if (!before.control.target || before.control.target.phase === "paused") return;
    const after = await this.store.commit(this.expected,
      (current, expected) => setContentTargetPhase(current, expected, "paused", this.store.config),
      () => { if (!this.active) throw new ContentError("stale", "Writer lock has been released"); });
    this.expected = expectedFor(after.control);
  }
}
