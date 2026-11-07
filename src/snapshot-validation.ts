import {
  SnapshotConsumerError, assertConsumerDescriptor, assertConsumerManifestEnvelope,
  assertConsumerManifest, assertConsumerPolicy, assertConsumerItem,
} from "../shared/tools/snapshot-consumer.mjs";
import { ContentError, assertContentPlan } from "../shared/tools/content-state.mjs";
import { createDownloadPlanner } from "../shared/tools/download-planner-reference.mjs";
import type { DownloadPlan, TransferPlanningPolicy } from "../shared/tools/download-planner-reference.mjs";
import type { DownloadRequest } from "../shared/types/download-plan";
import { admitSnapshotZipStore } from "../shared/tools/snapshot-zip-consumer.mjs";
import type { AdmittedSnapshotZipStoreMember } from "../shared/tools/snapshot-zip-consumer.mjs";
import type { ContentPlan, ContentObjectReceipt } from "../shared/types/content";
import type { LyricObjectReference } from "../shared/types/lyrics";
import type { SnapshotManifest } from "../shared/types/snapshot";
import type { ContentReader } from "./content-store";
import { encodedSha256 } from "./encoded-bytes";
import { TransferError } from "./list-transfer-types";
import { parseTransferJson, transformTransferBytes } from "./transfer-bytes";

export { ContentError, SnapshotConsumerError };
export { SnapshotZipConsumerError } from "../shared/tools/snapshot-zip-consumer.mjs";
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
  transferPlan(verified: readonly string[], limits: SnapshotTransferLimits): SnapshotTransferPlan;
  admitBundle(sha256: string, bytes: Uint8Array, limits: SnapshotBundleLimits,
    signal?: AbortSignal): Promise<AdmittedSnapshotZipStoreMember[]>;
  validate(plan: ContentPlan, read: ContentReader, signal?: AbortSignal): Promise<void>;
}
export interface SnapshotBundleLimits {
  maxBundleMembers: number;
  maxBundleEncodedBytes: number;
}
export interface SnapshotTransferLimits extends SnapshotBundleLimits {
  maxExtraBytes: number;
  maxExtraPercent: number;
  maxTransferEncodedBytes: number;
}
type TransferLimitField = Exclude<keyof SnapshotTransferLimits, "maxTransferEncodedBytes">;
export interface SnapshotTransferArtifact extends DownloadRequest {
  path: string;
}
export interface SnapshotTransferPlan {
  plan: DownloadPlan;
  artifacts: SnapshotTransferArtifact[];
  effectivePolicy: TransferPlanningPolicy;
  adjustments: { field: TransferLimitField; published: number; effective: number }[];
  excludedBundles: { sha256: string; limits: ("maxBundleMembers" | "maxBundleEncodedBytes")[] }[];
}
const transferLimitFields = ["maxBundleMembers", "maxBundleEncodedBytes", "maxExtraBytes", "maxExtraPercent"] as const;
function transferPlan(manifest: SnapshotManifest, manifestReference: LyricObjectReference, policy: TransferPlanningPolicy,
  originals: ContentObjectReceipt[], verified: readonly string[], input: SnapshotTransferLimits): SnapshotTransferPlan {
  const keys = [...transferLimitFields, "maxTransferEncodedBytes"] as const;
  if (!Array.isArray(verified) || !input || Object.keys(input).sort().join(",") !== [...keys].sort().join(",") ||
      keys.some(key => !Number.isSafeInteger(input[key]) ||
        (key === "maxExtraBytes" || key === "maxExtraPercent" ? input[key] < 0 : input[key] <= 0)) ||
      input.maxExtraPercent > 100) {
    throw new ContentError("invalid", "Explicit snapshot transfer safety limits are required");
  }
  const limits = { ...input };
  const effectivePolicy: TransferPlanningPolicy = {
    maxBundleMembers: Math.min(policy.maxBundleMembers, limits.maxBundleMembers),
    maxBundleEncodedBytes: Math.min(policy.maxBundleEncodedBytes, limits.maxBundleEncodedBytes),
    requestCostBytes: policy.requestCostBytes,
    maxExtraBytes: Math.min(policy.maxExtraBytes, limits.maxExtraBytes),
    maxExtraPercent: Math.min(policy.maxExtraPercent, limits.maxExtraPercent),
  };
  const base = { formatVersion: 1 as const, objects: originals.map(object => ({ ...object })),
    required: originals.map(object => object.sha256), verified: [...verified] };
  const baseline = createDownloadPlanner(effectivePolicy)({ ...base, bundles: [] });
  if (baseline.transferEncodedBytes > limits.maxTransferEncodedBytes) {
    throw new ContentError("capacity", "Missing original objects exceed the trusted transfer byte limit");
  }
  effectivePolicy.maxExtraBytes = Math.min(effectivePolicy.maxExtraBytes,
    limits.maxTransferEncodedBytes - baseline.transferEncodedBytes);
  const excludedBundles: SnapshotTransferPlan["excludedBundles"] = [];
  const bundles = [];
  for (const [sha256, bundle] of Object.entries(manifest.bundles).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const exceeded: SnapshotTransferPlan["excludedBundles"][number]["limits"] = [];
    if (bundle.members.length > effectivePolicy.maxBundleMembers) exceeded.push("maxBundleMembers");
    if (bundle.encodedBytes > effectivePolicy.maxBundleEncodedBytes) exceeded.push("maxBundleEncodedBytes");
    if (exceeded.length) excludedBundles.push({ sha256, limits: exceeded });
    else bundles.push({ sha256, encodedBytes: bundle.encodedBytes, members: [...bundle.members] });
  }
  const plan = createDownloadPlanner(effectivePolicy)({ ...base, bundles });
  if (plan.transferEncodedBytes > limits.maxTransferEncodedBytes) {
    throw new ContentError("capacity", "Selected artifacts exceed the trusted transfer byte limit");
  }
  const artifacts = plan.requests.map(request => {
    const reference = request.kind === "bundle" ? manifest.bundles[request.sha256] :
      request.sha256 === manifestReference.sha256 ? manifestReference : manifest.objects[request.sha256];
    if (!reference || reference.encodedBytes !== request.encodedBytes) {
      throw new ContentError("invalid", "Selected artifact differs from admitted publication metadata");
    }
    return { ...request, covers: [...request.covers], path: reference.path };
  });
  return { plan, artifacts, effectivePolicy, excludedBundles,
    adjustments: transferLimitFields.filter(field => effectivePolicy[field] !== policy[field])
      .map(field => ({ field, published: policy[field], effective: effectivePolicy[field] })) };
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
async function readEncoded(read: ContentReader, expected: ContentObjectReceipt, signal?: AbortSignal) {
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
  return bytes;
}
async function decodeBounded(read: ContentReader, expected: ContentObjectReceipt,
  decodedLimit: number, chunkBytes: number, limitCode: "integrity" | "capacity", signal?: AbortSignal) {
  const bytes = await readEncoded(read, expected, signal);
  let decoded: Uint8Array;
  try { decoded = transformTransferBytes(bytes, true, true, decodedLimit, chunkBytes, 0); }
  catch (reason) {
    if (reason instanceof TransferError && reason.code === "decodedLimit") {
      throw new ContentError(limitCode, "Snapshot object exceeds its decoded byte boundary");
    }
    if (reason instanceof TransferError) throw new ContentError("integrity", "Snapshot object is not one complete bounded gzip member");
    throw reason;
  }
  const value = json(decoded, false);
  signal?.throwIfAborted();
  return { bytes, value, decodedBytes: decoded.length };
}
async function decode(read: ContentReader, expected: LyricObjectReference, chunkBytes: number, signal?: AbortSignal) {
  const object = await decodeBounded(read, expected, expected.decodedBytes, chunkBytes, "integrity", signal);
  if (object.decodedBytes !== expected.decodedBytes) throw new ContentError("integrity", "Snapshot object decoded length differs from its reference");
  return object;
}
function originals(manifest: SnapshotManifest, receipt: ContentObjectReceipt, limits: Readonly<SnapshotValidationLimits>) {
  if (manifest.catalog.length > limits.maxItems) throw new ContentError("capacity", "Snapshot exceeds the trusted item count");
  const required = [{ ...receipt }];
  let encoded = BigInt(receipt.encodedBytes), decoded = 0n;
  for (const [sha256, object] of Object.entries(manifest.objects)) {
    if (sha256 === receipt.sha256) throw new ContentError("invalid", "Manifest cannot be one of its own objects");
    reference({ ...object, sha256 }, object.role === "policy" ? limits.maxPolicyEncodedBytes : limits.maxItemEncodedBytes,
      object.role === "policy" ? limits.maxPolicyDecodedBytes : limits.maxItemDecodedBytes);
    encoded += BigInt(object.encodedBytes); decoded += BigInt(object.decodedBytes);
    required.push({ sha256, encodedBytes: object.encodedBytes });
  }
  return { required, encoded, decoded };
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
  const original = originals(manifest, { sha256: descriptor.manifest.sha256, encodedBytes: descriptor.manifest.encodedBytes }, limits);
  const required = [...original.required];
  encoded = BigInt(descriptorBytes.length) + original.encoded;
  decoded = BigInt(descriptorBytes.length) + BigInt(descriptor.manifest.decodedBytes) + original.decoded;
  aggregate(encoded, decoded, limits);
  const policyReference = manifest.objects[manifest.policy];
  if (!policyReference) throw new ContentError("invalid", "Snapshot has no policy object");
  const policyObject = await decode(read, { ...policyReference, sha256: manifest.policy }, limits.chunkBytes, signal);
  const policy = policyObject.value;
  assertConsumerPolicy(policy);
  assertConsumerManifest(manifest, policy, limits.supportedCapabilities);
  const descriptorReceipt = { sha256: await encodedSha256(descriptorBytes), encodedBytes: descriptorBytes.length };
  if (required.some(object => object.sha256 === descriptorReceipt.sha256)) {
    throw new ContentError("invalid", "Descriptor evidence cannot alias an original snapshot object");
  }
  required.push(descriptorReceipt);
  const plan: ContentPlan = {
    reference: { sequence: descriptor.sequence, manifestSha256: descriptor.manifest.sha256 },
    required: required.sort((a, b) => a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0),
  };
  assertContentPlan(plan);
  const metadata = [
    { sha256: descriptorReceipt.sha256, bytes: descriptorBytes },
    { sha256: descriptor.manifest.sha256, bytes: manifestObject.bytes },
    { sha256: manifest.policy, bytes: policyObject.bytes },
  ];
  signal?.throwIfAborted();
  return Object.freeze({
    plan: () => structuredClone(plan),
    metadataObjects: () => metadata.map(object => ({ sha256: object.sha256, bytes: new Uint8Array(object.bytes) })),
    transferPlan: (verified: readonly string[], transferLimits: SnapshotTransferLimits) =>
      transferPlan(manifest, descriptor.manifest, policy.transferPlanning, original.required, verified, transferLimits),
    admitBundle: async (sha256: string, bytes: Uint8Array, bounds: SnapshotBundleLimits, currentSignal?: AbortSignal) => {
      currentSignal?.throwIfAborted();
      if (!bounds || Object.keys(bounds).sort().join(",") !== "maxBundleEncodedBytes,maxBundleMembers" ||
          !Number.isSafeInteger(bounds.maxBundleMembers) || bounds.maxBundleMembers <= 0 ||
          !Number.isSafeInteger(bounds.maxBundleEncodedBytes) || bounds.maxBundleEncodedBytes <= 0) {
        throw new ContentError("invalid", "Explicit bundle count and encoded byte limits are required");
      }
      const bundle = typeof sha256 === "string" && /^[0-9a-f]{64}$/.test(sha256) && Object.hasOwn(manifest.bundles, sha256)
        ? manifest.bundles[sha256] : undefined;
      if (!bundle) throw new ContentError("invalid", "Bundle is absent from the admitted snapshot");
      if (bundle.members.length > Math.min(bounds.maxBundleMembers, policy.transferPlanning.maxBundleMembers) ||
          bundle.encodedBytes > Math.min(bounds.maxBundleEncodedBytes, policy.transferPlanning.maxBundleEncodedBytes)) {
        throw new ContentError("capacity", "Bundle exceeds trusted or published transfer bounds");
      }
      const members = bundle.members.map(hash => {
        const object = manifest.objects[hash];
        if (!object) throw new ContentError("invalid", "Bundle member is absent from the admitted originals");
        return { sha256: hash, path: object.path, encodedBytes: object.encodedBytes };
      });
      const admitted = await admitSnapshotZipStore(bytes, { sha256, path: bundle.path,
        encodedBytes: bundle.encodedBytes, members }, {
        maxArchiveBytes: bundle.encodedBytes, maxMembers: members.length,
        maxMemberBytes: members.reduce((maximum, member) => Math.max(maximum, member.encodedBytes), 0),
        maxAggregateMemberBytes: limits.maxTotalEncodedBytes,
      });
      currentSignal?.throwIfAborted();
      return admitted;
    },
    validate: async (target: ContentPlan, currentRead: ContentReader, currentSignal?: AbortSignal) => {
      const captured = structuredClone(target);
      assertContentPlan(captured);
      if (canonicalJson(captured) !== canonicalJson(plan)) throw new ContentError("invalid", "Validation candidate differs from the target plan");
      const retainedDescriptor = await readEncoded(currentRead, descriptorReceipt, currentSignal);
      const fresh = await inspectSnapshot(retainedDescriptor, currentRead, limits, currentSignal);
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
export async function resumeSnapshot(target: ContentPlan, read: ContentReader,
  inputLimits: SnapshotValidationLimits, signal?: AbortSignal): Promise<SnapshotCandidate> {
  const limits = captureLimits(inputLimits);
  signal?.throwIfAborted();
  assertContentPlan(target);
  if (BigInt(target.required.length) > BigInt(limits.maxItems) + 3n) {
    throw new ContentError("capacity", "Retained target exceeds the trusted item and evidence count");
  }
  const captured = structuredClone(target);
  assertContentPlan(captured);
  aggregate(captured.required.reduce((sum, object) => sum + BigInt(object.encodedBytes), 0n), 0n, limits);
  const manifestReceipt = captured.required.find(object => object.sha256 === captured.reference.manifestSha256);
  if (!manifestReceipt) throw new ContentError("invalid", "Retained target has no manifest receipt");
  if (manifestReceipt.encodedBytes > limits.maxManifestEncodedBytes) {
    throw new ContentError("capacity", "Retained manifest exceeds its trusted encoded limit");
  }
  const preliminary = await decodeBounded(read, manifestReceipt, limits.maxManifestDecodedBytes, limits.chunkBytes, "capacity", signal);
  const manifest = preliminary.value;
  assertConsumerManifestEnvelope(manifest, limits.supportedCapabilities);
  const original = originals(manifest, manifestReceipt, limits);
  const expected = new Map(original.required.map(object => [object.sha256, object.encodedBytes]));
  const retained = new Map(captured.required.map(object => [object.sha256, object.encodedBytes]));
  const evidence = captured.required.filter(object => !expected.has(object.sha256));
  const originalsMatch = original.required.every(object => retained.get(object.sha256) === object.encodedBytes);
  if (!evidence.length && captured.required.length === original.required.length && originalsMatch) {
    throw new ContentError("unsupported", "Retained target has no original descriptor evidence; explicit original-descriptor admission or restart is required");
  }
  const descriptorReceipt = evidence[0];
  if (evidence.length !== 1 || !descriptorReceipt || captured.required.length !== original.required.length + 1 ||
      !originalsMatch) {
    throw new ContentError("invalid", "Retained target does not bind exactly one descriptor and every original object");
  }
  if (descriptorReceipt.encodedBytes > limits.maxDescriptorBytes) {
    throw new ContentError("capacity", "Retained descriptor exceeds its trusted byte limit");
  }
  aggregate(BigInt(descriptorReceipt.encodedBytes) + original.encoded,
    BigInt(descriptorReceipt.encodedBytes) + BigInt(preliminary.decodedBytes) + original.decoded, limits);
  const descriptorBytes = await readEncoded(read, descriptorReceipt, signal);
  const candidate = await inspectSnapshot(descriptorBytes, read, limits, signal);
  if (canonicalJson(candidate.plan()) !== canonicalJson(captured)) {
    throw new ContentError("invalid", "Original descriptor and retained target identity differ");
  }
  signal?.throwIfAborted();
  return candidate;
}
