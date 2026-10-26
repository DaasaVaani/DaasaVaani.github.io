import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import messages from "../shared/generated/web/ui.json";
import type { Publication } from "./artifacts";
import type { LyricLibrary } from "./lyric-publication";
import type { PersonalReference } from "./list-transfer-types";
import { learningChoices, referenceKey, PersonalError,
  type LearningLabel, type PersonalStore, type Revision } from "./personal-model";
import { updateLearningLabel } from "./personal";
import { LyricPagination, useLyricPaging } from "./LyricPaging";
import styles from "./App.module.css";

type Labels = typeof messages.en;
function caption(labels: Labels, label: LearningLabel) {
  return label === "wantToLearn" ? labels.learningWantToLearn
    : label === "practising" ? labels.learningPractising : labels.learningComfortableReciting;
}
export function LearningControl({ labels, reference, label, revision }: {
  labels: Labels; reference: PersonalReference; label?: LearningLabel; revision: Revision;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const select = useRef<HTMLSelectElement>(null), restore = useRef<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (busy || restore.current === undefined) return;
    const before = restore.current, target = select.current;
    restore.current = undefined;
    if (target?.isConnected && !target.closest("[hidden]") &&
        (document.activeElement === document.body || document.activeElement === before)) target.focus({ preventScroll: true });
  }, [busy, label]);
  async function change(value: string) {
    setError(""); setSaved(false);
    try {
      const next = learningChoices.find(choice => choice === value);
      if (value !== "" && next === undefined) throw new PersonalError("invalid");
      if (next === label) return;
      restore.current = document.activeElement;
      setBusy(true);
      await updateLearningLabel(reference, next, revision);
      setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy} aria-busy={busy}>
    <legend>{labels.learningLabel}</legend>
    <select ref={select} aria-label={labels.learningLabel} value={label ?? ""} onChange={event => void change(event.target.value)}>
      <option value="">{labels.learningNone}</option>
      {learningChoices.map(choice => <option key={choice} value={choice}>{caption(labels, choice)}</option>)}
    </select>
    {saved && <p role="status">{labels.learningSaved}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </fieldset>;
}
export function Learning({ labels, personal, publication, lyrics }: {
  labels: Labels; personal: PersonalStore; publication?: Publication; lyrics?: LyricLibrary;
}) {
  const location = useLocation(), paging = useLyricPaging("learning-read");
  const heading = useRef<HTMLHeadingElement>(null), focused = useRef<HTMLElement | undefined>(undefined);
  useLayoutEffect(() => {
    if (location.pathname === "/learning" && focused.current && !focused.current.isConnected &&
        document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, [location.pathname, personal.learning, paging.query]);
  const entries = personal.learning.entries.filter(entry => !paging.query || entry.label === paging.query);
  const shown = entries.slice(0, paging.limit);
  const nextEntry = entries[shown.length];
  return <section hidden={location.pathname !== "/learning"} aria-label={labels.learning}
    onFocusCapture={event => { if (event.target instanceof HTMLElement) focused.current = event.target; }}>
    <h1 ref={heading} tabIndex={-1}>{labels.learning}</h1>
    <p>{labels.learningNotice}</p><p>{labels.learningPracticeUnavailable}</p>
    <label>{labels.learningFilter}<select value={paging.query} onChange={event => paging.setQuery(event.target.value)}>
      <option value="">{labels.learningAll}</option>
      {learningChoices.map(choice => <option key={choice} value={choice}>{caption(labels, choice)}</option>)}
    </select></label>
    <div id={paging.resultsId} className={styles.grid}>{shown.map(entry => {
      const reference: PersonalReference = entry.kind === "lyric" ? { kind: entry.kind, lyricId: entry.lyricId }
        : { kind: entry.kind, videoId: entry.videoId };
      const key = referenceKey(reference);
      const item = reference.kind === "lyric" ? lyrics?.summary(reference.lyricId) : publication?.summary(reference.videoId);
      const pending = reference.kind === "lyric" ? !lyrics : !publication;
      const path = reference.kind === "lyric" ? `/lyrics/${reference.lyricId}` : item ? `/item/${encodeURIComponent(reference.videoId)}` : undefined;
      return <article className={styles.card} key={key}>
        <p>{reference.kind === "lyric" ? labels.lyricReference : labels.legacyReference}</p>
        {item ? <h2 lang="kn">{item.title}</h2> : <p>{pending ? labels.referencePending : labels.lyricsUnavailable}</p>}
        <code>{reference.kind === "lyric" ? reference.lyricId : reference.videoId}</code>
        <LearningControl labels={labels} reference={reference} label={entry.label} revision={personal.control} />
        {path && <Link id={paging.readId(key)} className={styles.readLink} to={path} state={{ browseFrom: "/learning" }}
          onClick={event => event.currentTarget.focus({ preventScroll: true })}>{labels.open}</Link>}
      </article>;
    })}</div>
    {!entries.length && <p role="status">{personal.learning.entries.length ? labels.noResults : labels.emptyLearning}</p>}
    <LyricPagination count={entries.length} nextId={nextEntry && referenceKey(nextEntry)} paging={paging} labels={labels} />
  </section>;
}
