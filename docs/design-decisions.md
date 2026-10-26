# Current design decisions

**Status:** individual directions selected; exact contracts and overall final
production design closure remains pending. Staged implementation of the recommended
plan and reviewed owner-text import/publication are authorized; unrestricted source
or personal migration is not. [Requirements](requirements.md) own product scope; the
[Shared specification](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md)
owns current cross-repository detail. [HISTORY.md](../HISTORY.md) is the only
archive of questionnaires, alternatives, changes and dated observations.

## Current selections

| Area | Current direction |
| --- | --- |
| Clients | Kotlin/Compose/Material3 API26+, app -> pure Kotlin core; React/strict TypeScript/Vite static PWA/hash routes |
| Platform libraries | Android ViewModels/Coroutines/Koin compiler DSL/Navigation3/OkHttp/serialization; web React state/Dexie/React Aria/CSS Modules/native Fetch/search worker |
| Ownership | Four independent repositories; Shared contracts/fixtures/settings/UI generator/resources; Library sources/ingestion/publisher; independent consumer pins |
| Source | Permanent lyric UUIDv4, flat `<lyricId>.md`, grouped provenance/review YAML, one canonical fence, stable lyric-scoped line/verse IDs; optional reviewed images/zero-or-more videos; valid drafts/holds excluded |
| Language | Kannada canonical, transliteration only, five Latin/nine non-Latin variants, global rules, reviewed Source Latin eligibility/alignment, target-script digits/Latin ASCII |
| Configuration | Product knobs in owned strict YAML settings; native dependency/toolchain manifests/locks are the explicit pin exception |
| Search | Kannada/Latin AND substrings/code-point OSA; one global counted1/2/3-gram candidate index plus exact verification/scan oracle; profile-aware normalization |
| Ranking | Metadata bucket first; best field per distinct term, weights100/80/60/40/20/10/5; worst edits/total edits/ASCII-ID ties; no duplicate evidence boost |
| Excerpts | Selected-script bounded item reads, one line/distinct term merged, max16 lines/result and240 code points/line; grapheme-safe/explicit errors |
| Formats | RFC8785 JSON/safe integers; independent version families, encoded SHA256 object map, manifest snapshot hash plus increasing feed sequence, exact size/capability validation |
| Publication | Durable Library state branch/pending-confirmed receipts; trusted post-merge job writer, no main bot bypass; semantic changedAt/no-op stability |
| Transfer | Original gzip members in ZIP STORE100/32MiB; bounded byte/request planner; images online only, no offline video/images |
| Offline | Explicit full validation/atomic pointer, active+one target, verified-artifact resume, safe reader pins/GC/fences, same-version repair/degradation, current-only hosting |
| Personal | One transactional Room/Dexie personal DB, typed identities, repeated occurrences, exact byte/collection bounds, forward non-destructive migration |
| Personal name matching | Official Unicode16 NFC/full default C/F folding/NFC with preserving derived-key migration; no automatic list renaming or merging |
| Lists/backups | Portable new-list-only minimal transfers; same-platform logical gzip full backups/confirmed replacement covering all currently implemented personal fields, versioned extension when new fields arrive, preview revision/fencing, truthful locale postcommit |
| Reading | Independent UI/script preferences; explicit Latin choice, system fonts, themes/density/helper, accessible navigation and explicit latest-list resume |
| Links/shell | Root Website and /open/ hash links, host-root association, normal worker activation, no forced reload or automatic content replacement |
| Ingestion | YouTube automation deferred to a later release, not an initial-release gate; retain local full uploads scan/reconciliation/source PR design and provider clarification before first API access |
| Releases | Full applicable checks before finalization/push; unsigned CI/local signing/protected verification; normal PR/check protection restored before release |
| Performance | All numerical search/LCP/INP/CLS targets best effort; correctness/accessibility/cancellation/integrity/safety remain mandatory |

The [approved lyric identity contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
owns typed lyric/legacy references, target minimal-list v2, text-only publication
eligibility and staged compatibility. Real source/publication schemas and separate
canonical readers implement the initial text-only slice. Website typed personal
v8/v2 transfers and native Room6 typed collections preserve old identities through structural legacy adapters;
fixture/v1 formats remain legacy-only. Future personal collections and
production adapters remain open. Website current-state backup v1 separately
implements the [same-platform protocol](architecture.md#same-platform-personal-backup-v1);
native backup and future personal collections remain open.
The [preview guide](lyric-preview.md) defines the current narrower lifecycle,
not a change to approved production PWA on-demand reading/offline behavior.

The clients' explicit [Show another lyric](lyric-preview.md#show-another-lyric)
uses the entire same verified canonical catalog independently of title filtering,
excludes the current/session-last-opened UUID, and preserves normal reader/history
and return behavior. It adds no persisted choice history, inferred classifications
or personalized recommendation. Native requires a completely prepared catalog;
Website retains on-demand selected-object reading. Both current content lifecycles
remain process-local, not durable offline snapshots. Reviewed Explore groups, publication dates,
Practice and complete active-snapshot offline discovery remain open.

Recently opened recording is initially enabled, device-only and bounded to the
latest50 distinct successful opens, with separate clear/disable controls.
The [Shared recent-history contract](https://github.com/DaasaVaani/shared/blob/main/docs/recent-history.md)
owns the exact ordered typed record and portable default. Website v8 implements
the successful-open/controls/preserving-upgrade slice; native Room6 independently
implements the same bounded device-only history. This is not permission to record search queries or send history.

Website/native later reading/Settings controls independently persist native
font units (CSS pixels/Android sp) and Shared Compact/Normal/Relaxed density, preserving canonical layout,
UI/theme independence and mounted-reader history. The
[v8 storage/reading protocol](architecture.md#web-typed-personal-storage-v8)
defines exact defaults, preserving older inputs and platform-owned spacing.
Onboarding/helper/native full-backup/Practice/offline and complete font/device evidence remain open.

The Website's [individual Recite lifecycle](architecture.md#focused-individual-recite-and-screen-awake)
implements only REC-01/02 for exposed canonical/fixture text: explicit focused
entry/exit, restorable controls and optional truthful screen-awake requests.
It reuses current reading preferences without extra personal writes/history or
content requests and ends on reader departure. Screen awake never blocks reading,
silently reacquires or promises control over OS restrictions. Website
[saved-list Recite](architecture.md#saved-list-recite-occurrences) additionally
implements REC-03 over exact ordered occurrences/placeholders, with
explicit boundaries/unavailability and conservative active-list invalidation.
Normal successful selected opens alone record history. Website's bounded
REC-04 slice persists one exact list/occurrence pair with commit-gated movement
and explicit Continue, preserving current contents and explaining deletion
without substitution. Its [Shared contract](https://github.com/DaasaVaani/shared/blob/main/docs/recitation-position.md)
keeps mode/wake ownership session-only. Website backup v1 includes the exact
pair without mode/wake state. Native resume validation/native full-backup,
reviewed verse Practice and durable offline content remain
open; no automatic entry or fabricated linguistic review is authorized.

Native independently implements the same bounded REC-01/02/03 surfaces and retains
its own Shared pin and validation. Android Back first exits focused Recite;
leaving/replacing the reader or backgrounding releases the scoped native request.
Pre-existing screen-awake ownership is preserved and foreground return does not
automatically reacquire. Native device checks do not prove every device/OS power
policy or the remaining resume/offline surfaces. Saved-list Recite preserves the
existing complete-preparation gate, exact repeated occurrences/placeholders,
typed history and original list/Back context; management preview is not readiness.

The [Shared learning-label contract](https://github.com/DaasaVaani/shared/blob/main/docs/learning-labels.md)
defines only optional Want to learn, Practising and Comfortable reciting
assignments per exact typed reference. Website v8 and native Room6 independently
add an initially empty local collection with preserving migrations, fenced atomic
writes and a filtered, paged Learning view usable before preparation and offline
(Website requires its installed interface).
No labels enter minimal transfers or imply scores, reviewed verse divisions or
content readiness. Verse Practice and its Learning shortcut remain explicitly
unavailable, so LEARN-04 is not fully complete.

The Website [app-interface protocol](architecture.md#web-app-interface-shell-and-normal-updates)
implements the selected Workbox shell-only/normal-update direction independently
of Library snapshots and the personal DB. Declarative
[installation metadata](architecture.md#web-installation-metadata-and-original-icons)
uses a stable base-owned identity, configured default-language branding and original
maskable/touch artwork without forced prompts. Actual OS installation/platform
evidence, persistent content/readiness/eviction and full upgrade evidence remain open.

## Current readiness gates

1. Verify compatible stable toolchain/dependency pins and real command registry.
2. Complete exact source/settings/public/index/policy/list/backup/capability schemas.
3. Review full language/native-approximation/alias/Unicode/technical-marker/digit tables.
4. Specify exact journal/receipt/epoch/lock-order/locale/accounting protocols.
5. Complete configurable UI defaults, route/signing/runbook details; ingestion defaults belong to the later ingestion release.
6. Demonstrate remaining production contracts and full requirement/release evidence;
   do not treat the authorized fixture milestone as complete product readiness.

Builds, oracle/crash/migration/device/font/App Links/capacity evidence belongs to
implementation validation, not an assumed design pass. Deferred first API ingestion needs
external provider clarification independently, without blocking the initial release.
Reviewed-content publication and its applicable checks remain required.
Follow [architecture](architecture.md),
[algorithm tasks](algorithm-analysis-tasks.md), [roadmap](implementation-roadmap.md)
and [validation policy](testing-and-release.md). Do not reopen settled families
or silently fill significant open choices.
