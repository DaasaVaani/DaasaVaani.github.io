import {
  captureSnapshotHttpLimits, captureSnapshotHttpRequest, fetchSnapshotArtifact, SnapshotHttpError,
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
export class SnapshotAttemptBudget {
  readonly maxEncodedBytes: number;
  #reservedEncodedBytes = 0;
  constructor(maxEncodedBytes: number) {
    if (!Number.isSafeInteger(maxEncodedBytes) || maxEncodedBytes <= 0) {
      throw new SnapshotHttpError("invalid", "An explicit positive safe shared attempt budget is required");
    }
    this.maxEncodedBytes = maxEncodedBytes;
    Object.freeze(this);
  }
  snapshot() {
    return Object.freeze({ maxEncodedBytes: this.maxEncodedBytes, reservedEncodedBytes: this.#reservedEncodedBytes,
      remainingEncodedBytes: this.maxEncodedBytes - this.#reservedEncodedBytes });
  }
  reserve(encodedBytes: number): void {
    if (!Number.isSafeInteger(encodedBytes) || encodedBytes <= 0) {
      throw new SnapshotHttpError("invalid", "A complete positive safe artifact reservation is required");
    }
    if (encodedBytes > this.maxEncodedBytes - this.#reservedEncodedBytes) {
      throw new SnapshotHttpError("capacity", "Shared artifact attempt reservation budget is exhausted");
    }
    this.#reservedEncodedBytes += encodedBytes;
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

export function captureSnapshotAttemptOptions(options: SnapshotAttemptOptions): SnapshotAttemptOptions {
  if (!options || Object.keys(options).sort().join(",") !==
      "httpLimits,isTransientNetworkError,maxAttemptEncodedBytes,retryAfterReadable,retryPolicy" ||
      !Number.isSafeInteger(options.maxAttemptEncodedBytes) || options.maxAttemptEncodedBytes <= 0 ||
      typeof options.retryAfterReadable !== "boolean" || typeof options.isTransientNetworkError !== "function") {
    throw new SnapshotHttpError("invalid", "Explicit attempt budget and retry evidence are required");
  }
  const httpLimits = captureSnapshotHttpLimits(options.httpLimits);
  snapshotRetryDecision(undefined, { attempt: 1, nowMs: 0, jitterUnit: 0.5,
    networkTransient: false, retryAfterReadable: options.retryAfterReadable }, options.retryPolicy);
  return { ...options, httpLimits, retryPolicy: { ...options.retryPolicy, backoffMs: [...options.retryPolicy.backoffMs] } };
}
export async function fetchSnapshotWithRetries(input: SnapshotHttpArtifact, inputOptions: SnapshotAttemptOptions,
  signal?: AbortSignal, sharedBudget?: SnapshotAttemptBudget): Promise<SnapshotAttemptResult> {
  const options = captureSnapshotAttemptOptions(inputOptions);
  if (sharedBudget !== undefined && !(sharedBudget instanceof SnapshotAttemptBudget)) {
    throw new SnapshotHttpError("invalid", "Shared reservations require an actual attempt budget");
  }
  const request = captureSnapshotHttpRequest(input, options.httpLimits);
  const policy = options.retryPolicy;
  const { maxAttemptEncodedBytes, retryAfterReadable, isTransientNetworkError } = options;
  let attempts = 0, reservedEncodedBytes = 0;
  let previousFailure: unknown;
  for (;;) {
    signal?.throwIfAborted();
    if (request.artifact.encodedBytes > maxAttemptEncodedBytes - reservedEncodedBytes) {
      throw new SnapshotAttemptError("capacity", attempts, reservedEncodedBytes, null,
        previousFailure ?? new SnapshotHttpError("capacity", "No complete artifact attempt fits the remaining reservation budget"));
    }
    if (sharedBudget) {
      try { sharedBudget.reserve(request.artifact.encodedBytes); }
      catch (cause) {
        if (!(cause instanceof SnapshotHttpError) || cause.code !== "capacity") throw cause;
        throw new SnapshotAttemptError("capacity", attempts, reservedEncodedBytes, null, previousFailure ?? cause);
      }
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
    if (request.artifact.encodedBytes > maxAttemptEncodedBytes - reservedEncodedBytes ||
        (sharedBudget && request.artifact.encodedBytes > sharedBudget.snapshot().remainingEncodedBytes)) {
      throw new SnapshotAttemptError("capacity", attempts, reservedEncodedBytes, decision, failure);
    }
    await wait(decision.delayMs, signal);
  }
}
