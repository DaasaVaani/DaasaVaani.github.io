import type { Page } from "@playwright/test";

declare global {
  interface Window {
    reciteWakeTest: {
      mode: "normal" | "deny" | "release-fail" | "unconfirmed" | "pending";
      requests: number; releases: number; active: boolean; hidden: boolean;
      settle: () => void; end: () => void;
    };
  }
}
export async function installScreenAwakeAdapter(page: Page) {
  await page.addInitScript(() => {
    const state: Window["reciteWakeTest"] = { mode: "normal", requests: 0, releases: 0, active: false, hidden: false,
      settle: () => { throw new Error("No pending synthetic request"); }, end: () => { throw new Error("No synthetic sentinel"); } };
    window.reciteWakeTest = state;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state.hidden ? "hidden" : "visible" });
    class Sentinel extends EventTarget {
      released = false;
      async release() {
        state.releases++;
        if (state.mode === "release-fail") throw new DOMException("Synthetic release denial", "NotAllowedError");
        if (state.mode === "unconfirmed") return;
        this.end();
      }
      end() { this.released = true; state.active = false; this.dispatchEvent(new Event("release")); }
    }
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async (type: string) => {
      if (type !== "screen") throw new Error("Unexpected wake request type");
      state.requests++;
      if (state.mode === "deny") throw new DOMException("Synthetic request denial", "NotAllowedError");
      if (state.mode === "pending") await new Promise<void>(resolve => { state.settle = resolve; });
      const sentinel = new Sentinel(); state.active = true; state.end = () => sentinel.end(); return sentinel;
    } } });
  });
}
