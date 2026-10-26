# Tasks requiring algorithm-choice analysis

**Status: approved algorithm directions with partial fixture implementation and
remaining production evidence.** Staged implementation is authorized. This document
identifies complex and medium-complexity tasks in the requirements/design records.
It does not change product scope, close decision gates, select new dependencies,
or claim implementation, linguistic verification or benchmark results.

## Basis and how to use this list

Read this alongside:

- [Approved requirements](requirements.md), including stable requirement IDs and
  acceptance scenarios.
- [Current design decisions](design-decisions.md)
  and the [Shared implementation-design record](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md).
  These define the current constraints.
- [Architecture gates D1-D7](architecture.md#selected-foundation-and-incomplete-gates)
  and [Shared contract guidance](https://github.com/DaasaVaani/shared/blob/main/docs/data-contracts.md).
- [Implementation roadmap](implementation-roadmap.md) and
  [testing/performance guidance](testing-and-release.md).
- [Library provider/content guidance](https://github.com/DaasaVaani/library/blob/main/docs/content-rights.md).

The tasks below involve competing correctness, latency, memory, network or
recovery properties, rather than merely choosing a framework. Alternatives not
explicitly selected below remain **candidates for analysis**, not approvals. Preserve selected
directions such as code-point OSA, one global JSON/gzip index, additive ranking,
Sanscript, ZIP STORE, Room/Dexie and explicit snapshot activation.

The current [bounded canonical online reader](lyric-preview.md#online-loading-and-failure-behavior)
validates catalog metadata in time linear in its decoded size, then uses expected
O(1) exact-ID map lookup. An uncached object requires O(E + D + L)
decoding/text/line validation (encoded bytes E, decoded bytes D, line/layout records L);
unrequested lyric text is not loaded. Retained memory scales with catalog metadata,
verified requested content and in-flight decoder work, under the owning logical
encoded/decoded ceilings. Failed/aborted reservations are released without
activating content. These logical bounds are not allocator/peak-heap or full
production/offline proofs. Literal title filtering remains a catalog scan, not
the reviewed linguistic search algorithm.

Website [current-state backup v1](architecture.md#same-platform-personal-backup-v1)
uses off-UI bounded gzip/JSON validation in O(E+D+N) time for encoded bytes E,
decoded bytes D and personal records N, plus object-key canonical sorting.
Typed-reference/occurrence uniqueness and duplicate-name preview use sets/maps;
array order and raw user text are not normalized. Logical and prospective
database accounting both apply. Atomic replacement checks a captured revision
and allocates a fresh fence; it neither merges nor resolves missing identities.
Retained decoded candidates, preview text, structured-clone messages and bounded
compression chunks are additional live allocations: wire ceilings are not
measured peak-heap guarantees. Native restore and crash/device evidence remain
separate work.

Priority is a proposed analysis order, not an approved delivery commitment:
**A** = resolve correctness/feasibility or data-preservation risks early;
**B** = resolve before the owning implementation slice. Work can proceed
independently where dependencies permit. Selected design directions do not mean
that their correctness proofs, implementations or validation are complete.

## Current constraints

The following are current approved constraints, identified by stable decision IDs
for traceability, not a decision chronology. Detailed values are authoritative in
Shared. Overall production closure remains incomplete; fixture implementation does
not constitute full linguistic, protocol or release conformance.
Past alternatives, review chronology and validation outcomes belong only in
[HISTORY.md](../HISTORY.md).

| Decisions | Approved result | Remaining evidence/detail |
| --- | --- | --- |
| S13, S30 | Preserve reviewed technical Roman marker syntax; deduplicate query terms only when their complete normalization/tokenization/edit-allowance signatures agree across every declared matching profile | Exact Unicode/marker tables, pipeline order and equivalence fixtures |
| S17, S29 | Best-field-per-distinct-term additive scoring; weights and deterministic edit-quality ordering below; no duplicate alias/rendering/occurrence bonus | Golden result sets, witness selection and executable parity |
| S28, S32 | Code-point multiset 1/2/3-gram candidate postings followed by exact OSA fragments; index 32 MiB encoded/128 MiB decoded; search-engine steady/peak budgets 96/160 MiB, excluding shell/UI | Completeness proof, exact packed representation, scan parity and measured memory |
| S31 B | At most one representative line per distinct query term, merging repeated lines; at most 16 lines/result and 240 code points/line, clipped only at grapheme boundaries | Reliable span projection, safe preview errors and rendering tests |
| S14, S23-S26 | Durable publication-state branch; independent format versions; semantic item change tracking; manifest-hash snapshot identity and monotonic publication sequence; trusted post-merge job-scoped writer token without main bypass | Exact ledger/receipt schemas, interrupted-deployment reconciliation and reproducibility tests |
| S35-S37, S39-S41 | Bounded transport/artifact sizes, deterministic weighted bundle planning, hosting headroom and a bounded `sharp` WebP processing profile | Exact platform wiring, packing/recovery protocols, verified encoder pin and actual fixtures |
| S15, S18 B, S19 B, S20-S21, S27 B | Same-platform full backups, native font units, gzip files, explicit personal-data bounds, preview revision checks and fresh local fencing; Android system backup remains best effort | Exact personal schema, bounded staging/accounting and crash/concurrency tests |
| S16, S22 | Retain published readers within the initial supported release line; UTC millisecond instants, at least 168 hours before recommendation and 72-hour successful-check suppression | Decoder/migration fixtures, capability table and clock-anomaly handling |
| S38 | All numeric PERF-01 to PERF-04 targets are best-effort goals, not hard implementation/release gates | Report actual latency/LCP/INP/CLS and regressions; no benchmark pass claimed |
| S43 C-end, S44-S47 | One canonical Kannada fence; reviewed verse UUID/end-line metadata; code-point Source Latin ranges and complete alignment before anchored features; grouped frontmatter; permanent lyric UUID with optional reviewed media and distinct legacy references | Exact source schemas, authoring diagnostics, identity adapters and language tables |
| S42 | Native dependency/toolchain manifests, catalogs, wrappers and lockfiles are an explicit exception to settings-only ownership | Keep one authoritative pin, not a duplicated settings value |
| S48 B | Generated renderings use target-script decimal digits, Latin ASCII, without changing numeric value/verse identity; canonical source remains unchanged | Complete reviewed digit tables and independent expectations |
| S49-S51 | Search-only ignore ZWJ/ZWNJ strictly between Kannada virama and a reviewed Kannada consonant; common/compact ASCII branches fold A-Z only; ordinary letter/mark/decimal runs plus reviewed technical grammar | Exact context/category/version tables, staged pipeline, control rejection and cross-client fixtures |
| S52 | Exclude terminal verse labels/numbers from lyric search only through reviewed range annotations on declared ending lines; no annotation means no inferred exclusion | Exact source annotation/span-projection rules; preserve displayed text |
| S53-S55 | Shared snapshot reader pins/exclusive nonblocking GC, no timeout eviction of suspended readers; additional-space margin max32MiB/10%; foreground idle audit4MiB/~50ms slices at least30s apart | Deadlock-safe lock order, quota/allocation failures, context death and cooperative scheduling fixtures |
| S56-S57 | Exact transactional UTF-8 backup-size accounting; backward clock anomaly ends freshness/suppression claims without blocking content | Serializer/accounting equality, migration rebuilding, monotonic/wall-clock and crash tests |
| S58-S60 | RFC8785 canonical JSON with safe integers; common line-ID/profile-text layout; hash-keyed manifest object table and explicit lookups | Exact field/capability/path schemas, canonicalization/compression fixtures, self-reference-free hash inputs |
| S61-S62 | LF-normalized parsed source offsets for LF/CRLF inputs without trimming/source rewrite; logical same-platform backup envelope independent of database tables | Fence/newline fixtures, exact personal schemas and versioned adapters |

All other configurable product/runtime/UI/search/network/ingestion/publication
values still originate in owning-repository settings. Safety bounds, complete
matching, integrity, responsive cancellation, accessibility and preservation of
personal/active content remain mandatory. Best-effort timing does not permit
silent truncation, false success or weaker validation.

## Current executable coverage

- ALG-01 to ALG-04: ordinary fixture tokenization, NFC/ASCII folding, counted
  code-point multiset grams, exact three-column OSA fragments, AND matching and
  deterministic best-field scoring exist in TypeScript and the native core.
  TypeScript tests compare sampled fragment/candidate cases with an independently
  enumerated substring/full-matrix oracle. This is not exhaustive completeness
  proof or reviewed technical/profile/joiner conformance. Native parity coverage
  is limited; there is no capacity/benchmark result.
  Browser projection reuses the per-publication exact-ID map in O(hits), rather
  than scanning the catalog for each hit. Explicit policy-sized UI pages expose
  the complete computed ranking; paging does not truncate the engine's hit set.
- ALG-07: fixture-only safe-integer canonical JSON, deterministic gzip/hash objects
  and policy binding exist. Tests cover LF/CRLF identity, strict parsing, repeated
  grams and byte/hash reproducibility. The production semantic ledger, receipts,
  sequence reconciliation and deploy protocol remain unimplemented.
- ALG-14: the web worker implements bounded single-member gzip and raw-deflate/
  base64url list codecs, schema/UTF8/duplicate-key validation, exact byte/link
  limits and lossless preview re-export. Independent Node zlib round trips and
  browser worker/cancellation/preview-no-write cases exist. Explicit web import
  uses transactional new-list-only persistence with repeated independent IDs,
  duplicate-name confirmation and revision/epoch checks. Native codec
  v2 client-generated codec interoperability has actual round-trip evidence;
  OS delivery and signed-link sharing remain incomplete.
- ALG-15: typed web-list writes have deterministic complete-envelope UTF8
  accounting, atomic collection/identity checks, non-destructive v1..v7-to-v8 migration and
  stale revision/epoch refusal. Actual configured byte/collection boundaries have
  executable coverage. Full recoverable backup/replacement is not implemented.
- ALG-07/08: the separate canonical publication reader preplans descriptor,
  manifest and every item against aggregate/count limits before bounded worker
  downloads. All objects must validate before activation; cancellation aborts and
  settles siblings. Literal title filtering/paging exposes the full prepared
  catalog, not production linguistic search or a ZIP/persistent-snapshot planner.
  See the [preview guide](lyric-preview.md).
- Official Unicode16 personal-name normalization/folding resources and independent
  conformance fixtures drive the actual web/native adapters. Website checks the
  official normalization equations/full scalar folding and derives versioned
  keys on demand; raw-name v8 records have no cached key to migrate. Stable
  insertion ordering is O(d squared) worst case/O(d) storage for decomposed name
  length d, bounded by personal-name policy. This is not linguistic search
  normalization, a performance benchmark or permission to merge/rename lists.
- Recent history uses an explicit ordered typed window, not wall-clock sorting:
  promotion/filtering is O(r) time/storage for the configured at-most50 distinct
  references; schema uniqueness can require O(r squared) bounded comparisons.
  Disabled/already-first opens produce no write/revision. Complete prospective
  personal-state validation/accounting remains transactional; rolling-window
  eviction does not authorize migration truncation or truncating other collections.
- Learning assignments use an explicit Set for O(l) typed uniqueness validation,
  not schema `uniqueItems` whole-object comparisons, which cannot reject
  conflicting labels and can be quadratic at configured10000 assignments.
  Lookup, change/clear copying, filter and paging scan the bounded ordered array
  in O(l) time with O(l) temporary references; complete personal accounting is
  still required in each transaction. Same-label/absent-clear actions are no-op.
  View rendering resolves summaries only from existing exact-ID maps and issues
  no content requests. This is not assessed progress, verse Practice or full backup.
- ALG-05/06/08-13: complete algorithms are not implemented. Basic verified online
  reading and process-local Android preparation are not aligned transliteration,
  a ZIP planner, persistent activation/GC, ingestion or recoverable personal backup.

Completed commands/results belong in [HISTORY.md](../HISTORY.md); this section
describes present coverage only. First API ingestion remains blocked pending
provider clarification. Full device/font and production package integration
evidence is not established.

## Complex-task inventory

| Task | Analysis topic | Priority | Owners | Relevant gates |
| --- | --- | --- | --- | --- |
| ALG-01 | Unicode normalization and search-only spelling equivalence | A | Shared policy; Library producer; both clients | D3, D4 |
| ALG-02 | Exact bounded OSA fragment matching | A | Shared specification/fixtures; both clients | D4 |
| ALG-03 | Candidate-complete search index and bounded execution | A | Library index; Shared contract; both clients | D4 |
| ALG-04 | Additive ranking, evidence aggregation and filter execution | A | Shared policy; Library index; both clients | D4 |
| ALG-05 | Selected-script excerpts, alignment and safe highlights | A | Library anchors; Shared contract; both clients | D3, D4 |
| ALG-06 | Kannada transliteration profiles and native approximations | A | Shared mappings/fixtures; Library conversion | D3 |
| ALG-07 | Deterministic publication identity and change tracking | A | Library publisher; Shared artifact contract | D2, D4 |
| ALG-08 | Bundle packing and download request planning | A | Library bundles; Shared policy; both clients | D4, D5, D7 |
| ALG-09 | Crash-safe snapshot activation, resume and writer coordination | A | Both clients; Shared lifecycle contract | D5 |
| ALG-10 | Reader-safe garbage collection, damage detection and readiness | A | Both clients; Shared lifecycle contract | D5 |
| ALG-11 | Complete ingestion scans and pending-work reconciliation | B | Library | D2, D6 |
| ALG-12 | Conservative lyric extraction and draft/hold classification | B | Library; Shared source fixtures | D2, D3, D6 |
| ALG-13 | Thumbnail optimization under quality/resource bounds | B | Library | D6 |
| ALG-14 | Bounded interoperable list encoding and decoding | B | Shared format/fixtures; both clients | D4 |
| ALG-15 | Recoverable personal-backup replacement and capacity accounting | A | Shared format/fixtures; both clients | D4, D5 |

## Search and language processing

### ALG-01: Unicode normalization and spelling equivalence

- **Requirements:** LANG-07, SEARCH-02/08/12/13, SET-01/02.
- **Already fixed:** NFC; profile-significant case/diacritics; ordinary punctuation as
  boundaries with reviewed technical-marker exceptions; only reviewed joiner equivalences. Two global common/compact ASCII
  search-only profiles must not change displayed lyrics or technical profiles.
  Query-term deduplication requires equal complete matching signatures across
  every declared profile, including tokenization and edit allowance; a case
  distinction in any technical profile prevents merging those terms.
- **Analysis needed:** compare explicit staged normalization/mapping pipelines
  and equivalence representations. Set rule order, token boundaries, alias
  expansion/deduplication, normalized-term length and provenance back to anchors.
  Avoid uncontrolled expansion and accidental collapse of distinct words.
- **Evidence:** independent accepted/rejected Unicode and spelling fixtures,
  combining marks/joiners, case-sensitive schemes, alias collisions and
  Kotlin/TypeScript parity using the snapshot's hash-pinned policy.
- **Dependencies:** reviewed D3 tables; supplies ALG-02 through ALG-05. A later
  app's defaults must not change an already downloaded index's semantics.

### ALG-02: Exact bounded OSA fragment matching

- **Requirements:** SEARCH-12/13, PERF-01.
- **Already fixed:** AND across terms; literal within-word substrings; restricted
  Damerau/optimal string alignment over Unicode code points. Normalized lengths
  1-3 allow zero edits, 4-8 one, and 9+ two.
- **Analysis needed:** specify legal fragment starts/ends and compare a simple
  exhaustive oracle with thresholded/banded dynamic-programming implementations.
  Prove initialization, pruning and early exits preserve substring acceptance
  and OSA's overlapping-edit restrictions, including adjacent swaps.
- **Evidence:** `dir sh` in `vadiraja krishna`; 3/4 and 8/9 boundaries; insertion,
  deletion, substitution and swap cases; OSA versus unrestricted Damerau;
  supplementary code points and randomized oracle comparisons.
- **Dependencies:** ALG-01. The distance model is selected; choosing a different
  fuzzy score, whole-word-only matching or UTF-16 counting is not an alternative.

### ALG-03: Candidate-complete indexing and bounded search execution

- **Requirements:** GEN-01/04, SEARCH-06/12-15, PERF-01.
- **Already fixed:** publisher-built acceleration in one global compact JSON/gzip
  index, exact fragment verification, independent Kotlin/TypeScript runtimes and
  a simple scan test oracle. Browser search uses a dedicated Web Worker.
  The selected accelerator uses code-point multiset 1/2/3-gram postings with
  occurrence counts, without word-boundary sentinels. For normalized query
  length `n` and edit allowance `k`, necessary overlap bounds are `n-k`,
  `n-1-3k` and `n-2-4k`; ignore nonpositive bounds and verify surviving
  whole-token candidates with exact fragment OSA.
- **Correctness argument to formalize:** substitution/deletion removes at most
  one query unigram; a swap preserves unigram counts. An adjacent swap destroys
  at most `q+1` overlapping q-grams for `q >= 2`. A containing token has at least
  the fragment's gram counts, so its extra grams can only broaden candidates.
  This argument is not an executed completeness test.
- **Analysis needed:** formalize the filter bounds and exact representations,
  short-term paths and cancellation-safe execution. Evaluate numeric-array representations, candidate
  intersection order, cancellation checkpoints, decoding and peak memory.
  Initial encoded/decoded ceilings are 32/128 MiB; retained/peak search-engine
  engineering budgets are 96/160 MiB excluding shell/UI. These are unmeasured
  budgets, not universally observable browser heap guarantees.
- **Evidence:** complete result parity with ALG-02's oracle, especially
  `abcd`/`acbd`, short literals and high-frequency fragments. Measure loaded
  search plus cold decode/parse peaks on a representative 10,000-item corpus;
  include IME, Enter/filter execution, cancellation and stale-response rejection.
- **Dependencies:** ALG-01/02; integrate ALG-04/05. No silent candidate truncation,
  production full scan, client-built index or sharding to pass a benchmark.

### ALG-04: Ranking, evidence aggregation and filters

- **Requirements:** SEARCH-03-06/11/12, SET-01/02, PERF-01.
- **Already fixed:** metadata-containing results precede lyrics-only results.
  Within buckets use additive weights with title > composer=ankita > deity >
  tags=form=category > context labels > context description > lyrics.
  Filters are OR within a field and AND across fields and with text search.
  Approved weights are title 100, composer/ankita 80, deity 60,
  tags/form/category 40, context labels 20, context description 10 and lyrics 5.
  Sum the best field weight per distinct query term; repeated occurrences,
  aliases and renderings do not inflate it. After field totals compare worst
  term edit count, then total term edits, then ASCII canonical lyric ID. Existing
  fixture indexes retain their versioned legacy identity semantics. Term quality
  comes from the same winning-weight field, without a whole-word/prefix bonus.
- **Analysis needed:** formalize score/evidence records and safe execution of
  AND evidence spread across fields/lines, and safe filter/top-page execution
  without discarding potentially higher-ranked results.
- **Evidence:** golden ranking cases, including enough lower-field evidence
  outweighing a title match, alias/variant duplication, exact/fuzzy mixtures,
  missing classifications, ties and online/offline parity.
- **Dependencies:** ALG-01-03. Exact weights and aggregation require approval;
  strict lexicographic field ranking is not the selected policy.

### ALG-05: Selected-script excerpts and correspondence

- **Requirements:** LANG-08/11, SEARCH-09/10, PERF-01.
- **Already fixed:** index anchors identify matches; selected-script readable
  excerpts come from bounded version-bound item reads, not all-rendering index
  copies. Source Latin needs reviewed canonical-line alignment for indexing,
  helpers and anchored navigation. Highlights cannot split grapheme clusters.
  Source Latin must have reviewed coverage for every canonical lyric line before
  aligned features are enabled; suitable complete but unaligned text remains
  whole-text-only. Mapping uses ordered, nonoverlapping half-open code-point
  ranges into the parsed supplied text, not byte/UTF-16 offsets.
  Excerpts use up to one representative line per distinct term, merging repeated
  lines: at most 16 lines/result, 240 code points/line with grapheme-safe clipping.
  Retain complete match/navigation data; show additional-match or explicit
  preview-unavailable/Open match states rather than fabricated text.
- **Analysis needed:** compare anchor/correspondence representations, match-span
  projection and excerpt selection when terms hit different lines or metadata.
  Evaluate bounded page-fetch concurrency, verified object reuse and cancellation
  so results cannot show stale text or text from another snapshot.
- **Evidence:** expansions/contractions, combining sequences, multiple hit lines,
  metadata-only hits, unaligned Source Latin, script switching and exact verse
  navigation. Measure visible selected-script excerpts/highlights including local
  and online item I/O, not just index lookup.
- **Dependencies:** ALG-01/03/04/06 and artifact contracts. Do not infer alignment
  or promise word-level highlighting where only line correspondence is reliable.

### ALG-06: Transliteration profiles and native approximations

- **Requirements:** DATA-03/08, LANG-01-04/08-12.
- **Already fixed:** Kannada canonical; Library-only post-merge conversion using
  Sanscript with reviewed pinned mappings. Nine generated non-Latin renderings,
  five Latin profiles, separate Bengali/Assamese; Hunterian deferred.
- **Analysis needed:** compare mapping/rule ordering, longest-match/context
  handling and normalization around the selected foundation. Resolve complete
  Kannada-specific tables, declared native-script losses, approved IAST
  distinctions and Tamil Grantha/consonant superscripts while preserving layout
  and persisted identities.
- **Evidence:** independent permitted samples and expected mappings, conjuncts,
  vowels/marks, spacing/verse preservation, loss declarations and global-rule
  regressions; actual system-font shaping tests are separate evidence.
- **Dependencies:** D2 source grammar and reviewed D3 data. No per-item exceptions,
  silent deletion/foreign-script fallback, generated Source Latin filling or
  actual item-variant previews in source PRs.

## Publication and offline lifecycle

### ALG-07: Publication identity and change tracking

- **Requirements:** GEN-01-06, DATA-07/08, CI-03/05, EXP-03.
- **Already fixed:** SHA-256-addressed gzip artifacts and a durable first-publication/
  output-changed-at ledger; no-op output retains identity/dates. Source mtimes
  and filename-only renames must not determine public changes.
  Logical public item data, excluding transport representation and derived
  `changedAt`, determines item changes; encoded bytes retain their separate
  integrity/address hash. Compression-only changes do not advance item
  `changedAt`, although a changed artifact set can produce a new snapshot.
  A dedicated publication-state branch records durable state/receipts; a trusted
  post-merge job uses scoped `GITHUB_TOKEN` write permissions, with other jobs
  read-only, serialized expected-tip writes and no publisher main bypass.
  Snapshot identity is the manifest hash; a durably reserved monotonic sequence
  orders publications. Gaps are allowed; potentially published sequences are
  never reused. Uncertain deployment outcomes must be reconciled before proceeding.
- **Analysis needed:** compare canonical serialization/compression rules and
  dependency-driven regeneration versus complete deterministic rebuilds.
  Specify ledger reconciliation through removal/reintroduction, global mapping
  changes, failed builds and publication retries without advancing dates falsely.
- **Evidence:** identical bytes/hashes for no-op rebuilds, isolated and global
  changes, restored ledger state, held/draft exclusions, stable first-publication
  dates and failure before deployment. Generation owns the >=7-day soft date.
- **Dependencies:** D2/D3 and exact artifact/date contracts. Whole-artifact Pages
  deployment is selected; do not assume globally atomic CDN visibility.

### ALG-08: Bundle packing and download planning

- **Requirements:** GEN-03, OFF-02/04/06/15, CI-06, SET-01/02.
- **Already fixed:** deterministic changed-at/path grouping; ZIP STORE containing
  original gzip objects; up to 100 members and 32 MiB per bundle. Individual
  objects remain fetchable; no thumbnail/video bytes enter reading transfers.
  The selected deterministic greedy cost is encoded bytes plus 128 KiB/request.
  Rank positive savings per extra byte, then savings, then bundle hash, using
  exact comparisons. Total extra bytes, including ZIP overhead/reused members,
  cannot exceed the smaller of 8 MiB or 25% of missing required encoded bytes.
  Individual objects cover every remaining requirement.
- **Analysis needed:** specify deterministic disjoint packing boundaries and
  prove planner coverage, budget enforcement and repeatability. Compare the
  selected heuristic against a small exact oracle without reopening its policy; account
  for verified cached members, repacked ZIPs, request costs and peak staging space.
- **Evidence:** repeatable plans, count/byte boundaries, actual selected transfer
  sizes, unchanged-member reuse, oversized individual artifacts, unavailable old
  objects and host storage including both bundles and individual copies.
  Publication preflight counts the entire output directory and stops above
  80% of the configured 1,000,000,000-byte site ceiling, initially 800,000,000
  bytes. Unknown future traffic is not a verified monthly-bandwidth guarantee.
- **Dependencies:** ALG-07 and approved planner/resource budgets. No unsupported
  optimality claim or forced re-download merely because ZIP membership changed.

### ALG-09: Snapshot coordination and crash-safe activation

- **Requirements:** OFF-01/04-07/10-12/15-17, QUAL-06.
- **Already fixed:** durable coordinator/journal; complete validation before one
  transactional active-pointer switch; one active plus one resumable target.
  Web Locks single writer with generation/fencing; artifact-boundary resume,
  not partial-object Range resume.
  Initial transport settings: metadata deadline 30 seconds; artifact no-progress
  timeout 30 seconds and total deadline 20 minutes/attempt; three attempts total
  with 1/2-second delays and +/-20% jitter. Snapshot concurrency is four;
  online excerpt concurrency eight. Honor `Retry-After` without shortening;
  pause explicitly if the required automatic wait exceeds 120 seconds.
  Retry only selected transient failures, not permanent/schema/capability/
  integrity errors; reconcile missing/mixed publications without changing targets
  silently. Fetched policy cannot raise consumer safety ceilings.
- **Analysis needed:** define state transitions, idempotent journal operations,
  fencing/transaction boundaries and recovery order across database/filesystem/
  network effects. Compare bounded retry/backoff and resume reconciliation
  policies without silently changing the target publication.
- **Evidence:** fault injection at each durable transition; crash, cancel,
  storage/quota exhaustion, competing tabs/jobs, stale writers and mixed/stale
  host responses. Failure preserves active content; first preparation never
  activates partially. Current-only hosting may require an explained restart.
- **Dependencies:** ALG-07/08, exact D5 structures and platform transfer rules.
  Test jointly with ALG-10; no automatic content update or permanent old snapshot.

### ALG-10: Reachability, verification and degraded readiness

- **Requirements:** OFF-03/08-11/16, SEARCH-07, LANG-09, LIB-05.
- **Already fixed:** GC protects active/staged/live-reader/recovery references;
  verify on use plus bounded opportunistic audit. Isolated later damage can leave
  independently verified capabilities usable; it is not partial first activation.
- **Analysis needed:** compare reachability/lease and reclamation strategies
  across tabs/jobs, including crashed readers and fencing races. Define audit
  scheduling, verification-cache validity and capability/readiness dependency
  evaluation for items, index, shell and required reading resources.
- **Evidence:** open-reader/update/GC races, orphan cleanup, item/index eviction,
  repair unavailable remotely, total loss and list readiness with repetitions,
  placeholders or unresolved IDs. A bad index is an error, never zero results;
  a placeholder-only list is not a ready offline lyrics library.
- **Dependencies:** ALG-09 and explicit shell/font capability contracts.
  Distinguish verified bytes from supported rendering; no image dependency,
  silent online substitution or stale readiness flag as proof.

## Ingestion and asset preparation

First API ingestion remains blocked pending provider retention/refresh
clarification. These analysis tasks neither resolve that hold nor authorize
source migration, live ingestion or automatic updates to reviewed items.

### ALG-11: Complete discovery and pending-work reconciliation

- **Requirements:** ING-01-08/11, DATA-01, QUAL-06.
- **Already fixed:** local/manual official uploads pagination with full-scan
  completeness, per-channel serialization and reconciliation against committed
  and pending work. One incremental PR when changed; no-change creates none.
- **Analysis needed:** define completeness when pages change during a scan,
  quota/time-bounded retries and checkpoint validity. Compare ID-set/ledger
  reconciliation and batch planning through open/merged/closed PRs and failures
  between branch creation, pushes and PR creation.
- **Evidence:** duplicate/reordered pages, newly arriving videos, interrupted
  backfill, concurrent runs, quota exhaustion and pending reviewer corrections.
  Repeated runs neither duplicate proposals nor overwrite reviewed sources.
- **Dependencies:** D2 identity/contracts, provider hold and configured D6 limits.
  An incomplete scan cannot be reported as successful no-change.

### ALG-12: Conservative extraction and publishability classification

- **Requirements:** DATA-02-04/07/08, ING-05/06/09, CI-01/02.
- **Already fixed:** uncertain/missing Kannada produces unpublished draft/hold
  work; no invented lyrics, attribution, verse divisions or audio transcription.
  Malformed structure/references fail rather than becoming acceptable drafts.
- **Analysis needed:** compare explicit rule/section-based extraction strategies,
  ambiguity/conflict detection and evidence retention. Define the boundary
  between extractable Kannada, supplied Latin and unrelated description text,
  plus when tooling must defer to review rather than assign metadata as fact.
- **Evidence:** permitted description fixtures with mixed scripts, repeated
  headings, non-lyric text, incomplete sections and conflicting classification.
  Measure false acceptance as well as missed extraction; reviewed corrections
  survive retries. Do not invent confidence thresholds or unreviewed lyric truth.
- **Dependencies:** D2 grammar, D3 language rules, ALG-11 and provider hold.
  No model/service dependency or automatic Source Latin alignment is approved.

### ALG-13: Thumbnail optimization

- **Requirements:** IMG-01-04, ING-05, CI-06.
- **Already fixed:** reviewed repository-managed online images, a reviewed WebP
  pipeline direction, no distortion and no offline image transfer requirement.
  `sharp` is selected pending an exact verified compatible pin. Static JPEG/
  PNG/WebP input is limited to 10 MiB/20 million decoded pixels; reject animation
  and unsupported types. Apply orientation, strip metadata, fit within 480x270
  without cropping/upscaling, and encode WebP at quality 75, reducing by five to
  a minimum of 45 only when needed for the 80 KiB ceiling; otherwise fail explicitly.
- **Analysis needed:** formalize the bounded encode search, deterministic output
  and malformed-input handling; verify encoder/libvips provenance, license,
  installation behavior and actual visual/resource results.
- **Evidence:** permitted representative images, visual review of embedded text/
  detail, byte and decode-memory measurements, invalid-image failures and
  reference validation. A missing image cannot block otherwise valid reading.
- **Dependencies:** D6 encoder/dependency review and approved dimensions/quality/
  resource settings; do not substitute a metric alone for visual acceptance.

## Personal-data portability

### ALG-14: Bounded list encoding and decoding

Web saved-list export uses the [typed personal protocol](architecture.md#web-typed-personal-storage-v8):
one validated read transaction, minimal allowlist projection, bounded worker
encoding, then epoch/revision recheck before exposing the independent snapshot.
This supplies partial stable-read/no-write/cancellation evidence, not native
round trips, platform share interoperability or full-backup exportability.

- **Requirements:** LIB-08-11, XFER-01-08, QUAL-05/06.
- **Already fixed:** versioned JSON, raw deflate and base64url in a hash fragment;
  distinct gzip UTF-8 JSON files ending `.dvlist.json.gz`. The list format marker
  is `daasavaani-list`, with frozen legacy v1 and typed lyric/legacy v2 families.
  Website re-exports v1 previews unchanged, adapts confirmed v1 imports only by
  discriminant and exports saved typed records as v2. No guessed mapping or
  silent downgrade. Complete URL ceiling
  is 2,048 ASCII characters; encoded/decoded file ceilings are 9/8 MiB.
  Oversized links offer lossless file fallback.
  Require one gzip member, valid checksum/length and no trailing bytes; absolute
  bounds replace a fixed inflation-ratio cap. Producers emit compact UTF-8 JSON
  without BOM; import may accept one leading UTF-8 BOM within the decoded cap,
  never stripping characters from user values. Gzip is not encryption.
- **Analysis needed:** define serialization/version discrimination and compare
  bounded inflate/parse/validate pipelines across platforms. Account for the
  entire URL, encoded limits, collection/text bounds and temporary memory before
  constructing a preview or committing a new list.
- **Evidence:** Android/web round trips, exact limits and limit+1, pathological
  compressed input, malformed/truncated payloads, significant user text,
  repetitions/unresolved references and unsupported versions. Cancel/error leaves
  existing data unchanged; no payload in host requests/logs.
- **Dependencies:** D4 exact envelopes/settings. Do not truncate, merge by name,
  deduplicate occurrences, include lyrics or introduce a short-link backend.

### ALG-15: Recoverable backup replacement and capacity accounting

The [web typed storage protocol](architecture.md#web-typed-personal-storage-v8)
supplies partial executable accounting/migration/fencing evidence only. It is not
the full-backup format and does not establish backup exportability or replacement.

- **Requirements:** XFER-09/10, SET-04, LIB-05, QUAL-06.
- **Already fixed:** separate full-backup envelope; approved personal state and
  preferences in one Room/Dexie transaction; confirmed replacement, not merge.
  Full backups are same-platform only: Android to Android, web/PWA to web/PWA.
  Minimal list transfer remains cross-platform. Native font preference units
  remain platform-specific; initial full restore performs no cross-platform
  font conversion.
  Files end `.dvbackup.json.gz`, use `daasavaani-personal-backup`, explicit
  `android`/`web` platform and an independently versioned format. Encoded/decoded
  ceilings are 65/64 MiB; gzip rules follow ALG-14. Newer formats/databases are
  refused non-destructively.
  Recheck the personal revision before commit; changed data requires renewed
  preview/confirmation. Fresh local generation/epoch fencing rejects stale
  writers; incoming backup data cannot restore the active fencing identity.
  Android system backup is best effort, subject to its documented 25 MB cloud
  quota/settings; manual file capacity is a separate limit. Never claim an
  automatic backup completed without evidence.
  Initial simultaneous personal limits: list names 128 code points,
  placeholder/fallback text 512, lists 1,000, occurrences/list 10,000,
  total occurrences 50,000, favorites 10,000, verse bookmarks 50,000 and
  learning-label records 10,000. Aggregate byte limits may bind first.
- **Analysis needed:** compare bounded validation/staging/replacement and forward
  migration strategies. Define exportable-capacity accounting, referential
  validation, stable backup reads and a crash-recoverable postcommit side-effect
  protocol for OS locale application.
- **Evidence:** failure/cancel before commit changes nothing; failure after commit
  truthfully reports restored data plus unapplied language and retry. Test crash
  boundaries, storage shortage, size limits, unresolved references and exclusion
  of content/journals/readiness from manual/Android Auto Backup.
- **Dependencies:** D4 personal schemas and D5 transactions/platform adapters.
  Full-backup resume state follows its own inventory; minimal-list transfers
  still exclude recitation/practice progress. No sync or heuristic reanchoring.

## Medium-complexity tasks

These tasks need bounded rule, data-structure or state-transition analysis, but
do not independently require the search-completeness proofs, cross-store crash
protocols or optimization studies above. Complexity is a provisional assessment,
not an effort estimate or a reduction in acceptance requirements. Ordinary CRUD
alone is not included. All entries below have proposed priority **B**; approved
details are recorded where available, while their remaining dependencies and
validation must be settled before implementation.

| Task | Analysis topic | Owners | Relevant gates |
| --- | --- | --- | --- |
| MED-01 | Restricted source grammar and validation diagnostics | Library; Shared fixtures | D2 |
| MED-02 | Registry conflicts and generated memberships | Library; Shared contracts | D2, D4 |
| MED-03 | Settings validation and policy-reference checks | Each settings owner; Shared contracts | D2, D4 |
| MED-04 | UI-catalog placeholder, plural and escaping rules | Shared generator; both clients | D1, D4 |
| MED-05 | Ordered list occurrences and duplicate-name comparison | Both clients; Shared personal contract | D4, D5 |
| MED-06 | Bounded recently-opened history | Both clients | D5 |
| MED-07 | Saved-location resolution and explicit resume | Both clients; Shared reference contract | D4, D5 |
| MED-08 | Session navigation and pending destinations | Both clients | D4, D5, D7 |
| MED-09 | Compatibility classification and reminder dates | Library metadata; both clients | D4, D5 |
| MED-10 | Generated discovery selection and newly-added ordering | Library candidates; both clients | D2, D4 |
| MED-11 | Independent preference resolution and capability states | Shared defaults/catalogs; both clients | D3, D5 |
| MED-12 | Shell-update notification and safe activation | Website | D1, D5, D7 |

### MED-01: Restricted source grammar and diagnostics

- **Requirements:** DATA-02/03/07/08, CI-01/02.
- **Approved source direction:** root format/permanent lyric UUID identity with grouped
  `public`, `provenance` and `review` frontmatter; source-only evidence is not
  automatically confidential in a public source repository. Use one canonical
  Kannada fence and `public.verses` records containing persistent verse UUIDs
  and `endsAt` line UUIDs. Preserve literal line/layout data and existing ending
  marks. A single pipe can occur inside a line and never implies a new line or
  full verse. Authoring tools may propose boundaries for human review; the
  publisher uses persisted declarations, not newly inferred boundaries.
  Follow the [lyric identity contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
  for `<lyricId>.md`, owner-supplied provenance, optional reviewed media and typed
  legacy references. No fake video IDs, inferred matches or automatic source
  migration. Offline imports preserve unresolved IDs without existence claims.
- **Analysis needed:** define a deterministic AST-validation pass over the
  selected Markdown/YAML parsers: allowed nodes, required sections, closed
  fences, UUID uniqueness and reference checks. Separate legitimate incomplete/
  held content from malformed input and produce actionable locations/errors.
- **Evidence/dependencies:** D2 grammar plus valid/draft/held/invalid fixtures,
  duplicate IDs across verses and whitespace-preserving prefix removal. No
  parser replacement, invented verse boundaries or publication-time ID repair.
  Extraction decisions remain ALG-12, not this validator's responsibility.

### MED-02: Registry conflicts and generated memberships

- **Requirements:** DATA-04-06, ING-06, GEN-01/04, SEARCH-04/05.
- **Analysis needed:** compare simple lookup/set representations for registry
  IDs, aliases, reviewed composer/ankita 1:1 conflicts and multi-valued membership.
  Define Unknown membership and deterministic generated groups without deriving
  attribution or treating uncertain alternatives as asserted classifications.
- **Evidence/dependencies:** D2 cardinalities/alias rules and D4 group contract;
  conflicting relations, absent/unknown IDs, label changes and duplicate
  memberships. Preserve stable IDs; clients query generated groups. Ranking and
  candidate/filter execution performance remain ALG-03/04.

### MED-03: Settings validation and policy references

- **Requirements:** SET-01/02, GEN-02, SEARCH-06.
- **Approved ownership exception:** native dependency/toolchain manifests,
  version catalogs, wrappers and lockfiles own their pins; do not duplicate
  them in settings. Other configurable product/runtime/UI/search/network/
  ingestion/publication values remain settings-owned with explicit units,
  defaults, bounds, application timing and compatibility impact.
- **Analysis needed:** define validation order and dependency/reference checks
  across owned settings, including units, bounds and inconsistent combinations.
  Distinguish build-applied values from runtime values and snapshot-pinned
  policy; compare a simple ordered validation pipeline with dependency-graph
  checks only where references actually require them.
- **Evidence/dependencies:** approved exact settings schemas; missing required
  keys, bad ranges, wrong policy identity and incompatible references fail
  explicitly. No coercion, duplicated constants or hidden fallback values.
  Full artifact integrity and activation remain ALG-07/09.

### MED-04: UI-catalog validation and generation

- **Requirements:** I18N-01-04, SET-01/02, QUAL-01.
- **Analysis needed:** define named-placeholder/cardinal-plural validation,
  cross-language key/argument comparison and target-specific escaping for
  Android/web outputs. Compare direct validated generation with a small shared
  intermediate representation only if it simplifies parity.
- **Evidence/dependencies:** exact message contract and selected toolchain;
  missing/extra arguments, plural forms, literal punctuation/escaping and
  deterministic regeneration. Shared commits source/generator/output together.
  This is not general ICU/rich text or automatic lyric/UI translation; third-party
  Kannada announcements require separate verification.

### MED-05: List ordering and duplicate-name comparison

- **Requirements:** LIB-02-04/08-11, XFER-04, REC-03/04.
- **Analysis needed:** compare transactional contiguous ordering with sparse
  order keys for independently identified UUID occurrences. Specify move,
  duplicate and manual-replacement behavior, plus NFC/case-insensitive name
  comparison without changing entered text or using names as identity.
- **Evidence/dependencies:** D4 occurrence/name contract; consecutive repeated
  items/placeholders, moving/removing one occurrence, duplicate/import order and
  cancelled duplicate-name confirmation. Confirmed equal names remain separate
  lists. Cross-platform transfer decoding remains ALG-14.
- **Current Website REC-03:** array position preserves every independent
  occurrence; movement is O(1), with no deduplication/skip/wrap. Captured/live list
  comparison is O(entries), checking exact ordered occurrence IDs/kinds/raw values
  and name; any change ends the session rather than reanchoring. Typed catalog/
  cache lookups remain exact. This supplies session navigation, not MED-07
  persisted-position recovery or durable offline/readiness evidence.

### MED-06: Bounded recently-opened history

- **Requirements:** LIB-06, SET-04, QUAL-05.
- **Analysis needed:** specify an atomic move-to-front/deduplication/eviction
  operation for the last 50 distinct successfully opened lyrics. Define what
  counts as successful opening, deterministic ordering of rapid opens and
  disable/clear behavior when a write is pending.
- **Evidence/dependencies:** personal schema and settings; repeated opens,
  50/51 boundary, failed opens, restart and disable/clear races. Disabling stops
  writes; clearing affects no lists, bookmarks or learning state. No permanent
  query history or network collection.

### MED-07: Saved-location resolution and resume

- **Requirements:** DATA-08, LIB-07/09/10, REC-04, LEARN-01/02.
- **Analysis needed:** define typed-reference lookup and explicit resolved/
  unresolved states for verse bookmarks, independent practice position and the
  single most-recent recitation list/occurrence. Specify recovery choices when
  an item, verse, list or occurrence disappears.
- **Evidence/dependencies:** D4 identities and ALG-05 anchors; moves/corrections
  retain location, ambiguous splits/removals do not guess. Repeated songs resume
  the exact occurrence; switching lists replaces the sole recitation position.
  No similarity reanchoring, per-list resume or exact lyric-scroll restoration.
- **Executable Website slice:** Shared exact-pair vectors drive strict shape and
  resolution checks. Current-list lookup is linear in list count, followed by a
  linear exact occurrence-ID search; equal references are never substitutes.
  Writes validate current full list contents, epoch and all six personal stores
  in one transaction, with full prospective-byte admission before cursor change.
  Browser journeys cover restart/no autoentry, reorder/replacement/deletion,
  empty-list preservation, rollback/retry and cancellation behind an actual
  database lock. Full-backup inclusion and reviewed verse positions remain open.

### MED-08: Session navigation and pending destinations

- **Requirements:** UX-07/09/13, XFER-05/07, OFF-10/11.
- **Analysis needed:** define a bounded navigation-state model retaining search
  text/filters/result position and list/Explore origins for the current session.
  Model pending item/list destinations through Android preparation and route
  decoding, distinguishing preview, explicit save and lyric access.
- **Evidence/dependencies:** typed D4 routes, D5 preparation gate and D7 link
  contract; Back/Forward, changed/removed origins, cancelled preparation and
  signed App Link/browser fallback. Do not auto-save a shared list, bypass
  preparation or create persistent general navigation/search history.

### MED-09: Compatibility and reminder classification

- **Requirements:** GEN-06, OFF-12-14/17, CI-05.
- **Approved date/version direction:** canonical RFC3339 UTC millisecond
  instants with localized display; recommendation at least 604,800 seconds
  after generation and successful-no-newer-compatible suppression for 259,200
  seconds from check completion. Source upload dates remain separately typed;
  do not manufacture missing times. Retain published readers/handlers within
  the initial supported release line; retirement requires a separately approved
  non-destructive migration plan.
- **Analysis needed:** define a decision table over active/published identity,
  supported major/required capabilities and check outcomes. Specify date parsing/
  comparison and local suppression state, including invalid dates and device
  clock changes. Negative elapsed time grants no freshness/suppression; use
  monotonic time in-process when available, never expire/block content.
- **Evidence/dependencies:** D4 versions/dates and generator metadata; >=7-day
  recommendation, late downloads, newer incompatible content and successful
  no-newer-compatible checks granting 3-day suppression. Failure grants none.
  Never claim latest published when only latest compatible is known, expire
  usable content or silently replace it. Activation remains ALG-09.

### MED-10: Discovery selection and newly-added ordering

- **Requirements:** EXP-01-04, GEN-04, OFF-12.
- **Analysis needed:** define selection from publisher-generated reviewed
  candidates, date ordering/ties and empty/unavailable behavior. A simple direct
  candidate selection is the baseline; repetition-avoidance, weighting or
  personalization policies are not approved additions.
- **Evidence/dependencies:** D4 candidate contract and ALG-07 publication ledger;
  zero/one/multiple candidates, stable first-publication dates after edits and
  active-snapshot selection even online. No upload-date substitution, inferred
  classifications or client-reconstructed taxonomy.

### MED-11: Preferences and capability-state resolution

- **Requirements:** I18N-02/03, LANG-05/06/08/09/12, UX-11/12/14.
- **Analysis needed:** specify independent resolution rules for device UI locale,
  remembered UI override, lyric/helper script, explicit Latin picker, theme and
  density. Model unavailable choices/rendering support without silently changing
  a stored selection; define what capability evidence can justify a warning.
- **Evidence/dependencies:** approved defaults/catalogs, D3 alignment and actual
  font/device tests; locale changes leave lyric script unchanged, manual theme
  wins over device theme, skipped setup retains defaults, unavailable previews/
  helpers explain why. No invented Latin recommendation, heuristic font-coverage
  guarantee, fallback font download or silent script substitution.

### MED-12: Shell updates and safe activation

- **Requirements:** PLAT-01/06, OFF-03/12/17, CI-03/05.
- **Current executable boundary:** the [Website shell protocol](architecture.md#web-app-interface-shell-and-normal-updates)
  defines the settings-owned cache-byte ceiling/visible-focus interval, complete
  compiled/lazy/legal resource allowlist, narrow navigation fallback, waiting
  notice and explicit unsupported/error/retry states. The
  [installation protocol](architecture.md#web-installation-metadata-and-original-icons)
  defines stable base-owned identity, original maskable/touch artwork and the
  metadata/image validation boundary. Code updates neither download
  Library artifacts nor force activation/reload or write personal data.
- **Remaining analysis:** installation/platform/eviction and full compatible
  schema/active-content upgrade coordination, including persistent offline readiness.
- **Evidence/dependencies:** D1 build output, D7 scope/routes and compatible local
  schemas; multiple controlled windows, deferred activation, offline lazy chunks
  and preserved personal/active content. No forced skipWaiting/reload; fetch
  exclusions do not reduce root service-worker scope. Content coordination and
  garbage collection remain ALG-09/10.

## Suggested analysis sequence and completion evidence

1. Establish reviewed language/normalization fixtures (ALG-01/06) and the exact
   matching oracle (ALG-02); then evaluate indexing/ranking/excerpts (ALG-03-05).
   In parallel, settle publication identity (ALG-07) and backup recovery
   boundaries (ALG-15).
2. Use artifact identity and approved budgets to evaluate planning (ALG-08),
   coordination and reader-safe recovery (ALG-09/10) together.
3. Resolve transfer envelopes (ALG-14) before client portability work. Resolve
   ingestion/asset choices (ALG-11-13) before that slice, retaining the external
   provider hold regardless of algorithm progress.
4. Resolve medium tasks alongside their owning slices after their listed
   prerequisites. Their bounded scope does not authorize filling open schemas,
   clock policies or defaults without approval. Reuse the complex tasks'
   contracts instead of introducing parallel normalization, identity, recovery
   or readiness logic.

For each task, record the exact open question, approved invariants, alternatives,
correctness argument/counterexamples, time/space/I/O costs, configuration owner
and bounds, fixture/benchmark method, actual evidence and remaining limitations.
Seek approval before adopting a significant open choice; record approved portable
decisions in Shared and operations in the owning repository.

The approved search performance goal is **best-effort 550 ms p95 from committed
input through visible selected-script excerpts/highlights**, including the
**250 ms debounce** and item I/O, on a documented representative 10,000-item
corpus, mid-range physical Android and desktop, online/offline, with the index
already loaded. PERF-02 to PERF-04 goals (LCP 2.5 seconds, INP 200 ms and
CLS 0.1) are also advisory. A numeric miss alone is not a hard implementation/
release gate; report actual results and meaningful regressions.

Document device/browser/network conditions and distinguish viewport/page,
prepared/unprepared, cached/uncached item reads and cold/warm index behavior.
There is no mandatory20/50Mbps baseline or page-versus-viewport completion rule;
report the actual measured scope and conditions.
Cold load and memory need separate measurements; engineering memory budgets do
not imply every browser exposes a reliable runtime heap counter. Correctness,
explicit errors, integrity, responsive cancellation and safety limits are not
best effort. No benchmark or measured capacity result is established here.

## Current readiness

The approved algorithm directions and initial safety policies are recorded, but
**overall implementation readiness is not yet established**. See the
[Shared readiness gates](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md#15-remaining-gates-and-implementation-handoff).
Do not present this backlog as executable algorithm analysis or a completed proof.

Before their owning implementation slices, close exact schema/packed-index/
capability/policy-signature contracts, language/Unicode/native-approximation/
technical-marker/digit tables, source terminal-label annotation, personal/backup
schemas and journal/receipt/fencing/GC lock protocols. Complete the settings
inventory with types, bounds, defaults, units, application timing and compatibility.
Provider applicability is still an external hold before first API ingestion.

During implementation, obtain actual oracle parity, crash/failure/migration,
rendering/device/routing and capacity evidence. Numeric performance goals are
advisory; safety limits and correctness remain requirements. Consolidated final
production design closure remains outstanding; staged coding authorization does
not waive those evidence requirements.

Incremental checks may be focused. Finalization/confirmation and every push require
full applicable builds/all tests under [validation policy](testing-and-release.md);
documentation-only work has the explicit all-available-checks exception while app
tooling is absent. Keep completed evidence only in HISTORY, not this current backlog.

Routine CRUD, UI styling, framework/version pinning, App Links association
publication, signing procedures and provider/legal clarification are not
presented as algorithm choices. Bounded discovery/catalog/navigation logic is
listed above as medium complexity, not as a new optimization or framework
selection. All retain their existing contract, integration and approval gates. Likewise,
source IDs and list occurrences must not gain similarity matching, automatic
reanchoring, deduplication or other algorithms contrary to approved behavior.
