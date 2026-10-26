import Ajv2020 from "ajv/dist/2020";
import { encodeTransferJson, parseTransferJson, transformTransferBytes } from "./transfer-bytes";
import schema from "../shared/schemas/list-transfer.schema.json";
import schemaV2 from "../shared/schemas/list-transfer-v2.schema.json";
import { TransferError, type ListSnapshot, type TransferConfig } from "./list-transfer-types";
const ajv = new Ajv2020({ strict: true });
const validV1 = ajv.compile<ListSnapshot>(schema), validV2 = ajv.compile<ListSnapshot>(schemaV2);
const validate = (value: unknown): value is ListSnapshot => validV1(value) || validV2(value);
function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export class ListCodec {
  constructor(readonly config: TransferConfig) {}
  private transform(input: Uint8Array, gzip: boolean, decoding: boolean): Uint8Array {
    const limit = decoding ? this.config.maxListDecodedBytes : this.config.maxListEncodedBytes;
    return transformTransferBytes(input, gzip, decoding, limit, this.config.transferChunkBytes, this.config.listCompressionLevel);
  }
  private parse(bytes: Uint8Array): ListSnapshot {
    const value = parseTransferJson(bytes);
    if (!validate(value)) throw new TransferError("invalid");
    return value;
  }
  private serialize(value: unknown): Uint8Array {
    if (!validate(value)) throw new TransferError("invalid");
    return encodeTransferJson(value, this.config.maxListDecodedBytes);
  }
  decodeFile(bytes: Uint8Array): ListSnapshot {
    if (bytes.length > this.config.maxListEncodedBytes) throw new TransferError("encodedLimit");
    return this.parse(this.transform(bytes, true, true));
  }
  encodeFile(value: unknown): Uint8Array { return this.transform(this.serialize(value), true, false); }
  encodeLink(value: unknown): string {
    const bytes = this.transform(this.serialize(value), false, false);
    const url = new URL(this.config.listLinkPath, this.config.canonicalBaseUrl);
    url.hash = "/list/";
    if (url.href.length + Math.ceil(bytes.length * 4 / 3) > this.config.maxSharedUrlAscii) throw new TransferError("linkLimit");
    url.hash += base64url(bytes);
    if (url.href.length > this.config.maxSharedUrlAscii) throw new TransferError("linkLimit");
    return url.href;
  }
  decodeLink(link: string): ListSnapshot {
    if (link.length > this.config.maxSharedUrlAscii) throw new TransferError("linkLimit");
    if (!/^[\x21-\x7e]+$/.test(link)) throw new TransferError("invalid");
    let url: URL;
    try { url = new URL(link); } catch { throw new TransferError("invalid"); }
    const base = new URL(this.config.canonicalBaseUrl);
    const open = new URL(this.config.listLinkPath, base);
    if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || url.search ||
        (url.pathname !== base.pathname && url.pathname !== open.pathname) || !url.hash.startsWith("#/list/")) {
      throw new TransferError("invalid");
    }
    const payload = url.hash.slice("#/list/".length);
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) throw new TransferError("invalid");
    const bytes = Uint8Array.from(atob(payload.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
    const canonical = base64url(bytes);
    if (canonical !== payload) throw new TransferError("invalid");
    if (bytes.length > this.config.maxListEncodedBytes) throw new TransferError("encodedLimit");
    return this.parse(this.transform(bytes, false, true));
  }
}
