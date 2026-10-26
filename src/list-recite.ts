import { referenceKey, type ListRecord, type RecitationPositionV1 } from "./personal-model";

export function resolveRecitation(recitation: RecitationPositionV1, lists: readonly ListRecord[]) {
  if (!recitation.position) return { status: "none" } as const;
  const record = lists.find(record => record.id === recitation.position?.listId);
  if (!record) return { status: "listMissing" } as const;
  const index = record.entries.findIndex(entry => entry.id === recitation.position?.entryId);
  return index < 0 ? { status: "entryMissing", record } as const : { status: "available", record, index } as const;
}

export function sameRecitationList(left: ListRecord, right: ListRecord | undefined): boolean {
  return right !== undefined && left.id === right.id && left.name === right.name &&
    left.entries.length === right.entries.length && left.entries.every((entry, index) => {
      const other = right.entries[index];
      return other !== undefined && entry.id === other.id && (entry.kind === "placeholder"
        ? other.kind === "placeholder" && entry.text === other.text
        : other.kind !== "placeholder" && referenceKey(entry) === referenceKey(other) && entry.fallback === other.fallback);
    });
}
