import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import messages from "../shared/generated/web/ui.json";
import type { Publication } from "./artifacts";
import type { LyricLibrary } from "./lyric-publication";
import { referenceKey, type PersonalStore, type RecentHistoryV1 } from "./personal-model";
import { updateHistory } from "./personal";
import styles from "./App.module.css";

type Labels = typeof messages.en;
export function HistoryControls({ labels, history, epoch }: { labels: Labels; history: RecentHistoryV1; epoch: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const recording = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (busy || restoreFocus.current === undefined) return;
    const before = restoreFocus.current, target = recording.current;
    restoreFocus.current = undefined;
    if (target?.isConnected && !target.closest("[hidden]") &&
        (document.activeElement === document.body || document.activeElement === before)) target.focus({ preventScroll: true });
  }, [busy, history]);
  async function change(mutator: (value: RecentHistoryV1) => RecentHistoryV1) {
    restoreFocus.current = document.activeElement;
    setBusy(true); setError("");
    try { await updateHistory(mutator, epoch); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy} aria-busy={busy}>
    <legend>{labels.recentHistory}</legend>
    <p>{labels.recentHistoryNotice}</p>
    <label><input ref={recording} type="checkbox" checked={history.enabled} onChange={event => {
      const enabled = event.target.checked;
      void change(value => value.enabled === enabled ? value : { ...value, enabled });
    }} />{labels.recentHistoryEnabled}</label>
    <button className={styles.secondary} disabled={!history.entries.length}
      onClick={() => void change(value => value.entries.length ? { ...value, entries: [] } : value)}>{labels.clearRecentHistory}</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </fieldset>;
}

export function RecentHistory({ labels, personal, publication, lyrics }: {
  labels: Labels; personal: PersonalStore; publication?: Publication; lyrics?: LyricLibrary;
}) {
  const location = useLocation();
  return <section hidden={location.pathname !== "/recent"} aria-label={labels.recentHistory}>
    <h1>{labels.recentHistory}</h1>
    <HistoryControls labels={labels} history={personal.history} epoch={personal.control.epoch} />
    <div className={styles.grid}>{personal.history.entries.map(reference => {
      const item = reference.kind === "lyric" ? lyrics?.summary(reference.lyricId) : publication?.summary(reference.videoId);
      const pending = reference.kind === "lyric" ? !lyrics : !publication;
      const path = reference.kind === "lyric" ? `/lyrics/${reference.lyricId}` : item ? `/item/${encodeURIComponent(reference.videoId)}` : undefined;
      return <article className={styles.card} key={referenceKey(reference)}>
        <p>{reference.kind === "lyric" ? labels.lyricReference : labels.legacyReference}</p>
        {item ? <h2 lang="kn">{item.title}</h2> : <p>{pending ? labels.referencePending : labels.lyricsUnavailable}</p>}
        <code>{reference.kind === "lyric" ? reference.lyricId : reference.videoId}</code>
        {path && <Link className={styles.readLink} to={path} state={{ browseFrom: "/recent" }}
          onClick={event => event.currentTarget.focus({ preventScroll: true })}>{labels.open}</Link>}
      </article>;
    })}</div>
    {!personal.history.entries.length && <p role="status">{labels.emptyRecentHistory}</p>}
  </section>;
}
