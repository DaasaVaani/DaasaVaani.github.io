import { ContentError, contentKey } from "../shared/tools/content-state.mjs";
import type { ContentReference } from "../shared/types/content";
import type { ContentStore } from "./content-store";
import { captureSnapshotValidationLimits, resumeSnapshot, type SnapshotValidationLimits } from "./snapshot-validation";

export async function readActiveSnapshotCatalog(store: Pick<ContentStore, "withActiveReader">,
  inputLimits: SnapshotValidationLimits, signal?: AbortSignal) {
  const limits = captureSnapshotValidationLimits(inputLimits);
  return store.withActiveReader(async (plan, read) => {
    const candidate = await resumeSnapshot(plan, read, limits, signal);
    signal?.throwIfAborted();
    return { reference: { ...plan.reference }, entries: candidate.catalog() };
  }, signal);
}

export async function readActiveSnapshotItem(store: Pick<ContentStore, "withActiveReader">, expected: ContentReference,
  lyricId: string, inputLimits: SnapshotValidationLimits, signal?: AbortSignal) {
  const key = contentKey(expected), limits = captureSnapshotValidationLimits(inputLimits);
  return store.withActiveReader(async (plan, read) => {
    if (contentKey(plan.reference) !== key) throw new ContentError("stale", "Active snapshot changed since catalog selection");
    const candidate = await resumeSnapshot(plan, read, limits, signal);
    return candidate.readItem(lyricId, read, signal);
  }, signal);
}

export async function verifyActiveSnapshot(store: Pick<ContentStore, "withActiveReader">, expected: ContentReference,
  inputLimits: SnapshotValidationLimits, signal?: AbortSignal) {
  const key = contentKey(expected), limits = captureSnapshotValidationLimits(inputLimits);
  return store.withActiveReader(async (plan, read) => {
    if (contentKey(plan.reference) !== key) throw new ContentError("stale", "Active snapshot changed since verification selection");
    const observed = new Map<string, number>();
    const checkedRead: typeof read = async sha256 => {
      const bytes = await read(sha256);
      observed.set(sha256, bytes.length);
      return bytes;
    };
    const candidate = await resumeSnapshot(plan, checkedRead, limits, signal);
    await candidate.validate(plan, checkedRead, signal);
    signal?.throwIfAborted();
    if (observed.size !== plan.required.length || plan.required.some(object => observed.get(object.sha256) !== object.encodedBytes)) {
      throw new ContentError("integrity", "Complete verification did not read every required original object");
    }
    return {
      reference: { ...plan.reference }, verifiedItems: candidate.catalog().length, verifiedObjects: observed.size,
      verifiedEncodedBytes: [...observed.values()].reduce((total, size) => total + size, 0),
    };
  }, signal);
}
