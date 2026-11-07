import { ContentError, assertContentPlan } from "../shared/tools/content-state.mjs";
import type { ContentPlan, ExpectedContent } from "../shared/types/content";
import type { ContentStore } from "./content-store";
import {
  captureSnapshotAttemptOptions, fetchSnapshotWithRetries, SnapshotAttemptBudget,
  type SnapshotAttemptOptions,
} from "./snapshot-attempts";
import { captureSnapshotHttpRequest, SnapshotHttpError } from "./snapshot-http";
import type { SnapshotCandidate, SnapshotTransferLimits, SnapshotTransferPlan } from "./snapshot-validation";

export interface SnapshotStagingOptions {
  publicationBaseUrl: string;
  transferLimits: SnapshotTransferLimits;
  attemptOptions: SnapshotAttemptOptions;
}
export interface SnapshotStagingResult {
  transfer: SnapshotTransferPlan;
  fetchedArtifacts: number;
  attempts: number;
  reservedEncodedBytes: number;
}
function samePlan(left: ContentPlan, right: ContentPlan) {
  const required = new Map(left.required.map(object => [object.sha256, object.encodedBytes]));
  return left.reference.sequence === right.reference.sequence &&
    left.reference.manifestSha256 === right.reference.manifestSha256 &&
    left.required.length === right.required.length &&
    right.required.every(object => required.get(object.sha256) === object.encodedBytes);
}
function publicationBase(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch (cause) { throw new SnapshotHttpError("invalid", "Invalid snapshot publication base URL", undefined, undefined, { cause }); }
  if (typeof value !== "string" || url.protocol !== "https:" || url.username || url.password ||
      url.href.includes("?") || url.href.includes("#") || !url.pathname.endsWith("/")) {
    throw new ContentError("invalid", "An explicit HTTPS publication directory without credentials, query or fragment is required");
  }
  return url;
}

export async function stageSnapshotTransfer(store: Pick<ContentStore, "snapshot" | "withWriter">,
  expected: ExpectedContent, candidate: SnapshotCandidate,
  input: SnapshotStagingOptions, budget: SnapshotAttemptBudget, signal?: AbortSignal): Promise<SnapshotStagingResult> {
  signal?.throwIfAborted();
  if (!input || Object.keys(input).sort().join(",") !== "attemptOptions,publicationBaseUrl,transferLimits" ||
      !(budget instanceof SnapshotAttemptBudget)) {
    throw new ContentError("invalid", "Explicit staging options and a shared attempt budget are required");
  }
  const base = publicationBase(input.publicationBaseUrl);
  const attemptOptions = captureSnapshotAttemptOptions(input.attemptOptions);
  const transferLimits = { ...input.transferLimits };
  const plan = candidate.plan(), metadata = candidate.metadataObjects();
  assertContentPlan(plan);
  candidate.transferPlan(plan.required.map(object => object.sha256), transferLimits);
  return store.withWriter(expected, async writer => {
    const before = await store.snapshot();
    if (before.control.target) {
      const target = before.control.target.reference;
      const retained = before.snapshots.find(value => value.reference.sequence === target.sequence &&
        value.reference.manifestSha256 === target.manifestSha256);
      if (!retained || !samePlan(retained, plan)) {
        throw new ContentError("target", "Staging cannot replace a different retained snapshot target");
      }
    } else await writer.begin(plan);
    const present = new Set(before.objects.map(object => object.sha256)), verified = new Set<string>();
    for (const object of plan.required) {
      signal?.throwIfAborted();
      if (present.has(object.sha256)) {
        await writer.readObject(object.sha256);
        verified.add(object.sha256);
      }
    }
    for (const object of metadata) {
      signal?.throwIfAborted();
      if (!verified.has(object.sha256)) {
        await writer.putObject(object.sha256, object.bytes);
        await writer.readObject(object.sha256);
        verified.add(object.sha256);
      }
    }
    const transfer = candidate.transferPlan([...verified], transferLimits);
    const requests = transfer.artifacts.map(artifact => {
      const url = new URL(artifact.path, base);
      if (url.origin !== base.origin || !url.href.startsWith(base.href) || url.search || url.hash) {
        throw new ContentError("invalid", "Selected artifact escaped the explicit publication directory");
      }
      return captureSnapshotHttpRequest({ url: url.href, sha256: artifact.sha256,
        encodedBytes: artifact.encodedBytes }, attemptOptions.httpLimits).artifact;
    });
    if (transfer.plan.transferEncodedBytes > budget.snapshot().remainingEncodedBytes ||
        transfer.artifacts.some(artifact => artifact.encodedBytes > attemptOptions.maxAttemptEncodedBytes)) {
      throw new ContentError("capacity", "The complete selected transfer cannot fit the remaining attempt reservations");
    }
    await writer.phase("downloading");
    let attempts = 0, reservedEncodedBytes = 0;
    for (const [index, artifact] of transfer.artifacts.entries()) {
      signal?.throwIfAborted();
      const request = requests[index];
      if (!request) throw new ContentError("invalid", "Selected artifact has no captured HTTP identity");
      const result = await fetchSnapshotWithRetries(request, attemptOptions, signal, budget);
      attempts += result.attempts;
      reservedEncodedBytes += result.reservedEncodedBytes;
      signal?.throwIfAborted();
      if (artifact.kind === "object") await writer.putObject(artifact.sha256, result.bytes);
      else {
        const members = await candidate.admitBundle(artifact.sha256, result.bytes, {
          maxBundleMembers: transferLimits.maxBundleMembers, maxBundleEncodedBytes: transferLimits.maxBundleEncodedBytes,
        }, signal);
        for (const member of members) {
          signal?.throwIfAborted();
          if (!verified.has(member.sha256)) {
            await writer.putObject(member.sha256, member.bytes);
            verified.add(member.sha256);
          }
        }
      }
    }
    signal?.throwIfAborted();
    await writer.phase("paused");
    return { transfer, fetchedArtifacts: transfer.artifacts.length, attempts, reservedEncodedBytes };
  }, signal);
}
