import { useEffect, useId, useRef, useState } from "react";
import type messages from "../shared/generated/web/ui.json";
import schema from "../shared/schemas/lyric-publication.schema.json";
import styles from "./App.module.css";

const uuid = new RegExp(schema.$defs.uuid.pattern, "u");
export function lyricLink(lyricId: string, canonicalBaseUrl: string): string {
  if (uuid.exec(lyricId)?.[0] !== lyricId) throw new Error("Invalid lyric identity");
  const url = new URL(canonicalBaseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) {
    throw new Error("Invalid canonical lyric base URL");
  }
  url.hash = `/lyrics/${lyricId}`;
  return url.href;
}

export function LyricShare({ lyricId, labels }: { lyricId: string; labels: typeof messages.en }) {
  const id = useId(), link = lyricLink(lyricId, __WEB_CONFIG__.canonicalBaseUrl);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const active = useRef(false), working = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  async function share(kind: "copy" | "share") {
    if (working.current) return;
    working.current = true;
    setBusy(true); setNotice(""); setError("");
    try {
      if (kind === "copy") {
        if (typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard is unavailable");
        await navigator.clipboard.writeText(link);
      } else {
        if (typeof navigator.share !== "function" || (navigator.canShare && !navigator.canShare({ url: link }))) {
          throw new Error("System sharing is unavailable");
        }
        await navigator.share({ url: link });
      }
      if (active.current) setNotice(kind === "copy" ? labels.lyricLinkCopied : labels.lyricLinkShared);
    } catch (reason) {
      if (active.current) {
        if (reason instanceof DOMException && reason.name === "AbortError") setNotice(labels.lyricShareCancelled);
        else setError(labels.lyricShareFailed);
      }
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  return <section aria-label={labels.lyricLink} aria-busy={busy}>
    <p id={`${id}-notice`} className={styles.muted}>{labels.lyricLinkNotice}</p>
    <label htmlFor={`${id}-link`}>{labels.lyricLink}</label>
    <input id={`${id}-link`} value={link} readOnly dir="ltr" spellCheck={false}
      aria-describedby={`${id}-notice`} onFocus={event => event.currentTarget.select()} />
    {typeof navigator.clipboard?.writeText === "function" && <button className={styles.secondary} disabled={busy}
      onClick={() => void share("copy")}>{labels.copyLyricLink}</button>}
    {typeof navigator.share === "function" && <button className={styles.secondary} disabled={busy}
      onClick={() => void share("share")}>{labels.shareLyricLink}</button>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
