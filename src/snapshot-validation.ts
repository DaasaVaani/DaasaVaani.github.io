import {
  SnapshotConsumerError, assertConsumerDescriptor, assertConsumerManifestEnvelope,
  assertConsumerManifest, assertConsumerPolicy, assertConsumerItem,
} from "../shared/tools/snapshot-consumer.mjs";
import { ContentError, assertContentPlan } from "../shared/tools/content-state.mjs";
import type { ContentPlan } from "../shared/types/content";
import type { LyricObjectReference } from "../shared/types/lyrics";
import type { ContentReader } from "./content-store";
import { encodedSha256 } from "./encoded-bytes";
import { TransferError } from "./list-transfer-types";
import { parseTransferJson, transformTransferBytes } from "./transfer-bytes";

export { ContentError, SnapshotConsumerError };
export interface SnapshotValidationLimits {
  maxDescriptorBytes: number;
  maxManifestEncodedBytes: number;
  maxManifestDecodedBytes: number;
  maxPolicyEncodedBytes: number;
  maxPolicyDecodedBytes: number;
  maxItemEncodedBytes: number;
  maxItemDecodedBytes: number;
  maxItems: number;
  maxTotalEncodedBytes: number;
  maxTotalDecodedBytes: number;
  chunkBytes: number;
  supportedCapabilities: readonly string[];
}
export interface SnapshotCandidate {
  plan(): ContentPlan;
  metadataObjects(): { sha256: string; bytes: Uint8Array }[];
  validate(plan: ContentPlan, read: ContentReader, signal?: AbortSignal): Promise<void>;
}
const numericLimits = [
  "maxDescriptorBytes", "maxManifestEncodedBytes", "maxManifestDecodedBytes",
  "maxPolicyEncodedBytes", "maxPolicyDecodedBytes", "maxItemEncodedBytes",
  "maxItemDecodedBytes", "maxItems", "maxTotalEncodedBytes", "maxTotalDecodedBytes", "chunkBytes",
] as const;
function captureLimits(input: SnapshotValidationLimits): Readonly<SnapshotValidationLimits> {
  if (!input || Object.keys(input).sort().join(",") !== [...numericLimits, "supportedCapabilities"].sort().join(",") ||
      numericLimits.some(key => !Number.isSafeInteger(input[key]) || input[key] <= 0) ||
      !Array.isArray(input.supportedCapabilities) ||
      input.supportedCapabilities.some(value => typeof value !== "string") ||
      new Set(input.supportedCapabilities).size !== input.supportedCapabilities.length) {
    throw new ContentError("invalid", "Explicit snapshot safety limits and unique caller capabilities are required");
  }
  return Object.freeze({ ...input, supportedCapabilities: Object.freeze([...input.supportedCapabilities]) });
}
function canonicalJson(value: unknown): string {
  const chunks: string[] = [], stack: ({ value: unknown } | { text: string })[] = [{ value }];
  const string = (value: string) => {
    if (/[\ud800-\udfff]/u.test(value)) throw new ContentError("integrity", "Canonical JSON contains an unpaired surrogate");
    return JSON.stringify(value);
  };
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    if ("text" in frame) { chunks.push(frame.text); continue; }
    const item = frame.value;
    if (Array.isArray(item)) {
      chunks.push("["); stack.push({ text: "]" });
      for (const [index, value] of [...item].reverse().entries()) {
        stack.push({ value });
        if (index !== item.length - 1) stack.push({ text: "," });
      }
    } else if (item !== null && typeof item === "object") {
      chunks.push("{"); stack.push({ text: "}" });
      const entries = Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      for (const [index, [key, value]] of [...entries].reverse().entries()) {
        stack.push({ value });
        stack.push({ text: (index === entries.length - 1 ? "" : ",") + string(key) + ":" });
      }
    } else {
      if (typeof item === "string") chunks.push(string(item));
      else if (item === null || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) {
        chunks.push(JSON.stringify(item));
      } else throw new ContentError("integrity", "Value is not canonical JSON data");
    }
  }
  return chunks.join("");
}
function json(bytes: Uint8Array, lineFeed: boolean): unknown {
  let value: unknown;
  try { value = parseTransferJson(bytes); }
  catch (reason) {
    if (reason instanceof TransferError) throw new ContentError("integrity", "Artifact is not unique-key fatal-UTF8 JSON");
    throw reason;
  }
  const expected = new TextEncoder().encode(canonicalJson(value) + (lineFeed ? "\n" : ""));
  if (expected.length !== bytes.length || expected.some((value, index) => value !== bytes[index])) {
    throw new ContentError("integrity", "Artifact does not use canonical JSON bytes");
  }
  return value;
}
function reference(reference: LyricObjectReference, encodedLimit: number, decodedLimit: number) {
  if (reference.sha256.length !== 64 || !/^[0-9a-f]{64}$/.test(reference.sha256) ||
      reference.path !== `objects/${reference.sha256}.json.gz` ||
      !Number.isSafeInteger(reference.encodedBytes) || reference.encodedBytes <= 0 ||
      !Number.isSafeInteger(reference.decodedBytes) || reference.decodedBytes <= 0) {
    throw new ContentError("invalid", "Invalid snapshot object reference");
  }
  if (reference.encodedBytes > encodedLimit || reference.decodedBytes > decodedLimit) {
    throw new ContentError("capacity", "Snapshot object exceeds trusted role limits");
  }
}
function aggregate(encoded: bigint, decoded: bigint, limits: Readonly<SnapshotValidationLimits>) {
  if (encoded > BigInt(limits.maxTotalEncodedBytes) || decoded > BigInt(limits.maxTotalDecodedBytes)) {
    throw new ContentError("capacity", "Complete snapshot exceeds trusted aggregate byte limits");
  }
}
async function decode(read: ContentReader, expected: LyricObjectReference, chunkBytes: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const input = await read(expected.sha256);
  signal?.throwIfAborted();
  if (!(input instanceof Uint8Array) || input.length !== expected.encodedBytes) {
    throw new ContentError("integrity", "Snapshot object encoded length differs from its reference");
  }
  const bytes = new Uint8Array(input);
  if (bytes.length !== expected.encodedBytes || await encodedSha256(bytes) !== expected.sha256) {
    throw new ContentError("integrity", "Snapshot object encoded length or SHA256 differs from its reference");
  }
  signal?.throwIfAborted();
  let decoded: Uint8Array;
  try { decoded = transformTransferBytes(bytes, true, true, expected.decodedBytes, chunkBytes, 0); }
  catch (reason) {
    if (reason instanceof TransferError) throw new ContentError("integrity", "Snapshot object is not one complete bounded gzip member");
    throw reason;
  }
  if (decoded.length !== expected.decodedBytes) throw new ContentError("integrity", "Snapshot object decoded length differs from its reference");
  const value = json(decoded, false);
  signal?.throwIfAborted();
  return { bytes, value };
}
export async function inspectSnapshot(descriptorInput: Uint8Array, read: ContentReader,
  inputLimits: SnapshotValidationLimits, signal?: AbortSignal): Promise<SnapshotCandidate> {
  const limits = captureLimits(inputLimits);
  signal?.throwIfAborted();
  if (!(descriptorInput instanceof Uint8Array) || !descriptorInput.length) {
    throw new ContentError("integrity", "Snapshot descriptor bytes are absent");
  }
  if (descriptorInput.length > limits.maxDescriptorBytes) {
    throw new ContentError("capacity", "Snapshot descriptor exceeds its trusted byte limit");
  }
  const descriptorBytes = new Uint8Array(descriptorInput);
  const descriptor = json(descriptorBytes, true);
  assertConsumerDescriptor(descriptor);
  reference(descriptor.manifest, limits.maxManifestEncodedBytes, limits.maxManifestDecodedBytes);
  let encoded = BigInt(descriptorBytes.length) + BigInt(descriptor.manifest.encodedBytes);
  let decoded = BigInt(descriptorBytes.length) + BigInt(descriptor.manifest.decodedBytes);
  aggregate(encoded, decoded, limits);
  const manifestObject = await decode(read, descriptor.manifest, limits.chunkBytes, signal);
  const manifest = manifestObject.value;
  assertConsumerManifestEnvelope(manifest, limits.supportedCapabilities);
  if (manifest.catalog.length > limits.maxItems) throw new ContentError("capacity", "Snapshot exceeds the trusted item count");
  const required = [{ sha256: descriptor.manifest.sha256, encodedBytes: descriptor.manifest.encodedBytes }];
  for (const [sha256, object] of Object.entries(manifest.objects)) {
    if (sha256 === descriptor.manifest.sha256) throw new ContentError("invalid", "Manifest cannot be one of its own objects");
    reference({ ...object, sha256 }, object.role === "policy" ? limits.maxPolicyEncodedBytes : limits.maxItemEncodedBytes,
      object.role === "policy" ? limits.maxPolicyDecodedBytes : limits.maxItemDecodedBytes);
    encoded += BigInt(object.encodedBytes); decoded += BigInt(object.decodedBytes);
    required.push({ sha256, encodedBytes: object.encodedBytes });
  }
  aggregate(encoded, decoded, limits);
  const policyReference = manifest.objects[manifest.policy];
  if (!policyReference) throw new ContentError("invalid", "Snapshot has no policy object");
  const policyObject = await decode(read, { ...policyReference, sha256: manifest.policy }, limits.chunkBytes, signal);
  assertConsumerPolicy(policyObject.value);
  assertConsumerManifest(manifest, policyObject.value, limits.supportedCapabilities);
  const plan: ContentPlan = {
    reference: { sequence: descriptor.sequence, manifestSha256: descriptor.manifest.sha256 },
    required: required.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0),
  };
  assertContentPlan(plan);
  const metadata = [
    { sha256: descriptor.manifest.sha256, bytes: manifestObject.bytes },
    { sha256: manifest.policy, bytes: policyObject.bytes },
  ];
  signal?.throwIfAborted();
  return Object.freeze({
    plan: () => structuredClone(plan),
    metadataObjects: () => metadata.map(object => ({ sha256: object.sha256, bytes: new Uint8Array(object.bytes) })),
    validate: async (target: ContentPlan, currentRead: ContentReader, currentSignal?: AbortSignal) => {
      const captured = structuredClone(target);
      assertContentPlan(captured);
      if (canonicalJson(captured) !== canonicalJson(plan)) throw new ContentError("invalid", "Validation candidate differs from the target plan");
      const fresh = await inspectSnapshot(descriptorBytes, currentRead, limits, currentSignal);
      if (canonicalJson(fresh.plan()) !== canonicalJson(plan)) throw new ContentError("integrity", "Stored snapshot metadata differs from its candidate");
      const identities = new Set(manifest.catalog.map(entry => entry.lyricId));
      for (const entry of manifest.catalog) {
        const object = manifest.objects[entry.item];
        if (!object) throw new ContentError("invalid", "Catalog item object is absent");
        const item = await decode(currentRead, { ...object, sha256: entry.item }, limits.chunkBytes, currentSignal);
        assertConsumerItem(item.value, entry);
        for (const line of item.value.lines) {
          if (line.kind !== "line") continue;
          if (identities.has(line.lineId)) throw new ContentError("invalid", "Lyric line identities conflict across the snapshot");
          identities.add(line.lineId);
        }
      }
      currentSignal?.throwIfAborted();
    },
  });
}
