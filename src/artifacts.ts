import Ajv2020 from "ajv/dist/2020";
import itemSchema from "../shared/schemas/fixture-item.schema.json";
import policySchema from "../shared/schemas/search-policy.schema.json";
import type { Descriptor, Manifest, FixtureItem, ObjectRecord, SearchIndex, SearchPolicy } from "../shared/types/publication";

export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const digestPattern = /^[0-9a-f]{64}$/;
const safePath = /^objects\/[0-9a-f]{64}\.json\.gz$/;
const ajv = new Ajv2020({ strict: true });
const validateItem = ajv.compile<FixtureItem>({ ...itemSchema, additionalProperties: true,
  properties: { ...itemSchema.properties, lines: { ...itemSchema.properties.lines,
    items: { ...itemSchema.properties.lines.items, additionalProperties: true } } } });
const validatePolicy = ajv.compile<SearchPolicy>({ ...policySchema, additionalProperties: true });

async function bounded(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > limit) {
        await reader.cancel();
        throw new Error(`Artifact exceeds ${limit} byte safety limit`);
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function fetchBytes(url: URL, limit: number, signal?: AbortSignal, cache?: RequestCache) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Metadata request timed out")), __BOUNDS__.metadataTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit", ...(cache ? { cache } : {}) });
    if (!response.ok) throw new Error(`Artifact request failed: HTTP ${response.status}`);
    if (!response.body) throw new Error("Artifact response has no body");
    return await bounded(response.body, limit);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export function parse(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function validateReference(expected: { path: string; sha256: string; encodedBytes: number; decodedBytes: number },
  encodedLimit: number, decodedLimit: number) {
  if (!safePath.test(expected.path) || !digestPattern.test(expected.sha256) ||
      expected.path !== `objects/${expected.sha256}.json.gz` ||
      !positiveInteger(expected.encodedBytes) || expected.encodedBytes > encodedLimit ||
      !positiveInteger(expected.decodedBytes) || expected.decodedBytes > decodedLimit) throw new Error("Invalid artifact identity or declared size");
}
export async function verified(base: URL, expected: { path: string; sha256: string; encodedBytes: number; decodedBytes: number },
  encodedLimit: number, decodedLimit: number, signal?: AbortSignal, cache?: RequestCache) {
  validateReference(expected, encodedLimit, decodedLimit);
  const bytes = await fetchBytes(new URL(expected.path, base), expected.encodedBytes, signal, cache);
  if (bytes.length !== expected.encodedBytes) throw new Error("Artifact encoded size mismatch");
  const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expected.sha256) throw new Error("Artifact SHA256 mismatch");
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const decoded = await bounded(stream, expected.decodedBytes);
  if (decoded.length !== expected.decodedBytes) throw new Error("Artifact decoded size mismatch");
  return parse(decoded);
}
function descriptor(value: unknown): Descriptor {
  if (!record(value) || value.formatVersion !== 1 || value.fixture !== true || !record(value.manifest)) throw new Error("Unsupported descriptor");
  const ref = value.manifest;
  if (typeof ref.path !== "string" || typeof ref.sha256 !== "string" ||
      !positiveInteger(ref.encodedBytes) || !positiveInteger(ref.decodedBytes)) throw new Error("Invalid descriptor manifest reference");
  return { formatVersion: 1, fixture: true, manifest: { path: ref.path, sha256: ref.sha256, encodedBytes: ref.encodedBytes, decodedBytes: ref.decodedBytes } };
}
function manifest(value: unknown): Manifest {
  if (!record(value) || value.formatVersion !== 1 || value.fixture !== true ||
      !Array.isArray(value.requiredCapabilities) || !record(value.objects) || !record(value.items) ||
      !record(value.named) || !Array.isArray(value.catalog)) throw new Error("Invalid manifest");
  const requiredCapabilities: string[] = [];
  for (const capability of value.requiredCapabilities) {
    if (typeof capability !== "string" || !__BOUNDS__.supportedRequiredCapabilities.includes(capability)) throw new Error("Unsupported required capability");
    requiredCapabilities.push(capability);
  }
  if (!requiredCapabilities.includes("fixture-catalog-v1")) throw new Error("Fixture capability is required");
  const objects: Manifest["objects"] = Object.create(null);
  for (const [hash, entry] of Object.entries(value.objects)) {
    if (!digestPattern.test(hash) || !record(entry) || typeof entry.path !== "string" ||
        !safePath.test(entry.path) || entry.path !== `objects/${hash}.json.gz` ||
        !positiveInteger(entry.encodedBytes) || !positiveInteger(entry.decodedBytes) ||
        (entry.role !== "item" && entry.role !== "index" && entry.role !== "policy")) throw new Error("Invalid object map");
    objects[hash] = { path: entry.path, role: entry.role, encodedBytes: entry.encodedBytes, decodedBytes: entry.decodedBytes };
  }
  const items: Record<string, string> = Object.create(null);
  for (const [id, hash] of Object.entries(value.items)) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof hash !== "string" || objects[hash]?.role !== "item") throw new Error("Invalid item lookup");
    items[id] = hash;
  }
  if (typeof value.named.index !== "string" || objects[value.named.index]?.role !== "index" ||
      typeof value.named.policy !== "string" || objects[value.named.policy]?.role !== "policy") throw new Error("Invalid named roles");
  const catalog: Manifest["catalog"] = [];
  const ids = new Set<string>();
  for (const summary of value.catalog) {
    if (!record(summary) || typeof summary.videoId !== "string" || !items[summary.videoId] || ids.has(summary.videoId) ||
        typeof summary.title !== "string" || !summary.title || !Array.isArray(summary.tags) ||
        summary.tags.some(tag => typeof tag !== "string") ||
        (summary.description !== undefined && typeof summary.description !== "string")) throw new Error("Invalid catalog summary");
    ids.add(summary.videoId);
    catalog.push({ videoId: summary.videoId, title: summary.title,
      ...(typeof summary.description === "string" ? { description: summary.description } : {}),
      tags: summary.tags.filter((tag): tag is string => typeof tag === "string") });
  }
  if (ids.size !== Object.keys(items).length) throw new Error("Catalog lookup coverage mismatch");
  return { formatVersion: 1, fixture: true, requiredCapabilities, objects, items,
    named: { index: value.named.index, policy: value.named.policy }, catalog };
}
export class Publication {
  private readonly summaries: Map<string, Manifest["catalog"][number]>;
  constructor(readonly base: URL, readonly manifest: Manifest) {
    this.summaries = new Map(manifest.catalog.map(summary => [summary.videoId, summary]));
  }
  summary(id: string) { return this.summaries.get(id); }
  async object(hash: string, role: ObjectRecord["role"], signal?: AbortSignal) {
    const entry = this.manifest.objects[hash];
    if (!entry || entry.role !== role) throw new Error("Missing or wrong-role artifact");
    const limits = {
      item: [__BOUNDS__.maxItemEncodedBytes, __BOUNDS__.maxItemDecodedBytes],
      index: [__BOUNDS__.maxIndexEncodedBytes, __BOUNDS__.maxIndexDecodedBytes],
      policy: [__BOUNDS__.maxPolicyEncodedBytes, __BOUNDS__.maxPolicyDecodedBytes],
    };
    return verified(this.base, { ...entry, sha256: hash }, limits[role][0]!, limits[role][1]!, signal);
  }
  async item(id: string, signal?: AbortSignal): Promise<FixtureItem> {
    const hash = this.manifest.items[id];
    if (!hash) throw new Error("Unavailable library reference");
    const value = await this.object(hash, "item", signal);
    if (!validateItem(value) || value.videoId !== id || new Set(value.lines.map(line => line.id)).size !== value.lines.length) throw new Error("Invalid item schema or identity");
    return value;
  }
  async prepareSearch(signal?: AbortSignal): Promise<{ index: SearchIndex; policy: SearchPolicy }> {
    const policy = await this.object(this.manifest.named.policy, "policy", signal);
    if (!validatePolicy(policy)) throw new Error("Invalid snapshot search policy");
    const value = await this.object(this.manifest.named.index, "index", signal);
    if (!record(value) || value.formatVersion !== 1 || value.policyHash !== this.manifest.named.policy ||
        !Array.isArray(value.tokens) || !record(value.postings)) throw new Error("Invalid search index");
    const tokens: SearchIndex["tokens"] = [];
    for (const token of value.tokens) {
      if (!record(token) || typeof token.value !== "string" || !token.value ||
          typeof token.itemId !== "string" || !this.manifest.items[token.itemId] ||
          typeof token.field !== "string" || !Object.hasOwn(policy.weights, token.field) ||
          (token.lineId !== undefined && typeof token.lineId !== "string")) throw new Error("Invalid index token");
      tokens.push({ value: token.value, itemId: token.itemId, field: token.field,
        ...(typeof token.lineId === "string" ? { lineId: token.lineId } : {}) });
    }
    const postings: SearchIndex["postings"] = Object.create(null);
    for (const [gram, entries] of Object.entries(value.postings)) {
      if (!/^[123]:/u.test(gram) || !Array.isArray(entries)) throw new Error("Invalid counted posting");
      postings[gram] = [];
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || !Number.isSafeInteger(entry[0]) ||
            typeof entry[0] !== "number" || entry[0] < 0 || entry[0] >= tokens.length || !positiveInteger(entry[1])) throw new Error("Invalid posting reference");
        postings[gram]!.push([entry[0], entry[1]]);
      }
    }
    return { policy, index: { formatVersion: 1, policyHash: this.manifest.named.policy, tokens, postings } };
  }
}
export async function loadPublication(signal?: AbortSignal) {
  const url = new URL(__WEB_CONFIG__.descriptorUrl, location.href);
  const head = descriptor(parse(await fetchBytes(url, __BOUNDS__.maxDescriptorBytes, signal)));
  const base = new URL("./", url);
  const value = await verified(base, head.manifest, __BOUNDS__.maxManifestEncodedBytes, __BOUNDS__.maxManifestDecodedBytes, signal);
  return new Publication(base, manifest(value));
}
