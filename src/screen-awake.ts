export interface ScreenLease extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}
export interface ScreenAwakeState {
  status: "unsupported" | "off" | "pending" | "active" | "released" | "failed";
  active: boolean;
  busy: boolean;
  error?: string;
}
export class ScreenAwake {
  private state: ScreenAwakeState;
  private readonly listeners = new Set<() => void>();
  private lease?: ScreenLease;
  private readonly releases = new WeakMap<ScreenLease, Promise<void>>();
  private generation = 0;
  private disposed = false;
  constructor(private readonly request?: () => Promise<ScreenLease>) {
    this.state = { status: request ? "off" : "unsupported", active: false, busy: false };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(state: ScreenAwakeState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private fail(reason: unknown, current = true) {
    console.error("Screen-awake request failed", reason);
    if (current) this.update({ status: "failed", active: !!this.lease && !this.lease.released, busy: false,
      error: reason instanceof Error ? reason.message : String(reason) });
  }
  private async release(lease: ScreenLease) {
    let pending = this.releases.get(lease);
    if (!pending) {
      pending = (async () => {
        await lease.release();
        if (!lease.released) throw new Error("Screen-awake release was not confirmed");
      })();
      this.releases.set(lease, pending);
    }
    try { await pending; }
    finally { if (this.releases.get(lease) === pending) this.releases.delete(lease); }
  }
  async start() {
    if (!this.request || this.disposed || this.state.busy || this.lease) return;
    const generation = ++this.generation;
    this.update({ status: "pending", active: false, busy: true });
    try {
      const lease = await this.request();
      if (this.disposed || generation !== this.generation) {
        if (!lease.released) await this.release(lease);
        return;
      }
      if (lease.released) { this.update({ status: "released", active: false, busy: false }); return; }
      this.lease = lease;
      lease.addEventListener("release", () => {
        if (this.lease !== lease) return;
        this.lease = undefined;
        this.update({ status: "released", active: false, busy: false });
      }, { once: true });
      this.update({ status: "active", active: true, busy: false });
    } catch (reason) { this.fail(reason, !this.disposed && generation === this.generation); }
  }
  async stop() {
    const generation = ++this.generation, lease = this.lease;
    if (!lease) {
      if (this.state.status === "pending") this.update({ status: "released", active: false, busy: false });
      return;
    }
    this.update({ ...this.state, busy: true });
    try {
      if (!lease.released) await this.release(lease);
      if (generation === this.generation) {
        this.lease = undefined;
        this.update({ status: "released", active: false, busy: false });
      }
    } catch (reason) { this.fail(reason, generation === this.generation); }
  }
  async dispose() { this.disposed = true; await this.stop(); }
}
