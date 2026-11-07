import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import type { ContentDataset, ContentPlan, ExpectedContent } from "../shared/types/content";
import type { ContentStore, ContentWriteScope } from "./content-store";
import { ContentError, inspectSnapshot, resumeSnapshot } from "./snapshot-validation";
import { SnapshotAttemptBudget } from "./snapshot-attempts";
import { resumeSnapshotTransfer, stageSnapshotTransfer, type SnapshotStagingOptions } from "./snapshot-staging";
import { actualBundledSnapshotFixture, snapshotFixture, snapshotLimits } from "../tests/snapshot-fixture";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function options(): SnapshotStagingOptions {
  return { publicationBaseUrl: "https://snapshot.invalid/publication/",
    transferLimits: { maxBundleMembers: 100, maxBundleEncodedBytes: 32768, maxExtraBytes: 8192,
      maxExtraPercent: 25, maxTransferEncodedBytes: 131072 },
    attemptOptions: { httpLimits: { maxEncodedBytes: 32768, noProgressTimeoutMs: 30000, totalTimeoutMs: 120000 },
      maxAttemptEncodedBytes: 131072, retryAfterReadable: true, isTransientNetworkError: () => false,
      retryPolicy: { maxAttempts: 2, backoffMs: [0], jitterPercent: 0, maxAutomaticWaitMs: 120000 } } };
}
async function setup(bundled = true) {
  const bundledFixture = bundled ? actualBundledSnapshotFixture() : undefined;
  const fixture = bundledFixture ?? snapshotFixture();
  const read = async (sha256: string) => {
    const bytes = fixture.objects[sha256];
    if (!bytes) throw new Error("Missing synthetic object");
    return bytes;
  };
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read, snapshotLimits());
  const stored = new Map<string, Uint8Array>();
  const state: ContentDataset = { control: { formatVersion: 1, epoch: "10000000-0000-4000-8000-000000000001",
    revision: 0, active: null, target: null, retired: [] }, snapshots: [], objects: [] };
  const snapshot = () => ({ ...structuredClone(state),
    objects: [...stored].map(([sha256, bytes]) => ({ sha256, encodedBytes: bytes.length })) });
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected writer operation"); };
  const writer: ContentWriteScope = {
    begin: vi.fn(async (plan: ContentPlan) => {
      state.snapshots = [structuredClone(plan)];
      state.control.target = { reference: { ...plan.reference }, phase: "downloading" };
      return snapshot();
    }),
    phase: vi.fn(async (phase: "downloading" | "paused") => {
      if (!state.control.target) throw new Error("No target");
      state.control.target.phase = phase;
      return snapshot();
    }),
    putObject: vi.fn(async (sha256: string, bytes: Uint8Array) => {
      const required = state.snapshots[0]?.required.find(object => object.sha256 === sha256);
      if (!required || bytes.length !== required.encodedBytes || hash(bytes) !== sha256) {
        throw new ContentError("integrity", "Invalid synthetic checkpoint");
      }
      stored.set(sha256, new Uint8Array(bytes));
      return snapshot();
    }),
    readObject: vi.fn(async (sha256: string) => {
      const bytes = stored.get(sha256);
      if (!bytes || hash(bytes) !== sha256) throw new ContentError("integrity", "Invalid synthetic stored bytes");
      return new Uint8Array(bytes);
    }),
    remove: unexpected, dropTarget: unexpected, activate: unexpected, collect: unexpected,
  };
  const entered = vi.fn();
  const store: Pick<ContentStore, "snapshot" | "withWriter"> = {
    snapshot: vi.fn(async () => snapshot()),
    withWriter: async <T>(_expected: ExpectedContent, work: (scope: ContentWriteScope) => Promise<T>) => {
      entered();
      return work(writer);
    },
  };
  const fetcher = vi.fn(async (url: string) => {
    const sha256 = url.split("/").pop()?.split(".")[0];
    const bytes = sha256 && bundledFixture?.archives[sha256] ||
      (sha256 ? fixture.objects[sha256] : undefined);
    if (!bytes) throw new Error("Unexpected synthetic artifact URL");
    const response = new Response(new Uint8Array(bytes));
    Object.defineProperty(response, "url", { value: url });
    return response;
  });
  vi.stubGlobal("fetch", fetcher);
  return { fixture, candidate, stored, state, writer, store, entered, fetcher, expected: { ...state.control } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each([true, false])("staging actual selected artifacts bundled=%s checkpoints originals without activation", async bundled => {
  const context = await setup(bundled), budget = new SnapshotAttemptBudget(131072);
  const result = await stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget);
  expect(result.fetchedArtifacts).toBe(2);
  expect(result.attempts).toBe(2);
  expect(result.reservedEncodedBytes).toBe(result.transfer.plan.transferEncodedBytes);
  expect(result.transfer.artifacts.every(artifact => artifact.kind === (bundled ? "bundle" : "object"))).toBe(true);
  expect(context.fetcher.mock.calls.map(([url]) => url)).toEqual(result.transfer.artifacts.map(artifact =>
    `https://snapshot.invalid/publication/${artifact.path}`));
  expect([...context.stored.keys()].sort()).toEqual(context.candidate.plan().required.map(object => object.sha256));
  expect(context.state.control.active).toBeNull();
  expect(context.state.control.target?.phase).toBe("paused");
  await context.candidate.validate(context.candidate.plan(), async sha256 => context.writer.readObject(sha256));
});
test("resuming verifies actual retained bytes before selecting only missing originals", async () => {
  const context = await setup(false);
  await context.writer.begin(context.candidate.plan());
  for (const object of context.candidate.metadataObjects()) await context.writer.putObject(object.sha256, object.bytes);
  const item = context.fixture.manifest.catalog[0]?.item;
  if (!item || !context.fixture.objects[item]) throw new Error("Missing synthetic item");
  context.stored.set(item, context.fixture.objects[item]);
  const recovered = await resumeSnapshot(context.candidate.plan(), context.writer.readObject, snapshotLimits());
  const result = await stageSnapshotTransfer(context.store, context.expected, recovered, options(), new SnapshotAttemptBudget(131072));
  expect(result.fetchedArtifacts).toBe(1);
  expect(result.transfer.artifacts.some(artifact => artifact.sha256 === item)).toBe(false);
  expect(context.writer.begin).toHaveBeenCalledOnce();
  expect(context.writer.readObject).toHaveBeenCalledWith(item);
});
test("a complete verified target stages without requests or spending and still does not activate", async () => {
  const context = await setup();
  await context.writer.begin(context.candidate.plan());
  for (const [sha256, bytes] of Object.entries(context.fixture.objects)) context.stored.set(sha256, bytes);
  const budget = new SnapshotAttemptBudget(1);
  const result = await stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget);
  expect(result).toMatchObject({ fetchedArtifacts: 0, attempts: 0, reservedEncodedBytes: 0, transfer: { artifacts: [] } });
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(budget.snapshot().reservedEncodedBytes).toBe(0);
  expect(context.state.control.active).toBeNull();
});
test("corrupt retained bytes explicitly fail before any request or reservation, never silently refetch", async () => {
  const context = await setup(false);
  await context.writer.begin(context.candidate.plan());
  const item = context.fixture.manifest.catalog[0]?.item;
  if (!item || !context.fixture.objects[item]) throw new Error("Missing synthetic item");
  context.stored.set(item, new Uint8Array(context.fixture.objects[item].length));
  const budget = new SnapshotAttemptBudget(131072);
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget))
    .rejects.toMatchObject({ code: "integrity" });
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(budget.snapshot().reservedEncodedBytes).toBe(0);
});
test("different retained targets are refused without beginning or requesting a replacement", async () => {
  const context = await setup(false);
  const other = structuredClone(context.candidate.plan());
  other.reference.sequence++;
  await context.writer.begin(other);
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), new SnapshotAttemptBudget(131072)))
    .rejects.toMatchObject({ code: "target" });
  expect(context.writer.begin).toHaveBeenCalledOnce();
  expect(context.fetcher).not.toHaveBeenCalled();
});
test.each(["http://snapshot.invalid/", "https://user:pass@snapshot.invalid/", "https://snapshot.invalid/?",
  "https://snapshot.invalid/#", "https://snapshot.invalid/not-a-directory", "not a URL"])(
  "invalid publication directory %s fails before entering a writer", async publicationBaseUrl => {
    const context = await setup(false);
    await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate,
      { ...options(), publicationBaseUrl }, new SnapshotAttemptBudget(131072))).rejects.toMatchObject({ code: "invalid" });
    expect(context.entered).not.toHaveBeenCalled();
    expect(context.fetcher).not.toHaveBeenCalled();
  });
test("invalid retry/HTTP/transfer limits and pre-cancellation do not enter the writer or spend", async () => {
  const context = await setup(false), budget = new SnapshotAttemptBudget(131072);
  const invalid = options();
  invalid.attemptOptions.retryPolicy.maxAttempts = 0;
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, invalid, budget))
    .rejects.toMatchObject({ code: "invalid" });
  invalid.attemptOptions = options().attemptOptions;
  invalid.attemptOptions.httpLimits.maxEncodedBytes = 0;
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, invalid, budget))
    .rejects.toMatchObject({ code: "invalid" });
  invalid.attemptOptions = options().attemptOptions;
  invalid.transferLimits.maxBundleMembers = 0;
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, invalid, budget))
    .rejects.toMatchObject({ code: "invalid" });
  const controller = new AbortController();
  controller.abort();
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget, controller.signal))
    .rejects.toBe(controller.signal.reason);
  expect(context.entered).not.toHaveBeenCalled();
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(budget.snapshot().reservedEncodedBytes).toBe(0);
});
test("the complete selected transfer fits at equality and fails one byte below before requests", async () => {
  for (const difference of [0, -1]) {
    const context = await setup(false);
    const selected = context.candidate.transferPlan(context.candidate.metadataObjects().map(object => object.sha256), options().transferLimits);
    const budget = new SnapshotAttemptBudget(selected.plan.transferEncodedBytes + difference);
    const work = stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget);
    if (difference) {
      await expect(work).rejects.toMatchObject({ code: "capacity" });
      expect(context.fetcher).not.toHaveBeenCalled();
      expect(budget.snapshot().reservedEncodedBytes).toBe(0);
    } else {
      expect((await work).reservedEncodedBytes).toBe(selected.plan.transferEncodedBytes);
      expect(budget.snapshot().remainingEncodedBytes).toBe(0);
    }
  }
});
test("request and checkpoint effects are serial; checkpoint failure prevents all later requests", async () => {
  const context = await setup(false), failure = new DOMException("Synthetic quota", "QuotaExceededError");
  const original = context.writer.putObject;
  let fetched = false;
  context.fetcher.mockImplementation(async url => {
    fetched = true;
    const sha256 = url.split("/").pop()?.split(".")[0], bytes = sha256 && context.fixture.objects[sha256];
    if (!bytes) throw new Error("Missing synthetic artifact");
    const response = new Response(new Uint8Array(bytes));
    Object.defineProperty(response, "url", { value: url });
    return response;
  });
  context.writer.putObject = vi.fn(async (sha256, bytes) => {
    if (fetched) throw failure;
    return original(sha256, bytes);
  });
  const budget = new SnapshotAttemptBudget(131072);
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget)).rejects.toBe(failure);
  expect(context.fetcher).toHaveBeenCalledOnce();
  expect(budget.snapshot().reservedEncodedBytes).toBeGreaterThan(0);
});
test("cancellation during the first actual request retains its reservation and suppresses later work", async () => {
  const context = await setup(false), controller = new AbortController(), budget = new SnapshotAttemptBudget(131072);
  const reason = new DOMException("Synthetic departure", "AbortError");
  vi.stubGlobal("fetch", vi.fn(async () => { controller.abort(reason); throw reason; }));
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, options(), budget, controller.signal))
    .rejects.toBe(reason);
  expect(fetch).toHaveBeenCalledOnce();
  expect(budget.snapshot().reservedEncodedBytes).toBeGreaterThan(0);
  expect(context.stored.size).toBe(3);
});
test("nested options are captured before asynchronous writer work", async () => {
  const context = await setup(false), input = options();
  const original = context.store.withWriter;
  context.store.withWriter = async <T>(expected: ExpectedContent, work: (writer: ContentWriteScope) => Promise<T>) => {
    input.publicationBaseUrl = "https://wrong.invalid/";
    input.transferLimits.maxTransferEncodedBytes = 1;
    input.attemptOptions.httpLimits.maxEncodedBytes = 1;
    input.attemptOptions.retryPolicy.backoffMs = [];
    return original(expected, work);
  };
  const result = await stageSnapshotTransfer(context.store, context.expected, context.candidate, input, new SnapshotAttemptBudget(131072));
  expect(result.fetchedArtifacts).toBe(2);
  expect(context.fetcher.mock.calls.every(([url]) => url.startsWith("https://snapshot.invalid/publication/"))).toBe(true);
});
test.each(["../escape.json.gz", "/outside/object.json.gz", "https://other.invalid/object.json.gz",
  "objects/changed.json.gz?query", "objects/changed.json.gz#fragment", "objects/changed.json.gz?", "objects/changed.json.gz#"])(
  "a selected path %s cannot escape or extend the explicit publication directory", async path => {
    const context = await setup(false);
    const candidate = { ...context.candidate, transferPlan: (...args: Parameters<typeof context.candidate.transferPlan>) => {
      const transfer = context.candidate.transferPlan(...args);
      if (transfer.artifacts[0]) transfer.artifacts[0].path = path;
      return transfer;
    } };
    const budget = new SnapshotAttemptBudget(131072);
    await expect(stageSnapshotTransfer(context.store, context.expected, candidate, options(), budget))
      .rejects.toMatchObject({ code: "invalid" });
    expect(context.fetcher).not.toHaveBeenCalled();
    expect(budget.snapshot().reservedEncodedBytes).toBe(0);
  });
test("per-artifact attempt capacity is preflighted for the complete selection before any request", async () => {
  const context = await setup(false), input = options(), budget = new SnapshotAttemptBudget(131072);
  input.attemptOptions.maxAttemptEncodedBytes = 1;
  await expect(stageSnapshotTransfer(context.store, context.expected, context.candidate, input, budget))
    .rejects.toMatchObject({ code: "capacity" });
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(budget.snapshot().reservedEncodedBytes).toBe(0);
});
test("atomic explicit resume reconstructs actual metadata and stages only missing bytes in one writer scope", async () => {
  const context = await setup(false);
  await context.writer.begin(context.candidate.plan());
  for (const object of context.candidate.metadataObjects()) await context.writer.putObject(object.sha256, object.bytes);
  const item = context.fixture.manifest.catalog[0]?.item;
  if (!item || !context.fixture.objects[item]) throw new Error("Missing synthetic original");
  await context.writer.putObject(item, context.fixture.objects[item]);
  const result = await resumeSnapshotTransfer(context.store, context.expected, snapshotLimits(), options(), new SnapshotAttemptBudget(131072));
  expect(context.entered).toHaveBeenCalledOnce();
  expect(context.writer.begin).toHaveBeenCalledOnce();
  expect(result.candidate.plan()).toEqual(context.candidate.plan());
  expect(result.staged.fetchedArtifacts).toBe(1);
  expect(result.staged.transfer.artifacts.some(artifact => artifact.sha256 === item)).toBe(false);
  await result.candidate.validate(result.candidate.plan(), context.writer.readObject);
  expect(context.state.control.active).toBeNull();
  expect(context.state.control.target?.phase).toBe("paused");
});
test.each(["missing", "corrupt"] as const)("atomic resume refuses %s original descriptor without requesting or inventing evidence", async fault => {
  const context = await setup(false);
  await context.writer.begin(context.candidate.plan());
  for (const object of context.candidate.metadataObjects()) context.stored.set(object.sha256, object.bytes);
  if (fault === "missing") context.stored.delete(context.fixture.descriptorHash);
  else context.stored.set(context.fixture.descriptorHash, new Uint8Array(context.fixture.descriptorBytes.length));
  const budget = new SnapshotAttemptBudget(131072);
  await expect(resumeSnapshotTransfer(context.store, context.expected, snapshotLimits(), options(), budget))
    .rejects.toMatchObject({ code: "integrity" });
  expect(context.entered).toHaveBeenCalledOnce();
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(budget.snapshot().reservedEncodedBytes).toBe(0);
});
test("explicit resume without a retained target never begins a replacement", async () => {
  const context = await setup(false);
  await expect(resumeSnapshotTransfer(context.store, context.expected, snapshotLimits(), options(), new SnapshotAttemptBudget(131072)))
    .rejects.toMatchObject({ code: "target" });
  expect(context.writer.begin).not.toHaveBeenCalled();
  expect(context.fetcher).not.toHaveBeenCalled();
});
test("all resume limit shapes are validated before writer entry", async () => {
  const context = await setup(false);
  await expect(resumeSnapshotTransfer(context.store, context.expected, { ...snapshotLimits(), maxItems: 0 },
    options(), new SnapshotAttemptBudget(131072))).rejects.toMatchObject({ code: "invalid" });
  const input = options();
  input.transferLimits.maxTransferEncodedBytes = 0;
  await expect(resumeSnapshotTransfer(context.store, context.expected, snapshotLimits(), input,
    new SnapshotAttemptBudget(131072))).rejects.toMatchObject({ code: "invalid" });
  expect(context.entered).not.toHaveBeenCalled();
  expect(context.fetcher).not.toHaveBeenCalled();
});
test("resume validation limits and capability arrays are captured before writer entry", async () => {
  const context = await setup(false);
  await context.writer.begin(context.candidate.plan());
  for (const object of context.candidate.metadataObjects()) context.stored.set(object.sha256, object.bytes);
  const capabilities = [...snapshotLimits().supportedCapabilities];
  const limits = { ...snapshotLimits(), supportedCapabilities: capabilities }, original = context.store.withWriter;
  context.store.withWriter = async <T>(expected: ExpectedContent, work: (writer: ContentWriteScope) => Promise<T>) => {
    limits.maxItems = 0;
    limits.supportedCapabilities.length = 0;
    return original(expected, work);
  };
  const result = await resumeSnapshotTransfer(context.store, context.expected, limits, options(), new SnapshotAttemptBudget(131072));
  expect(result.staged.fetchedArtifacts).toBe(2);
  expect(context.entered).toHaveBeenCalledOnce();
});
test("legacy target plans without original descriptor evidence fail explicitly rather than restart", async () => {
  const context = await setup(false), legacy = context.candidate.plan();
  legacy.required = legacy.required.filter(object => object.sha256 !== context.fixture.descriptorHash);
  await context.writer.begin(legacy);
  for (const [sha256, bytes] of Object.entries(context.fixture.objects)) {
    if (sha256 !== context.fixture.descriptorHash) context.stored.set(sha256, bytes);
  }
  await expect(resumeSnapshotTransfer(context.store, context.expected, snapshotLimits(), options(), new SnapshotAttemptBudget(131072)))
    .rejects.toMatchObject({ code: "unsupported" });
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(context.writer.begin).toHaveBeenCalledOnce();
});
test("cancellation during original-evidence reconstruction stops before staging or reservation", async () => {
  const context = await setup(false);
  await context.writer.begin(context.candidate.plan());
  for (const object of context.candidate.metadataObjects()) context.stored.set(object.sha256, object.bytes);
  const controller = new AbortController(), reason = new DOMException("Synthetic reconstruction departure", "AbortError");
  const original = context.writer.readObject;
  context.writer.readObject = vi.fn(async sha256 => {
    const bytes = await original(sha256);
    controller.abort(reason);
    return bytes;
  });
  const budget = new SnapshotAttemptBudget(131072);
  await expect(resumeSnapshotTransfer(context.store, context.expected, snapshotLimits(), options(), budget, controller.signal))
    .rejects.toBe(reason);
  expect(context.fetcher).not.toHaveBeenCalled();
  expect(budget.snapshot().reservedEncodedBytes).toBe(0);
});
