import Ajv2020 from "ajv/dist/2020";
import sourceSchema from "../shared/schemas/lyric-publication.schema.json";
import type { LyricDescriptor, LyricItem, LyricManifest } from "../shared/types/lyrics";
import { fetchBytes, parse, record, validateReference, verified } from "./artifacts";

const schema = structuredClone(sourceSchema);
function allowOptionalFields(value: unknown): void {
  if (Array.isArray(value)) value.forEach(allowOptionalFields);
  else if (record(value)) {
    if (value.additionalProperties === false) value.additionalProperties = true;
    Object.values(value).forEach(allowOptionalFields);
  }
}
allowOptionalFields(schema);
const ajv = new Ajv2020({ strict: true });
const descriptorValid = ajv.compile<LyricDescriptor>({ ...schema, $ref: "#/$defs/descriptor" });
const manifestValid = ajv.compile<LyricManifest>({ ...schema, $ref: "#/$defs/manifest" });
const itemValid = ajv.compile<LyricItem>({ ...schema, $ref: "#/$defs/item" });
function text(value: string) {
  if (/[\ud800-\udfff\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
    throw new Error("Lyric contains malformed Unicode or unsupported controls");
  }
}
export class LyricLibrary {
  private readonly items = new Map<string, LyricItem>();
  private readonly summaries;
  private readonly ids;
  constructor(readonly catalog: LyricManifest["catalog"], readonly manifestSha256: string,
    private readonly base: URL, private readonly settings: WebConfig["lyricPreview"],
    private encoded: number, private decoded: number) {
    this.summaries = new Map(catalog.map(summary => [summary.lyricId, summary]));
    this.ids = new Set(this.summaries.keys());
  }
  summary(id: string) { return this.summaries.get(id); }
  item(id: string) { return this.items.get(id); }
  chooseAnother(excludedId?: string, random: () => number = Math.random) {
    const candidates = this.catalog.filter(summary => summary.lyricId !== excludedId);
    if (!candidates.length) return undefined;
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid lyric choice random value");
    return candidates[Math.floor(value * candidates.length)];
  }
  assertCompleteFits() {
    let encoded = this.encoded, decoded = this.decoded;
    for (const summary of this.catalog) {
      if (this.items.has(summary.lyricId)) continue;
      encoded += summary.item.encodedBytes; decoded += summary.item.decodedBytes;
    }
    this.checkCapacity(encoded, decoded);
  }
  private checkCapacity(encoded: number, decoded: number) {
    if (encoded > this.settings.maxEncodedBytes || decoded > this.settings.maxDecodedBytes) {
      throw new Error("Lyric library exceeds configured preparation byte limits");
    }
  }
  async read(id: string, signal?: AbortSignal): Promise<LyricItem> {
    signal?.throwIfAborted();
    const cached = this.items.get(id);
    if (cached) return cached;
    const summary = this.summaries.get(id);
    if (!summary) throw new Error("Lyric is unavailable in the verified catalog");
    this.checkCapacity(this.encoded + summary.item.encodedBytes, this.decoded + summary.item.decodedBytes);
    this.encoded += summary.item.encodedBytes; this.decoded += summary.item.decodedBytes;
    let retained = false;
    try {
      const item = await verified(this.base, summary.item, __BOUNDS__.maxItemEncodedBytes,
        __BOUNDS__.maxItemDecodedBytes, signal, "no-store");
      signal?.throwIfAborted();
      const existing = this.items.get(id);
      if (existing) return existing;
      if (!itemValid(item)) throw new Error("Invalid lyric item");
      if (item.lyricId !== summary.lyricId || item.title !== summary.title ||
          item.tags.length !== summary.tags.length || item.tags.some((tag, index) => tag !== summary.tags[index])) {
        throw new Error("Lyric item does not match its catalog summary");
      }
      const lineIds = new Set<string>();
      let kannada = false;
      for (const line of item.lines) {
        text(line.text);
        if (line.kind === "layout") {
          if ("lineId" in line) throw new Error("Layout must not have a lyric line identity");
        } else {
          if (this.ids.has(line.lineId) || lineIds.has(line.lineId) || /^[ \t]*$/u.test(line.text)) {
            throw new Error("Duplicate, conflicting or blank lyric line identity");
          }
          lineIds.add(line.lineId); kannada ||= /\p{Script=Kannada}/u.test(line.text);
        }
      }
      if (!lineIds.size || !kannada) throw new Error("Lyric has no canonical Kannada lines");
      for (const lineId of lineIds) this.ids.add(lineId);
      this.items.set(id, item); retained = true;
      return item;
    } finally {
      if (!retained) { this.encoded -= summary.item.encodedBytes; this.decoded -= summary.item.decodedBytes; }
    }
  }
}
export async function loadLyricCatalog(signal?: AbortSignal,
  settings: WebConfig["lyricPreview"] = __WEB_CONFIG__.lyricPreview): Promise<LyricLibrary> {
  signal?.throwIfAborted();
  const descriptorUrl = new URL(settings.descriptorUrl), base = new URL(".", descriptorUrl);
  const bytes = await fetchBytes(descriptorUrl, __BOUNDS__.maxDescriptorBytes, signal, "no-store");
  const descriptor = parse(bytes);
  if (!descriptorValid(descriptor)) throw new Error("Unsupported lyric descriptor");
  validateReference(descriptor.manifest, __BOUNDS__.maxManifestEncodedBytes, __BOUNDS__.maxManifestDecodedBytes);
  const encoded = bytes.length + descriptor.manifest.encodedBytes, decoded = bytes.length + descriptor.manifest.decodedBytes;
  if (encoded > settings.maxEncodedBytes || decoded > settings.maxDecodedBytes) {
    throw new Error("Lyric library exceeds configured preparation byte limits");
  }
  const manifest = await verified(base, descriptor.manifest, __BOUNDS__.maxManifestEncodedBytes,
    __BOUNDS__.maxManifestDecodedBytes, signal, "no-store");
  if (!manifestValid(manifest)) throw new Error("Unsupported lyric manifest or required capability");
  if (manifest.catalog.length > settings.maxItems) throw new Error("Complete lyric library exceeds configured item count");
  const ids = new Set<string>();
  for (const summary of manifest.catalog) {
    if (ids.has(summary.lyricId)) throw new Error("Duplicate lyric catalog identity");
    ids.add(summary.lyricId); text(summary.title); summary.tags.forEach(text);
    validateReference(summary.item, __BOUNDS__.maxItemEncodedBytes, __BOUNDS__.maxItemDecodedBytes);
  }
  signal?.throwIfAborted();
  return new LyricLibrary(manifest.catalog, descriptor.manifest.sha256, base, settings, encoded, decoded);
}
export async function prepareLyrics(signal?: AbortSignal, progress?: (done: number, total: number) => void,
  settings: WebConfig["lyricPreview"] = __WEB_CONFIG__.lyricPreview): Promise<LyricLibrary> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const library = await loadLyricCatalog(controller.signal, settings);
    library.assertCompleteFits();
    controller.signal.throwIfAborted();
    progress?.(0, library.catalog.length);
    let next = 0, done = 0;
    const workers = Array.from({ length: Math.min(settings.concurrentRequests, library.catalog.length) }, async () => {
      for (;;) {
        controller.signal.throwIfAborted();
        const summary = library.catalog[next++];
        if (!summary) return;
        await library.read(summary.lyricId, controller.signal);
        progress?.(++done, library.catalog.length);
      }
    });
    try { await Promise.all(workers); }
    catch (error) { controller.abort(error); await Promise.allSettled(workers); throw error; }
    controller.signal.throwIfAborted();
    return library;
  } finally { signal?.removeEventListener("abort", abort); }
}
