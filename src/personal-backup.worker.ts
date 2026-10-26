import { backupContents, makeBackup, PersonalBackupCodec, type WebBackup } from "./personal-backup";
import { listNameKey, type PersonalContents, type PersonalStore } from "./personal-model";
import { TransferError, type TransferErrorCode } from "./list-transfer-types";

export type BackupRequest = { kind: "encode"; state: PersonalStore; exportedAt: string } | { kind: "decode"; file: Blob };
export type BackupPreview = {
  value: WebBackup; contents: PersonalContents; text: string; duplicateNames: string[][];
};
export type BackupResult = { kind: "file"; bytes: Uint8Array } | { kind: "preview"; preview: BackupPreview };
export type BackupResponse = { result: BackupResult } | { error: TransferErrorCode };

self.onmessage = async (event: MessageEvent<BackupRequest>) => {
  try {
    const request = event.data, codec = new PersonalBackupCodec();
    let result: BackupResult;
    if (request.kind === "encode") result = { kind: "file", bytes: codec.encode(makeBackup(request.state, request.exportedAt)) };
    else if (request.kind === "decode") {
      if (request.file.size > __BACKUP_LIMITS__.maxBackupEncodedBytes) throw new TransferError("encodedLimit");
      const value = codec.decode(new Uint8Array(await request.file.arrayBuffer()));
      const names = new Map<string, string[]>();
      for (const list of value.data.lists) {
        const key = listNameKey(list.name), group = names.get(key) ?? [];
        group.push(list.name); names.set(key, group);
      }
      result = { kind: "preview", preview: { value, contents: backupContents(value), text: JSON.stringify(value),
        duplicateNames: [...names.values()].filter(group => group.length > 1) } };
    } else throw new TransferError("invalid");
    self.postMessage({ result } satisfies BackupResponse);
  } catch (reason) {
    self.postMessage({ error: reason instanceof TransferError ? reason.code : "failed" } satisfies BackupResponse);
  }
};
