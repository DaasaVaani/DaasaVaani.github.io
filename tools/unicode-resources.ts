import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020";
import { strictYaml } from "../shared/tools/generate-catalog.mjs";
import schema from "../shared/schemas/unicode-settings.schema.json" with { type: "json" };
import manifest from "../shared/generated/unicode/manifest.json" with { type: "json" };

export function verifyUnicodeResources(read: (url: URL) => Buffer = readFileSync): void {
  const base = new URL("../shared/", import.meta.url);
  const settings = strictYaml(read(new URL("settings/unicode.yml", base)).toString("utf8"));
  const validate = new Ajv2020({ strict: true }).compile<{
    profile: string; unicodeVersion: string; sources: { "LICENSE.txt": { sha256: string } };
  }>(schema);
  if (!validate(settings)) throw new Error("Invalid Unicode settings: " + JSON.stringify(validate.errors));
  if (manifest.formatVersion !== 1 || manifest.profile !== settings.profile || manifest.unicodeVersion !== settings.unicodeVersion ||
      manifest.data.path !== "unicode16.json" || manifest.vectors.path !== "../../fixtures/unicode-name-matching.json" ||
      manifest.license !== "../../resources/unicode16/LICENSE.txt") throw new Error("Unsupported Unicode resource manifest");
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const check = (name: string, reference: { bytes: number; sha256: string }) => {
    const bytes = read(new URL(name, base));
    if (bytes.length !== reference.bytes || hash(bytes) !== reference.sha256) throw new Error("Unicode resource integrity mismatch: " + name);
    return bytes;
  };
  const data: unknown = JSON.parse(check("generated/unicode/unicode16.json", manifest.data).toString("utf8"));
  if (!data || typeof data !== "object" || !("formatVersion" in data) || data.formatVersion !== 1 ||
      !("profile" in data) || data.profile !== settings.profile ||
      !("unicodeVersion" in data) || data.unicodeVersion !== settings.unicodeVersion) throw new Error("Unsupported Unicode table metadata");
  check("fixtures/unicode-name-matching.json", manifest.vectors);
  if (hash(read(new URL("resources/unicode16/LICENSE.txt", base))) !== settings.sources["LICENSE.txt"].sha256) {
    throw new Error("Unicode license integrity mismatch");
  }
}
