import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { fetchSnapshotWithRetries, SnapshotAttemptError, type SnapshotAttemptOptions } from "./snapshot-attempts";
import type { SnapshotHttpArtifact } from "./snapshot-http";

const bytes = new Uint8Array([31, 139, 8, 0, 1, 2]);
const artifact = (): SnapshotHttpArtifact => ({ url: "https://snapshot.invalid/original.json.gz",
  sha256: createHash("sha256").update(bytes).digest("hex"), encodedBytes: bytes.length });
const options = (): SnapshotAttemptOptions => ({
  httpLimits: { maxEncodedBytes: bytes.length, noProgressTimeoutMs: 30000, totalTimeoutMs: 1200000 },
  retryPolicy: { maxAttempts: 3, backoffMs: [1000, 2000], jitterPercent: 20, maxAutomaticWaitMs: 120000 },
  maxAttemptEncodedBytes: bytes.length * 3, retryAfterReadable: true, isTransientNetworkError: () => false,
});
function response(status = 200, retryAfter?: string, body = bytes) {
  const value = new Response(new Uint8Array(body), { status, headers: retryAfter ? { "Retry-After": retryAfter } : {} });
  Object.defineProperty(value, "url", { value: artifact().url });
  return value;
}
function fakeTime() {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
test("first successful attempt returns copied verified bytes and exact reservation accounting", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetcher);
  expect(await fetchSnapshotWithRetries(artifact(), { ...options(), maxAttemptEncodedBytes: bytes.length }))
    .toEqual({ bytes, attempts: 1, reservedEncodedBytes: bytes.length });
  expect(fetcher).toHaveBeenCalledOnce();
});
test("transient HTTP failures wait the complete1s/2s before the third same-identity attempt", async () => {
  fakeTime();
  const fetcher = vi.fn().mockImplementationOnce(() => Promise.resolve(response(503)))
    .mockImplementationOnce(() => Promise.resolve(response(429)))
    .mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetcher);
  const work = fetchSnapshotWithRetries(artifact(), options());
  await vi.advanceTimersByTimeAsync(999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(await work).toEqual({ bytes, attempts: 3, reservedEncodedBytes: bytes.length * 3 });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([artifact().url, artifact().url, artifact().url]);
  expect(vi.getTimerCount()).toBe(0);
});
test("visible server waits are never shortened by backoff or early timer callbacks", async () => {
  fakeTime();
  const fetcher = vi.fn().mockImplementationOnce(() => Promise.resolve(response(503, "2")))
    .mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetcher);
  const work = fetchSnapshotWithRetries(artifact(), options());
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect((await work).attempts).toBe(2);
});
test.each(["hidden", "invalid", "excessive"] as const)("%s server wait pauses once with its exact cause and no retry timer", async fault => {
  fakeTime();
  const fetcher = vi.fn().mockResolvedValue(response(503, fault === "invalid" ? "invalid" : "121"));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchSnapshotWithRetries(artifact(), { ...options(), retryAfterReadable: fault !== "hidden" }))
    .rejects.toMatchObject({ code: "paused", attempts: 1, reservedEncodedBytes: bytes.length,
      cause: { code: "http", status: 503 }, decision: { action: "pause",
        reason: fault === "hidden" ? "retry-after-unavailable" : fault === "invalid" ? "retry-after-invalid" : "wait-limit" } });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
test.each([401, 404, 501])("permanent HTTP%s fails once preserving original status", async status => {
  fakeTime();
  const fetcher = vi.fn().mockResolvedValue(response(status));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchSnapshotWithRetries(artifact(), options())).rejects.toMatchObject({
    code: "failed", attempts: 1, cause: { code: "http", status }, decision: { action: "fail", reason: "permanent" },
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
test("three failed attempts exhaust the policy, retain the last failure, and never make a fourth request", async () => {
  fakeTime();
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(503)));
  vi.stubGlobal("fetch", fetcher);
  const work = expect(fetchSnapshotWithRetries(artifact(), options())).rejects.toMatchObject({
    code: "failed", attempts: 3, reservedEncodedBytes: bytes.length * 3,
    decision: { action: "fail", reason: "attempts-exhausted" }, cause: { status: 503 },
  });
  await vi.advanceTimersByTimeAsync(3000);
  await work;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
test.each([bytes.length - 1, bytes.length * 2 - 1])("budget%s refuses before an unaffordable request or sleep", async budget => {
  fakeTime();
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(503)));
  vi.stubGlobal("fetch", fetcher);
  const attempts = budget < bytes.length ? 0 : 1;
  await expect(fetchSnapshotWithRetries(artifact(), { ...options(), maxAttemptEncodedBytes: budget }))
    .rejects.toMatchObject({ code: "capacity", attempts, reservedEncodedBytes: attempts * bytes.length });
  expect(fetcher).toHaveBeenCalledTimes(attempts);
  expect(vi.getTimerCount()).toBe(0);
});
test("pre-cancellation and cancellation during backoff preserve the reason and suppress later attempts", async () => {
  fakeTime();
  const controller = new AbortController(), reason = new Error("Synthetic departure");
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(503)));
  vi.stubGlobal("fetch", fetcher);
  controller.abort(reason);
  await expect(fetchSnapshotWithRetries(artifact(), options(), controller.signal)).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
  const pending = new AbortController(), work = fetchSnapshotWithRetries(artifact(), options(), pending.signal);
  const rejected = expect(work).rejects.toBe(reason);
  await vi.advanceTimersByTimeAsync(1);
  pending.abort(reason);
  await rejected;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
test("only independently classified network errors retry and callback failures are not swallowed", async () => {
  fakeTime();
  const cause = new TypeError("Synthetic network failure"), fetcher = vi.fn().mockRejectedValueOnce(cause)
    .mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetcher);
  const work = fetchSnapshotWithRetries(artifact(), { ...options(), isTransientNetworkError: error => error.cause === cause });
  await vi.advanceTimersByTimeAsync(1000);
  expect((await work).attempts).toBe(2);
  fetcher.mockRejectedValue(cause);
  const classifierFailure = new Error("Synthetic classifier failure");
  await expect(fetchSnapshotWithRetries(artifact(), { ...options(), isTransientNetworkError: () => { throw classifierFailure; } }))
    .rejects.toBe(classifierFailure);
});
test("unclassified network errors, corrupt bytes and native crypto errors never retry", async () => {
  const cause = new TypeError("Synthetic ambiguous fetch failure");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
  await expect(fetchSnapshotWithRetries(artifact(), options())).rejects.toMatchObject({
    code: "failed", attempts: 1, cause: { code: "network", cause },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, undefined, new Uint8Array([...bytes].reverse()))));
  await expect(fetchSnapshotWithRetries(artifact(), options())).rejects.toMatchObject({
    code: "failed", attempts: 1, cause: { code: "integrity" },
  });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(response())));
  const cryptoFailure = new Error("Synthetic native crypto failure");
  vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(cryptoFailure);
  await expect(fetchSnapshotWithRetries(artifact(), options())).rejects.toMatchObject({
    code: "failed", attempts: 1, cause: cryptoFailure,
  });
});
test.each(["extra", "budget", "classifier", "visibility", "policy", "artifact"] as const)(
  "invalid %s configuration fails before network work", async fault => {
    const fetcher = vi.fn(), bounds = options(), input = artifact();
    vi.stubGlobal("fetch", fetcher);
    if (fault === "extra") Object.assign(bounds, { unexpected: true });
    if (fault === "budget") bounds.maxAttemptEncodedBytes = 0;
    if (fault === "classifier") Object.assign(bounds, { isTransientNetworkError: null });
    if (fault === "visibility") Object.assign(bounds, { retryAfterReadable: null });
    if (fault === "policy") bounds.retryPolicy.backoffMs = [];
    if (fault === "artifact") input.url = "http://snapshot.invalid";
    await expect(fetchSnapshotWithRetries(input, bounds)).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).not.toHaveBeenCalled();
  });
test("the entire retry configuration and identity are captured before the first request", async () => {
  fakeTime();
  const input = artifact(), bounds = options();
  const fetcher = vi.fn().mockImplementationOnce(() => {
    input.url = "http://changed.invalid"; input.sha256 = "f".repeat(64); input.encodedBytes = 1;
    bounds.httpLimits.maxEncodedBytes = 1; bounds.maxAttemptEncodedBytes = 1; bounds.retryAfterReadable = false;
    bounds.retryPolicy.backoffMs = [0, 0]; bounds.retryPolicy.maxAttempts = 1;
    return Promise.resolve(response(503));
  }).mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetcher);
  const work = fetchSnapshotWithRetries(input, bounds);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(await work).toEqual({ bytes, attempts: 2, reservedEncodedBytes: bytes.length * 2 });
});
test("structured terminal failures are errors, not success-shaped partial results", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(404)));
  await expect(fetchSnapshotWithRetries(artifact(), options())).rejects.toBeInstanceOf(SnapshotAttemptError);
});
test("a timed-out native request is fully aborted before another attempt starts", async () => {
  fakeTime();
  let aborted = false;
  const fetcher = vi.fn().mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { aborted = true; reject(init.signal?.reason); }, { once: true });
  })).mockImplementation(() => {
    expect(aborted).toBe(true);
    return Promise.resolve(response());
  });
  vi.stubGlobal("fetch", fetcher);
  const work = fetchSnapshotWithRetries(artifact(), { ...options(),
    httpLimits: { ...options().httpLimits, noProgressTimeoutMs: 30 } });
  await vi.advanceTimersByTimeAsync(1029);
  expect(fetcher).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect((await work).attempts).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});
