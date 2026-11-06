import { SnapshotHttpError } from "./snapshot-http";

export interface SnapshotRetryPolicy {
  maxAttempts: number;
  backoffMs: readonly number[];
  jitterPercent: number;
  maxAutomaticWaitMs: number;
}
export interface SnapshotRetryContext {
  attempt: number;
  nowMs: number;
  jitterUnit: number;
  networkTransient: boolean;
  retryAfterReadable: boolean;
}
export type SnapshotRetryDecision =
  | { action: "fail"; reason: "permanent" | "attempts-exhausted" }
  | { action: "retry"; delayMs: number }
  | { action: "pause"; reason: "retry-after-unavailable" | "retry-after-invalid" | "wait-limit"; delayMs: number | null };

export function snapshotRetryDecision(error: unknown, context: SnapshotRetryContext,
  policy: SnapshotRetryPolicy): SnapshotRetryDecision {
  if (!policy || Object.keys(policy).sort().join(",") !== "backoffMs,jitterPercent,maxAttempts,maxAutomaticWaitMs" ||
      !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 ||
      !Array.isArray(policy.backoffMs) || policy.backoffMs.length !== policy.maxAttempts - 1 ||
      Array.from(policy.backoffMs).some(value => !Number.isSafeInteger(value) || value < 0) ||
      !Number.isSafeInteger(policy.maxAutomaticWaitMs) || policy.maxAutomaticWaitMs < 0 ||
      !Number.isSafeInteger(policy.jitterPercent) || policy.jitterPercent < 0 || policy.jitterPercent > 100 ||
      !context || Object.keys(context).sort().join(",") !== "attempt,jitterUnit,networkTransient,nowMs,retryAfterReadable" ||
      !Number.isSafeInteger(context.attempt) || context.attempt < 1 || context.attempt > policy.maxAttempts ||
      !Number.isSafeInteger(context.nowMs) || context.nowMs < 0 || context.nowMs > 8640000000000000 ||
      !Number.isFinite(context.jitterUnit) || context.jitterUnit < 0 || context.jitterUnit > 1 ||
      typeof context.networkTransient !== "boolean" || typeof context.retryAfterReadable !== "boolean") {
    throw new SnapshotHttpError("invalid", "Explicit retry policy, clock, attempt and failure evidence are required");
  }
  if (!(error instanceof SnapshotHttpError) ||
      (error.code !== "timeout" && !(error.code === "network" && context.networkTransient) &&
        !(error.code === "http" && [408, 429, 500, 502, 503, 504].includes(error.status ?? 0)))) {
    return { action: "fail", reason: "permanent" };
  }
  if (context.attempt === policy.maxAttempts) return { action: "fail", reason: "attempts-exhausted" };
  const backoff = policy.backoffMs[context.attempt - 1];
  if (backoff === undefined) throw new SnapshotHttpError("invalid", "Missing retry backoff");
  const jittered = Math.ceil(backoff * (1 + policy.jitterPercent / 100 * (context.jitterUnit * 2 - 1)));
  if (!Number.isSafeInteger(jittered)) throw new SnapshotHttpError("invalid", "Retry backoff arithmetic overflow");
  let delayMs = jittered;
  if (error.code === "http") {
    if (!context.retryAfterReadable) return { action: "pause", reason: "retry-after-unavailable", delayMs: null };
    const header = error.retryAfter;
    if (header !== null && header !== undefined) {
      if (typeof header !== "string") throw new SnapshotHttpError("invalid", "Invalid raw Retry-After field");
      const value = header.trim();
      let wait: number;
      if (/^[0-9]+$/.test(value)) {
        const seconds = value.replace(/^0+/, "") || "0", maximum = "9007199254740";
        if (seconds.length > maximum.length || (seconds.length === maximum.length && seconds > maximum)) {
          return { action: "pause", reason: "wait-limit", delayMs: null };
        }
        wait = Number(seconds) * 1000;
      } else {
        if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(value)) {
          return { action: "pause", reason: "retry-after-invalid", delayMs: null };
        }
        const date = Date.parse(value);
        if (!Number.isFinite(date) || new Date(date).toUTCString() !== value) {
          return { action: "pause", reason: "retry-after-invalid", delayMs: null };
        }
        wait = Math.max(0, date - context.nowMs);
      }
      delayMs = Math.max(delayMs, wait);
    }
  }
  return delayMs > policy.maxAutomaticWaitMs
    ? { action: "pause", reason: "wait-limit", delayMs }
    : { action: "retry", delayMs };
}
