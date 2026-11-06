import { expect, test, vi } from "vitest";
import { SnapshotHttpError } from "./snapshot-http";
import { snapshotRetryDecision, type SnapshotRetryContext, type SnapshotRetryPolicy } from "./snapshot-retry";

const policy = (): SnapshotRetryPolicy => ({ maxAttempts: 3, backoffMs: [1000, 2000], jitterPercent: 20, maxAutomaticWaitMs: 120000 });
const context = (): SnapshotRetryContext => ({ attempt: 1, nowMs: Date.UTC(2026, 10, 6), jitterUnit: 0.5,
  networkTransient: false, retryAfterReadable: true });
const http = (status: number, retryAfter: string | null = null) => new SnapshotHttpError("http", "Synthetic HTTP error", status, retryAfter);
test.each([408, 429, 500, 502, 503, 504])("approved HTTP%s is eligible without silently retrying any other status", status => {
  expect(snapshotRetryDecision(http(status), context(), policy())).toEqual({ action: "retry", delayMs: 1000 });
});
test.each([206, 301, 400, 401, 403, 404, 409, 410, 501])("permanent HTTP%s never retries", status => {
  expect(snapshotRetryDecision(http(status, "121"), context(), policy())).toEqual({ action: "fail", reason: "permanent" });
});
test.each(["invalid", "capacity", "integrity"] as const)("%s errors fail regardless of network evidence", code => {
  expect(snapshotRetryDecision(new SnapshotHttpError(code, "Synthetic refusal"),
    { ...context(), networkTransient: true }, policy())).toEqual({ action: "fail", reason: "permanent" });
});
test("unclassified native and fetch failures are not blindly retryable", () => {
  for (const error of [new TypeError("Synthetic native failure"), new DOMException("Cancelled", "AbortError"),
    new SnapshotHttpError("network", "Ambiguous redirect/CORS/network refusal")]) {
    expect(snapshotRetryDecision(error, context(), policy())).toEqual({ action: "fail", reason: "permanent" });
  }
  expect(snapshotRetryDecision(new SnapshotHttpError("network", "Explicit transient evidence"),
    { ...context(), networkTransient: true }, policy())).toEqual({ action: "retry", delayMs: 1000 });
});
test("only two retries follow three complete attempts, with exact backoff and inclusive jitter endpoints", () => {
  const error = new SnapshotHttpError("timeout", "Synthetic timeout");
  for (const [attempt, jitterUnit, delayMs] of [[1, 0, 800], [1, 0.5, 1000], [1, 1, 1200],
    [2, 0, 1600], [2, 0.5, 2000], [2, 1, 2400]] as const) {
    expect(snapshotRetryDecision(error, { ...context(), attempt, jitterUnit }, policy()))
      .toEqual({ action: "retry", delayMs });
  }
  expect(snapshotRetryDecision(error, { ...context(), attempt: 3 }, policy()))
    .toEqual({ action: "fail", reason: "attempts-exhausted" });
});
test("Retry-After never shortens backoff and exactly120s is allowed while one second above pauses", () => {
  for (const [header, delayMs] of [["0", 1000], ["1", 1000], ["2", 2000], ["120", 120000]] as const) {
    expect(snapshotRetryDecision(http(429, header), context(), policy())).toEqual({ action: "retry", delayMs });
  }
  expect(snapshotRetryDecision(http(503, "121"), context(), policy()))
    .toEqual({ action: "pause", reason: "wait-limit", delayMs: 121000 });
  expect(snapshotRetryDecision(http(503, "9007199254740991000"), context(), policy()))
    .toEqual({ action: "pause", reason: "wait-limit", delayMs: null });
});
test("absolute HTTP date honors captured time including past dates and exact threshold/+1ms", () => {
  const now = context().nowMs, header = new Date(now + 120000).toUTCString();
  expect(snapshotRetryDecision(http(503, header), context(), policy())).toEqual({ action: "retry", delayMs: 120000 });
  expect(snapshotRetryDecision(http(503, header), { ...context(), nowMs: now - 1 }, policy()))
    .toEqual({ action: "pause", reason: "wait-limit", delayMs: 120001 });
  expect(snapshotRetryDecision(http(503, new Date(now - 1000).toUTCString()), context(), policy()))
    .toEqual({ action: "retry", delayMs: 1000 });
});
test.each(["", "-1", "1.5", "1e3", "tomorrow", "Fri, 31 Feb 2026 00:00:00 GMT",
  "Thu, 06 Nov 2026 00:00:00 GMT", "Friday, 06-Nov-26 00:00:00 GMT"])("unusable Retry-After %s pauses rather than guessing or shortening", header => {
  expect(snapshotRetryDecision(http(503, header), context(), policy()))
    .toEqual({ action: "pause", reason: "retry-after-invalid", delayMs: null });
});
test("hidden Retry-After cannot be treated as an absent server wait even if a mock supplied a value", () => {
  for (const header of [null, "2"]) {
    expect(snapshotRetryDecision(http(500, header), { ...context(), retryAfterReadable: false }, policy()))
      .toEqual({ action: "pause", reason: "retry-after-unavailable", delayMs: null });
  }
});
test.each(["attempt", "clock", "jitter", "classification", "visibility", "extra", "backoff", "count", "limit", "overflow"] as const)(
  "invalid %s inputs explicitly fail", fault => {
    const input = context(), bounds = policy();
    if (fault === "attempt") input.attempt = 0;
    if (fault === "clock") input.nowMs = NaN;
    if (fault === "jitter") input.jitterUnit = 1.1;
    if (fault === "classification") Object.assign(input, { networkTransient: "yes" });
    if (fault === "visibility") Object.assign(input, { retryAfterReadable: undefined });
    if (fault === "extra") Object.assign(bounds, { extra: true });
    if (fault === "backoff") bounds.backoffMs = [1000];
    if (fault === "count") bounds.maxAttempts = 0;
    if (fault === "limit") bounds.maxAutomaticWaitMs = -1;
    if (fault === "overflow") bounds.backoffMs = [Number.MAX_SAFE_INTEGER, 2000];
    expect(() => snapshotRetryDecision(http(503), { ...input, ...(fault === "overflow" ? { jitterUnit: 1 } : {}) }, bounds))
      .toThrowError(SnapshotHttpError);
  });
test("decision-making schedules no network/timer, reads no clock/random and preserves inputs", () => {
  const input = context(), bounds = policy(), before = structuredClone({ input, bounds });
  const fetcher = vi.spyOn(globalThis, "fetch"), clock = vi.spyOn(Date, "now"), random = vi.spyOn(Math, "random");
  const timer = vi.spyOn(globalThis, "setTimeout");
  try {
    expect(snapshotRetryDecision(http(503, "2"), input, bounds)).toEqual({ action: "retry", delayMs: 2000 });
    expect({ input, bounds }).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled(); expect(clock).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
  } finally { fetcher.mockRestore(); clock.mockRestore(); random.mockRestore(); timer.mockRestore(); }
});
test("caller wait ceiling is inclusive after jitter and sparse backoff policies are refused", () => {
  expect(snapshotRetryDecision(http(503), { ...context(), jitterUnit: 1 }, { ...policy(), maxAutomaticWaitMs: 1200 }))
    .toEqual({ action: "retry", delayMs: 1200 });
  expect(snapshotRetryDecision(http(503), { ...context(), jitterUnit: 1 }, { ...policy(), maxAutomaticWaitMs: 1199 }))
    .toEqual({ action: "pause", reason: "wait-limit", delayMs: 1200 });
  const backoffMs = [1000, 2000];
  delete backoffMs[1];
  expect(() => snapshotRetryDecision(http(503), context(), { ...policy(), backoffMs })).toThrowError(SnapshotHttpError);
});
test("fractional jitter waits round upwards and exhausted attempts do not start even a hidden-header wait", () => {
  expect(snapshotRetryDecision(http(503), { ...context(), jitterUnit: 0.501 }, policy()))
    .toEqual({ action: "retry", delayMs: 1001 });
  expect(snapshotRetryDecision(http(503), { ...context(), attempt: 3, retryAfterReadable: false }, policy()))
    .toEqual({ action: "fail", reason: "attempts-exhausted" });
});
