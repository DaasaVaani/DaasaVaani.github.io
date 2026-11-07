import {
  captureSnapshotHttpRequest, fetchSnapshotArtifact, SnapshotHttpError,
  type SnapshotHttpArtifact, type SnapshotHttpLimits,
} from "./snapshot-http";
import { snapshotRetryDecision, type SnapshotRetryPolicy, type SnapshotRetryDecision } from "./snapshot-retry";

export interface SnapshotAttemptOptions {
  httpLimits: SnapshotHttpLimits;
  retryPolicy: SnapshotRetryPolicy;
  maxAttemptEncodedBytes: number;
  retryAfterReadable: boolean;
  isTransientNetworkError: (error: SnapshotHttpError) => boolean;
}
export interface SnapshotAttemptResult {
  bytes: Uint8Array;
  attempts: number;
  reservedEncodedBytes: number;
}
export class SnapshotAttemptError extends Error {
  constructor(readonly code: "failed" | "paused" | "capacity", readonly attempts: number,
    readonly reservedEncodedBytes: number, readonly decision: SnapshotRetryDecision | null, cause: unknown) {
    super(`Snapshot artifact attempts ${code}`, { cause });
    this.name = "SnapshotAttemptError";
  }
}
function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + delayMs;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(signal?.reason); };
    const tick = () => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { cleanup(); resolve(); }
      else timer = setTimeout(tick, Math.min(Math.ceil(remaining), 2147483647));
    };
    signal?.addEventListener("abort", abort, { once: true });
    tick();
  });
}

export async function fetchSnapshotWithRetries(input: SnapshotHttpArtifact, options: SnapshotAttemptOptions,
  signal?: AbortSignal): Promise<SnapshotAttemptResult> {
  if (!options || Object.keys(options).sort().join(",") !==
      "httpLimits,isTransientNetworkError,maxAttemptEncodedBytes,retryAfterReadable,retryPolicy" ||
      !Number.isSafeInteger(options.maxAttemptEncodedBytes) || options.maxAttemptEncodedBytes <= 0 ||
      typeof options.retryAfterReadable !== "boolean" || typeof options.isTransientNetworkError !== "function") {
    throw new SnapshotHttpError("invalid", "Explicit attempt budget and retry evidence are required");
  }
  const request = captureSnapshotHttpRequest(input, options.httpLimits);
  snapshotRetryDecision(undefined, { attempt: 1, nowMs: 0, jitterUnit: 0.5,
    networkTransient: false, retryAfterReadable: options.retryAfterReadable }, options.retryPolicy);
  const policy = { ...options.retryPolicy, backoffMs: [...options.retryPolicy.backoffMs] };
  const { maxAttemptEncodedBytes, retryAfterReadable, isTransientNetworkError } = options;
  let attempts = 0, reservedEncodedBytes = 0;
  let previousFailure: unknown;
  for (;;) {
    signal?.throwIfAborted();
    if (request.artifact.encodedBytes > maxAttemptEncodedBytes - reservedEncodedBytes) {
      throw new SnapshotAttemptError("capacity", attempts, reservedEncodedBytes, null,
        previousFailure ?? new SnapshotHttpError("capacity", "No complete artifact attempt fits the remaining reservation budget"));
    }
    reservedEncodedBytes += request.artifact.encodedBytes;
    attempts++;
    let failure: unknown;
    try {
      const bytes = await fetchSnapshotArtifact(request.artifact, request.limits, signal);
      signal?.throwIfAborted();
      return { bytes, attempts, reservedEncodedBytes };
    } catch (cause) {
      signal?.throwIfAborted();
      failure = cause;
    }
    const networkTransient = failure instanceof SnapshotHttpError && failure.code === "network"
      ? isTransientNetworkError(failure) : false;
    signal?.throwIfAborted();
    const decision = snapshotRetryDecision(failure, { attempt: attempts, nowMs: Date.now(),
      jitterUnit: Math.random(), networkTransient, retryAfterReadable }, policy);
    if (decision.action !== "retry") {
      throw new SnapshotAttemptError(decision.action === "pause" ? "paused" : "failed",
        attempts, reservedEncodedBytes, decision, failure);
    }
    previousFailure = failure;
    if (request.artifact.encodedBytes > maxAttemptEncodedBytes - reservedEncodedBytes) {
      throw new SnapshotAttemptError("capacity", attempts, reservedEncodedBytes, decision, failure);
    }
    await wait(decision.delayMs, signal);
  }
}
