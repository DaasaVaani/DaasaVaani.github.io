# Isolated staged snapshot admission and byte validation

## Status and authoritative contract

This is a GEN-02/03 and OFF-06/07/15/16 prerequisite, not enabled downloading,
complete offline preparation or release conformance.
[The Shared staged snapshot contract](https://github.com/DaasaVaani/shared/blob/main/docs/snapshot-publication.md)
owns the exact descriptor/manifest/policy/item families, semantic relationships,
consumer tolerance and producer strictness. Its explicit prelaunch projection
does not advertise multilingual search, transliteration, verses, full metadata,
media or offline readiness. Do not treat support for this family as support for
the future complete reading library.

[The Website validator](../src/snapshot-validation.ts) consumes the independently
pinned Shared browser-safe assertions and the existing strict transfer byte codec.
It is not imported by the application, has no network or production configuration
and does not register capabilities in the app's support list. Existing online
reading, personal data and shell behavior are unchanged. Shared's producer remains
strict; consumer tolerance is not permission to publish unknown source fields.

## Explicit trusted limits

Every `inspectSnapshot` or `resumeSnapshot` call supplies all of `SnapshotValidationLimits`:

- descriptor byte ceiling;
- independent encoded and decoded ceilings for manifest, policy and item roles;
- complete item-count, required-original encoded-byte and decoded-byte ceilings;
- positive processing chunk size and an explicit unique caller capability list.

There are no defaults. Numeric values must be positive safe integers; extra/missing
configuration fields fail. Limits and capabilities are copied before asynchronous
reads. Fetched policy cannot increase these trusted ceilings. Production values
remain an owning-settings/integration gate; test constants are fixtures only.

Known descriptor-plus-manifest aggregate size is admitted before reading the
manifest. After manifest admission, all required original references/counts/sums
are checked before reading policy or items. Sums use exact integers. Descriptor
bytes count toward both aggregate totals; manifest, policy and each original item
count once. ZIP bytes, retries, HTTP overhead, app shell and IndexedDB metadata
are not invented as zero-cost transfers. These totals are neither the separate
store's complete logical accounting nor physical allocation/heap guarantees.

## API and verification order

`inspectSnapshot(descriptorBytes, readEncoded, limits, signal?)`:

1. Copy bounded actual descriptor bytes. Require fatal UTF8, unique JSON keys and
   exact RFC8785-compatible canonical JSON plus one LF. No legacy-feed adapter
   injects a sequence; require the supported sequenced descriptor family.
2. Admit the manifest reference against trusted role/aggregate bounds, then read
   and copy actual bytes. Check exact encoded length and SHA-256, decode one whole
   bounded gzip member and check exact decoded length, fatal UTF8, unique keys and
   canonical JSON without LF. No partial/trailing/concatenated gzip success.
3. Use Shared's early envelope assertion before following the policy lookup.
   Unsupported majors/required capabilities fail before policy/item reads;
   malformed known fields/roles/paths/catalog relationships fail explicitly.
   Unknown optional fields remain inert, but their original canonical bytes still
   contribute to hashes and bounds. Numeric-looking object keys use true UTF16
   lexical ordering rather than JavaScript's integer-property serialization order.
4. Admit every original reference/count/aggregate, verify actual policy bytes in
   the same manner, then validate policy shape and manifest/policy semantics.
   Compatible gzip header/compression profiles are accepted; a consumer does not
   require byte-for-byte reproduction of the producer's compression algorithm.
5. Hash the original plain descriptor bytes locally and add their receipt to the
   required set. Return a candidate with `plan()`, `metadataObjects()` and
   `validate(plan, readStored, signal?)`. Plans and descriptor/manifest/policy byte
   seeds are copies; callers cannot mutate captured evidence through accessors.
   Seeds are ordered descriptor first, then manifest and policy.

The candidate plan contains the genuine descriptor's sequence/manifest reference
and a strict hash-sorted set of manifest, policy, all original item receipts and
exactly one additional original descriptor receipt. The descriptor is its exact
canonical JSON plus LF, not gzip, a fabricated remote object path, a decoded lyric
copy or an authentication token. It cannot alias an original object.
Every receipt/object/count/single-object and logical-byte storage limit applies
to it; identical stored hashes count once under Shared's accounting and reachability
rules. No new store, schema version or plan field is introduced.
The plan does not include ZIP archives or claim their CRC/framing was inspected.
The [durable-content adapter](durable-content.md) still owns writer fencing,
transactional byte checkpoints, atomic activation and reader pins.

`validate` must be the actual activation callback, not replaced with a no-op:

1. Require the exact captured target reference and complete required set.
2. Read and verify the actual stored original descriptor, then independently
   reverify manifest/policy bytes through the complete admission path; no remembered
   receipt, synthesized descriptor or parsed cache is proof.
3. Read/decode/schema-check every item. Bind actual item UUID/title/ordered tags
   to its catalog entry, preserve literal text/layout and enforce canonical known
   line semantics. Reject line identities colliding with any catalog UUID or
   another line across the complete snapshot.
4. Honor explicit cancellation before/after asynchronous reads and before success.
   The owning writer subsequently rechecks its original fence before activation.

Example callback shape is `writer.activate((plan, read) => candidate.validate(plan,
read, signal))`. This validates only the staged family. The physical backend's
all-object-read guard alone does not establish decoded/capability proof.
Errors propagate as explicit typed Shared metadata errors, content integrity/
capacity errors or native cancellation; there is no success-shaped fallback.

## Isolated transfer planning

`candidate.transferPlan(verifiedHashes, transferLimits)` binds the admitted
original manifest/policy to the independently pinned
[Shared deterministic planner](https://github.com/DaasaVaani/shared/blob/main/docs/download-planning.md).
It is a synchronous metadata-only operation, not a downloader, ZIP decoder,
checkpoint, activation or readiness test. It makes no requests or personal/content
writes. Both newly admitted and recovered candidates offer the same operation.

The result retains the unchanged portable `plan`, effective policy, adjustment
and excluded-bundle reporting. Its additional `artifacts` array binds every
selected request in planner order to **captured admitted metadata**, with exactly
`{ kind, sha256, encodedBytes, covers, path }`. Bundle paths come from the manifest;
policy/item paths from their original object references; the remote manifest path
comes from the original descriptor reference, not a reconstructed hash template.
No remote path is fabricated for locally rooted descriptor evidence.
A complete verified set produces no artifacts; excluded ZIPs cannot reappear
in this projection. Both arrays and each coverage array are independent copies;
mutating a returned artifact cannot change the plan or future candidates.
Unknown optional metadata does not enter the artifact shape.

Paths are publication-relative identities, not authenticated URLs or a downloader.
The future coordinator must establish the genuine configured publication origin
and resolve these admitted paths under that origin before the direct HTTPS runner.
This API makes no network/storage write, changes no retry/budget behavior and
does not prove that caller-supplied verified hashes were actually read.

Every call explicitly supplies `SnapshotTransferLimits`:

- positive safe `maxBundleMembers`, `maxBundleEncodedBytes` and
  `maxTransferEncodedBytes`;
- nonnegative safe `maxExtraBytes` and integer `maxExtraPercent` in 0..100.

Extra/missing/invalid fields fail; no production defaults are hidden here.
`maxTransferEncodedBytes` bounds the selected **remaining artifact plan**, not
descriptor/metadata bytes already acquired, retries, HTTP framing, heap or total
physical storage. Admission and store accounting remain separate obligations.

The approved behavior is eligible ZIPs plus individual originals, never raising
local safety limits to match fetched policy:

1. Project exactly the five known published policy fields into the strict planner;
   inert optional fields are not forwarded or made behavioral. Preserve its
   published request-cost weight; narrow bundle/extra bounds to trusted ceilings.
2. Derive remote objects/requirements only from the admitted manifest, policy and
   original items. The locally hashed plain descriptor is not a remote object,
   bundle member or request; no remote descriptor-object path is fabricated.
3. Use the same planner without bundles to establish exact missing original bytes.
   Refuse if even individual originals exceed the remaining-transfer ceiling.
   Further cap extra-byte allowance to the exact remaining network headroom.
4. Exclude optional bundles above the effective member/encoded bounds. Return
   each excluded hash and every exceeded bound explicitly, in hash order.
   Plan eligible bundles plus remaining originals with Shared's unchanged
   deterministic weighted/disjoint selection and exact arithmetic.
5. Return `{ plan, effectivePolicy, adjustments, excludedBundles }`. `plan` is
   Shared's unmodified `DownloadPlan`; adjustments identify each narrowed field's
   published/effective value. Every result is independent mutable data, not a
   reference into captured candidate evidence.

An unselected bundle that merely loses the normal savings/budget competition is
not an excluded/invalid artifact. Its originals remain covered by the planner.
The plan's encoded totals include selected ZIP overhead and any already-verified
members retransferred inside that ZIP; cached objects do not gain zero-cost
network bytes. Equality at the transfer ceiling is allowed; insufficient extra
headroom chooses fewer ZIPs rather than exceeding the ceiling.

`verifiedHashes` is a caller assertion of **actual encoded-byte verification**,
not proof supplied by metadata receipts or this pure planner. Malformed/duplicate
hashes fail. Valid unrelated cached hashes, including local descriptor evidence,
do not create remote requirements. An empty plan never proves complete decoded
validation or offline readiness. Future storage/transport integration must
establish that verified set from actual current bytes and still run complete
candidate validation before activation.
Invalid local limits and insufficient remaining-transfer capacity use
`ContentError`; strict planner input/overflow failures propagate Shared's
`DownloadPlanningError` (`invalid`/`overflow`). They are explicit refusals, not
an empty-plan fallback.

## Actual ZIP bundle admission

`candidate.admitBundle(sha256, bytes, bundleLimits, signal?)` binds actual archive
bytes to a bundle in this candidate's admitted manifest. Every call supplies
exactly the two positive safe bounds in `SnapshotBundleLimits`:
`maxBundleMembers` and `maxBundleEncodedBytes`. Project these two fields rather
than passing the complete transfer-planning object. The effective count/archive
bounds cannot exceed either caller or published policy; no defaults exist.

The approved consumer policy is the
[exact producer ZIP STORE container profile](https://github.com/DaasaVaani/shared/blob/main/docs/snapshot-zip-admission.md),
not a general ZIP adapter. Alternate timestamps, entry order, flags, extras,
comments, compressed members, ZIP64 or trailing data are not accepted as harmless
variations. The independently pinned Shared parser owns those exact binary rules;
Website does not duplicate them or reimplement CRC/SHA.

1. Refuse malformed/unknown bundle hashes and excessive declared count/encoded
   size before byte work. Derive complete original member paths, hashes and
   encoded lengths from the private admitted manifest, never caller replacements.
2. Derive narrower Shared limits from the admitted archive length/member count,
   largest already role-bounded member and captured complete-original encoded
   ceiling. ZIP framing overhead is not stored as an original content object.
3. Shared preflights references/limits, takes a bounded fixed-length private byte
   snapshot and performs **all** exact framing, local/central agreement, CRC,
   whole-archive SHA and each original encoded length/SHA proof against that same
   snapshot. Shared/growable/resizable inputs are refused; caller mutation after
   asynchronous hashing begins cannot change the validated bytes.
4. Return independent `{ sha256, path, bytes }` encoded-original members only
   after complete archive validation. No filesystem extraction, ZIP persistence,
   checkpoint, decoded-item success or activation occurs inside this method.

Check cancellation before starting and after Shared finishes, before exposing any
members. Shared's synchronous framing/CRC and WebCrypto calls have no AbortSignal
or interruptible guarantee; this wrapper does not claim mid-operation interruption,
worker/off-main execution or bounded peak heap. Native crypto failures propagate.
Local shape/capacity refusals use `ContentError`; binary/reference failures use
`SnapshotZipConsumerError` (`invalid`/`limit`/`integrity`).

Future transport must fetch only its selected plan and account for cumulative
network bytes/retries separately. Admission proves this archive, not that it was
selected or that an entire transfer budget/consent/authentication requirement was
met. Checkpoint each returned original through `writer.putObject`; do not store the
ZIP digest as a required object. Finally use complete `candidate.validate` during
activation. A valid container can still contain a correctly hashed original that
fails gzip/canonical JSON/lyric semantics; preserve previous active content.
The existing compatible-gzip consumer rules remain unchanged inside the exact ZIP
container policy. Newly admitted and recovered candidates share this API.

## Isolated direct HTTPS artifact transfer

[fetchSnapshotArtifact](../src/snapshot-http.ts) supplies one isolated HTTP attempt
for an already admitted artifact, not descriptor discovery or a downloader/coordinator.
It is not imported by the application. The caller supplies exactly
`{ url, sha256, encodedBytes }` and explicit `SnapshotHttpLimits`:
`maxEncodedBytes`, `noProgressTimeoutMs`, `totalTimeoutMs`. All numbers are positive
safe integers; timer values must also fit the platform timer range. Declared bytes
above the caller ceiling fail before requesting. Inputs are captured before I/O.

- Use the genuine configured **direct HTTPS** URL, without URL credentials or
  fragment. Fetch uses `redirect: "error"`, omitted credentials, no referrer and
  `cache: "no-store"`. A redirect fails; there is no landing-host fallback, HTTP
  exception or Range request. HTTP200, unchanged final URL and a response body are
  required. This is address enforcement, not publisher authentication.
- Start both deadlines before requesting headers. Only nonempty body chunks reset
  the idle deadline; progress never extends the total deadline. Browser-native
  AbortSignal cancellation aborts the request/body. Clear timers/listeners and abort
  any remaining transfer on exit, including overlong/error responses.
- After successful headers, allocate one private admitted-length buffer and copy
  each chunk into it. Refuse an overlong chunk before copying it,
  require exact completed encoded length, then verify the entire encoded SHA.
  HTTP Content-Length is deliberately not treated as artifact length: browsers
  remove HTTP Content-Encoding before exposing the artifact gzip/ZIP body.
  There is no physical wire-byte, chunk-allocation or peak-heap guarantee.
- Preserve caller cancellation reasons and native crypto failures. Crypto has no
  interruptible guarantee; cancellation/deadline guards after hashing prevent a
  late success but do not promise immediate interruption of WebCrypto.

`SnapshotHttpError.code` distinguishes `invalid`, `capacity`, `http`, `network`,
`timeout` and `integrity`. HTTP errors expose status and the readable raw
`retryAfter` header, without parsing it or scheduling a retry. Null means absent
**or CORS-unreadable**, not proof the server specified no wait. Cross-origin
Retry-After needs actual host exposure/evidence before production retry conformance
can be claimed. Browser fetch does not reliably distinguish redirect/CORS/permanent
request refusal from transient network TypeErrors; never blindly retry every
`network` result. No automatic retries occur in this primitive.

Callers must bind URLs/references to their selected admitted plan, account cumulative
attempt bytes, implement approved transient classification/backoff/Retry-After,
concurrency, genuine descriptor origin, consent and preservation. The approved
30s idle/20min artifact-attempt policy remains in Shared; this low-level API has no
hidden product defaults. It does not prove selection, full snapshot budget, storage
admission or readiness. Pass verified ZIPs through `admitBundle`, checkpoint only
originals, and run complete `candidate.validate` before activation. Individual
objects likewise need full decoded validation after encoded transfer proof.

## Isolated retry decisions

[snapshotRetryDecision](../src/snapshot-retry.ts) is a pure next-action prerequisite
for OFF-06/07/15 and QUAL-06, not an automatic retry loop. The caller supplies
exact `SnapshotRetryPolicy` fields `maxAttempts`, `backoffMs`, `jitterPercent` and
`maxAutomaticWaitMs`, plus exact `SnapshotRetryContext` fields `attempt`, `nowMs`,
`jitterUnit`, `networkTransient` and `retryAfterReadable`. Attempts are one-based;
the backoff array has exactly one nonnegative safe millisecond value per possible
retry. Caller values narrow/implement trusted policy, never fetched allowances.
No product defaults are introduced; the approved three total attempts, 1s/2s
backoff, +/-20% jitter and 120s automatic-wait ceiling remain in Shared's design.

- Return `fail` for non-HTTP native errors/cancellation, integrity/schema/capacity/
  invalid errors and HTTP statuses outside408/429/500/502/503/504. An ambiguous
  browser `network` error is eligible only with independently established explicit
  transient evidence; redirects/CORS are not assumed transient.
- Stop after the final total attempt, even if a response suggests waiting.
  Otherwise compute the indexed backoff with supplied unit jitter in inclusive
  `[0,1]`, and round upwards to a whole millisecond. The function reads no clock
  or random source and schedules no request, timeout or storage mutation.
- For eligible HTTP failures require explicit Retry-After readability evidence.
  Unreadable headers return `pause`, not an absent-header fallback. Readable null
  means absent. Decimal nonnegative seconds and exact IMF-fixdate HTTP dates are
  supported; calendar/weekday mismatches, malformed and obsolete alternate date
  forms pause explicitly rather than guessing. An oversized numeric wait pauses
  without unsafe arithmetic; no enormous BigInt parsing is needed.
- Never shorten the server wait or backoff: take their maximum. Past dates impose
  no additional wait. Exactly the caller's automatic-wait ceiling is eligible;
  anything above pauses, reporting safe `delayMs` where calculable, otherwise null.
  Unknown wait (`delayMs: null`) does not mean zero. Invalid context/policy and
  arithmetic overflow throw explicit `SnapshotHttpError("invalid")`.

The exact discriminated result is `{ action: "retry", delayMs }`,
`{ action: "fail", reason: "permanent" | "attempts-exhausted" }`, or
`{ action: "pause", reason: "retry-after-unavailable" | "retry-after-invalid" |
"wait-limit", delayMs: number | null }`. Callers retain the original failure for
display/logging and preserve checkpoints/active content. They must supply a
trustworthy clock/header-visibility/transient classification, respect cancellation
during actual waits and prove cumulative attempt-byte and selected-target bounds
before orchestration. These decisions do not implement user consent, automatic
retry, remote-host CORS validation, production defaults or offline readiness.

## Isolated cancellable attempt runner

[fetchSnapshotWithRetries](../src/snapshot-attempts.ts) connects the single-request
primitive and pure retry decisions without importing either into the application.
It implements only one captured artifact's serial attempts, not descriptor
discovery, snapshot scheduling, consent or activation. Map this prerequisite to
OFF-06/07/15, SET-01/02 and QUAL-06.

Supply the artifact and exact `SnapshotAttemptOptions`: `httpLimits`,
`retryPolicy`, `maxAttemptEncodedBytes`, `retryAfterReadable` and
`isTransientNetworkError`. Reuse the exact HTTP and retry bound shapes above.
The full configuration, backoff array and artifact identity are captured and
validated before requesting; no hidden defaults or endpoint changes occur.
The caller-owned classifier is invoked only for ambiguous `network` failures.
False means no retry; callback errors propagate rather than silently authorizing
a retry. Readable-header evidence is explicit, never inferred from a null header.

Before **each** attempt, reserve the complete artifact declared encoded length
against the positive safe `maxAttemptEncodedBytes`. Equality passes; a missing
byte refuses the request. Failed/partial attempts retain their full reservation,
and an unaffordable next attempt refuses before even scheduling backoff. This is
deliberately conservative admitted-artifact reservation accounting, not measured
actual received bytes, HTTP overhead, HTTP-decoded wire bytes, an overlong hostile
response or exact physical bandwidth. It is per invocation/artifact, not a shared
whole-snapshot budget; future scheduling must reserve across all requests without
double spending and account for actual transport limits separately. An optional
shared ledger now supplies the [same-process reservation prerequisite](#shared-attempt-reservation-ledger).

Each actual attempt uses the same captured direct URL/hash/length and complete
HTTP cancellation/integrity guards. Eligible failures wait at least the decision's
required delay, using a monotonic elapsed-time deadline with timer-range chunking;
an early timer callback cannot shorten the wait. Abort clears the wait/listener,
preserves the caller reason and suppresses all later attempts. Background timer
delays are allowed; downloading after browser closure is not promised. Aborted
HTTP work has settled before a later attempt starts; native hashing remains
cooperative and can delay cancellation.

Success returns exactly `{ bytes, attempts, reservedEncodedBytes }`, with fully
verified encoded bytes only. Terminal non-cancellation errors are
`SnapshotAttemptError`: `code` is `failed`, `paused` or `capacity`; `attempts`,
`reservedEncodedBytes`, `decision` and the original `cause` are retained. Preflight
shape/capacity errors use `SnapshotHttpError`; classifier errors and cancellation
retain their original identity. Never treat a pause, exhausted attempt count or
reservation refusal as a partial success. Original HTTP status/header, native
crypto failure and integrity causes remain available for explicit reporting.

The runner does not checkpoint, activate, remove data or record consent. Within
`store.withWriter`, a runner failure/cancellation uses the existing durable paused
target path, retaining actual progress and previous active content. The writer
does not aggregate the primary cancellation a second time as a drain error;
distinct unfinished-operation/drain/pause failures remain explicit.
Actual browser cases retry selected ZIPs before original checkpointing/full
decoded validation and cancel a native attempt while preserving the active reader.
These prove isolated integration, not live-host permission/authentication,
production settings, concurrent snapshot scheduling or complete offline readiness.

## Shared attempt reservation ledger

`new SnapshotAttemptBudget(maxEncodedBytes)` from
[the attempt module](../src/snapshot-attempts.ts) creates one explicit positive
safe encoded-artifact reservation ceiling. Pass the **same instance** as the
optional fourth argument to `fetchSnapshotWithRetries(artifact, options, signal,
sharedBudget)` for all runners belonging to the same admitted operation.
Existing calls without a ledger retain their per-artifact limits unchanged.

Reservations are synchronous, nonrefundable and performed immediately before each
request, after local shape/bound/cancellation preflight. No await can interleave
the subtraction/check/increment: concurrent promises sharing this instance cannot
spend the same remaining reservation twice. Both local per-artifact and shared
ceilings must admit a complete declared-length attempt; equality passes and one
byte less refuses. A failed shared reservation changes neither ledger nor local
attempt count and makes no request. Invalid configuration/pre-cancellation costs
nothing; any already reserved failed/cancelled/partial attempt remains charged.
Retry loops check shared affordability before backoff and re-reserve after waiting,
so another runner consuming the allowance during the wait still blocks the next
request. Terminal capacity errors retain local attempts/reservations and the
original prior failure where one exists.

`budget.snapshot()` returns a frozen independent exact
`{ maxEncodedBytes, reservedEncodedBytes, remainingEncodedBytes }` view.
The fixed limit is immutable; private accounting cannot be reset or refunded.
`budget.reserve(encodedBytes)` is available for owning orchestration to charge
other complete admitted attempts: invalid numbers throw `SnapshotHttpError`
`invalid`; insufficient allowance throws `capacity`. Use checked subtraction to
avoid overflow even at the maximum safe integer ceiling.

This is an in-memory, same-instance **artifact reservation** ledger, not actual
HTTP/wire/heap measurement, persisted progress, cross-tab/worker atomic storage,
or a complete snapshot scheduler. Creating separate ledgers creates separate
allowances and does not establish a shared operation limit. The future coordinator
must own its lifecycle, reserve all artifacts/metadata consistently, limit request
concurrency, establish consent and preserve target/publication identity under its
writer fence. No automatic refund, replacement consent, background continuation,
production defaults or readiness claim is supplied by the ledger.

## Isolated serial transfer staging

[stageSnapshotTransfer](../src/snapshot-staging.ts) connects the admitted candidate,
durable store, selected paths, actual ZIP admission and bounded retry runner. This
is an OFF-02/04/06/07/15 and QUAL-06 prerequisite, not application integration,
automatic download consent or complete production offline support.

Call `stageSnapshotTransfer(store, expected, candidate, options, budget, signal?)`
with an actual inspected/reconstructed candidate, the captured store fence and
one explicit `SnapshotAttemptBudget`. Exact `SnapshotStagingOptions` contain:

- `publicationBaseUrl`: trusted HTTPS publication directory, ending in `/`,
  without credentials, any query or fragment (including empty `?`/`#`);
- `transferLimits`: the exact five planner limits defined above;
- `attemptOptions`: the exact five attempt-runner fields defined above.

These settings and nested retry/backoff/HTTP limits are captured and validated
before entering the writer; no implicit defaults or mutable delayed configuration
are used. Publication-origin permission/provenance is the caller's obligation;
an HTTPS address and valid bytes do not authenticate the publisher. Production
names/limits/host values still belong in owning settings before live integration.

The helper holds one whole-operation `withWriter` scope and uses **one request
and one awaited checkpoint at a time**. It has no concurrent tasks to detach or
drain, request pool, timeout lock release or hidden fallback:

1. Begin the candidate target if absent, or require the retained target's exact
   sequence/manifest/required hash-length set. Never replace a different target,
   consult a newer feed, delete progress or reinterpret an old plan.
2. Use metadata receipts only to identify which required objects might exist.
   Read each through the writer's actual length/SHA/fence checks before marking it
   verified. Corrupt claimed progress fails explicitly; it is not silently
   ignored, overwritten, repaired or redownloaded.
3. Checkpoint missing original descriptor/manifest/policy seeds from the admitted
   candidate and read them back. Their acquisition occurred before this staging
   call; do not pretend its reservation counters include their earlier transfer.
4. Compute the remaining plan from these actual verified hashes. Resolve exact
   selected paths under the explicit directory, refuse escaping origins/paths/
   queries/fragments, and preflight **all** selected HTTP identities/limits. Check
   that one complete attempt per selected artifact fits the remaining shared
   allowance and each artifact's local attempt allowance before any request.
   Equality passes. This affordability check is not a promised reservation for
   future work: retries or other users of the same ledger can consume headroom;
   each request still reserves synchronously and may explicitly refuse later.
5. Mark downloading, serially fetch/retry each captured identity using the same
   budget, then checkpoint only whole verified original objects. ZIPs undergo
   complete framing/CRC/archive/member proof before any member checkpoint;
   already verified members are not rewritten. Never persist a ZIP digest,
   partial response, decoded lyric or fabricated descriptor object.
6. On success leave the complete target **paused**, not active or ready. Return
   exactly `{ transfer, fetchedArtifacts, attempts, reservedEncodedBytes }`;
   counts/reservations describe this call's requests, not reused bytes, earlier
   discovery or physical bandwidth. An already complete verified target returns
   zero requests/attempts/reservations but is still not activated.

All errors/cancellation propagate. The store drains its operations and attempts
the durable paused checkpoint while retaining the lock; distinct pause/drain
failures stay explicit. A successfully checkpointed earlier artifact remains
available after a later request/storage failure. No later request starts after
cancellation or checkpoint failure. The previous active snapshot and personal
database are not replaced, removed or mutated by staging.

After explicit successful staging, activation remains a separate fenced writer
operation: `writer.activate((plan, read) => candidate.validate(plan, read, signal))`.
The full actual decoder/schema/global-identity validation is mandatory even when
every byte receipt exists. A validation failure keeps the old active snapshot.
Fresh-process explicit resume reconstructs the candidate through `resumeSnapshot`
from retained original metadata, then calls the same staging helper with a fresh
expected fence and explicit authorized allowance. Reconstructing or reopening
does not grant new consent or refund previous reservations.

Serial staging deliberately does not select production concurrency, integrate
progress/cancel/removal UI, acquire descriptors, audit/repair damage, change reader
precedence, establish cross-tab persisted network accounting or enable automatic
continuation after browser closure.

## Atomic explicit transfer resume

`resumeSnapshotTransfer(store, expected, validationLimits, options, budget, signal?)`
from [the staging module](../src/snapshot-staging.ts) combines original-evidence
reconstruction and serial staging in **one** whole-operation writer scope.
It accepts no current descriptor, feed, remembered candidate, alternate publication
identity or synthesized sequence. This is the preferred isolated entrypoint when
resuming after process/page departure; it does not enable automatic resume.

The exact validation limits/capability list, staging options, nested transfer/
HTTP/retry bounds and shared-budget identity are captured/validated before writer
entry. The same validation/transfer capture helpers serve standalone admission/
planning; no second permissive validation implementation or fake request is used.
The writer claim validates the captured expected fence. Under that same lock:

1. Require a retained target and its stored plan. Absence is an explicit `target`
   error, never a request to discover or begin a different snapshot.
2. Run the existing full `resumeSnapshot` reconstruction through scoped actual
   `writer.readObject` reads and the captured validation bounds. Every original
   descriptor/manifest/policy identity and length/schema/capability check remains
   mandatory. Missing/corrupt evidence fails explicitly; old plans without the
   descriptor profile report `unsupported` and require explained explicit recovery.
3. Pass the reconstructed candidate into the same serial staging implementation,
   without releasing/reacquiring the lock, nesting writers or supplying a newer
   feed. Recheck actual retained item bytes before reuse and fetch only the
   remaining admitted artifacts under the explicit trusted publication directory.
4. Return exactly `{ candidate, staged }`. `candidate` is the genuine immutable
   reconstructed process-local validator; `staged` has the staging result shape
   above. Success still leaves the target paused. A separate fenced
   `writer.activate((plan, read) => candidate.validate(plan, read, signal))`
   remains mandatory; the returned object is not a readiness receipt.

Cancellation during reconstruction prevents staging/requests and preserves the
caller reason; request/checkpoint failures retain the normal durable paused
target and old active snapshot. A failed drain/pause is still surfaced, not hidden.
The same optional signal controls reconstruction and staging. No silent restart,
deletion, refund, extra consent or new allowance is inferred by reopening.
Previously acquired metadata and prior invocations' reservations remain outside
the current call's transfer counters. Production origin provenance, approved UI
consent/retry/restart explanation and durable physical-accounting integration are
still required before a live slice.

## Durable evidence and recovery order

The separate [bounded attempt runner](#isolated-cancellable-attempt-runner) can
fetch a selected artifact after explicit orchestration admission; it does not
discover or replace the target during recovery.

Persist `plan()` and all `metadataObjects()` through the scoped writer before
claiming a locally recoverable metadata checkpoint. Partial individual checkpoints
remain useful progress, not a recovery/readiness flag. The candidate itself is
process-local; `resumeSnapshot(targetPlan, readStored, limits, signal?)`
reconstructs it from actual retained evidence in a fresh process:

1. Capture/validate the plan and trusted limits. Refuse more than `maxItems + 3`
   receipts (one manifest, one policy, one descriptor) and excessive planned
   encoded aggregate before any read.
2. Verify the root manifest's actual encoded length/hash and parse its one complete
   gzip member under the trusted manifest decoded ceiling. This preliminary read
   is not proof of the original descriptor's declared decoded length or identity.
3. Perform early envelope/capability refusal, bound all original roles/counts and
   derive their exact receipts. Map-based membership checks require every original
   receipt with its exact length and exactly one extra descriptor receipt.
4. Admit descriptor/complete aggregates, verify its actual stored bytes, then run
   full `inspectSnapshot` on those original bytes. This repeats manifest decoding
   with the original exact decoded length, policy verification and all semantic
   bindings. Require the reconstructed plan to equal the retained plan, including
   sequence and manifest identity.
5. Explicitly [stage missing originals](#isolated-serial-transfer-staging) with
   the reconstructed candidate and trusted operation inputs, then separately use
   its actual `validate` activation callback. Recovery or staging alone never
   activates a partial snapshot.

Inside `withWriter`, use `sha256 => writer.readObject(sha256)` for retained target
reads. This verifies actual bytes and the captured fence before/after reading
without changing the revision; it is not an activation callback escape hatch.
Do not pass a current feed, remembered descriptor or synthesized sequence as
recovery evidence. A valid generic old plan containing only original objects
returns explicit `unsupported`: original-descriptor admission or restart is
required. Missing/corrupt/extra/mismatched evidence fails, preserving the previous
active snapshot and committed progress. No automatic deletion or fallback occurs.
If essential metadata was never checkpointed, offline reconstruction is genuinely
incomplete; this API reports the missing bytes rather than guessing them.

## Isolated pinned canonical reader

The approved next user-visible milestone is an **explicitly limited canonical
Kannada text offline reader**, not the complete multilingual/search/verse package.
This approval does not activate publication, production configuration or UI.
Full product requirements and all source/publication/consent/storage/release
gates remain unchanged. The real live feed is still legacy/unsequenced; no
adapter invents a sequence or treats it as an activated staged snapshot.

[The isolated reader](../src/snapshot-reader.ts) supplies the bounded stored-read
prerequisite for that milestone, mapping to partial UX-01/03 and OFF-07/08/09/16
with QUAL-06. It is not imported by the application and makes **no requests,
checkpoints, repairs, activation, personal writes or readiness claims**.
There are no production database names, limits or fallback defaults.

- `readActiveSnapshotCatalog(store, validationLimits, signal?)` holds the store's
  actual active-reader pin while reconstructing the candidate from original
  descriptor/manifest/policy bytes. It returns exactly `{ reference, entries }`;
  entries are copied known catalog fields in admitted UUID order. It reads no
  item bodies and is not a completeness/audit certificate.
- `readActiveSnapshotItem(store, expectedReference, lyricId, validationLimits,
  signal?)` captures/validates the displayed catalog's exact sequence/manifest
  identity before active-pin acquisition. If the selected active reference
  changed, fail `stale` **before reading bytes**, rather than silently loading the
  same UUID from another version. Under the active pin, reconstruct from original
  metadata, then read/decode only the selected item's original bytes.

Both use the exact strict validation-bound capture and actual scoped byte checks.
Missing active content remains `unprepared`; metadata/item damage, unsupported
evidence or capability, decoder errors and cancellation propagate, never trigger
a network fallback or successful empty result. An absent/malformed selected
identity reports `unprepared` without an item lookup or invented text.
Use a refreshed explicit catalog selection after a stale error; do not silently
substitute the current feed/version. The native store owns late-read/cancellation
guards and pin-safe removal/collection.

The admitted candidate additionally exposes `catalog()` and
`readItem(lyricId, readEncoded, signal?)` for these operations. Catalog fields and
item tags/lines are independent known-field projections; unknown optional
metadata stays inert and absent from the returned shape. Requested items retain
literal title/tags/Kannada/layout/line IDs, with actual encoded length/SHA, complete
bounded gzip/canonical JSON, schema and item/catalog binding rechecked through
the existing decoder. These narrower projections do **not** replace complete
`candidate.validate` before initial activation or prove fonts/verses/search,
linguistic approval, system-wide degraded readiness or cross-item validity alone.
Repeated reader calls intentionally repeat bounded metadata verification; no
unvalidated parsed cache is installed.

## Provenance and remaining gates

Byte/schema validity also does not authenticate a publisher's protected ledger,
deployment provenance, source approval or legal permissions. The future caller
must establish the genuine publication/descriptor origin. Live sequenced
publication, production settings, live bounded transport/integration,
consent/progress/cancel/retry/removal UI, active-version reader/search
integration, repair/degraded readiness, full multilingual capability proof and
supported browser/device evidence remain gates. No Library or Android pin is
changed by this isolated Website slice.

## Executable evidence

[Unit tests](../src/snapshot-validation.test.ts) use actual independently hashed
gzip fixtures, exact aggregate ceilings/-1, role/count refusal, unsupported
capabilities before lookups, copied candidate/configuration boundaries, canonical
optional fields/integer-like keys, actual hash/length, compatible gzip profiles,
CRC/trailing/concatenated corruption, duplicate JSON keys, malformed UTF8/surrogates,
item/catalog/global-identity mismatch, wrong targets and cancellation. Recovery
tests cover metadata-only reconstruction, original evidence corruption/absence,
old generic plans, extra/missing/wrong-length receipts, sequence binding, exact
aggregate thresholds, preliminary inflation/count/descriptor bounds and mandatory
original declared-length revalidation.

[Transfer-planning units](../src/snapshot-transfer.test.ts) exercise original-only
coverage, deterministic eligible/excluded ZIPs, exact member/encoded/remaining
transfer thresholds, reduced allowance/headroom, verified-member reuse, inert
optional fields, copied results, recovered candidates and explicit invalid input.
Their bundle lengths/hashes are synthetic planning metadata, not actual ZIP
framing/CRC/byte validation.

[Actual bundle units](../src/snapshot-bundle.test.ts) instead use independently
hashed Node-built archives, with CRCs independently obtained from Node zlib.
They cover full original/decoded validation, inclusive count/archive bounds,
unknown/prototype identities, otherwise-valid whole-hash mismatch, rehashed
matching-but-wrong local/central CRC, strict timestamp/flag/trailing refusal,
member SHA after valid framing/CRC, declared membership substitution, result/input/
limit capture, recovered candidates and pre/post cancellation.

[Actual browser storage tests](../tests/browser/content-store.spec.ts) compile
the [test-only entry](../tests/isolated-content.ts) into an in-memory Vite module;
it is not a production app entrypoint. They close an actual writer page, confirm
native lock release and reconstruct a candidate in a new page using only the
stored plan/evidence and explicit limits. That new page receives only missing
item objects, no descriptor/candidate/current-feed argument, then completes actual
validation/activation. Scoped reads check copied bytes, unchanged revision,
late/abort/corrupt/mid-read-fence refusal. Missing/corrupt evidence and rehashed
invalid JSON/gzip preserve previous active content and progress; personal data
stays unchanged.
The same browser module also imports the actual portable Shared planner and
plans from genuinely read/verified metadata, compares recovered results and
checks explicit capacity/exclusion reporting without any artifact requests,
activation, revision or personal writes.
Actual ZIP browser cases go further: select genuine archives, admit/checkpoint
only encoded originals and complete actual decoder activation. Rehashed invalid
CRC yields no member progress; a valid archive with a noncanonical original fails
full activation. Both preserve prior active/personal data and keep ZIP digests
out of the content store. These remain permitted synthetic fixtures, not linguistic,
origin/ledger or release evidence.
These synthetic inputs are permitted storage fixtures, not invented lyric truth.

Incremental checks:

```powershell
npm test -- snapshot-validation --maxWorkers=2
npm test -- snapshot-transfer snapshot-validation --maxWorkers=2
npm test -- snapshot-bundle snapshot-transfer snapshot-validation --maxWorkers=2
node node_modules\@playwright\test\cli.js test content-store --workers=2
```

Finalization and every authorized push retain the complete
[build/test/documentation/workflow gate](testing-and-release.md), including
existing online-reader behavior after extracting the common encoded SHA helper.
