import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { fetchSnapshotArtifact, type SnapshotHttpArtifact, type SnapshotHttpLimits } from "./snapshot-http";

const bytes = new Uint8Array([31, 139, 8, 0, 1, 2]);
const artifact = (): SnapshotHttpArtifact => ({ url: "https://snapshot.invalid/objects/original.json.gz",
  sha256: createHash("sha256").update(bytes).digest("hex"), encodedBytes: bytes.length });
const limits = (): SnapshotHttpLimits => ({ maxEncodedBytes: bytes.length, noProgressTimeoutMs: 30, totalTimeoutMs: 120 });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function reply(body: Uint8Array = bytes, init?: ResponseInit) {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(new Uint8Array(body), init)));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function response(body: BodyInit | null, init?: ResponseInit) {
  const value = new Response(body, init);
  Object.defineProperty(value, "url", { value: artifact().url, configurable: true });
  return value;
}
test("exact length/SHA are proved at the inclusive caller ceiling with direct credentialless requests", async () => {
  vi.useFakeTimers();
  const fetcher = reply();
  const result = await fetchSnapshotArtifact(artifact(), limits());
  expect(result).toEqual(bytes);
  expect(result).not.toBe(bytes);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
  });
  expect(vi.getTimerCount()).toBe(0);
});
test.each(["http", "credentials", "fragment", "empty-fragment", "malformed"] as const)("an invalid %s address fails before requesting", async fault => {
  const fetcher = reply(), input = artifact();
  input.url = fault === "http" ? "http://snapshot.invalid/item" :
    fault === "credentials" ? "https://user:password@snapshot.invalid/item" :
    fault === "fragment" ? `${input.url}#fragment` : fault === "empty-fragment" ? `${input.url}#` : "not a URL";
  await expect(fetchSnapshotArtifact(input, limits())).rejects.toMatchObject({ code: "invalid" });
  expect(fetcher).not.toHaveBeenCalled();
});
test.each(["hash", "length", "extra", "timeout", "timer-overflow"] as const)("invalid %s configuration fails before requesting", async fault => {
  const fetcher = reply(), input = artifact(), bound = limits();
  if (fault === "hash") input.sha256 = "INVALID";
  if (fault === "length") input.encodedBytes = 0;
  if (fault === "extra") Object.assign(bound, { unexpected: 1 });
  if (fault === "timeout") bound.totalTimeoutMs = 0;
  if (fault === "timer-overflow") bound.noProgressTimeoutMs = 2147483648;
  await expect(fetchSnapshotArtifact(input, bound)).rejects.toMatchObject({ code: "invalid" });
  expect(fetcher).not.toHaveBeenCalled();
});
test("one byte below declared capacity fails before any network request", async () => {
  const fetcher = reply();
  await expect(fetchSnapshotArtifact(artifact(), { ...limits(), maxEncodedBytes: bytes.length - 1 }))
    .rejects.toMatchObject({ code: "capacity" });
  expect(fetcher).not.toHaveBeenCalled();
});
test.each(["short", "long", "hash"] as const)("a %s body never returns verified bytes", async fault => {
  const input = new Uint8Array(bytes);
  if (fault === "hash") input[0] = 0;
  reply(fault === "short" ? input.subarray(1) : fault === "long" ? new Uint8Array([...input, 0]) : input);
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "integrity" });
});
test.each([206, 304, 401, 404, 408, 429, 500, 503])("HTTP%s is explicit, never automatically retried", async status => {
  const fetcher = reply(bytes, { status: status === 304 ? 200 : status, headers: { "Retry-After": "121" } });
  if (status === 304) fetcher.mockResolvedValue(response(null, { status, headers: { "Retry-After": "121" } }));
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "http", status, retryAfter: "121" });
  expect(fetcher).toHaveBeenCalledOnce();
});
test("HTTP Content-Length is not mistaken for original gzip length after HTTP content decoding", async () => {
  reply(bytes, { headers: { "Content-Length": "9999", "Content-Encoding": "gzip" } });
  await expect(fetchSnapshotArtifact(artifact(), limits())).resolves.toEqual(bytes);
});
test("network failure preserves its cause without retry or success-shaped fallback", async () => {
  const cause = new TypeError("Permitted synthetic network failure"), fetcher = vi.fn().mockRejectedValue(cause);
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "network", cause });
  expect(fetcher).toHaveBeenCalledOnce();
});
test("pre-cancelled and pending cancellation preserve the caller reason", async () => {
  const controller = new AbortController(), reason = new Error("Synthetic departure"), fetcher = reply();
  controller.abort(reason);
  await expect(fetchSnapshotArtifact(artifact(), limits(), controller.signal)).rejects.toBe(reason);
  expect(fetcher).not.toHaveBeenCalled();
  const pending = new AbortController();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  }));
  const work = fetchSnapshotArtifact(artifact(), limits(), pending.signal);
  pending.abort(reason);
  await expect(work).rejects.toBe(reason);
});
test.each(["idle", "total"] as const)("%s deadline aborts a pending request and clears both timers", async kind => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  }));
  const work = expect(fetchSnapshotArtifact(artifact(), {
    ...limits(), noProgressTimeoutMs: kind === "idle" ? 30 : 120, totalTimeoutMs: kind === "total" ? 30 : 120,
  })).rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(30);
  await work;
  expect(vi.getTimerCount()).toBe(0);
});
test("empty chunks do not reset idle deadlines and body abort does not leak partial bytes", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => Promise.resolve(response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array());
      init.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
    },
  }))));
  const work = expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(30);
  await work;
  expect(vi.getTimerCount()).toBe(0);
});
test("captured identity and safety bounds cannot change while the body is arriving", async () => {
  const input = artifact(), bound = limits();
  vi.stubGlobal("fetch", () => {
    input.sha256 = "f".repeat(64); input.encodedBytes = 1; input.url = "http://changed.invalid";
    bound.maxEncodedBytes = 1; bound.totalTimeoutMs = 1;
    return Promise.resolve(response(new Uint8Array(bytes)));
  });
  await expect(fetchSnapshotArtifact(input, bound)).resolves.toEqual(bytes);
});
test("native hashing failure is preserved and cancellation during hashing prevents success", async () => {
  reply();
  const failure = new Error("Synthetic crypto failure");
  const digest = vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(failure);
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toBe(failure);
  const controller = new AbortController(), reason = new Error("Synthetic hash departure");
  digest.mockImplementationOnce(async () => { controller.abort(reason); return new Uint8Array(createHash("sha256").update(bytes).digest()).buffer; });
  await expect(fetchSnapshotArtifact(artifact(), limits(), controller.signal)).rejects.toBe(reason);
});
test.each(["redirected", "different", "empty", "no-body"] as const)("a %s response cannot satisfy the direct complete response contract", async fault => {
  const value = response(fault === "no-body" ? null : new Uint8Array(bytes));
  if (fault === "redirected") Object.defineProperty(value, "redirected", { value: true });
  if (fault === "different" || fault === "empty") Object.defineProperty(value, "url", {
    value: fault === "empty" ? "" : "https://other.invalid/object",
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value));
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "integrity" });
});
test("nonempty chunks reset idle timing but cannot extend the complete attempt deadline", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => Promise.resolve(response(new ReadableStream({
    start(controller) {
      const interval = setInterval(() => controller.enqueue(bytes.subarray(0, 1)), 20);
      init.signal?.addEventListener("abort", () => {
        clearInterval(interval); controller.error(init.signal?.reason);
      }, { once: true });
    },
  }))));
  const work = expect(fetchSnapshotArtifact(artifact(), { ...limits(), totalTimeoutMs: 55 }))
    .rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(40);
  expect(vi.getTimerCount()).toBe(3);
  await vi.advanceTimersByTimeAsync(15);
  await work;
  expect(vi.getTimerCount()).toBe(0);
});
test("an overlong stream is stopped before hashing and aborts its underlying transfer", async () => {
  let aborted = false;
  const digest = vi.spyOn(crypto.subtle, "digest");
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    init.signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
    return Promise.resolve(response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([...bytes, 0])); },
    })));
  });
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "integrity" });
  expect(digest).not.toHaveBeenCalled();
  expect(aborted).toBe(true);
});
test("chunk copies survive source-buffer reuse while a stream failure preserves its cause", async () => {
  const first = new Uint8Array(bytes.subarray(0, 3));
  let count = 0;
  vi.stubGlobal("fetch", () => Promise.resolve(response(new ReadableStream({
    pull(controller) {
      if (count++ === 0) { controller.enqueue(first); return; }
      first.fill(0);
      controller.enqueue(new Uint8Array(bytes.subarray(3))); controller.close();
    },
  }, { highWaterMark: 0 }))));
  await expect(fetchSnapshotArtifact(artifact(), limits())).resolves.toEqual(bytes);
  const cause = new TypeError("Synthetic broken stream");
  vi.stubGlobal("fetch", () => Promise.resolve(response(new ReadableStream({
    start(controller) { controller.error(cause); },
  }))));
  await expect(fetchSnapshotArtifact(artifact(), limits())).rejects.toMatchObject({ code: "network", cause });
});
