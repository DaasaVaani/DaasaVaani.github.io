import { expect, test } from "vitest";
import { inspectSnapshot, resumeSnapshot, type SnapshotTransferLimits } from "./snapshot-validation";
import { bundledSnapshotFixture, snapshotFixture, snapshotLimits } from "../tests/snapshot-fixture";

function limits(): SnapshotTransferLimits {
  return { maxBundleMembers: 100, maxBundleEncodedBytes: 32 * 1024 * 1024,
    maxExtraBytes: 8 * 1024 * 1024, maxExtraPercent: 25, maxTransferEncodedBytes: 131072 };
}
function read(fixture: ReturnType<typeof snapshotFixture>) {
  return async (hash: string) => {
    const bytes = fixture.objects[hash];
    if (!bytes) throw new Error("Missing synthetic object");
    return new Uint8Array(bytes);
  };
}
async function prepare() {
  const fixture = bundledSnapshotFixture();
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read(fixture), snapshotLimits());
  const verified = candidate.metadataObjects().map(object => object.sha256);
  return { fixture, candidate, verified };
}
test("admitted transfer planning covers every missing original once without remotely requesting local descriptor evidence", async () => {
  const { fixture, candidate, verified } = await prepare();
  const result = candidate.transferPlan(verified, limits());
  expect(result.plan.requests.map(request => request.kind)).toEqual(["bundle", "bundle"]);
  const covered = result.plan.requests.flatMap(request => request.covers).sort();
  expect(covered).toEqual(fixture.manifest.catalog.map(entry => entry.item).sort());
  expect(new Set(covered).size).toBe(covered.length);
  expect(result.plan.requests.some(request => request.sha256 === fixture.descriptorHash)).toBe(false);
  expect(covered).not.toContain(fixture.descriptorHash);
  expect(result.plan.savedCostBytes).toBeGreaterThan(0);
  expect(result.excludedBundles).toEqual([]);
});
test("oversized optional bundles are reported explicitly while eligible bundles and individual objects remain usable", async () => {
  const { fixture, candidate, verified } = await prepare();
  const entries = Object.entries(fixture.bundles).sort((a, b) => a[1].encodedBytes - b[1].encodedBytes);
  const small = entries[0], large = entries[1];
  if (!small || !large || small[1].encodedBytes === large[1].encodedBytes) throw new Error("Distinct synthetic bundle sizes required");
  const result = candidate.transferPlan(verified, { ...limits(), maxBundleEncodedBytes: small[1].encodedBytes });
  expect(result.excludedBundles).toEqual([{ sha256: large[0], limits: ["maxBundleEncodedBytes"] }]);
  expect(result.plan.requests.filter(request => request.kind === "bundle").map(request => request.sha256)).toEqual([small[0]]);
  expect(result.plan.requests.filter(request => request.kind === "object").map(request => request.sha256).sort())
    .toEqual(large[1].members);
  const below = candidate.transferPlan(verified, { ...limits(), maxBundleEncodedBytes: small[1].encodedBytes - 1 });
  expect(below.plan.requests.every(request => request.kind === "object")).toBe(true);
  expect(below.excludedBundles).toHaveLength(2);
});
test("member and encoded exclusions are deterministic, complete and fall back to original objects without raising limits", async () => {
  const { candidate, verified } = await prepare();
  const result = candidate.transferPlan(verified, { ...limits(), maxBundleMembers: 1, maxBundleEncodedBytes: 1 });
  expect(result.excludedBundles).toEqual(["a", "b"].map(letter => ({
    sha256: letter.repeat(64), limits: ["maxBundleMembers", "maxBundleEncodedBytes"],
  })));
  expect(result.plan.requests).toHaveLength(4);
  expect(result.plan.requests.every(request => request.kind === "object")).toBe(true);
  const exact = candidate.transferPlan(verified, { ...limits(), maxBundleMembers: 2 });
  expect(exact.plan.requests.every(request => request.kind === "bundle")).toBe(true);
  const below = candidate.transferPlan(verified, { ...limits(), maxBundleMembers: 1 });
  expect(below.excludedBundles.every(bundle => bundle.limits.join(",") === "maxBundleMembers")).toBe(true);
});
test("trusted extra allowances are capped and reported without changing the published request-cost weight", async () => {
  const { fixture, candidate, verified } = await prepare();
  const result = candidate.transferPlan(verified, { ...limits(), maxExtraBytes: 0, maxExtraPercent: 0 });
  expect(result.plan.requests.every(request => request.kind === "object")).toBe(true);
  expect(result.plan.extraBudgetBytes).toBe(0);
  expect(result.effectivePolicy.requestCostBytes).toBe(fixture.policy.transferPlanning.requestCostBytes);
  expect(result.adjustments).toContainEqual({ field: "maxExtraBytes", published: fixture.policy.transferPlanning.maxExtraBytes, effective: 0 });
  expect(result.adjustments).toContainEqual({ field: "maxExtraPercent", published: fixture.policy.transferPlanning.maxExtraPercent, effective: 0 });
});
test("total transfer equality selects bundles and one byte less safely replans rather than exceeding the budget", async () => {
  const { candidate, verified } = await prepare(), selected = candidate.transferPlan(verified, limits());
  const exact = candidate.transferPlan(verified, { ...limits(), maxTransferEncodedBytes: selected.plan.transferEncodedBytes });
  expect(exact.plan.requests).toEqual(selected.plan.requests);
  const smaller = candidate.transferPlan(verified, { ...limits(), maxTransferEncodedBytes: selected.plan.transferEncodedBytes - 1 });
  expect(smaller.plan.transferEncodedBytes).toBeLessThanOrEqual(selected.plan.transferEncodedBytes - 1);
  expect(smaller.plan.requests.some(request => request.kind === "object")).toBe(true);
  expect(smaller.plan.requests.flatMap(request => request.covers).sort()).toEqual(selected.plan.requests.flatMap(request => request.covers).sort());
  await expect(Promise.resolve().then(() => candidate.transferPlan(verified, {
    ...limits(), maxTransferEncodedBytes: selected.plan.missingEncodedBytes - 1,
  }))).rejects.toMatchObject({ code: "capacity" });
});
test("empty and partially verified sets preserve exact coverage and immutable candidate evidence", async () => {
  const { fixture, candidate, verified } = await prepare(), before = candidate.plan();
  const none = candidate.transferPlan([], limits());
  expect(none.plan.requests.flatMap(request => request.covers).sort())
    .toEqual(before.required.filter(object => object.sha256 !== fixture.descriptorHash).map(object => object.sha256));
  const first = fixture.manifest.catalog[0]?.item;
  if (!first) throw new Error("Missing synthetic item");
  const partial = candidate.transferPlan([...verified, first], limits());
  expect(partial.plan.requests.flatMap(request => request.covers)).not.toContain(first);
  const complete = candidate.transferPlan(before.required.map(object => object.sha256), limits());
  expect(complete.plan.requests).toEqual([]);
  expect(complete.plan.transferEncodedBytes).toBe(0);
  none.plan.requests.length = 0;
  none.effectivePolicy.maxExtraBytes = 0;
  none.adjustments.length = 0;
  expect(candidate.plan()).toEqual(before);
  expect(candidate.transferPlan(verified, limits()).plan.requests).toHaveLength(2);
});
test("unknown optional policy and bundle fields remain inert through strict planner projection", async () => {
  const fixture = bundledSnapshotFixture({
    policy: value => ({ ...value, extra: true, transferPlanning: { ...value.transferPlanning, ignored: true } }),
    manifest: value => ({ ...value, extra: "inert",
      bundles: Object.fromEntries(Object.entries(value.bundles).map(([hash, bundle]) => [hash, { ...bundle, ignored: true }])) }),
  });
  const candidate = await inspectSnapshot(fixture.descriptorBytes, read(fixture), snapshotLimits());
  expect(candidate.transferPlan([], limits()).plan.requests.filter(request => request.kind === "bundle")).toHaveLength(2);
});
test("fresh recovered candidates retain identical deterministic transfer planning", async () => {
  const { fixture, candidate, verified } = await prepare();
  const recovered = await resumeSnapshot(candidate.plan(), read(fixture), snapshotLimits());
  expect(recovered.transferPlan(verified, limits())).toEqual(candidate.transferPlan(verified, limits()));
});
test.each(["missing", "extra", "negative", "fractional", "unsafe", "percent"] as const)("invalid %s transfer limits fail explicitly", async fault => {
  const { candidate, verified } = await prepare();
  const input = limits();
  if (fault === "missing") {
    const { maxExtraBytes: _omitted, ...rest } = input;
    // @ts-expect-error Exercise runtime refusal of a missing required limit.
    expect(() => candidate.transferPlan(verified, rest)).toThrowError(expect.objectContaining({ code: "invalid" }));
    return;
  }
  const modified = fault === "extra" ? { ...input, unknown: 1 } : fault === "percent" ? { ...input, maxExtraPercent: 101 } :
    { ...input, maxBundleMembers: fault === "negative" ? -1 : fault === "fractional" ? 1.5 : Number.MAX_SAFE_INTEGER + 1 };
  expect(() => candidate.transferPlan(verified, modified)).toThrowError(expect.objectContaining({ code: "invalid" }));
});
test("malformed and duplicate verified hashes are rejected rather than silently repaired", async () => {
  const { candidate, verified } = await prepare(), first = verified[0];
  if (!first) throw new Error("Missing synthetic metadata");
  expect(() => candidate.transferPlan(["not-a-hash"], limits())).toThrowError(expect.objectContaining({ code: "invalid" }));
  expect(() => candidate.transferPlan([first, first], limits())).toThrowError(expect.objectContaining({ code: "invalid" }));
});
