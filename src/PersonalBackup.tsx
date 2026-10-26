import { useEffect, useId, useRef, useState } from "react";
import type messages from "../shared/generated/web/ui.json";
import { personalBackup } from "./personal-backup-client";
import type { BackupPreview } from "./personal-backup.worker";
import { readStore, restorePersonalContents } from "./personal";
import { PersonalError, type PersonalStore, type Revision } from "./personal-model";
import { TransferError } from "./list-transfer-types";
import styles from "./App.module.css";

type Labels = typeof messages.en;
const sameRevision = (a: Revision, b: Revision) => a.epoch === b.epoch && a.revision === b.revision;
const errorCaption = (reason: unknown): keyof Labels =>
  reason instanceof PersonalError ? reason.code === "stale" ? "backupStale"
    : reason.code === "capacity" ? "backupTooLarge" : "backupInvalid"
    : reason instanceof TransferError ? reason.code === "decodedLimit" || reason.code === "encodedLimit" ? "backupTooLarge"
      : reason.code === "invalid" ? "backupInvalid" : "backupFailed" : "backupFailed";

export function PersonalBackup({ labels, store }: { labels: Labels; store: PersonalStore }) {
  const id = useId(), controller = useRef<AbortController | null>(null), mounted = useRef(false);
  const [busy, setBusy] = useState<"export" | "decode" | "restore">();
  const [preview, setPreview] = useState<{ candidate: BackupPreview; expected: Revision }>();
  const [download, setDownload] = useState<{ url: string; expected: Revision }>();
  const [error, setError] = useState<keyof Labels>(), [notice, setNotice] = useState<keyof Labels>();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  const stale = preview && !sameRevision(preview.expected, store.control);
  async function run(file?: File) {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(file ? "decode" : "export"); setError(undefined); setNotice(undefined); setDownload(undefined);
    if (file) setPreview(undefined);
    try {
      const state = await readStore(); current.signal.throwIfAborted();
      const result = await personalBackup(file ? { kind: "decode", file }
        : { kind: "encode", state, exportedAt: new Date().toISOString() }, current.signal);
      current.signal.throwIfAborted();
      if (!sameRevision(state.control, (await readStore()).control)) throw new PersonalError("stale");
      current.signal.throwIfAborted();
      if (file && result.kind === "preview") setPreview({ candidate: result.preview, expected: state.control });
      else if (!file && result.kind === "file") {
        setDownload({ url: URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: "application/gzip" })), expected: state.control });
      } else throw new TransferError("failed");
    } catch (reason) {
      if (mounted.current && !current.signal.aborted) {
        const caption = errorCaption(reason);
        setError(!file && caption === "backupFailed" ? "personalFailed" : caption);
      }
    } finally { if (mounted.current && controller.current === current) setBusy(undefined); }
  }
  async function restore() {
    if (!preview) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy("restore"); setError(undefined); setNotice(undefined); setDownload(undefined);
    try {
      await restorePersonalContents(preview.candidate.contents, preview.expected, current.signal);
      if (mounted.current) { setPreview(undefined); setNotice("backupRestored"); }
    } catch (reason) {
      if (mounted.current) {
        if (current.signal.aborted) { setPreview(undefined); setNotice("backupCancelled"); }
        else setError(errorCaption(reason));
      }
    } finally { if (mounted.current && controller.current === current) setBusy(undefined); }
  }
  function cancel() {
    controller.current?.abort();
    if (busy !== "restore") { setPreview(undefined); setError(undefined); setNotice("backupCancelled"); }
  }
  const candidate = preview?.candidate, data = candidate?.value.data;
  return <section aria-labelledby={`${id}-title`} aria-busy={Boolean(busy)}>
    <h2 id={`${id}-title`}>{labels.backupTitle}</h2>
    <p>{labels.backupPrivacy}</p><p>{labels.backupSamePlatform}</p>
    <p>{labels.backupOfferExport}</p>
    <button disabled={Boolean(busy)} onClick={() => void run()}>{labels.backupExport}</button>
    {download && sameRevision(download.expected, store.control) &&
      <p><a href={download.url} download={__WEB_CONFIG__.backupFileName}>{labels.backupExport}</a></p>}
    <label htmlFor={`${id}-file`}>{labels.backupChoose}</label>
    <input id={`${id}-file`} type="file" accept=".gz,application/gzip" disabled={Boolean(busy)}
      onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (file) void run(file);
      }} />
    {busy && <p role="status">{labels.transferWorking}</p>}
    {(busy || preview) && <button onClick={cancel}>{labels.cancel}</button>}
    {error && <p role="alert" className={styles.error}>{labels[error]}</p>}
    {notice && <p role="status">{labels[notice]}</p>}
    {candidate && data && <section aria-label={labels.backupPreview}>
      <h3>{labels.backupPreview}</h3>
      <p><time dateTime={candidate.value.exportedAt}>{candidate.value.exportedAt}</time> · {candidate.value.platform}</p>
      <dl>
        <dt>{labels.favorites}</dt><dd>{data.favorites.length}</dd>
        <dt>{labels.lists}</dt><dd>{data.lists.length}</dd>
        <dt>{labels.recentHistory}</dt><dd>{data.history.entries.length}</dd>
        <dt>{labels.learning}</dt><dd>{data.learning.entries.length}</dd>
        <dt>{labels.savedRecitationPosition}</dt><dd>{data.recitation.position
          ? `${data.recitation.position.listId} / ${data.recitation.position.entryId}` : labels.noRecitationPosition}</dd>
      </dl>
      {candidate.duplicateNames.map((names, index) => <aside key={index} role="status">
        <p>{labels.backupReplacementNotice}</p><p>{labels.listName}: {names.join(" / ")}</p>
      </aside>)}
      <label htmlFor={`${id}-data`}>{labels.backupPreview}</label>
      <textarea id={`${id}-data`} readOnly rows={10} value={candidate.text} style={{ width: "100%", boxSizing: "border-box" }} />
      <p>{labels.backupReplacementNotice}</p>
      {stale && <p role="alert">{labels.backupStale}</p>}
      <button disabled={Boolean(busy) || Boolean(stale)} onClick={() => void restore()}>{labels.backupReplace}</button>
    </section>}
  </section>;
}
