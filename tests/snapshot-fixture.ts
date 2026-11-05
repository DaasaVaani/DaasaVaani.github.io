import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import vector from "../shared/fixtures/snapshot.json" with { type: "json" };
import type { LyricItem, LyricObjectReference } from "../shared/types/lyrics";
import type { SnapshotBundle, SnapshotDescriptor, SnapshotManifest, SnapshotPolicy } from "../shared/types/snapshot";
import type { SnapshotValidationLimits } from "../src/snapshot-validation";

type Role = "item" | "policy" | "manifest";
export interface SnapshotFixtureOptions {
  sequence?: number;
  items?: LyricItem[];
  manifest?: (value: SnapshotManifest) => unknown;
  policy?: (value: SnapshotPolicy) => unknown;
  item?: (value: LyricItem) => unknown;
  jsonBytes?: (role: Role, bytes: Uint8Array) => Uint8Array;
  gzipBytes?: (role: Role, bytes: Uint8Array) => Uint8Array;
}
export function fixtureCanonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(fixtureCanonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ":" + fixtureCanonical(item)).join(",") + "}";
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Invalid synthetic JSON fixture");
  return result;
}
export function snapshotFixture(options: SnapshotFixtureOptions = {}) {
  const objects: Record<string, Uint8Array> = {};
  function encode(value: unknown, role: Role) {
    let decoded = new TextEncoder().encode(fixtureCanonical(value));
    if (options.jsonBytes) decoded = new Uint8Array(options.jsonBytes(role, decoded));
    let bytes = new Uint8Array(gzipSync(decoded));
    if (options.gzipBytes) bytes = new Uint8Array(options.gzipBytes(role, bytes));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const reference: LyricObjectReference = {
      sha256, path: `objects/${sha256}.json.gz`, encodedBytes: bytes.length, decodedBytes: decoded.length,
    };
    objects[sha256] = bytes;
    return reference;
  }
  const items: LyricItem[] = options.items ?? [1, 2].map(value => ({
    format: "daasavaani-lyric", formatVersion: 1, canonicalScript: "kn",
    lyricId: `10000000-0000-4000-8000-00000000000${value}`, title: `Synthetic storage ${value}`, tags: [],
    lines: [{ kind: "line", lineId: `20000000-0000-4000-8000-00000000000${value}`, text: "\u0c85" }],
  }));
  const policy: SnapshotPolicy = {
    format: "daasavaani-snapshot-policy", formatVersion: 1, logicalProjection: "canonical-prelaunch-v1",
    transferPlanning: structuredClone(vector.policy.transferPlanning),
  };
  const policyReference = encode(options.policy ? options.policy(policy) : policy, "policy");
  const manifest: SnapshotManifest = {
    format: "daasavaani-snapshot", formatVersion: 1, stage: "prelaunch",
    logicalProjection: "canonical-prelaunch-v1",
    requiredCapabilities: ["snapshot-envelope-v1", "lyric-preview-v1", "snapshot-policy-v1"],
    policy: policyReference.sha256, objects: {
      [policyReference.sha256]: { role: "policy", path: policyReference.path,
        encodedBytes: policyReference.encodedBytes, decodedBytes: policyReference.decodedBytes,
        requiredCapabilities: ["snapshot-policy-v1"] },
    }, catalog: [], bundles: {},
  };
  for (const item of items) {
    const reference = encode(options.item ? options.item(structuredClone(item)) : item, "item");
    manifest.objects[reference.sha256] = { role: "item", path: reference.path,
      encodedBytes: reference.encodedBytes, decodedBytes: reference.decodedBytes, requiredCapabilities: ["lyric-preview-v1"] };
    manifest.catalog.push({ lyricId: item.lyricId, title: item.title, tags: [...item.tags], item: reference.sha256,
      firstPublishedAt: "2026-01-01T00:00:00.000Z", changedAt: "2026-01-01T00:00:00.000Z" });
  }
  const manifestReference = encode(options.manifest ? options.manifest(structuredClone(manifest)) : manifest, "manifest");
  const descriptor: SnapshotDescriptor = {
    format: "daasavaani-snapshot-feed", formatVersion: 1, sequence: options.sequence ?? 1, manifest: manifestReference,
  };
  const descriptorBytes = new TextEncoder().encode(fixtureCanonical(descriptor) + "\n");
  const descriptorHash = createHash("sha256").update(descriptorBytes).digest("hex");
  objects[descriptorHash] = descriptorBytes;
  return { descriptor, descriptorBytes, descriptorHash, objects, manifest, items, policy,
    encodedBytes: Object.values(objects).reduce((sum, bytes) => sum + bytes.length, 0),
    decodedBytes: descriptorBytes.length + manifestReference.decodedBytes +
      Object.values(manifest.objects).reduce((sum, object) => sum + object.decodedBytes, 0),
  };
}
export function snapshotLimits(): SnapshotValidationLimits {
  return { maxDescriptorBytes: 4096, maxManifestEncodedBytes: 16384, maxManifestDecodedBytes: 65536,
    maxPolicyEncodedBytes: 4096, maxPolicyDecodedBytes: 16384, maxItemEncodedBytes: 4096,
    maxItemDecodedBytes: 16384, maxItems: 10, maxTotalEncodedBytes: 131072, maxTotalDecodedBytes: 262144,
    chunkBytes: 7, supportedCapabilities: ["snapshot-envelope-v1", "lyric-preview-v1", "snapshot-policy-v1"] };
}
export function snapshotPacket(fixture: ReturnType<typeof snapshotFixture>) {
  return { descriptor: [...fixture.descriptorBytes],
    objects: Object.fromEntries(Object.entries(fixture.objects).map(([hash, bytes]) => [hash, [...bytes]])) };
}
export function bundledSnapshotFixture(options: Pick<SnapshotFixtureOptions, "manifest" | "policy"> = {}) {
  const template = snapshotFixture().items[0];
  if (!template) throw new Error("Missing synthetic template");
  const items = [1, 2, 3, 4].map(value => {
    let seed = value;
    const text = Array.from({ length: 3072 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String.fromCharCode(32 + seed % 95);
    }).join("");
    return { ...template, lyricId: `10000000-0000-4000-8000-00000000000${value}`, title: `Synthetic planning ${value}`,
      lines: [{ kind: "line" as const, lineId: `20000000-0000-4000-8000-00000000000${value}`, text }] };
  });
  let bundles: Record<string, SnapshotBundle> = {};
  const fixture = snapshotFixture({ items, ...options, manifest: manifest => {
    const members = manifest.catalog.map(entry => entry.item);
    bundles = Object.fromEntries(["a", "b"].map((letter, index) => {
      const selected = members.slice(index * 2, index * 2 + 2).sort();
      const encodedBytes = selected.reduce((sum, hash) => {
        const object = manifest.objects[hash];
        if (!object) throw new Error("Missing synthetic member");
        return sum + object.encodedBytes;
      }, 600);
      return [letter.repeat(64), { path: `bundles/${letter.repeat(64)}.zip`, members: selected, encodedBytes,
        changedAt: "2026-01-01T00:00:00.000Z" }];
    }));
    const bundled = { ...manifest, bundles };
    return options.manifest ? options.manifest(bundled) : bundled;
  } });
  return { ...fixture, bundles };
}
