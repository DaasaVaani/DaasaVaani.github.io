import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import messages from "../shared/generated/web/ui.json";
import { loadLyricCatalog, type LyricLibrary } from "./lyric-publication";
import type { LyricItem } from "../shared/types/lyrics";
import { hasFavorite, learningLabelFor, referenceKey, type PersonalStore } from "./personal-model";
import { readStore } from "./personal";
import type { Publication } from "./artifacts";
import type { PersonalReference } from "./list-transfer-types";
import { AddToList } from "./AddToList";
import { ReadingPreferences, type ReadingPreferencesProps } from "./ReadingPreferences";
import { LearningControl } from "./Learning";
import { Recite } from "./Recite";
import { LyricText } from "./LyricText";
import { LyricPagination, useLyricPaging } from "./LyricPaging";
import styles from "./App.module.css";

type Labels = typeof messages.en;
function AnotherLyric({ publication, labels, excludedId, reading = false }: {
  publication: LyricLibrary; labels: Labels; excludedId?: string; reading?: boolean;
}) {
  const navigate = useNavigate(), location = useLocation(), notice = useId();
  const [error, setError] = useState("");
  const available = publication.catalog.some(summary => summary.lyricId !== excludedId);
  return <section>
    <p id={notice} className={styles.muted}>{labels.anotherLyricNotice}</p>
    <button disabled={!available} aria-describedby={notice} onClick={() => {
      setError("");
      try {
        const chosen = publication.chooseAnother(excludedId);
        if (!chosen) { setError(labels.noAnotherLyric); return; }
        const state: unknown = location.state;
        navigate(`/lyrics/${chosen.lyricId}`, { replace: reading, state: reading ? state : { browseFrom: "/lyrics" } });
      } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    }}>{labels.showAnotherLyric}</button>
    {!available && <p role="status">{labels.noAnotherLyric}</p>}
    {error && <p role="alert" className={styles.error}>{labels.error}: {error}</p>}
  </section>;
}
function LyricReader({ publication, labels, personal, preferences, change, toggle, opened }: {
  publication: LyricLibrary; labels: Labels; personal?: PersonalStore; toggle: (reference: PersonalReference) => void;
  preferences: ReadingPreferencesProps["personal"]; change: ReadingPreferencesProps["change"];
  opened: (reference: PersonalReference, epoch: string | undefined) => void;
}) {
  const { id } = useParams();
  const location = useLocation(), navigate = useNavigate();
  const state: unknown = location.state;
  const origin = state !== null && typeof state === "object" && "browseFrom" in state ? state.browseFrom : undefined;
  const fromBrowsing = origin === "/lyrics" || origin === "/lists" || origin === "/favorites" || origin === "/recent" || origin === "/learning";
  const [loaded, setLoaded] = useState<LyricItem>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [cancelled, setCancelled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const [readingEpoch, setReadingEpoch] = useState<{ id: string | undefined; epoch: string }>();
  const known = id ? publication.summary(id) : undefined;
  const item = !cancelled && id ? publication.item(id) ?? (loaded?.lyricId === id ? loaded : undefined) : undefined;
  const reference: PersonalReference | undefined = item && { kind: "lyric", lyricId: item.lyricId };
  const favorite = reference && personal?.personal ? hasFavorite(personal.personal, reference) : false;
  useEffect(() => {
    const request = new AbortController();
    setReadingEpoch(undefined);
    setError(""); setCancelled(false);
    if (personal) setReadingEpoch({ id, epoch: personal.control.epoch });
    else void readStore().then(state => {
      if (!request.signal.aborted) setReadingEpoch({ id, epoch: state.control.epoch });
    }).catch(reason => {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });
    if (!id || !publication.summary(id) || publication.item(id)) {
      setBusy(false); return () => request.abort();
    }
    controller.current = request; setBusy(true);
    void publication.read(id, request.signal).then(value => {
      if (!request.signal.aborted) setLoaded(value);
    }).catch(reason => {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (controller.current === request) { controller.current = null; setBusy(false); }
    });
    return () => { request.abort(); if (controller.current === request) controller.current = null; };
  }, [id, publication, attempt]);
  useEffect(() => {
    if (item && readingEpoch && readingEpoch.id === id) opened({ kind: "lyric", lyricId: item.lyricId }, readingEpoch.epoch);
  }, [item, opened, readingEpoch, id]);
  return <section className={styles.reader}>
    {item && error && <p role="alert" className={styles.error}>{labels.error}: {error}</p>}
    <Link to={fromBrowsing ? origin : "/lyrics"} className={styles.back} onClick={event => {
      if (fromBrowsing && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); navigate(-1);
      }
    }}>← {origin === "/lists" ? labels.backToList : origin === "/favorites" ? labels.favorites
      : origin === "/recent" ? labels.recentHistory : origin === "/learning" ? labels.learning : labels.lyricBack}</Link>
    {!known ? <p role="alert">{labels.lyricsUnavailable}</p> : !item ? <>
      {error ? <p role="alert" className={styles.error}>{labels.error}: {error}</p>
        : <p role="status">{cancelled ? labels.loadingCancelled : labels.loading}</p>}
      {busy ? <button onClick={() => {
        controller.current?.abort(); controller.current = null; setBusy(false); setCancelled(true);
      }}>{labels.cancel}</button> : <button onClick={() => setAttempt(value => value + 1)}>{labels.retry}</button>}
    </> : <Recite key={`${item.lyricId}:${location.key}`} labels={labels}
      heading={<header className={styles.readerHeader}><h1 lang="kn">{item.title}</h1></header>}
      controls={<>
        {personal && reference && <button className={styles.secondary} aria-pressed={favorite} onClick={() => toggle(reference)}>
          {favorite ? labels.removeFavorite : labels.addFavorite}
        </button>}
      <AnotherLyric publication={publication} labels={labels} excludedId={item.lyricId} reading />
      {personal && <ReadingPreferences labels={labels} personal={preferences} change={change} />}
      {personal && reference && <LearningControl key={referenceKey(reference)} labels={labels} reference={reference}
        label={learningLabelFor(personal.learning, reference)} revision={personal.control} />}
      </>}
      secondary={<><p className={styles.muted}>{labels.lyricNoMedia}</p>
        {personal && reference ? <AddToList key={item.lyricId} labels={labels} personal={personal} reference={reference} />
          : <p role="status">{labels.personalUnavailable}</p>}</>}>
      <LyricText item={item} />
    </Recite>}
  </section>;
}
export function ReferenceFavorites({ labels, personal, publication, legacyPublication, toggle }: {
  labels: Labels; personal: PersonalStore; publication?: LyricLibrary; legacyPublication?: Publication;
  toggle: (reference: PersonalReference) => void;
}) {
  const location = useLocation();
  const paging = useLyricPaging("lyric-favorite-read");
  const restoreFocus = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (restoreFocus.current) {
      (heading.current ?? document.getElementById("favorites-title"))?.focus();
      restoreFocus.current = false;
    }
  }, [personal.personal?.favorites]);
  const favorites = personal.personal?.favorites ?? [];
  const groups = [
    { kind: "lyric", label: labels.ownerLyrics, pending: !publication, entries: favorites.filter(reference => reference.kind === "lyric") },
    { kind: "legacyVideo", label: labels.legacyReference, pending: !legacyPublication,
      entries: favorites.filter(reference => reference.kind === "legacyVideo" && !legacyPublication?.summary(reference.videoId)) },
  ].filter(group => group.entries.length);
  return <div hidden={location.pathname !== "/favorites"}>{groups.map((group, index) => {
    const entries = group.kind === "lyric" ? group.entries.filter(reference => reference.kind === "lyric" &&
      (!paging.query || publication?.summary(reference.lyricId)?.title.includes(paging.query))) : group.entries;
    const shown = group.kind === "lyric" ? entries.slice(0, paging.limit) : entries;
    const next = entries[paging.limit];
    return <section key={group.kind} aria-label={group.label}>
    <h2 tabIndex={-1} ref={index === 0 ? heading : undefined}>{group.label}</h2>
    {group.kind === "lyric" && <p>{publication ? labels.lyricOnlineLimits : labels.lyricOnlineCatalogPending}</p>}
    {group.kind === "lyric" && publication && <label>{labels.lyricTitleFilter}
      <input type="search" value={paging.query} onChange={event => paging.setQuery(event.target.value)} />
    </label>}
    <div id={group.kind === "lyric" ? paging.resultsId : undefined} className={styles.grid}>{shown.map(reference => {
      const item = reference.kind === "lyric" ? publication?.summary(reference.lyricId) : undefined;
      return <article className={styles.card} key={referenceKey(reference)}>
        {item ? <h3 lang="kn">{item.title}</h3> : <p>{group.pending ? labels.referencePending : labels.lyricsUnavailable}</p>}
        <code>{reference.kind === "lyric" ? reference.lyricId : reference.videoId}</code>
        {reference.kind === "lyric" && <Link id={paging.readId(reference.lyricId)} className={styles.readLink}
          to={`/lyrics/${reference.lyricId}`} state={{ browseFrom: "/favorites" }}
          onClick={event => event.currentTarget.focus({ preventScroll: true })}>{labels.open}</Link>}
        <button className={styles.secondary} onClick={() => { restoreFocus.current = true; toggle(reference); }}>{labels.removeFavorite}</button>
      </article>;
    })}</div>
    {!entries.length && <p role="status">{labels.noResults}</p>}
    {group.kind === "lyric" && <LyricPagination count={entries.length} nextId={next?.kind === "lyric" ? next.lyricId : undefined}
      paging={paging} labels={labels} />}
  </section>;
  })}</div>;
}
export function Lyrics({ labels, publication, onPrepared, personal, preferences, change, toggle, opened }: {
  labels: Labels; publication?: LyricLibrary; onPrepared: (publication: LyricLibrary) => void;
  personal?: PersonalStore; toggle: (reference: PersonalReference) => void;
  preferences: ReadingPreferencesProps["personal"]; change: ReadingPreferencesProps["change"];
  opened: (reference: PersonalReference, epoch: string | undefined) => void;
}) {
  const location = useLocation();
  const active = /^\/lyrics(?:\/|$)/u.test(location.pathname);
  const catalogActive = /^\/lyrics\/?$/u.test(location.pathname);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false), [attempt, setAttempt] = useState(0);
  const paging = useLyricPaging("lyric-read");
  const controller = useRef<AbortController | null>(null);
  const lastOpened = useRef<{ publication: LyricLibrary; lyricId: string } | undefined>(undefined);
  const rememberOpened = useCallback((reference: PersonalReference, epoch: string | undefined) => {
    if (reference.kind === "lyric" && publication?.summary(reference.lyricId)) {
      lastOpened.current = { publication, lyricId: reference.lyricId };
    }
    opened(reference, epoch);
  }, [opened, publication]);
  useEffect(() => {
    if (!active || publication) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setError(""); setCancelled(false);
    void loadLyricCatalog(request.signal).then(value => {
      if (controller.current === request && !request.signal.aborted) onPrepared(value);
    }).catch(reason => {
      if (controller.current === request && !request.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (controller.current === request) { controller.current = null; setBusy(false); }
    });
    return () => { request.abort(); if (controller.current === request) controller.current = null; };
  }, [active, publication, onPrepared, attempt]);
  const entries = publication?.catalog.filter(entry => entry.title.includes(paging.query)) ?? [];
  const shown = entries.slice(0, paging.limit);
  return <section hidden={!active}>
    <aside className={styles.notice}><p>{labels.lyricPreviewNotice}</p><p>{labels.lyricOnlineLimits}</p></aside>
    {!publication && <section className={styles.reader}>
      <h1>{labels.ownerLyrics}</h1>
      {error && <p className={styles.error} role="alert">{labels.error}: {error}</p>}
      {!error && <p role="status">{cancelled ? labels.loadingCancelled : labels.loading}</p>}
      {busy ? <button onClick={() => {
        controller.current?.abort(); controller.current = null; setBusy(false); setCancelled(true);
      }}>{labels.cancel}</button> : <button onClick={() => setAttempt(value => value + 1)}>{labels.retry}</button>}
    </section>}
    {publication && <>
      <div hidden={!catalogActive}>
        <section className={styles.hero}><h1>{labels.ownerLyrics}<span className={styles.count}>{publication.catalog.length}</span></h1>
          <label>{labels.lyricTitleFilter}<input type="search" value={paging.query} onChange={event => paging.setQuery(event.target.value)} /></label>
          <AnotherLyric publication={publication} labels={labels}
            excludedId={lastOpened.current?.publication === publication ? lastOpened.current.lyricId : undefined} />
        </section>
        <section id={paging.resultsId} className={styles.grid} aria-label={labels.ownerLyrics}>
          {shown.map(entry => <article className={styles.card} key={entry.lyricId}>
            <h2 lang="kn">{entry.title}</h2><Link id={paging.readId(entry.lyricId)} className={styles.readLink}
              to={`/lyrics/${entry.lyricId}`} state={{ browseFrom: "/lyrics" }}>{labels.open}</Link>
          </article>)}
        </section>
        {!entries.length && <p role="status">{labels.noResults}</p>}
        <LyricPagination count={entries.length} nextId={entries[shown.length]?.lyricId} paging={paging} labels={labels} />
      </div>
      <Routes>
        <Route path="/lyrics" element={null} />
        <Route path="/lyrics/:id" element={<LyricReader publication={publication} labels={labels} personal={personal} preferences={preferences} change={change} toggle={toggle} opened={rememberOpened} />} />
        <Route path="/lyrics/*" element={<p role="alert">{labels.unknownRoute}</p>} />
        <Route path="*" element={null} />
      </Routes>
    </>}
  </section>;
}
