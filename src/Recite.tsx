import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import messages from "../shared/generated/web/ui.json";
import { ScreenAwake } from "./screen-awake";
import styles from "./App.module.css";

type Labels = typeof messages.en;
function ScreenAwakeControl({ labels }: { labels: Labels }) {
  const [awake] = useState(() => new ScreenAwake(isSecureContext && typeof navigator.wakeLock?.request === "function"
    ? () => navigator.wakeLock.request("screen") : undefined));
  const state = useSyncExternalStore(awake.subscribe, awake.snapshot), button = useRef<HTMLButtonElement>(null);
  const restore = useRef<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (state.busy || restore.current === undefined) return;
    const before = restore.current;
    restore.current = undefined;
    if (document.activeElement === document.body || document.activeElement === before) button.current?.focus({ preventScroll: true });
  }, [state.busy]);
  useEffect(() => {
    const background = () => { if (document.visibilityState !== "visible") void awake.stop(); };
    const leave = () => { void awake.stop(); };
    document.addEventListener("visibilitychange", background);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", background);
      window.removeEventListener("pagehide", leave);
      void awake.dispose();
    };
  }, [awake]);
  return <div>
    <button ref={button} className={styles.secondary} aria-pressed={state.active}
      disabled={state.busy || state.status === "unsupported"} onClick={() => {
        restore.current = document.activeElement;
        void (state.active ? awake.stop() : awake.start());
      }}>{labels.keepScreenAwake}</button>
    <p role={state.status === "failed" ? "alert" : "status"}>
      {state.status === "unsupported" ? labels.screenAwakeUnsupported
        : state.status === "pending" ? labels.screenAwakePending : state.status === "active" ? labels.screenAwakeActive
        : state.status === "released" ? labels.screenAwakeReleased : state.status === "failed" ? labels.screenAwakeFailed : labels.screenAwakeInactive}
      {state.error && <> {state.error}</>}
    </p>
  </div>;
}
export function Recite({ labels, heading, controls, children, secondary, list }: {
  labels: Labels; heading: ReactNode; controls: ReactNode; children: ReactNode; secondary: ReactNode;
  list?: { onExit: () => void; navigation: ReactNode };
}) {
  const [individual, setIndividual] = useState(false), [showControls, setShowControls] = useState(false);
  const active = list !== undefined || individual;
  const leave = () => { if (list) list.onExit(); else setIndividual(false); };
  const button = useRef<HTMLButtonElement>(null);
  const focused = active && !showControls;
  useEffect(() => {
    if (!active) return;
    const body = document.body, previous = body.getAttribute("data-recite");
    body.setAttribute("data-recite", focused ? "focused" : "controls");
    return () => {
      if (previous === null) body.removeAttribute("data-recite");
      else body.setAttribute("data-recite", previous);
    };
  }, [active, focused]);
  return <div onKeyDown={event => {
    if (focused && event.key === "Escape") {
      event.preventDefault(); leave(); if (!list) button.current?.focus({ preventScroll: true });
    }
  }}>
    {heading}
    <div>
      <button ref={button} aria-pressed={active} onClick={() => {
        setShowControls(false); if (list) leave(); else setIndividual(value => !value);
      }}>
        {active ? labels.exitRecite : labels.recite}
      </button>
      {active && <>
        <button className={styles.secondary} aria-expanded={showControls} onClick={() => setShowControls(value => !value)}>
          {showControls ? labels.hideReadingControls : labels.showReadingControls}
        </button>
        <p className={styles.muted}>{list ? labels.listReciteNotice : labels.reciteNotice}</p>
        <ScreenAwakeControl labels={labels} />
      </>}
    </div>
    {list?.navigation}
    <div hidden={focused}>{controls}</div>
    {children}
    <div hidden={focused}>{secondary}</div>
  </div>;
}
