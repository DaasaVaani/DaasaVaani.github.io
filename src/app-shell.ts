import { useEffect, useState } from "react";

interface ShellState { unsupported: boolean; updateAvailable: boolean; error: string }
export function useAppShell() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ShellState>({ unsupported: false, updateAvailable: false, error: "" });
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) {
      setState({ unsupported: true, updateAvailable: false, error: "" });
      return;
    }
    let stopped = false;
    let registration: ServiceWorkerRegistration | undefined;
    let updating = false;
    let lastChecked = 0;
    const workers = new Set<ServiceWorker>();
    const failed = (reason: unknown) => {
      if (!stopped) setState(current => ({ ...current, error: reason instanceof Error ? reason.message : String(reason) }));
    };
    const observe = () => {
      if (stopped || !registration) return;
      const updateAvailable = !!registration.active && !!registration.waiting;
      setState(current => ({ ...current, updateAvailable }));
      const worker = registration.installing;
      if (worker && !workers.has(worker)) {
        workers.add(worker);
        worker.addEventListener("statechange", changed);
      }
    };
    const changed = (event: Event) => {
      if (event.target instanceof ServiceWorker && ["redundant", "activated"].includes(event.target.state)) {
        event.target.removeEventListener("statechange", changed);
        workers.delete(event.target);
        if (event.target.state === "redundant") failed(new Error("The app-interface worker installation failed."));
      }
      observe();
    };
    const update = () => {
      const now = Date.now();
      if (!registration || updating || stopped || document.visibilityState !== "visible" ||
          now >= lastChecked && now - lastChecked < __WEB_CONFIG__.appShell.updateCheckIntervalMs) return;
      lastChecked = Date.now();
      updating = true;
      registration.update().then(() => {
        if (!stopped) setState(current => ({ ...current, error: "" }));
        observe();
      }).catch(failed).finally(() => { updating = false; });
    };
    const register = async () => {
      const workerUrl = new URL(__WEB_CONFIG__.appShell.workerFile, new URL(__WEB_CONFIG__.base, location.origin));
      const value = await navigator.serviceWorker.register(workerUrl, { scope: __WEB_CONFIG__.base, updateViaCache: "none" });
      if (stopped) return;
      registration = value;
      lastChecked = Date.now();
      setState(current => ({ ...current, unsupported: false, error: "" }));
      registration.addEventListener("updatefound", observe);
      observe();
    };
    void register().catch(failed);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      stopped = true;
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      registration?.removeEventListener("updatefound", observe);
      for (const worker of workers) worker.removeEventListener("statechange", changed);
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
