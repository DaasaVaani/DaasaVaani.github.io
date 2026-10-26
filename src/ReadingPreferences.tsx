import { useId, useLayoutEffect, useRef, useState } from "react";
import messages from "../shared/generated/web/ui.json";
import { adjustFontSize, setReadingDensity, type Personal } from "./personal-model";
import styles from "./App.module.css";

export interface ReadingPreferencesProps {
  labels: typeof messages.en; personal: Personal;
  change: (mutator: (personal: Personal) => Personal) => Promise<void>;
}
export function ReadingPreferences({ labels, personal, change }: ReadingPreferencesProps) {
  const id = useId(), [busy, setBusy] = useState(false);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const restoreFocus = useRef<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (busy || restoreFocus.current === undefined) return;
    const before = restoreFocus.current;
    restoreFocus.current = undefined;
    if (!before || !fieldset.current?.contains(before) || fieldset.current.closest("[hidden]")) return;
    const target = before.matches(":disabled") ? fieldset.current.querySelector<HTMLButtonElement>("button:not(:disabled)") : before;
    if (target instanceof HTMLElement && (document.activeElement === document.body || document.activeElement === before)) {
      target.focus({ preventScroll: true });
    }
  }, [busy, personal.fontSize, personal.density]);
  async function update(mutator: (personal: Personal) => Personal) {
    restoreFocus.current = document.activeElement;
    setBusy(true);
    try { await change(mutator); }
    finally { setBusy(false); }
  }
  return <fieldset ref={fieldset} aria-label={labels.readingPreferences} aria-busy={busy}>
    <legend>{labels.readingPreferences}</legend>
    <div role="group" aria-label={labels.lyricFontSize}>
      <button className={styles.secondary} aria-label={labels.decreaseLyricFontSize} aria-describedby={id}
        disabled={busy || personal.fontSize <= __WEB_CONFIG__.readerFontSizeMin}
        onClick={() => void update(value => adjustFontSize(value, -1))}>A-</button>
      <span id={id} aria-live="polite" aria-atomic="true">
        {labels.fontSizeValue.replace("{size}", String(personal.fontSize)).replace("{unit}", "px")}
      </span>
      <button className={styles.secondary} aria-label={labels.increaseLyricFontSize} aria-describedby={id}
        disabled={busy || personal.fontSize >= __WEB_CONFIG__.readerFontSizeMax}
        onClick={() => void update(value => adjustFontSize(value, 1))}>A+</button>
    </div>
    <label>{labels.readingDensity}<select value={personal.density} disabled={busy} onChange={event => {
      const density = event.currentTarget.value;
      void update(value => setReadingDensity(value, density));
    }}>
      {__WEB_CONFIG__.readingDensities.map(density => <option key={density} value={density}>
        {density === "compact" ? labels.densityCompact : density === "normal" ? labels.densityNormal : labels.densityRelaxed}
      </option>)}
    </select></label>
  </fieldset>;
}
