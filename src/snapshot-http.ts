import { encodedSha256 } from "./encoded-bytes";

export interface SnapshotHttpArtifact {
  url: string;
  sha256: string;
  encodedBytes: number;
}
export interface SnapshotHttpLimits {
  maxEncodedBytes: number;
  noProgressTimeoutMs: number;
  totalTimeoutMs: number;
}
export class SnapshotHttpError extends Error {
  constructor(readonly code: "invalid" | "capacity" | "http" | "network" | "timeout" | "integrity",
    message: string, readonly status?: number, readonly retryAfter?: string | null, options?: ErrorOptions) {
    super(message, options);
    this.name = "SnapshotHttpError";
  }
}
export function captureSnapshotHttpLimits(limits: SnapshotHttpLimits): SnapshotHttpLimits {
  if (!limits || Object.keys(limits).sort().join(",") !== "maxEncodedBytes,noProgressTimeoutMs,totalTimeoutMs" ||
      Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0) ||
      limits.noProgressTimeoutMs > 2147483647 || limits.totalTimeoutMs > 2147483647) {
    throw new SnapshotHttpError("invalid", "Explicit HTTP safety limits are required");
  }
  return { ...limits };
}
export function captureSnapshotHttpRequest(artifact: SnapshotHttpArtifact, bounds: SnapshotHttpLimits) {
  const limits = captureSnapshotHttpLimits(bounds);
  if (!artifact || Object.keys(artifact).sort().join(",") !== "encodedBytes,sha256,url" ||
      typeof artifact.url !== "string" || typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.encodedBytes) || artifact.encodedBytes <= 0) {
    throw new SnapshotHttpError("invalid", "Explicit artifact identity and HTTP safety limits are required");
  }
  let url: URL;
  try { url = new URL(artifact.url); }
  catch (cause) {
    throw new SnapshotHttpError("invalid", "Invalid artifact URL", undefined, undefined, { cause });
  }
  if (url.protocol !== "https:" || url.username || url.password || url.href.includes("#")) {
    throw new SnapshotHttpError("invalid", "A direct HTTPS artifact address without credentials or fragment is required");
  }
  if (artifact.encodedBytes > limits.maxEncodedBytes) {
    throw new SnapshotHttpError("capacity", "Artifact exceeds the caller's encoded byte ceiling");
  }
  return { artifact: { ...artifact, url: url.href }, limits: { ...limits } };
}

export async function fetchSnapshotArtifact(input: SnapshotHttpArtifact, bounds: SnapshotHttpLimits,
  signal?: AbortSignal): Promise<Uint8Array> {
  const { artifact, limits } = captureSnapshotHttpRequest(input, bounds);
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = () => controller.abort(new SnapshotHttpError("timeout", "Snapshot artifact transfer timed out"));
  let progressTimer = setTimeout(timeout, limits.noProgressTimeoutMs);
  const totalTimer = setTimeout(timeout, limits.totalTimeoutMs);
  const progress = () => {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(timeout, limits.noProgressTimeoutMs);
  };
  const network = (cause: unknown): never => {
    controller.signal.throwIfAborted();
    throw new SnapshotHttpError("network", "Snapshot artifact request or stream failed", undefined, undefined, { cause });
  };
  try {
    const response = await fetch(artifact.url, { signal: controller.signal, credentials: "omit",
      redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" }).catch(network);
    controller.signal.throwIfAborted();
    if (response.redirected || response.url !== artifact.url) {
      throw new SnapshotHttpError("integrity", "Artifact response address differs from the direct request");
    }
    if (response.status !== 200) {
      throw new SnapshotHttpError("http", "Snapshot artifact requires a complete HTTP200 response",
        response.status, response.headers.get("Retry-After"));
    }
    if (!response.body) throw new SnapshotHttpError("integrity", "Snapshot artifact response has no body");
    const bytes = new Uint8Array(artifact.encodedBytes), reader = response.body.getReader();
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read().catch(network);
        controller.signal.throwIfAborted();
        if (part.done) break;
        if (part.value.byteLength > artifact.encodedBytes - length) {
          throw new SnapshotHttpError("integrity", "Snapshot artifact exceeds its admitted encoded length");
        }
        if (part.value.byteLength) {
          bytes.set(part.value, length);
          length += part.value.byteLength;
          progress();
        }
      }
    } finally { reader.releaseLock(); }
    if (length !== artifact.encodedBytes) throw new SnapshotHttpError("integrity", "Snapshot artifact encoded length differs");
    const actual = await encodedSha256(bytes);
    controller.signal.throwIfAborted();
    if (actual !== artifact.sha256) {
      throw new SnapshotHttpError("integrity", "Snapshot artifact encoded SHA256 differs");
    }
    return bytes;
  } finally {
    clearTimeout(progressTimer);
    clearTimeout(totalTimer);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
