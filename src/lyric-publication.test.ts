import { afterEach, expect, test, vi } from "vitest";
import { lyricFixture, lyricId } from "../tests/lyric-fixture";
import { loadLyricCatalog, prepareLyrics } from "./lyric-publication";
import type { LyricItem } from "../shared/types/lyrics";

afterEach(() => vi.unstubAllGlobals());
function serve(fixture: ReturnType<typeof lyricFixture>) {
  const base = new URL(".", __WEB_CONFIG__.lyricPreview.descriptorUrl);
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    options?.signal?.throwIfAborted();
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url.href);
    const bytes = fixture.files.get(url.href.slice(base.href.length));
    return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 });
  }));
  return requests;
}
test("complete preparation validates every UUID object before exposing exact text/layout and never reads source or fixture identities", async () => {
  const fixture = lyricFixture(), requests = serve(fixture), progress: number[] = [];
  const ready = await prepareLyrics(undefined, done => progress.push(done));
  expect(ready.catalog).toHaveLength(2);
  expect(ready.item(lyricId(1))?.lines.map(line => line.text)).toEqual(["ಕನ್ನಡ 😀  ", " \t ", "", "ಅಕ್ಷರ"]);
  expect(ready.item("fixture-one")).toBeUndefined();
  expect(ready.item("__proto__")).toBeUndefined();
  expect(progress).toEqual([0, 1, 2]);
  expect(requests).toHaveLength(4);
  expect(requests.every(url => url.startsWith(new URL(".", __WEB_CONFIG__.lyricPreview.descriptorUrl).href))).toBe(true);
  expect(fetch).toHaveBeenCalledWith(new URL(__WEB_CONFIG__.lyricPreview.descriptorUrl), expect.objectContaining({ credentials: "omit", cache: "no-store" }));
});
test("discovery reaches the whole verified catalog independently of paging without fetching or mutating content", async () => {
  const count = __WEB_CONFIG__.lyricPreview.pageSize * 2 + 1, fixture = lyricFixture(count);
  const requests = serve(fixture), library = await loadLyricCatalog(), before = structuredClone(library.catalog);
  expect(requests).toHaveLength(2);
  for (let index = 0; index < count; index++) {
    expect(library.chooseAnother(undefined, () => (index + 0.5) / count)?.lyricId).toBe(lyricId(index + 1));
  }
  expect(library.chooseAnother(undefined, () => 0)?.lyricId).toBe(lyricId(1));
  expect(library.chooseAnother(undefined, () => 1 - Number.EPSILON)?.lyricId).toBe(lyricId(count));
  expect(library.chooseAnother(lyricId(1), () => 0)?.lyricId).toBe(lyricId(2));
  expect(library.chooseAnother(lyricId(count), () => 1 - Number.EPSILON)?.lyricId).toBe(lyricId(count - 1));
  expect(library.catalog).toEqual(before);
  expect(library.catalog.every(summary => !library.item(summary.lyricId))).toBe(true);
  expect(requests).toHaveLength(2);
});
test("discovery rejects empty published catalogs and handles sole/missing exclusions without invalid random values", async () => {
  serve(lyricFixture(0));
  await expect(loadLyricCatalog()).rejects.toThrow("Unsupported lyric manifest");
  const random = vi.fn(() => 0);
  serve(lyricFixture(1));
  const sole = await loadLyricCatalog();
  expect(sole.chooseAnother(undefined, () => 0)?.lyricId).toBe(lyricId(1));
  expect(sole.chooseAnother(lyricId(99), () => 0)?.lyricId).toBe(lyricId(1));
  expect(sole.chooseAnother(lyricId(1), random)).toBeUndefined();
  expect(random).not.toHaveBeenCalled();
  for (const invalid of [NaN, Infinity, -1, 1, 2]) {
    expect(() => sole.chooseAnother(undefined, () => invalid)).toThrow("Invalid lyric choice random value");
  }
});
test("prepared discovery stays with that verified catalog and requires no discovery or item request", async () => {
  const requests = serve(lyricFixture()), library = await prepareLyrics(), before = requests.length;
  const chosen = library.chooseAnother(lyricId(1), () => 0);
  expect(chosen?.lyricId).toBe(lyricId(2));
  expect(library.item(lyricId(2))?.lyricId).toBe(chosen?.lyricId);
  expect(requests).toHaveLength(before);
});
test("additive optional fields are compatible while unknown required capabilities and future formats fail explicitly", async () => {
  serve(lyricFixture(1, { item: item => { item.optionalFuture = "ignored"; },
    manifest: manifest => { manifest.optionalFuture = true; }, descriptor: descriptor => { descriptor.optionalFuture = []; } }));
  expect((await prepareLyrics()).catalog).toHaveLength(1);
  serve(lyricFixture(1, { manifest: manifest => { Object.assign(manifest, { requiredCapabilities: ["unknown-v2"] }); } }));
  await expect(prepareLyrics()).rejects.toThrow("required capability");
  serve(lyricFixture(1, { descriptor: descriptor => { Object.assign(descriptor, { formatVersion: 2 }); } }));
  await expect(prepareLyrics()).rejects.toThrow("descriptor");
});
test("hash, byte sizes, item-summary identity, duplicate catalog/line identities and malformed Unicode fail without a prepared result", async () => {
  const corrupt = lyricFixture();
  const first = corrupt.manifest.catalog[0];
  if (!first) throw new Error("Synthetic fixture missing first entry");
  corrupt.files.set(first.item.path, Buffer.from("corrupt"));
  serve(corrupt);
  await expect(prepareLyrics()).rejects.toThrow("size mismatch");
  const damaged = lyricFixture(), reference = damaged.manifest.catalog[0]?.item;
  if (!reference) throw new Error("Synthetic fixture missing item reference");
  const data = damaged.files.get(reference.path), byte = data?.[10];
  if (!data || byte === undefined) throw new Error("Synthetic gzip missing payload");
  data[10] = byte ^ 1;
  serve(damaged);
  await expect(prepareLyrics()).rejects.toThrow("SHA256 mismatch");
  const edits: ((item: LyricItem) => void)[] = [
    item => { item.lyricId = lyricId(99); },
    item => {
      item.lines = [{ kind: "line", lineId: lyricId(1), text: "ಕನ್ನಡ" }];
    },
    item => {
      item.lines = [{ kind: "line", lineId: lyricId(9), text: "\ud800" }];
    },
    item => {
      item.lines = [{ kind: "line", lineId: lyricId(9), text: " \t " }];
    },
  ];
  for (const edit of edits) {
    serve(lyricFixture(1, { item: edit }));
    await expect(prepareLyrics()).rejects.toThrow();
  }
  serve(lyricFixture(2, { manifest: manifest => { const entry = manifest.catalog[0]; if (entry) manifest.catalog.push({ ...entry }); } }));
  await expect(prepareLyrics()).rejects.toThrow("Duplicate");
  serve(lyricFixture(2, { item: (item, index) => {
    if (index === 2) item.lines = [{ kind: "line", lineId: lyricId(1).slice(0, -1) + "1", text: "ಕನ್ನಡ" }];
  } }));
  await expect(prepareLyrics()).rejects.toThrow("Duplicate");
  serve(lyricFixture(1, { item: item => { item.lines = [{ kind: "layout", text: "" }]; } }));
  await expect(prepareLyrics()).rejects.toThrow("no canonical");
  serve(lyricFixture(1, { item: item => {
    item.lines = [Object.assign({ kind: "layout" as const, text: "" }, { lineId: lyricId(9) })];
  } }));
  await expect(prepareLyrics()).rejects.toThrow("Layout");
  serve(lyricFixture(1, { manifest: manifest => {
    const entry = manifest.catalog[0]; if (entry) entry.item.decodedBytes++;
  } }));
  await expect(prepareLyrics()).rejects.toThrow("decoded size mismatch");
});
test("configured preparation limits accept exact totals and reject one-byte/one-item over before any item download", async () => {
  const fixture = lyricFixture(), settings = { ...__WEB_CONFIG__.lyricPreview, maxItems: 2,
    maxEncodedBytes: fixture.encodedBytes, maxDecodedBytes: fixture.decodedBytes };
  serve(fixture);
  expect((await prepareLyrics(undefined, undefined, settings)).catalog).toHaveLength(2);
  for (const patch of [{ maxEncodedBytes: fixture.encodedBytes - 1 }, { maxDecodedBytes: fixture.decodedBytes - 1 }, { maxItems: 1 }]) {
    const requests = serve(fixture);
    await expect(prepareLyrics(undefined, undefined, { ...settings, ...patch })).rejects.toThrow("configured");
    expect(requests).toHaveLength(2);
  }
});
test("actual configured complete-library decoded boundary is accepted and limit+1 refuses all item requests", async () => {
  const each = 7 * 1024 * 1024;
  const build = (last: number) => lyricFixture(9, { item: (item, index) => { item.syntheticPadding = "x".repeat(index === 9 ? last : each); } });
  const first = build(each), last = each + __WEB_CONFIG__.lyricPreview.maxDecodedBytes - first.decodedBytes;
  const boundary = build(last);
  expect(boundary.decodedBytes).toBe(__WEB_CONFIG__.lyricPreview.maxDecodedBytes);
  serve(boundary);
  expect((await prepareLyrics()).catalog).toHaveLength(9);
  const over = build(last + 1), requests = serve(over);
  expect(over.decodedBytes).toBe(__WEB_CONFIG__.lyricPreview.maxDecodedBytes + 1);
  await expect(prepareLyrics()).rejects.toThrow("configured preparation byte limits");
  expect(requests).toHaveLength(2);
});
test("aborted preparation propagates cancellation and never exposes a partial catalog", async () => {
  const controller = new AbortController();
  vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) throw new Error("Missing request cancellation signal");
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  })));
  const pending = prepareLyrics(controller.signal);
  controller.abort(new DOMException("Cancelled", "AbortError"));
  await expect(pending).rejects.toThrow("Cancelled");
});
test("online catalog loading fetches only metadata and reads exactly the selected pinned item", async () => {
  const fixture = lyricFixture(3), requests = serve(fixture);
  const library = await loadLyricCatalog();
  expect(requests).toHaveLength(2);
  expect(library.summary(lyricId(2))).toEqual(fixture.manifest.catalog[1]);
  expect(library.item(lyricId(2))).toBeUndefined();
  const item = await library.read(lyricId(2));
  expect(item.lyricId).toBe(lyricId(2)); expect(requests).toHaveLength(3);
  expect(await library.read(lyricId(2))).toBe(item);
  expect(library.item(lyricId(1))).toBeUndefined();
  await expect(library.read("fixture-one")).rejects.toThrow("unavailable");
  await expect(library.read("__proto__")).rejects.toThrow("unavailable");
  expect(requests).toHaveLength(3);
});
test("online cache budgets bind only requested items and refuse over-capacity reads before their request", async () => {
  const fixture = lyricFixture(), requests = serve(fixture);
  const library = await loadLyricCatalog(undefined, { ...__WEB_CONFIG__.lyricPreview,
    maxEncodedBytes: fixture.encodedBytes - 1, maxDecodedBytes: fixture.decodedBytes });
  expect(requests).toHaveLength(2);
  expect(() => library.assertCompleteFits()).toThrow("configured preparation byte limits");
  await library.read(lyricId(1)); expect(requests).toHaveLength(3);
  await expect(library.read(lyricId(2))).rejects.toThrow("configured preparation byte limits");
  expect(requests).toHaveLength(3); expect(library.item(lyricId(1))).toBeDefined();
});
test("failed reads release byte reservations and never poison cache identities before an explicit retry", async () => {
  const fixture = lyricFixture(1), requests = serve(fixture), summary = fixture.manifest.catalog[0];
  if (!summary) throw new Error("Missing synthetic item");
  const original = fixture.files.get(summary.item.path);
  if (!original) throw new Error("Missing synthetic object");
  const library = await loadLyricCatalog(undefined, { ...__WEB_CONFIG__.lyricPreview,
    maxEncodedBytes: fixture.encodedBytes, maxDecodedBytes: fixture.decodedBytes });
  fixture.files.set(summary.item.path, Buffer.from("corrupt"));
  await expect(library.read(lyricId(1))).rejects.toThrow("size mismatch");
  expect(library.item(lyricId(1))).toBeUndefined();
  fixture.files.set(summary.item.path, original);
  expect((await library.read(lyricId(1))).lyricId).toBe(lyricId(1));
  expect(requests).toHaveLength(4);
  const invalid = lyricFixture(1, { item: item => { item.lines.push({ kind: "line", lineId: lyricId(991), text: "\ud800" }); } });
  serve(invalid);
  const broken = await loadLyricCatalog(undefined, { ...__WEB_CONFIG__.lyricPreview,
    maxEncodedBytes: invalid.encodedBytes, maxDecodedBytes: invalid.decodedBytes });
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(broken.read(lyricId(1))).rejects.toThrow("malformed Unicode");
    expect(broken.item(lyricId(1))).toBeUndefined();
  }
});
test("cancelled online reads do not expose content or consume cache capacity", async () => {
  const fixture = lyricFixture(1); serve(fixture);
  const library = await loadLyricCatalog(undefined, { ...__WEB_CONFIG__.lyricPreview,
    maxEncodedBytes: fixture.encodedBytes, maxDecodedBytes: fixture.decodedBytes });
  const controller = new AbortController();
  vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = options?.signal;
    if (!signal) throw new Error("Missing cancellation signal");
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  })));
  const pending = library.read(lyricId(1), controller.signal);
  controller.abort(new DOMException("Cancelled", "AbortError"));
  await expect(pending).rejects.toThrow("Cancelled");
  expect(library.item(lyricId(1))).toBeUndefined();
  serve(fixture);
  expect((await library.read(lyricId(1))).lyricId).toBe(lyricId(1));
});
test("valid bytes arriving after an ignored abort cannot populate the online cache", async () => {
  const fixture = lyricFixture(1); serve(fixture);
  const library = await loadLyricCatalog(), reference = fixture.manifest.catalog[0]?.item;
  const bytes = reference && fixture.files.get(reference.path);
  if (!bytes) throw new Error("Missing synthetic late response");
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const controller = new AbortController(), pending = library.read(lyricId(1), controller.signal);
  controller.abort(new DOMException("Cancelled", "AbortError"));
  if (!finish) throw new Error("Late response request did not start");
  finish(new Response(new Uint8Array(bytes)));
  await expect(pending).rejects.toThrow("Cancelled");
  expect(library.item(lyricId(1))).toBeUndefined();
  serve(fixture);
  expect((await library.read(lyricId(1))).lyricId).toBe(lyricId(1));
});
