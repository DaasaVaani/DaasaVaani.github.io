import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type messages from "../shared/generated/web/ui.json";
import type { LyricItem } from "../shared/types/lyrics";
import type { FixtureItem } from "../shared/types/publication";
import type { Publication } from "./artifacts";
import { loadLyricCatalog, type LyricLibrary } from "./lyric-publication";
import { type ListRecord, type PersonalStore, referenceKey } from "./personal-model";
import type { PersonalReference } from "./list-transfer-types";
import { ListEntryView } from "./ListEntryView";
import { LyricText } from "./LyricText";
import { ReadingPreferences, type ReadingPreferencesProps } from "./ReadingPreferences";
import { Recite } from "./Recite";
import { browserDefaultPersonal } from "./personal";
import { personalMessage } from "./ListSave";
import { PersonalError } from "./personal-model";
import styles from "./App.module.css";

type Reading = { entryId: string } & (
  { status: "loading" | "cancelled" | "unavailable" | "pending" } |
  { status: "failed"; error: string } |
  { status: "ready"; item: LyricItem | FixtureItem }
);
export function ListRecite({ record, initialIndex, remember, labels, personal, publication, lyrics, onLyrics, opened, change, exit }: {
  record: ListRecord; initialIndex: number; labels: typeof messages.en; personal: PersonalStore;
  remember: (entryId: string, signal: AbortSignal) => Promise<void>;
  publication?: Publication; lyrics?: LyricLibrary; onLyrics: (library: LyricLibrary) => void;
  opened: (reference: PersonalReference, epoch: string | undefined) => void; change: ReadingPreferencesProps["change"]; exit: () => void;
}) {
  const [index, setIndex] = useState(initialIndex), [attempt, setAttempt] = useState(0);
  const [moving, setMoving] = useState(false), [movementError, setMovementError] = useState<{ index: number; message: string }>();
  const movement = useRef<AbortController | null>(null);
  const [reading, setReading] = useState<Reading>();
  const library = useRef(lyrics), cache = useRef(new Map<string, FixtureItem>());
  const controller = useRef<AbortController | null>(null);
  const position = useRef<HTMLHeadingElement>(null), focus = useRef(true);
  const entry = record.entries[index], current = reading?.entryId === entry?.id ? reading : undefined;
  useEffect(() => () => { movement.current?.abort(); }, []);
  useLayoutEffect(() => {
    if (!focus.current) return;
    focus.current = false;
    const frame = requestAnimationFrame(() => position.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [index]);
  useEffect(() => {
    if (!entry || entry.kind === "placeholder") return;
    const request = new AbortController();
    controller.current = request;
    setReading({ entryId: entry.id, status: "loading" });
    void (async () => {
      let item: LyricItem | FixtureItem;
      if (entry.kind === "lyric") {
        const available = library.current ?? await loadLyricCatalog(request.signal);
        request.signal.throwIfAborted();
        if (!library.current) { library.current = available; onLyrics(available); }
        if (!available.summary(entry.lyricId)) { setReading({ entryId: entry.id, status: "unavailable" }); return; }
        item = await available.read(entry.lyricId, request.signal);
      } else {
        if (!publication) { setReading({ entryId: entry.id, status: "pending" }); return; }
        if (!publication.summary(entry.videoId)) { setReading({ entryId: entry.id, status: "unavailable" }); return; }
        const key = referenceKey(entry);
        const cached = cache.current.get(key);
        item = cached ?? await publication.item(entry.videoId, request.signal);
        request.signal.throwIfAborted();
        if (!cached) cache.current.set(key, item);
      }
      request.signal.throwIfAborted();
      setReading({ entryId: entry.id, status: "ready", item });
      opened(entry.kind === "lyric" ? { kind: "lyric", lyricId: entry.lyricId }
        : { kind: "legacyVideo", videoId: entry.videoId }, personal.control.epoch);
    })().catch(reason => {
      if (!request.signal.aborted) setReading({ entryId: entry.id, status: "failed",
        error: reason instanceof Error ? reason.message : String(reason) });
    }).finally(() => { if (controller.current === request) controller.current = null; });
    return () => { request.abort(); if (controller.current === request) controller.current = null; };
  }, [entry, publication, attempt, onLyrics, opened]);
  const move = async (targetIndex: number) => {
    if (movement.current) return;
    const request = new AbortController();
    movement.current = request; setMoving(true); setMovementError(undefined);
    try {
      const target = record.entries[targetIndex];
      if (!target) throw new PersonalError("stale");
      await remember(target.id, request.signal);
      request.signal.throwIfAborted();
      focus.current = true; setIndex(targetIndex);
    } catch (reason) {
      if (!request.signal.aborted) setMovementError({ index: targetIndex, message: personalMessage(reason, labels) });
    } finally {
      if (movement.current === request) { movement.current = null; setMoving(false); }
    }
  };
  return <section className={styles.reader}>
    <Recite labels={labels} heading={<header className={styles.readerHeader}><h1>{record.name}</h1></header>}
      list={{ onExit: exit, navigation: <section aria-label={labels.reciteList} className={styles.recitationNavigation} aria-busy={moving}>
        {entry ? <h2 ref={position} tabIndex={-1} aria-live="polite">{labels.entryNumber
          .replace("{position}", String(index + 1)).replace("{total}", String(record.entries.length))}</h2>
          : <h2 ref={position} tabIndex={-1}>{labels.emptyRecitation}</h2>}
        <div>
          <button disabled={moving || index === 0 || !entry} onClick={() => void move(index - 1)}>{labels.previousRecitationEntry}</button>
          <button disabled={moving || !entry || index === record.entries.length - 1} onClick={() => void move(index + 1)}>{labels.nextRecitationEntry}</button>
        </div>
        {moving && <p role="status">{labels.recitationPositionSaving}</p>}
        {movementError && <><p role="alert">{movementError.message}</p>
          <button disabled={moving} onClick={() => void move(movementError.index)}>{labels.retry}</button></>}
        {entry && index === 0 && <p role="status">{labels.recitationStart}</p>}
        {entry && index === record.entries.length - 1 && <p role="status">{labels.recitationEnd}</p>}
      </section> }}
      controls={<ReadingPreferences labels={labels} personal={personal.personal ?? browserDefaultPersonal()} change={change} />}
      secondary={null}>
      {entry && <section aria-label={labels.recite} aria-busy={entry.kind !== "placeholder" && (!current || current.status === "loading")}>
        <ListEntryView entry={entry} labels={labels} publication={publication} lyrics={library.current} />
        {entry.kind !== "placeholder" && <>
          {(!current || current.status === "loading") && <><p role="status">{labels.loading}</p>
            <button onClick={() => {
              controller.current?.abort(); controller.current = null;
              setReading({ entryId: entry.id, status: "cancelled" });
            }}>{labels.cancel}</button></>}
          {current?.status === "cancelled" && <p role="status">{labels.loadingCancelled}</p>}
          {current?.status === "failed" && <p role="alert" className={styles.error}>{labels.error}: {current.error}</p>}
          {(current?.status === "failed" || current?.status === "cancelled") &&
            <button onClick={() => setAttempt(value => value + 1)}>{labels.retry}</button>}
          {current?.status === "ready" && <LyricText item={current.item} />}
        </>}
      </section>}
    </Recite>
  </section>;
}
