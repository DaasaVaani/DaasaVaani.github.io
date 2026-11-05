# Isolated Website durable-content backend

## Status and ownership

This is an isolated OFF-06/07/11/15/16 and QUAL-06 prerequisite, not an enabled
offline library or complete requirement conformance. The application does not
import this backend, fetch into it, select its active snapshot or display a
readiness flag from it. Existing online and in-memory readers are unchanged.
Android and Library retain their independent Shared pins and implementations.

The [Shared durable-content contract](https://github.com/DaasaVaani/shared/blob/main/docs/durable-content.md)
is authoritative for strict logical shapes, fencing, transitions, reference
ordering and complete logical-byte accounting. Website consumes the portable
module and types from its pinned Shared checkout. Do not duplicate or reinterpret
that protocol in a downloader or readiness adapter.

[ContentStore](../src/content-store.ts) owns the physical IndexedDB transactions,
actual encoded-object verification and Web Locks. It uses existing Dexie and
browser APIs, with no new dependency, production database name or product limit.
Every caller must explicitly supply a dedicated database name and all four
positive logical/count/object limits. Future product values belong in Website's
own settings, not defaults hidden in this module. Logical accounting is not
physical disk usage, available quota or an allocation guarantee.

## Physical layout and opening

Dexie logical version 1 uses native IndexedDB version 10:

| Store | Key | Value |
| --- | --- | --- |
| `control` | Out-of-line `state` | One strict Shared control record |
| `snapshots` | Out-of-line Shared reference key | Strict required-object plan |
| `objects` | Inline `sha256`, no secondary indexes | Exact `sha256`, `encodedBytes`, `bytes: Blob` row |

Only a genuinely new database receives empty control state. Opening requires the
database's nonblocking exclusive writer lock, the exact version/store/key/index
layout, one valid control row, matching plan keys and complete portable metadata
validation. Missing or corrupt existing control is not initialized away.
Unsupported Web Locks fail before creating a substitute database. Future versions,
unexpected schemas and invalid existing records are refused without deletion or
fallback. An existing unrelated database must never be used as a content database.

Snapshots expose metadata only. Blob receipts and their lengths do not prove
their digest, decoded schema, capability coverage, fonts, app-shell availability
or offline readiness. Object reads independently verify actual encoded length
and SHA-256 before returning copied bytes; corrupt data is an explicit error.

## Complete-operation writer lifetime

`withWriter(expected, work, signal?)` acquires a database-specific exclusive
Web Lock nonblockingly for the complete operation. Busy is an explicit refusal;
there is no timeout stealing or fallback coordination. A writer claim checks the
captured epoch/revision, rotates the epoch and starts the new revision sequence.

The callback receives only a scoped interface:

- `begin(plan)` and explicit `phase("downloading" | "paused")`;
- `putObject(sha256, bytes)` for whole verified target objects;
- `readObject(sha256)` for fenced verified reads of retained target bytes;
- `activate(validate)` for a fenced, completely verified candidate;
- `dropTarget()`, `remove()` and explicit `collect()`.

Await every operation and propagate failures. Failed operations cannot be hidden
by returning a success value from the callback. Completion invalidates further
scope use and drains any outstanding operations while retaining the actual
writer lock. Unawaited operations fail explicitly; their late guards prevent
terminal writes. Retained writer capabilities cannot mutate after departure.
Abort remains cooperative for the callback itself; no timeout releases a writer
while its asynchronous operation is still running.
The nonblocking native request uses `ifAvailable` without the incompatible native
`signal` option. Cancellation is checked before requesting, inside the callback
and by operation/terminal guards; it does not release the lock ahead of unfinished work.

Failure attempts a durable paused target checkpoint while the lock is still held,
including after cancellation. If that also fails, both errors are surfaced in an
`AggregateError`; there is no fabricated paused/success state.

Every mutation builds the prospective Shared candidate inside one IndexedDB
read/write transaction, validates its complete logical limits and captured fence,
changes plans/objects and writes control last. A failed terminal write rolls back
the whole transaction. SHA-256 work and user validation are outside transactions;
their subsequent commit still uses the original captured fence.

## Bytes and activation boundary

`putObject` copies input, requires the target's exact digest and encoded length,
applies the explicit single-object bound and checks actual SHA-256. Reusing a
stored digest independently verifies the existing immutable Blob. Corrupt reuse
is refused, not silently repaired or replaced.

`readObject` requires a current target and checks the captured epoch/revision before
and after actual length/digest verification. It returns copied bytes without a
revision mutation. It shares the same tracked scope, cancellation and late-use
guards as writes; it is not a general unrooted-object or active-reader API.
The [staged recovery profile](snapshot-validation.md#durable-evidence-and-recovery-order)
roots the original plain descriptor as one extra immutable object alongside all
original gzip objects. All accounting, count limits and collection roots include
that evidence; no physical schema/version changes or fabricated remote paths exist.

`activate` passes a copied plan and verified lazy reader to the supplied validator.
The validator must read every required actual object and must reject on incomplete
decoding/schema/capability validation. A no-op validator cannot activate. After
validation, the original fence is checked again before atomic active/target/
retired-root replacement. A changed revision or terminal storage failure preserves
the prior active pointer and committed target progress.

Reading every object is a necessary guard, not proof of the future production
validator. Coordinator tests use permitted gzip storage fixtures and synthetic
callbacks. Additional [staged snapshot validation](snapshot-validation.md) verifies
actual descriptor/manifest/policy/item bytes for the narrow prelaunch family.
Neither establishes a real multilingual/index/complete-library or app-shell proof.
Its [bundle admission](snapshot-validation.md#actual-zip-bundle-admission) can
return verified encoded originals from an actual strict ZIP. Checkpoint those
originals through the same writer API, never the ZIP digest. Complete decoded
validation remains mandatory even when archive/member hashes and CRCs pass.

## Readers, removal and collection

`withActiveReader(work, signal?)` captures the active reference, obtains its shared
manifest pin and rechecks the pointer after lock acquisition. If it changed while
waiting, the reader retries rather than exposing a retired selection. The pin
lasts through the callback without an automatic lease expiry.

Callback completion or explicit abort releases the pin and invalidates retained
read functions. An abort can release a departed reader even when its callback does
not settle. Future UI callers must also guard their own late display work; releasing
a storage pin does not cancel arbitrary application code or erase returned memory.
Closing an actual browser context releases its native locks; this does not promise
background downloading after browser closure.

Removal clears active/target roots, never personal data. Previously pinned readers
can finish; new reads report unprepared. Collection acquires the writer lock first,
then tries each retired manifest pin exclusively and nonblockingly. Busy pins
produce an explicit deferred-root result. Only safely released roots and unreachable
plans/objects are reclaimed; shared digests remain while any retained root needs
them. Temporary retired data still counts toward logical bounds.

## Validation and remaining integration gates

[Actual browser tests](../tests/browser/content-store.spec.ts) compile only the
real backend and staged validator through a test-only entry into an in-memory
bundle with the existing Vite API. This adds
no production entrypoint, app test hook, cache or offline UI. All configured
Chromium desktop/mobile/narrow projects use real IndexedDB and Web Locks:

- interrupted reopen, explicit resume and complete actual gzip reads;
- wrong bytes, failed validation and stale validation callbacks;
- actual terminal object-checkpoint and activation-write rollback, then retry;
- busy/stale/retained/unawaited writers and actual writer-page closure;
- pinned old readers, removal, digest reuse and deferred/final collection;
- explicit reader departure and delayed-pin active-pointer recheck;
- exact prospective complete logical-byte ceiling versus one byte less;
- future/schema/missing-control refusal and unsupported-lock no-creation;
- complete personal-database preservation for covered preparation/removal/closure.
- actual staged decoding during partial-store reopen and activation; rehashed
  invalid JSON/gzip cannot replace the prior active snapshot through valid receipts.
- new-page reconstruction from retained original descriptor evidence after actual
  writer-page death, then completion/activation without a supplied descriptor;
- missing/corrupt evidence preservation and read-only scoped revision/copy/fence/
  abort/late-use checks.

Incremental command:

```powershell
node node_modules\@playwright\test\cli.js test content-store --workers=2
```

Use the configured clean fixture publisher as described in the
[validation guide](testing-and-release.md#current-executable-checks). Finalization
and every push still require the complete unit/browser/build/documentation/
workflow checks, not this selector alone. Shared independently validates the pure
protocol; Website supplies physical-storage evidence, not native/device parity.

Remaining gates include Library's live sequenced publication/ledger/receipts and
activation, genuine descriptor admission, live bounded transport/integration, complete
decoded-schema/capability proof, explicit consent/progress/cancel/retry/removal UI,
production settings and storage/quota/
eviction handling, active-version reader/
search integration, same-version repair/degraded readiness, and the supported
browser/device matrix. OFF-01/02/03/04/08/09/10/12/13/14/17 and full OFF-06/07/
11/15/16 remain unclosed. There is no real offline save or release-readiness claim.
