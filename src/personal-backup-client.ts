import { TransferError } from "./list-transfer-types";
import type { BackupRequest, BackupResponse, BackupResult } from "./personal-backup.worker";

export function personalBackup(request: BackupRequest, signal: AbortSignal): Promise<BackupResult> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    if (request.kind === "decode" && request.file.size > __BACKUP_LIMITS__.maxBackupEncodedBytes) throw new TransferError("encodedLimit");
    const worker = new Worker(new URL("./personal-backup.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { worker.terminate(); signal.removeEventListener("abort", abort); };
    const abort = () => { finish(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<BackupResponse>) => {
      finish();
      if ("error" in event.data) reject(new TransferError(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = worker.onmessageerror = () => { finish(); reject(new TransferError("failed")); };
    try { worker.postMessage(request); }
    catch { finish(); reject(new TransferError("failed")); }
  });
}
