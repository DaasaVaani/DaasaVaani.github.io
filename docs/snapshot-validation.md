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

Every `inspectSnapshot` call supplies all of `SnapshotValidationLimits`:

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
5. Return a process-local candidate with `plan()`, `metadataObjects()` and
   `validate(plan, readStored, signal?)`. Plans and manifest/policy byte seeds are
   copies; callers cannot mutate the captured candidate through these accessors.

The candidate plan contains the genuine descriptor's sequence/manifest reference
and a strict hash-sorted set of manifest, policy and all original item receipts.
It does not include ZIP archives or claim their CRC/framing was inspected.
The [durable-content adapter](durable-content.md) still owns writer fencing,
transactional byte checkpoints, atomic activation and reader pins.

`validate` must be the actual activation callback, not replaced with a no-op:

1. Require the exact captured target reference and complete required set.
2. Re-read and independently reverify stored manifest/policy actual bytes through
   the complete admission path; no remembered receipt or parsed cache is proof.
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

## Persistence, provenance and remaining gates

The candidate retains the originally supplied descriptor only in memory.
Closing/reopening the IndexedDB connection within that session does not persist
the candidate or prove reconstruction after browser death. Durable retention of
the admitted descriptor, or an approved reconstruction protocol, remains open
before live crash-resumable validation. Never fabricate a feed/sequence from the
old unsequenced publication or call a remembered flag readiness.

Byte/schema validity also does not authenticate a publisher's protected ledger,
deployment provenance, source approval or legal permissions. The future caller
must establish the genuine publication/descriptor origin. Live sequenced
publication, descriptor-retention/reconstruction, production settings, transport/
ZIP planning, consent/progress/cancel/retry/removal UI, active-version reader/search
integration, repair/degraded readiness, full multilingual capability proof and
supported browser/device evidence remain gates. No Library or Android pin is
changed by this isolated Website slice.

## Executable evidence

[Unit tests](../src/snapshot-validation.test.ts) use actual independently hashed
gzip fixtures, exact aggregate ceilings/-1, role/count refusal, unsupported
capabilities before lookups, copied candidate/configuration boundaries, canonical
optional fields/integer-like keys, actual hash/length, compatible gzip profiles,
CRC/trailing/concatenated corruption, duplicate JSON keys, malformed UTF8/surrogates,
item/catalog/global-identity mismatch, wrong targets and cancellation.

[Actual browser storage tests](../tests/browser/content-store.spec.ts) compile
the [test-only entry](../tests/isolated-content.ts) into an in-memory Vite module;
it is not a production app entrypoint. They re-open partial IndexedDB state with
a retained candidate, complete activation through the real decoder and preserve
the previous active snapshot when rehashed noncanonical JSON or malformed gzip
passes encoded receipts but fails full validation. Personal data stays unchanged.
These synthetic inputs are permitted storage fixtures, not invented lyric truth.

Incremental checks:

```powershell
npm test -- snapshot-validation --maxWorkers=2
node node_modules\@playwright\test\cli.js test content-store --workers=2
```

Finalization and every authorized push retain the complete
[build/test/documentation/workflow gate](testing-and-release.md), including
existing online-reader behavior after extracting the common encoded SHA helper.
