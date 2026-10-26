import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { LyricDescriptor, LyricItem, LyricManifest } from "../shared/types/lyrics";

export const lyricId = (index: number) => `10000000-0000-4000-8000-${(index * 16).toString(16).padStart(12, "0")}`;
export function lyricFixture(count = 2, edit: {
  item?: (value: LyricItem & Record<string, unknown>, index: number) => void;
  manifest?: (value: LyricManifest & Record<string, unknown>) => void;
  descriptor?: (value: LyricDescriptor & Record<string, unknown>) => void;
} = {}) {
  const files = new Map<string, Buffer>();
  function object(value: unknown) {
    const decoded = Buffer.from(JSON.stringify(value)), encoded = gzipSync(decoded);
    const sha256 = createHash("sha256").update(encoded).digest("hex"), path = `objects/${sha256}.json.gz`;
    files.set(path, encoded);
    return { path, sha256, encodedBytes: encoded.length, decodedBytes: decoded.length };
  }
  const manifest: LyricManifest & Record<string, unknown> = { format: "daasavaani-lyric-catalog", formatVersion: 1,
    stage: "prelaunch", requiredCapabilities: ["lyric-preview-v1"], catalog: [] };
  for (let index = 1; index <= count; index++) {
    const id = lyricId(index);
    const item: LyricItem & Record<string, unknown> = { format: "daasavaani-lyric", formatVersion: 1, lyricId: id,
      canonicalScript: "kn", title: `ಕನ್ನಡ synthetic ${String(index).padStart(3, "0")}`, tags: ["synthetic"],
      lines: [{ kind: "line", lineId: id.slice(0, -1) + "1", text: "ಕನ್ನಡ 😀  " },
        { kind: "layout", text: " \t " }, { kind: "layout", text: "" },
        { kind: "line", lineId: id.slice(0, -1) + "2", text: "ಅಕ್ಷರ" }] };
    edit.item?.(item, index);
    manifest.catalog.push({ lyricId: id, title: item.title, tags: [...item.tags], item: object(item) });
  }
  edit.manifest?.(manifest);
  const descriptor: LyricDescriptor & Record<string, unknown> = { format: "daasavaani-lyrics", formatVersion: 1, manifest: object(manifest) };
  edit.descriptor?.(descriptor);
  const descriptorBytes = Buffer.from(JSON.stringify(descriptor) + "\n");
  files.set("latest.json", descriptorBytes);
  return { files, manifest, descriptor, descriptorBytes,
    encodedBytes: descriptorBytes.length + descriptor.manifest.encodedBytes + manifest.catalog.reduce((sum, entry) => sum + entry.item.encodedBytes, 0),
    decodedBytes: descriptorBytes.length + descriptor.manifest.decodedBytes + manifest.catalog.reduce((sum, entry) => sum + entry.item.decodedBytes, 0) };
}
