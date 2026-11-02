import { useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import messages from "../shared/generated/web/ui.json";
import { browserDefaultPersonal, saveFirstUse } from "./personal";
import type { Personal, PersonalStore, Revision } from "./personal-model";
import { ReadingPreferences } from "./ReadingPreferences";
import styles from "./App.module.css";

type Labels = typeof messages.en;
export function FirstUse({ store, labels }: { store: PersonalStore; labels: Labels }) {
  const { pathname } = useLocation(), id = useId();
  const section = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<{ personal: Personal; expected: Revision }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [notice, setNotice] = useState<"firstUseSaved" | "firstUseSkipped">();
  const status = store.control.setupStatus;
  const inSettings = pathname === "/settings";
  if (!inSettings && status !== "pending" && !draft) return null;
  const previewLabels = draft ? messages[draft.personal.language] : labels;
  async function finish(skipped: boolean) {
    const active = document.activeElement;
    setBusy(true); setError(false); setNotice(undefined);
    try {
      await saveFirstUse(skipped ? "skipped" : "completed", skipped ? undefined : draft?.personal,
        draft?.expected ?? store.control);
      setDraft(undefined);
      setNotice(skipped ? "firstUseSkipped" : "firstUseSaved");
      if (!inSettings && active instanceof HTMLElement && section.current?.contains(active) &&
          (document.activeElement === active || document.activeElement === document.body)) {
        document.getElementById("content")?.focus({ preventScroll: true });
      }
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <section ref={section} lang={draft?.personal.language} className={styles.notice} aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h2 id={`${id}-title`}>{previewLabels.firstUseTitle}</h2>
    <p>{previewLabels.firstUseNotice}</p>
    <p>{previewLabels.firstUseLimits}</p>
    <p>{previewLabels.firstUseOffline}</p>
    {inSettings && <p>{labels.firstUseStatus}: {status === "pending" ? labels.firstUsePending
      : status === "completed" ? labels.firstUseCompleted : labels.firstUseSkippedStatus}</p>}
    {error && <p role="alert" className={styles.error}>{previewLabels.firstUseFailed}</p>}
    {notice && <p role="status">{labels[notice]}</p>}
    {!draft ? <>
      <button disabled={busy} onClick={() => {
        setError(false); setNotice(undefined);
        setDraft({ personal: structuredClone(store.personal ?? browserDefaultPersonal()), expected: store.control });
      }}>{labels.firstUseStart}</button>
      {status === "pending" && <button className={styles.secondary} disabled={busy}
        onClick={() => void finish(true)}>{labels.firstUseSkip}</button>}
    </> : <form onSubmit={event => { event.preventDefault(); void finish(false); }}>
      <fieldset disabled={busy}><legend>{previewLabels.language}</legend>
        {__WEB_CONFIG__.uiLanguages.map(language => <button key={language} type="button" className={styles.secondary}
          aria-pressed={draft.personal.language === language}
          onClick={() => setDraft(value => value && ({ ...value, personal: { ...value.personal, language } }))}>
          {messages[language].languageName}</button>)}
      </fieldset>
      <fieldset disabled={busy}><legend>{previewLabels.appearance}</legend>
        {__WEB_CONFIG__.uiThemes.map(theme => <button key={theme} type="button" className={styles.secondary}
          aria-pressed={draft.personal.theme === theme}
          onClick={() => setDraft(value => value && ({ ...value, personal: { ...value.personal, theme } }))}>
          {theme === "device" ? previewLabels.followDevice : previewLabels[theme]}</button>)}
      </fieldset>
      <fieldset disabled={busy}>
        <ReadingPreferences labels={previewLabels} personal={draft.personal} change={async change => {
          setDraft(value => value && ({ ...value, personal: change(value.personal) }));
        }} />
      </fieldset>
      <button type="submit" disabled={busy}>{previewLabels.firstUseSave}</button>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => {
        setDraft(undefined); setError(false); setNotice(undefined);
      }}>{previewLabels.firstUseCancel}</button>
      {status === "pending" && <button type="button" className={styles.secondary} disabled={busy}
        onClick={() => void finish(true)}>{previewLabels.firstUseSkip}</button>}
    </form>}
  </section>;
}
