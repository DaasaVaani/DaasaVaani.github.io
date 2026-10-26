import {
  ZStream, GZheader, Z_OK, Z_STREAM_END, Z_FINISH, Z_NO_FLUSH,
  zlibInflateInit2, zlibInflate, zlibInflateEnd,
  zlibDeflateInit2, zlibDeflateSetHeader, zlibDeflate, zlibDeflateEnd,
} from "pako";
import { TransferError } from "./list-transfer-types";

export function parseTransferJson(bytes: Uint8Array): unknown {
  let text: string, value: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch { throw new TransferError("invalid"); }
  const stack: (Set<string> | null)[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "{") stack.push(new Set());
    else if (char === "[") stack.push(null);
    else if (char === "}" || char === "]") stack.pop();
    else if (char === '"') {
      const start = index++;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === "\\") index++;
        index++;
      }
      let next = index + 1;
      while (/\s/.test(text[next] ?? "")) next++;
      const keys = stack.at(-1);
      if (text[next] === ":" && keys) {
        const key: unknown = JSON.parse(text.slice(start, index + 1));
        if (typeof key !== "string" || keys.has(key)) throw new TransferError("invalid");
        keys.add(key);
      }
    }
  }
  return value;
}

export function encodeTransferJson(value: unknown, limit: number): Uint8Array {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TransferError("invalid");
  if (text.length > limit) throw new TransferError("decodedLimit");
  const output = new Uint8Array(Math.min(text.length * 3, limit + 1));
  const encoded = new TextEncoder().encodeInto(text, output);
  if (encoded.read !== text.length || encoded.written > limit) throw new TransferError("decodedLimit");
  return output.slice(0, encoded.written);
}

export function transformTransferBytes(input: Uint8Array, gzip: boolean, decoding: boolean,
  limit: number, chunkBytes: number, compressionLevel: number): Uint8Array {
  const stream = new ZStream();
  const initialized = decoding ? zlibInflateInit2(stream, gzip ? 31 : -15)
    : zlibDeflateInit2(stream, compressionLevel, 8, gzip ? 31 : -15, 8, 0);
  if (initialized !== Z_OK) throw new TransferError("failed");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (!decoding && gzip) {
      const header = new GZheader();
      header.os = 255;
      header.time = 0;
      if (zlibDeflateSetHeader(stream, header) !== Z_OK) throw new TransferError("failed");
    }
    stream.input = input;
    stream.next_in = 0;
    stream.avail_in = input.length;
    for (;;) {
      const before = stream.next_in;
      stream.output = new Uint8Array(Math.min(chunkBytes, limit - length + 1));
      stream.next_out = 0;
      stream.avail_out = stream.output.length;
      const status = decoding ? zlibInflate(stream, Z_NO_FLUSH) : zlibDeflate(stream, Z_FINISH);
      length += stream.next_out;
      if (length > limit) throw new TransferError(decoding ? "decodedLimit" : "encodedLimit");
      if (stream.next_out) chunks.push(stream.output.subarray(0, stream.next_out));
      if (status === Z_STREAM_END) {
        if (stream.avail_in !== 0) throw new TransferError("invalid");
        const output = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
        return output;
      }
      if (status !== Z_OK || (before === stream.next_in && !stream.next_out)) throw new TransferError("invalid");
    }
  } finally {
    if (decoding) zlibInflateEnd(stream);
    else zlibDeflateEnd(stream);
  }
}
