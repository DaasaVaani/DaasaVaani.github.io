# Implementation roadmap

**Status: staged implementation authorized; prelaunch text-only reading and isolated fixtures.**
Use [requirements](requirements.md), [current design](design-decisions.md),
[architecture gates](architecture.md) and the
[Shared specification](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md).
Reviewed owner-text import/publication is authorized; unrestricted source
reinterpretation and first live API ingestion are not. Remaining production
gates must close before their owning slices; no phase is globally complete.
YouTube ingestion automation is deferred to a later release under
[requirements section 6](requirements.md#6-ingestion-and-review-workflow).
It and its provider clarification are not initial-release gates. Reviewed
existing-content publication remains in the initial-release scope.
The approved [lyric identity and optional media contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
is the target for P1/P4/P5a/P7: text-only lyric publication, permanent UUID lookup,
typed references and versioned legacy-preserving transfers. Source/publication
schemas and separate real readers implement the initial slice. Website typed
favorites/lists/recent history/learning labels/font/density/latest recitation position, v1/v2 transfer adapters and preserving personal v8 upgrades are
implemented; Website also implements same-platform current-state backup v1.
Future personal collections, native backups and production publication remain open. Follow its
Shared-first rollout without inferred legacy mapping or identity changes.

Publication requires exact main checks, successful deployment and live HTTPS
verification. A preflight pass or main push alone is not deployment evidence.
The [guarded manual-main recovery](maintenance.md#current-operating-policy)
does not waive any validation gate.

The Website's [focused individual Recite](lyric-preview.md#focused-recite) adds
bounded REC-01/02 entry/exit/restorable controls and optional scoped screen-awake
requests to loaded canonical/fixture readers. No schema/preference/history or
content-lifecycle change accompanies it. Native independently implements the
same bounded focused-reading/scoped-awake surface. Website additionally implements
REC-03 saved-list order, repetitions/placeholders, explicit boundaries/
unavailability, cancellation/retry and conservative active-list invalidation,
preserving drafts/Back focus and one awake owner. Selected successful reads use
normal history without storing occurrence metadata. Native independently
implements the same bounded saved-list surface with the existing complete
compatible preparation gate and original list/Android Back context.
Website implements bounded REC-04 explicit exact-occurrence Continue, with
commit-gated cursor changes, preserving upgrade and missing-position recovery.
Native's independent upgrade/device checks and native full-backup position inclusion,
reviewed verse Practice and persistent offline content remain separate gates;
this is not complete recitation.

## Current implementation coverage

Website P5a now includes [backup v1](architecture.md#same-platform-personal-backup-v1):
all currently implemented personal state, stable export, strict local preview and
explicit atomic replacement with fresh fencing. It is not a backup of future
bookmarks/Practice, native state, lyrics or readiness. The remaining-backup work
in the table below refers to native adoption and future versioned personal fields.

| Surface | Available | Still incomplete |
| --- | --- | --- |
| P0 | npm manifests/locks, React/Vite checks, native Gradle wrapper/catalog and JVM/SDK integration | Complete selected dependency integration and production command/release matrix |
| P1 | Strict real canonical/draft source and optional authoring schemas, identity/hold/verse-range/Latin-mapping checks; separate fixture validation | Full registry/rights resolution, public metadata adapters and production diagnostics |
| P2 | Two-locale UI generation with committed web/Android resources | Reviewed five-Latin/nine-non-Latin tables, transliteration, technical grammar, plurals/escaping conformance |
| P4 | Real canonical text-only hash-addressed publication; separate fixture index producer and sampled OSA/candidate parity | Public populated-metadata/Latin/media adapters, durable ledger/receipts, semantic dates, ZIP/planner and complete language/profile index evidence |
| P5 | Verified real online metadata/catalog and on-demand UUID reading with bounded in-memory cache, literal title filter, complete paging, explicit entire-catalog Show another lyric and reader continuity; existing fixture search/preferences/themes | Complete production-profile reading, full filters/reviewed Explore groups/first-publication discovery/script/helper/video/accessibility/platform journeys |
| P5a | Transactional typed lyric/legacy web favorites/lists/preferences/recent history/learning labels with filtered local view, independent lyric font/density, preserving v1..v7-to-v8 upgrade, worker v1/v2 preview and saved-v2 export, optional share/copy/fallbacks, independent occurrence editing/import/management, exact verified catalog lookup and reader-to-list addition; native Room6 typed collections; both clients' individual/ordered-list Recite; Website explicit exact-occurrence Continue | Bookmarks/verse Practice, native resume validation, real sharing-surface interoperability, full backups including position and remaining production migrations |
| P6 | Production-only shell precache with offline lazy-worker/manifest coverage, narrow root/open fallback, explicit support/error/retry states, normal deferred code-update notice and stable declarative installation metadata/original maskable/touch icons | Actual OS installation/supported-platform matrix, persistent snapshots/journals/atomic activation/resume/repair/reader-safe GC, eviction/readiness and complete lifecycle compatibility |
| P7 | Separate native real canonical full preparation/reading and whole-prepared-catalog discovery in memory; session-local Library and independent Favorites literal filtering/complete paging/reader/Back return context, original collection/unsaved-preview/Learning context through successive choices and Settings, fixture search, Room6 typed favorites/durable lists/occurrences/preferences/recent history/learning labels and offline filtered Learning view before preparation, preserving upgrades, independent font/density/locale/theme, bounded v1/v2 preview/save/re-export, explicit complete-link Sharesheet handoff with copy/file fallbacks and reader/list navigation, core and connected tests | Full personal backups/bookmarks/verse Practice/recitation, signed App Links/receiving-app matrix, direct file sharing, durable preparation/recovery and full parity/device matrix |
| P3/P8/P9 | Dependency-ordered Shared/fixture-publisher pins; full web fixture CI/Pages and native build/core/lint CI | Initial release: production publication/signing, device CI and release readiness. Later release: YouTube ingestion automation and its provider clarification |

The fixture capability is deliberately named `fixture-catalog-v1`; all UIs label
synthetic records and unavailable features. Android bundles no lyrics and requires
explicit complete fixture preparation before reading; in-memory preparation is
not a persistent offline snapshot. Requirement families receive partial evidence,
not blanket completed IDs. No release or full153-requirement completion is claimed.

Website UX-13 coverage retains separate Library/Favorites searches, verified
indexes and result sets in memory while reading or visiting Settings. Browser
Back/Forward and the reader return link restore the originating context and
available scroll/focus; removed favorites fall back to the current valid results.
Reloading discards browsing state and requires search consent again. This is not
persistent search history, Explore continuity or Android/offline parity.
Loaded search/browse results expose all matches through explicit policy-sized
pages, preserve the expanded page on reader return and reset it when the query
changes. Configured first/second/final-page boundary journeys cover keyboard focus,
completeness and worker-failure recovery without a false no-results state.
List-origin reading retains the selected list, unsaved editor state and available
focus/scroll through return/Back/Forward in the same session; reload resets selection.
Native prepared real Library and independent Favorites retain literal title
queries, expanded configured pages and viewport through reader return/Android
Back. Canonical discovery excludes the current/session-last-opened identity from
the entire completely prepared catalog without selection requests or writes.
Catalog, Favorites, Lists, Recently opened and unsaved-preview reader origins
survive successive choices, Settings return and Android Back. Query changes
reset paging; unresolved typed favorites remain visible and filtering/navigation
does not write personal data. This state is session-only, does not implicitly
prepare/download content, and successful reader opens still obey the history
contract. Full production search/filter/Explore and offline continuity remain
incomplete; native complete preparation remains required.

XFER-01/02/03/04/05/06/08 receive partial web evidence: strict settings-derived
schema, bounded single-member gzip/raw-deflate/base64url codecs, local plain-text
preview/saved-list export, explicit cancellation and a static configured `/open/` hash entry.
Settings/preview/list management remain available when the Library endpoint fails.
Saving requires an explicit action after preview and creates a new independent
list only. Duplicate names require confirmation; revision/epoch changes require
renewed review. No lyric is fetched by transfer or saving, and no offline readiness
or signed native App Links is claimed. The [current storage protocol](architecture.md#web-typed-personal-storage-v8)
does not establish full-backup exportability, complete list/recitation journeys,
production migration coverage or native parity.
Saved-list export rechecks its read revision after encoding and refuses concurrent
changes without a write. Its gzip/link projection excludes local IDs/control,
preferences and unsaved drafts; oversized links retain a complete file fallback.
Optional browser platform APIs hand off exactly those generated links/files or
copy the link after an explicit click. Unsupported APIs/files, cancellation and
permission failures retain the manual fallbacks and never save a list. Adapter
tests are not delivery confirmation or real OS/receiving-app interoperability;
the XFER-08 platform matrix and signed App Links remain open.
Android's bounded native codec has independent Node/zlib vectors and strict
actual-ceiling rejection, plus connected preview/new-list save/re-export evidence.
It displays catalog known/pending/unavailable states without guessing matches.
Typed favorites and independently identified list occurrences persist in Room6;
v1 imports structurally become legacy references and saved lists export v2.
Actual client-generated v2 gzip/link round trips cover both codec directions,
not OS delivery. Failed/cancelled provider writes can leave an incomplete selected
destination; the warning preserves this distinction from unchanged personal data.
Official Unicode16 name matching is implemented in both consumers using Shared's
pinned tables and conformance fixtures, without platform lowercase/ICU.
Website derives keys on demand from raw names; no persisted-key cache exists
in v8. Native list-name behavior follows its
[owning storage/validation guide](https://github.com/DaasaVaani/AndroidApp/blob/main/README.md).
Existing names/identities remain unchanged; future persisted caches require
explicit profile-aware preserving migration, never automatic renaming/merging.
Durable lists do not complete full personal-state parity.

LEARN-04 receives partial Website/native evidence for self-assigned Want to
learn, Practising and Comfortable reciting labels, exact typed change/clear and
offline persisted local Learning filters/paging before content preparation.
Website pre-v7-to-v8/native Room6 migrations initialize only empty labels while preserving
all old values and identities; complete accounting, collection limits, no-op
revisions and stale-write fences remain mandatory. Unresolved records are
retained/editable and no catalog is implicitly fetched. Reader/discovery return
retains Learning context; native explicit Read remains preparation-gated.
Minimal list exports exclude labels. Reviewed verse Practice and its Learning
shortcut remain explicitly unavailable, not fabricated from flat published lines.
See the [bounded implementation](lyric-preview.md#local-learning-labels).

The [real lyric preview](lyric-preview.md) provides partial DATA-01/02/04/05,
UX-07/13, OFF-02 and SET-01/02 evidence. It preserves canonical line/layout
identity without optional media. Website explicit favorite/list actions write
typed lyric references, never real UUIDs in fixture `videoId` fields; reading
itself performs no favorite/list/preference write; an uncached exact item requires
one pinned-object request after metadata loading. Optional
device-only recent history records successful explicit opens. Legacy discriminants are
structurally upgraded without source/identity remapping. V1 previews re-export
unchanged; confirmed imports create fresh local IDs and saved exports use v2.
It implements the initial on-demand online path, not production profile search
or persistent offline preparation. Populated source metadata remains a publisher gate
until its matching public adapters are implemented; empty authoring fields are
not invented classifications, rights grants or Source Latin eligibility.

LIB-02/03/04/08/09/10 receive partial web management evidence: plain-text
placeholder/reference entry forms, optional user fallback labels, independent
ordered occurrence identities, explicit replacement and no-write invalid/stale/
cancel paths. Replacement preserves position and identity; the form initially
offers the user's placeholder text as an editable fallback, never a guessed
catalog title. List previews and saved lists resolve titles only from the currently
available verified catalog, distinguishing unresolved-before-catalog references
from generic unavailable references/placeholders without guessing matches.
Explicit real-reference Read loads only required catalog metadata and its exact
item online; preview/save/export never initiates that read. Real/legacy maps remain
independent. Readers add fresh independent occurrences
to an explicitly chosen list using the captured revision; no catalog title is
stored as a fallback or exported. Recitation remains incomplete.

UX-11 and SET-04 receive partial Website evidence for persisted Light/Dark/Warm/
Follow device selection. System-color changes do not write personal data, and
explicit choices/locale/canonical text stay independent. Strict v1..v7-to-v8
migrations preserve favorites/lists/identities and create a fresh writer fence;
future/invalid schemas remain non-destructive refusals. Palette contrast tests
do not establish full physical-device/font/offline-shell accessibility evidence.

UX-02/03/14 and SET-04 receive partial Website/native evidence for persisted bounded
lyric-only font controls and all three densities in both canonical/fixture
readers and Settings. Default platform rendering (Website28px/native28sp,
Normal density) and literal line/layout
identities are preserved. Latest-state transactions, no-op choices, peer updates,
restart, old-history preservation and actual byte-capacity checks belong to the
v8/native Room6 slices, with independent native font units and spacing. Onboarding, helper/script coverage, native full-backup inclusion/Practice, persistent offline
use and the complete accessibility/font/device matrix remain unimplemented or
unverified; this is not full UX-14 completion.

## Delivery sequence

Each phase delivers a verified behavior slice, current documentation and real
commands/tests. Prerequisites are explicit, not implied by row order.

| Phase | Prerequisites | Scope and exit |
| --- | --- | --- |
| P0 foundation | None | Approve final design, compatible pins/native manifests/locks and real bootstrap/build/check commands |
| P1 source/settings | P0, D2 | Exact contracts/validators, valid/incomplete/held/invalid/reference/identity/layout fixtures |
| P2 language/catalog | P1, D3 | Independent mapping/digit/alias/alignment/plural/escaping fixtures; global conversion/catalog generation; no real source-PR variants |
| P3 YouTube ingestion (later release) | P1,P2,D6 | Deferred local historical/incremental API ingestion, pagination/reconciliation/extraction/asset/review-PR failures and idempotency; provider clarification before live API access. Not an initial-release prerequisite |
| P4 publication/search | P1,P2,D4 | Canonical/hash/capability artifacts, durable ledger, full index/OSA parity, deterministic planner/limits and post-merge generation |
| P5 online PWA | P4, routing D7 | Individual online reading, explicit search-index consent, worker/IME/errors/filters/accessibility/preferences/direct routes |
| P5a personal journeys | P5,D4,D5 | Favorites/repeated lists/placeholders/recents/bookmarks/practice/recitation, portable minimal transfers and same-platform recoverable full backup |
| P6 offline PWA | P5,P5a,D5 | Explicit full activation/resume/failure/degradation/repair, reader-safe GC, safe shell updates and active-version precedence |
| P7 Android | P4,D1,D4,D5,D7 | app/core, required preparation with accessible recovery/lists, transfer/lifecycle/device/personal/routing parity; can run alongside P5/P6 |
| P8 automation | P4,P6,P7,D7 | Owning full-check gates, validated-only Pages, root association, local-signing/protected APK verification and normal branch rules; P3 integration belongs to the later ingestion release |
| P9 release | P8 | Complete applicable builds/tests and truthful supported-platform/privacy/compatibility/accessibility/capacity evidence |

## Slice rules

- Map work/tests to stable requirement IDs; preserve all approved behavior.
- Close applicable exact contracts/tables/protocols before owning implementation;
  do not confuse algorithm selection with proven/executable conformance.
- Pair success/failure/recovery paths and producer/consumer fixtures. Reuse shared
  contracts rather than inventing parallel normalization/readiness logic.
- Product configuration belongs in owned settings; native toolchain/dependency
  pins stay in manifests/locks. Personal data/secrets remain separate.
- No placeholder/mock search, downloaded JSON or hardcoded lyric sample counts
  as a completed app, search engine or offline library.
- Offline contains no images/video. Complete initial activation, explicit refresh,
  stale-writer/reader safety and previous-data preservation remain mandatory.
- Incremental tests may be focused; finalization/confirmation and every push
  require full applicable builds/all suites under [testing policy](testing-and-release.md).
  Missing required code checks block completion. Numeric performance goals are
  advisory, not an excuse to weaken correctness/safety.
- Keep current status/commands here; past phase discussions/validation records
  belong only in [HISTORY.md](../HISTORY.md). Never mark future work implemented.

## Task handoff

Include bounded scope, affected IDs/repositories, exact prerequisites/current
contracts, owner/settings impact, acceptance/failure paths, full validation commands,
actual results/blockers and commit/push authorization. Keep Shared pins independent.
