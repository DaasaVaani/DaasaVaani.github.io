import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

interface Position { x: number; y: number; focus: WeakRef<HTMLElement> | null }

export function NavigationContinuity() {
  const location = useLocation();
  const entries = useRef(new Map<string, Position>());
  const browsing = useRef(new Map<string, Position>());
  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => { history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => {
    const isBrowsing = location.pathname === "/" || location.pathname === "/favorites" || location.pathname === "/lists" ||
      location.pathname === "/lyrics" || location.pathname === "/recent" || location.pathname === "/learning";
    const position = entries.current.get(location.key) ??
      (isBrowsing ? browsing.current.get(location.pathname) : undefined);
    let restored = false;
    function save() {
      if (!restored) return;
      const value = { x: window.scrollX, y: window.scrollY,
        focus: document.activeElement instanceof HTMLElement ? new WeakRef(document.activeElement) : null };
      entries.current.set(location.key, value);
      if (isBrowsing) browsing.current.set(location.pathname, value);
    }
    const frame = requestAnimationFrame(() => {
      const target = position?.focus?.deref();
      if (target?.isConnected && !target.closest("[hidden]")) target.focus({ preventScroll: true });
      else document.getElementById("content")?.focus({ preventScroll: true });
      window.scrollTo(position?.x ?? 0, position?.y ?? 0);
      restored = true;
      save();
    });
    window.addEventListener("scroll", save);
    document.addEventListener("focusin", save);
    document.addEventListener("click", save, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
      document.removeEventListener("focusin", save);
      document.removeEventListener("click", save, true);
    };
  }, [location.key, location.pathname]);
  return null;
}
