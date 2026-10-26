import type { ListEntryV2, ListTransferV2, PersonalReference } from "../shared/types/personal";
export type { ListEntryV2, ListTransferV2, PersonalReference };
export interface ListSnapshotV1 {
  format: "daasavaani-list"; formatVersion: 1; name: string;
  entries: ({ kind: "item"; videoId: string; fallback?: string } | { kind: "placeholder"; text: string })[];
}
export type ListSnapshot = ListSnapshotV1 | ListTransferV2;
export function typedEntry(entry: ListSnapshot["entries"][number]): ListEntryV2 {
  return entry.kind === "item" ? { ...entry, kind: "legacyVideo" } : { ...entry };
}
export type TransferErrorCode = "invalid" | "encodedLimit" | "decodedLimit" | "linkLimit" | "failed";
export class TransferError extends Error {
  constructor(readonly code: TransferErrorCode) { super(`List transfer: ${code}`); }
}
export interface TransferConfig {
  maxListEncodedBytes: number; maxListDecodedBytes: number; maxSharedUrlAscii: number;
  transferChunkBytes: number; listCompressionLevel: number; canonicalBaseUrl: string; listLinkPath: string;
}
