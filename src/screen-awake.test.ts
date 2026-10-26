import { expect, test, vi } from "vitest";
import { ScreenAwake } from "./screen-awake";

class Lease extends EventTarget {
  released = false;
  releases = 0;
  failure?: Error;
  unconfirmed = false;
  async release() {
    this.releases++;
    if (this.failure) throw this.failure;
    if (!this.unconfirmed) this.end();
  }
  end() { this.released = true; this.dispatchEvent(new Event("release")); }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
test("unsupported and initially off requests never acquire implicitly or fabricate a release", async () => {
  const unavailable = new ScreenAwake();
  await unavailable.start(); await unavailable.stop(); await unavailable.dispose();
  expect(unavailable.snapshot()).toEqual({ status: "unsupported", active: false, busy: false });
  const request = vi.fn(async () => new Lease()), available = new ScreenAwake(request);
  await available.stop();
  expect(available.snapshot()).toEqual({ status: "off", active: false, busy: false });
  expect(request).not.toHaveBeenCalled();
});
test("explicit acquisition is single-flight and reports actual release without automatically reacquiring", async () => {
  const pending = deferred<Lease>(), lease = new Lease(), request = vi.fn(() => pending.promise);
  const awake = new ScreenAwake(request), notified = vi.fn(), unsubscribe = awake.subscribe(notified);
  const started = awake.start(); await awake.start();
  expect(request).toHaveBeenCalledTimes(1);
  expect(awake.snapshot()).toEqual({ status: "pending", active: false, busy: true });
  pending.resolve(lease); await started;
  expect(awake.snapshot()).toEqual({ status: "active", active: true, busy: false });
  lease.end();
  expect(awake.snapshot()).toEqual({ status: "released", active: false, busy: false });
  expect(request).toHaveBeenCalledTimes(1);
  unsubscribe(); const count = notified.mock.calls.length;
  await awake.stop(); expect(notified).toHaveBeenCalledTimes(count);
});
test("request rejection is explicit, logged and retryable without a phantom active state", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const lease = new Lease(), request = vi.fn().mockRejectedValueOnce(new Error("Synthetic denied")).mockResolvedValueOnce(lease);
    const awake = new ScreenAwake(request);
    await awake.start();
    expect(awake.snapshot()).toEqual({ status: "failed", active: false, busy: false, error: "Synthetic denied" });
    expect(log).toHaveBeenCalledTimes(1);
    await awake.start(); expect(awake.snapshot().active).toBe(true);
    await awake.stop(); expect(lease.releases).toBe(1); expect(awake.snapshot().active).toBe(false);
  } finally { log.mockRestore(); }
});
test("late cancelled acquisition releases its exact sentinel and cannot overwrite a newer explicit request", async () => {
  const first = deferred<Lease>(), second = deferred<Lease>(), late = new Lease(), current = new Lease();
  let count = 0;
  const awake = new ScreenAwake(() => ++count === 1 ? first.promise : second.promise);
  const old = awake.start(); await awake.stop();
  const next = awake.start(); second.resolve(current); await next;
  first.resolve(late); await old;
  expect(late.releases).toBe(1); expect(current.releases).toBe(0);
  expect(awake.snapshot()).toEqual({ status: "active", active: true, busy: false });
  await awake.dispose(); expect(current.releases).toBe(1);
});
test("departure releases a pending acquisition rather than reactivating a disposed reader", async () => {
  const pending = deferred<Lease>(), lease = new Lease(), request = vi.fn(() => pending.promise), awake = new ScreenAwake(request);
  const started = awake.start(); await awake.dispose(); pending.resolve(lease); await started;
  expect(lease.releases).toBe(1);
  expect(awake.snapshot()).toEqual({ status: "released", active: false, busy: false });
  await awake.start(); expect(request).toHaveBeenCalledTimes(1);
});
test("release rejection and unconfirmed release retain actual ownership and support explicit retry", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const failure of [true, false]) {
      const lease = new Lease(), awake = new ScreenAwake(async () => lease);
      await awake.start(); lease.failure = failure ? new Error("Synthetic release failure") : undefined; lease.unconfirmed = !failure;
      await awake.stop();
      expect(awake.snapshot()).toMatchObject({ status: "failed", active: true, busy: false });
      lease.failure = undefined; lease.unconfirmed = false;
      await awake.stop(); expect(awake.snapshot()).toEqual({ status: "released", active: false, busy: false });
      expect(lease.releases).toBe(2);
    }
    expect(log).toHaveBeenCalledTimes(2);
  } finally { log.mockRestore(); }
});
test("overlapping departure signals share release work and late failure is logged without corrupting replacement state", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const lease = new Lease(), release = deferred<void>(), awake = new ScreenAwake(async () => lease);
    const original = vi.spyOn(lease, "release").mockImplementation(async () => { await release.promise; lease.end(); });
    await awake.start(); const first = awake.stop(), second = awake.dispose();
    expect(original).toHaveBeenCalledTimes(1);
    release.resolve(); await Promise.all([first, second]); expect(awake.snapshot().active).toBe(false);
    const pending = deferred<Lease>(), abandoned = new ScreenAwake(() => pending.promise), late = new Lease();
    late.failure = new Error("Synthetic abandoned release failure");
    const start = abandoned.start(); await abandoned.dispose(); const before = abandoned.snapshot();
    pending.resolve(late); await start;
    expect(abandoned.snapshot()).toBe(before); expect(log).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); }
});
