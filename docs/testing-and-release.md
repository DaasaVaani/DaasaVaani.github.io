# Testing, finalization and release

## Mandatory completion and push gate

- Incremental work may run focused relevant tests.
- A request to finalize or confirm completion requires the **full applicable
  build and all configured test/check suites**, not only targeted tests.
- Before every authorized push, validate the final change set with complete
  applicable builds/tests in each affected repository. Include dependent consumer
  conformance checks needed by the compatibility claim. Rerun invalidated checks
  after further edits; do not reuse evidence for a different tree.
- Required failures, skipped/cancelled suites, unavailable tooling/devices or
  incomplete checks are blockers, not passes. Fix or explicitly request guidance/
  an exemption; never silently weaken scope, quarantine failures or claim success.
- Validation is separate from authorization to commit/push and from GitHub rules.
  Record exact commands/results, tested revisions/conditions and limitations only
  in each repository's HISTORY.md. Current guides list commands/policy, not past runs.

### Documentation-only exception

While application tooling is absent, documentation-only work may finalize/push
after **all available documentation/bootstrap checks** pass. Explicitly report
that app builds/tests do not exist, not that they passed. Do not implement/install
an assumed toolchain just to fill this gap. This exception never covers code,
publisher/source validation or behavior changes needing actual checks.

Once application tooling exists, documentation-only changes do not automatically
exempt the repository from full build/test finalization; an explicit approved
waiver is needed. Include documentation tests when configured. Update this registry
alongside tooling changes.

## Current executable checks

Executable tooling covers isolated fixture features and the separate real
canonical prelaunch reader. It does not
establish complete production-schema/language/lifecycle or release conformance.

From Website:

```powershell
npm ci
npm run check
git --no-pager diff --check
git --no-pager diff --cached --check
```

The full check runs unit tests, then publishes fixtures, builds/typechecks the
current tree and runs browser tests against that fresh production build, not the
development server. `npm run build` and `npm test` are available incrementally;
`npm run test:e2e` also prepares/builds before starting its isolated preview server.
Production build additionally generates the complete bounded Workbox interface
precache; missing/skipped/oversized resources fail it. The
[shell units](../src/app-shell.test.ts) exercise the exact total ceiling/+1,
complete-versus-skipped generation and narrow root/open route grammar. The
[shell browser suite](../tests/browser/app-shell.spec.ts) uses isolated actual
HTTP hosts/generated workers, not a mocked readiness flag: offline Settings and
lazy local-transfer decode, no Library/media cache or fallback, controlled
multi-window waiting/normal activation, unsaved/personal/foreign-cache preservation,
failed candidate recovery and unsupported/registration-retry paths.
Mounted synthetic canonical-reader checks compare literal text/layout/IDs,
the complete personal database and exact item-request counts through failed and
waiting code candidates, with no history replay. Worker fault/cancellation tests
use the [native-worker script adapter](../tests/worker-script.ts) because a
precache can correctly bypass HTTP route replacement; service workers stay
enabled and real worker lifecycle/error/cancellation assertions remain intact.
`npm test -- app-shell` and
`node node_modules\@playwright\test\cli.js test app-shell` are incremental only.
Do not rebuild Website output while native connected tests hold its shared
HTTP slot. These checks do not establish OS installation, complete offline
Library readiness, eviction handling or full browser/device coverage.

Installation metadata maps to PLAT-01/06. `npm test -- app-manifest app-shell`
checks root/subdirectory identity, default-language branding, template ownership,
stale/malformed/dimension failures and complete shell bounds. The
[manifest browser suite](../tests/browser/app-manifest.spec.ts) checks both HTML
entries, actual manifest MIME/Chromium parsing/installability errors, native
SVG/PNG decoding, exact dimensions/palette/maskable safe geometry, independent
UI language, resolved browser chrome and no media-change personal writes.
Shell cases also fetch the manifest offline and exclude all icon images from
CacheStorage. `node node_modules\@playwright\test\cli.js test app-manifest app-shell`
is incremental only. These diagnostics do not prove actual OS/launcher installation,
supported-browser/device behavior or native App Links.

After changing original artwork, the owned Light palette or icon basename, run
`npm run icons` with the existing Playwright Chromium, then commit generated
SVG/180/192/512px PNGs and run the full check. Normal builds validate those
committed resources without generating them or requiring Chromium.
Development serves the same manifest projection; production includes it in the
bounded shell. See the [installation protocol](architecture.md#web-installation-metadata-and-original-icons).

Browser tests require the clean Library revision in settings/tooling.yml with `npm ci` completed and
the installed Playwright Chromium (`npx playwright install chromium` if missing).
When parallel Library development makes its main worktree dirty or advances its
HEAD, use a separate clean detached worktree at the configured fixture revision,
with its independently pinned Shared and installed locked dependencies. Set
`DAASAVAANI_FIXTURE_PUBLISHER_ROOT` to that worktree in the same PowerShell process
as validation; do not repin fixtures or bypass the clean/revision guard.
For explicit runner concurrency without npm argument-forwarding ambiguity, the
full equivalent is `npm test` followed by
`node node_modules\@playwright\test\cli.js test --workers=2`.
Both commands must pass, without test selectors; the browser runner must report
all configured projects and the intended worker count.
On a resource-constrained local host, the same complete browser command may use
`--workers=1` instead. This changes scheduling only: keep all projects, tests,
assertions and existing time limits; incomplete or failed runs remain blockers.
The replacement prerequisite maps to XFER-09 and REC-04:
`npm test -- personal-restore recitation-position personal-model` checks the
complete allowlist, copying, fresh fences, exact byte admission and rejection
without mutation. `node node_modules\@playwright\test\cli.js test personal-restore`
checks the actual six-store transaction, stale writers and final-write
quota/cancellation rollback across all configured layouts. Its API harness is
compiled from current source entirely in memory; it adds no production route,
test hook or file-format support. These API checks alone do not establish the
separate full-backup UI or native restore.
`npm test -- personal-backup list-transfer personal-restore` covers Shared web
vectors and all rejected mutations, same-platform refusal, absent preferences,
semantic duplicates, actual65MiB encoded/64MiB decoded equality/+1, gzip framing,
UTF8/JSON and preserving minimal-list behavior. Run
`node node_modules\@playwright\test\cli.js test personal-backup personal-restore`
for complete-file export/preview/confirmation, locale/theme/font restoration,
restart, source-revision invalidation, malformed/native/newer refusal, real
quota and locked-transaction cancellation/departure, worker failure/cancellation
and installed-shell offline restore without content requests. These map to
XFER-09/10 and REC-04; native backup/system backup and receiving-device matrices
remain separate gates.
The same suites also check old-epoch preference/favorite/history refusal after
replacement, continued latest-state changes within one epoch, and an actual
delayed canonical read completing after a peer restore without adding old
activity to the restored history. This maps to XFER-09 and LIB-06, not automatic
cancellation or re-recording of already exposed lyrics.
The cold-reader case holds an actual personal-store write lock while verified
text loads, then checks that the initial open is recorded after hydration without
requiring a reload or replaying mounted-reader history.
The configured suite exercises desktop, Pixel7 and320px layouts, explicit index
consent, actual search/reading, preference/favorite persistence and corrupt-artifact
errors. First-use locale cases exercise ordered supported/regional browser
preferences, unsupported fallback, an empty preference list, explicit saved
override/reload and independent theme/canonical Kannada behavior.
Appearance journeys exercise actual media changes, persisted Warm/Follow device,
configured palettes and independent Kannada UI/canonical text. Pure checks enforce
at least4.5:1 normal text/accent contrast on configured reading surfaces and3:1
interactive-boundary contrast. Native10/20/30/40/50/60/70-to80 database cases structurally
type legacy favorites/entries while preserving their raw values and every
list/occurrence ID, refreshing the local fence and rolling back invalid or
over-capacity legacy data/schema, add configured reading defaults only to existing
preference rows and preserve exact v5 history (earlier inputs gain empty history);
preserve v6 font/density, initialize empty pre-v7 labels, preserve v7 labels and
add only null recitation position; future90 refusal and stale already-open
clients stay non-destructive. Media
changes compare every personal table/header/index without automatic writes.
The [reading-preference suite](../tests/browser/reading-preferences.spec.ts)
checks configured font steps through both actual bounds, all three measured
line heights, canonical literal text/layout/IDs, narrow-screen overflow, UI-font
independence, persistence, peer updates and no mounted-reader history replay.
Default display/repeated density make no preference/revision write. Native50
cases preserve disabled typed history, favorites, repeated occurrences and raw
text, or roll back rows/version/indexes for invalid old data/schema. Unit cases
freeze old accounting and test prospective migration at the actual64MiB boundary.
`node node_modules\@playwright\test\cli.js test reading-preferences` is incremental
only. These cases do not establish onboarding/helper/Recite/Practice/offline or
complete physical-device/font coverage.
The [Learning suite](../tests/browser/learning.spec.ts) covers canonical/fixture
assignment, all three states, clearing/no-ops, peer propagation, unresolved and
UUID-looking legacy identities, configured label capacity, exact personal
snapshot isolation and no mounted-reader history replay. It checks All/state
filters, complete configured paging/new-page focus, Learning-origin
Back/Forward/consecutive discovery, explicit unavailable Practice, actual quota/
stale-fence rollback, native60 preserving/invalid/schema/over-capacity upgrade
and actual controlled offline-shell restart management without content readiness.
The [pure learning suite](../src/learning.test.ts) consumes Shared accepted/
structural/semantic vectors, tests typed uniqueness and stable order, required
current rows, exact full-envelope accounting and actual configured aggregate
ceiling/+1 admission, frozen v6 migration, no-op revision and minimal-export
exclusion. `npm test -- personal-model unicode-names learning` and
`node node_modules\@playwright\test\cli.js test learning reading-preferences recent-history lists`
are incremental only. LEARN-04 is partial: reviewed verse Practice and its
shortcut remain unimplemented; local labels are not assessed progress.

The [Recite units](../src/screen-awake.test.ts) exercise actual ownership state,
single-flight requests, explicit rejection/retry, confirmed/unconfirmed release,
system release, overlapping departure signals, late acquisition/disposal and
stale-generation isolation. The [Recite browser suite](../tests/browser/recite.spec.ts)
checks canonical/fixture focused entry/exit/restored controls, keyboard focus,
literal layout/font preservation, whole-personal no-write snapshots, offline
session reuse, Kannada unsupported feedback and controlled native platform
request/release/error/background/pending-navigation paths. Controlled adapters
exercise the actual DOM/lifecycle controller, not OS power-policy compliance.
`npm test -- screen-awake` and
`node node_modules\@playwright\test\cli.js test recite reading-preferences discovery learning`
are incremental only. The [list Recite suite](../tests/browser/list-recite.spec.ts)
checks exact mixed/repeated typed occurrences and raw placeholders, empty/start/
end/no-wrap states, unavailable identities, preserved drafts/Back focus without
Forward/restart entry, one awake owner/preferences, peer invalidation, corrupt/
cancelled/late selected reads, exact successful typed history and actual HTTP
offline verified-session reuse with explicit uncached failure/retry.
The [list comparison units](../src/list-recite.test.ts) check exact occurrence/
fallback/kind/order invalidation, independent equal records and empty lists.
`npm test -- list-recite screen-awake` and
`node node_modules\@playwright\test\cli.js test recite` are incremental only.
The [position units](../src/recitation-position.test.ts) consume Shared strict
shape/exact-resolution vectors, preserve unresolved pointers, enforce no-op
revision and exact envelope ceilings, freeze old v7 accounting and exclude
position/local IDs from minimal exports. List browsers additionally check exact
second-occurrence restart/Continue without automatic entry or wake, current
reorder/replacement, missing list/entry recovery, empty-list preservation, real
quota-write rollback/retry and departure while an actual native transaction
holds the store lock. Native70 migration preserves all old rows/IDs/raw values
or rolls back the complete version/schema on corruption.
`npm test -- recitation-position list-recite personal-model` and
`node node_modules\@playwright\test\cli.js test list-recite` are incremental only.
Native full-backup position inclusion, durable offline content,
real-device screen/power behavior and the broad supported-platform matrix remain open.
Session-continuity journeys verify query/results, restored keyboard focus
and measured scroll position through Back/Forward and reader return, no repeated
index download, separate Library/Favorites searches, removed favorites, direct
reader fallback and reset on reload. Pagination journeys serve independently
hashed synthetic catalog/item/policy/index artifacts at the actual configured
page, two-page and two-page-plus-one sizes. They cover complete ranked reachability,
keyboard/new-page focus, independent Favorites paging, reader Back/Forward,
query reset and worker-error recovery without stale cards or false no-results.
These synthetic fixtures are not a production language/corpus benchmark.
The [real-preview suite](../tests/browser/lyrics.spec.ts) serves only synthetic,
independently hashed public-family objects. It verifies metadata-only browsing,
exact selected-object requests without complete preparation, complete title paging, exact canonical text/layout, locale independence,
Back/Forward focus/scroll, corrupt-object failure/retry, cancellation, unknown IDs,
direct-route/reload loading and byte-equivalent personal database snapshots for reading
with recent recording explicitly disabled.
Additional typed-personal journeys cover explicit real favorites/repeated
reader-to-list saves, unresolved favorites after reload with no implicit download,
own-commit observation delays without stale reselection or lost occurrences,
independent real Favorites title filtering and complete configured-size paging,
new-page/reader-return focus and unchanged personal records,
mixed v2 preview/re-export/new-list save, UUID-looking legacy separation and
real list-origin return/focus/unsaved context. Loader units
cover compatible optional fields versus unsupported capabilities/versions,
identity/control/layout/hash/size failures and aggregate/count exact/+1 bounds,
including the actual configured decoded-byte ceiling. Online cache cases prove
metadata-only loading, unknown-ID no-item requests, successful cache reuse,
pre-request aggregate refusal, failed/cancelled reservation release and no cache
activation from late valid bytes after an ignored abort. Browser cases prove
explicit catalog/item error and cancellation/retry, with no false no-results or
history write before a successful exposed reader. Incremental commands:

```powershell
npm test -- lyric-publication
npm run test:e2e -- lyrics
```

These focused checks do not replace `npm run check` before finalization/push.
The [canonical discovery suite](../tests/browser/discovery.spec.ts) maps partial
EXP-02/04 and UX-13 evidence: selection beyond filtered pages, exact chosen-object
requests/text/layout/IDs, current/last-opened exclusion, normal history/revision
counts and no mounted-reader replay, catalog/Favorites return with measured focus,
ordinary typed Favorite/Add to list, Kannada sole/current unavailability and
explicit selection/item failure with pinned-object retry and no personal writes.
Units reach every candidate through configured two-page-plus-one catalogs, test
index endpoints, sole/unknown exclusions and invalid random values, reject empty
published catalogs under the unchanged schema, and prove selection fetches nothing.
`node node_modules\@playwright\test\cli.js test discovery` is incremental only.
Browser random injection is single-use for the selector, then restores the actual
random source before React Router creates its independent history keys; tests
must not manufacture navigation-key collisions. These cases do not prove reviewed
Explore groups/dates, Practice or persistent active-snapshot offline discovery.
The [history suite](../tests/browser/recent-history.spec.ts) covers actual real
and fixture reader success, no activity from catalog loading/preview/failed routes,
distinct typed ordering and the actual configured rolling-window ceiling,
disabled-state persistence, clear independence and no re-recording of a
still-mounted reader after peer-tab controls. It checks v4 preservation/rollback,
over-capacity current-history refusal, injected quota failure without partial
writes or hidden readable text, controls/return focus and unchanged unrelated
personal rows. The complete configured64MiB accounting case includes history.
`node node_modules\@playwright\test\cli.js test recent-history` is incremental only.
Actual hosted objects and real desktop/mobile reading require separate post-deploy
verification; synthetic tests are not owner-text/linguistic review.
The actual Unicode16 personal-name adapter executes all Shared integer vectors,
comparisons and invalid UTF16 units, official normalization equations and full
scalar folding against official C/F records, with host normalization disabled in
an additional guard case. Build guards reject changed settings/table/vector/license
bytes. Browser journeys check byte-identical packaged licensing, an old-package
collision that now splits, existing newly equal names without any current database/
row rewrite, and future explicit independent reuse/rename cancellation.
`npm test -- unicode-names` is the focused unit command. These are Unicode-data/
algorithm checks, not transliteration, linguistic review or full personal parity.
`npm run demo` publishes only synthetic fixture artifacts and serves the
local Website at the configured settings/web.yml port. It is not a production
Library deployment or a source migration.
The fixture tool repository/revision/default checkout path are centralized in
settings/tooling.yml. CI uses the same validated revision, overriding only its
local checkout location through DAASAVAANI_FIXTURE_PUBLISHER_ROOT. The helper
rejects a wrong revision or dirty producer tree; never replace it with floating main.

Shared: `npm ci` then `npm run check` regenerates/tests catalogs and fixture/settings
contracts; check generated resources remain unchanged. Library: `npm ci` then
`npm run check` runs TypeScript and all publisher tests; `npm run publish:demo`
generates only explicitly synthetic fixtures. No real source-PR variants.

Web transfer unit tests compare both frozen v1 and typed v2 families with independent Node
zlib, including exact/limit+1 encoded/decoded/link ceilings, BOM accounting, malformed
UTF8/JSON/schema/duplicate keys, every truncated fixture, CRC/length damage,
concatenated members and trailing bytes. Browser journeys exercise the actual
worker and built open-path entry, plain-text/repeated-entry preservation, file/
link re-export, unavailable Library and unchanged personal records. A controlled
nonresponding worker tests cancellation/termination deterministically; it is not a
compression-speed benchmark. Confirmed web import and list creation/rename/
duplication/deletion exercise the real personal database, including cross-tab
duplicate-name confirmation invalidation, migration rollback, future-schema refusal
without changing unfamiliar stores, blocked-upgrade recovery and preservation of
favorites/preferences. Model checks also account for old and longer typed target
envelopes, exact target capacity and capacity-minus-one refusal, actual favorite
and stored-byte ceilings, strict old-schema discrimination and no input mutation.
Occurrence journeys verify independent add/edit/move/remove/
manual replacement, stable UUID/order, focus after movement, literal user text,
configured code-point boundaries, optional fallbacks, stale writes and cancellation.
Unchanged duplicate names do not reprompt on entry edits; actual renames do.
Saved-list journeys download/decompress the actual gzip, locally reopen links,
compare every table before/after and verify stored rather than unsaved names.
Controlled workers test post-encode revision refusal and cancellation; high-entropy
valid snapshots exercise oversized-link refusal plus lossless file fallback.
Controlled browser sharing/clipboard adapters compare the exact URL and gzip File
against independent Node decompression, on previews and saved lists. They exercise
copy/share denial, neutral cancellation, unsupported files/absent APIs, manual
fallbacks, pending-confirmation dismissal, concurrent-save fencing and stale
completion after unmount, with every personal table unchanged. These tests do not
establish real OS sharing, receiving-app delivery or clipboard permission behavior.
Open-path same-document navigation after saving/moving/exporting verifies current
router-bound payload decoding without a reload; unsupported query suffixes remain
invalid and all personal tables stay unchanged.
Catalog integration journeys verify known/unavailable/not-yet-resolved states,
literal fallback/placeholder text, exact-ID matching, no lyric request before
Read, catalog retry without personal writes, and no catalog title in saved/exported data.
List-origin reading retains selected editor context, measured scroll and exact
focus through return/Back/Forward. Reader-to-list choices are explicit and
revision-bound, preserve repetitions and refuse concurrent-tab stale writes.
Native codec vectors and connected preview/re-export checks are documented in
the [Android guide](https://github.com/DaasaVaani/AndroidApp/blob/main/README.md).
Native connected checks also cover typed durable favorites/lists/occurrences and
preserving Room upgrades, duplicate-name confirmations and stale-write refusal.
Actual client-generated v2 file/link compatibility requires both actual codec
directions and exact snapshot comparison, with preview causing no personal write
or content request. These do not establish signed App Links, real receiving-app/
provider interoperability or complete offline-shell/platform behavior.
Tests include actual 9MiB encoded, 8MiB decoded and 2,048-character complete-link
boundaries, not only reduced test limits. Highly compressible valid data is not
rejected by an invented ratio cap. The build emits third-party license notices.
Personal tests cover the actual configured complete-envelope byte ceiling and
exactly one extra byte, including control/header/revision/identity/escaping UTF8
overhead, plus the actual list-count ceiling and limit+1. Transport-preview
no-write checks compare every personal table, not just preferences.

Native sharing cases inspect the exact standard chooser/ACTION_SEND/text/plain
intent and complete validated v1/v2 link, including the actual complete-link
ceiling. Explicit preview/saved-list actions retain display/copy/document
fallbacks after dismissal or narrow system failures, refuse over-cap sharing
without truncation and preserve all personal rows. An emulator smoke case opens
the actual Sharesheet and returns with Android Back. Intercepted intents and
chooser display do not prove recipient receipt, provider/device interoperability
or incoming signed App Links. File export still uses Create Document, not direct
file sharing. No unreliable activity-result code is treated as a delivery or
cancellation receipt; see the [native guide](https://github.com/DaasaVaani/AndroidApp/blob/main/README.md).

Native learning checks cover Shared structural/semantic vectors, stable typed
order and no-op/limit/accounting semantics, preserving Room6 migration and local
filter/paging/restart management before preparation. Connected journeys exercise
canonical/fixture label controls, exact text/history preservation and true
Learning origin through preparation, readers, repeated discovery, Settings and
Android Back. Minimal exports exclude labels; reviewed verse Practice remains
unavailable. These do not prove durable canonical preparation or full device parity.

Android requires Node, JDK21, the configured SDK36/build tools and an API36 emulator
for current connected evidence. Set JAVA_HOME/ANDROID_HOME and select the intended
device with ANDROID_SERIAL; do not target another user's device. From Android:

```powershell
npm ci
npm run config
.\gradlew.bat :core:build :app:build :app:lintDebug :app:lintRelease :app:connectedDebugAndroidTest --no-daemon
```

App-level JVM tests currently have no sources; the pure core has executable JVM
tests. The connected test launches the actual Compose app, requires preparation,
downloads/verifies the served fixtures and opens canonical text. The native
suite also covers Room6 typed favorites, durable list/occurrence management and
device-only recent history, preserving migrations, v1/v2 import/export,
reader/list navigation and independent font/density/locale/theme controls.
Reading cases preserve the existing Normal baseline, literal text/spacing,
typed history/identities and unrelated personal state through defaults,
bounded/no-op actions, restart and older-format upgrade.
Synthetic verified-catalog
journeys exercise native real Favorites literal filtering, complete configured
expandable pages, query reset, retained viewport/reader/Android Back context,
unresolved typed references and no incidental personal writes. These do not prove
full production linguistic search or the complete real corpus;
see the [native validation guide](https://github.com/DaasaVaani/AndroidApp/blob/main/README.md)
for its owning scenarios and current limitations. The Website demo
must run at the endpoint configured in Android settings. API26/other devices,
release signing and complete Android parity are not established.
Native CI builds all debug/release variants and runs core/JVM/lint checks; the
connected suite is a required local finalization check with the configured server/
owned emulator, not a claimed CI-device pass. Unsigned release compilation does
not constitute release signing or a release-ready candidate.

Also validate all changed/new Markdown for UTF8/newline/whitespace, relative file
links, current local anchors and balanced fences. Preserve all153 unique requirement
IDs and ensure current guidance agrees with the Shared specification. Include new
files explicitly; do not stage unrelated changes merely to run validation.

Website workflow validation uses actionlint v1.7.12 with a pinned download checksum.
With the existing binary installed, `actionlint` runs from this root; shell
analysis also needs ShellCheck. Workflow changes require the documented workflow
checks. No application validation is implied. Do not invent commands if absent.

From Shared, AndroidApp and Library, respectively:

```powershell
python tools\check_repository.py
git --no-pager diff --check
git --no-pager diff --cached --check
```

Their CI also parses all .github YAML files. With existing Ruby, the workflow
command is `ruby -e 'require "yaml"; Dir.glob(".github/**/*.{yml,yaml}").each { |path| YAML.load_file(path); puts "Parsed #{path}" }'`.
An already-available YAML parser can check syntax locally; disclose the actual
method rather than claiming the Ruby command ran. The hygiene checker enumerates
tracked paths: include new documentation deliberately and preserve unrelated staging.

| Full application check | Current command |
| --- | --- |
| Website | `npm run check`: unit tests, fresh fixture build/typecheck and three-viewport production-preview browser tests |
| Shared | `npm run check`: deterministic UI/Unicode generation and all contract/settings/conformance tests |
| Library | `npm run check`: typecheck, canonical source validation and all source/import/publisher tests |
| Android | Generated config, full build/core/JVM/lint and connected test above; no app JVM test sources |
| Production/release | Incomplete: full schemas/tables, snapshots/personal migration, signing/platform/accessibility/capacity matrix |
| Performance/capacity harness | Not implemented; no production timing/memory/corpus result claimed |

## Partial requirement evidence

These mappings identify limited executable evidence, not completed requirement
IDs or a release acceptance declaration.

| Requirements | Current evidence | Boundary |
| --- | --- | --- |
| DATA-01/02/04/05/07/08 | Real canonical source/import/publication contracts, optional empty authoring fields, LF/CRLF/UUID preservation, verse/alignment validation, held-input isolation and separate media-independent readers; typed web lyric references and preserving structural legacy adapters | Populated public metadata/Latin/media adapters, full rights/registry closure, remaining personal collections/backup and production lifecycle remain incomplete |
| SEARCH-12/13 | Sampled independent substring/full-matrix oracle, counted-gram candidates, native core checks and real browser search | Ordinary fixture text only; reviewed profiles/aliases/markers, exhaustive proof and complete native parity pending |
| PLAT-01/05/06 | Real React and Compose apps; built-site desktop/mobile/320px journeys; stable PWA manifest/root and direct-entry links, decoded original icons, Chromium installability diagnostics and independent chrome/theme checks; one native API36 reading journey | Actual OS installation/launcher behavior, complete routes/layout/interaction modes and supported-platform/device matrix pending |
| I18N-01/02/03, SET-04 | Matching two-locale resources; web first-use ordered browser-language selection, configured fallback, persisted four-mode appearance with contrast/media checks; native durable locale/theme preferences; canonical text remains independent | Complete script/personal preferences, device/font matrix and full localization conformance pending |
| LIB-01/02/03/04/05/08/09/10/11 | Typed web/native lyric/legacy favorites/lists, independent occurrences/plain text, duplicate-name confirmation, management/manual replacement, exact catalog details/explicit reading, reader-to-list addition and preserving web v8/native Room6 upgrades | Offline/full personal collections and remaining production migrations remain incomplete |
| LIB-06, SET-04, QUAL-05 | Web v8/native Room6 default-on device-only typed50-distinct successful-open history, explicit disable/re-enable/clear, retained unresolved refs, exact accounting, migration/failure/no-network and restart checks | Selected-script/offline parity and native full personal backup remain incomplete |
| LEARN-04, QUAL-05, XFER-01 | Website v8/native Room6 self-assigned typed labels/local filtered paged Learning view, no-network/offline management, preserving upgrade, exact limits/fences/no-ops and exclusion from minimal transfers | Reviewed verse Practice shortcut and native full backups remain incomplete |
| REC-01/02/03/04, QUAL-05 | Website/native canonical/fixture focused Recite with explicit exit/restorable controls, exact text/font/history preservation and optional scoped screen-awake lifecycle/error handling; ordered independent occurrences, explicit empty/boundaries/unavailable states, preserved list context and active-list invalidation; Website exact latest-pair persistence, commit-gated movement, explicit Continue/recovery, preserving v8 migration and failure/cancellation checks; native complete-preparation gating | Native resume/device validation, native full-backup position inclusion, selected-script generation, durable offline content and complete real-device power-policy/platform evidence remain open |
| UX-02/03/14, SET-04 | Website/native canonical/fixture and later Settings lyric-only bounded font/all densities, exact layout preservation, persisted independent native-unit choices, no-op/history and preserving web v8/native Room6 checks; Website peer propagation and saved-list reading controls | Onboarding/helper/native full-backup resume inclusion/Practice/offline and complete font/device evidence remain open |
| UX-13 | Web in-session Library/Favorites context and list-origin selected editor state, Back/Forward/reader return with measured scroll/focus; removed-result/direct-reader/reload coverage; native prepared real Library and independent Favorites literal query/pages/viewport and reader/Android Back context, plus Library Settings return | No persistent search history; full production filters/search/Explore and offline continuity remain incomplete |
| EXP-02/04 | Web/native explicit entire-verified-catalog canonical selection, current/session-last-opened exclusion, honest sole/current/error states and ordinary typed favorite/list/history controls; web on-demand selected-object requests, native prepared-only/no-request selection and truthful original collection/unsaved-preview/Settings/Back continuity | Reviewed Explore groups/first-publication dates, Practice and complete persistent active-snapshot offline discovery remain incomplete; consumers adopt Shared and validate independently |
| XFER-01/02/03/04/05/06/08 | Bounded web worker/native v1/v2 codecs with independent vectors, explicit previews/transactional new-list saves and saved-v2 exports, actual cross-client v2 codec round trips, catalog-only details, browser share/copy adapters and native complete-link chooser/payload/Back/fallback/no-write checks | Real receiving-app/provider/device interoperability, direct native file sharing, verified App Links and native full backups incomplete |
| SET-01/02 | Owned settings/schema guards, Shared policy binding and immutable clean fixture-tool pin | Complete production settings inventory, language/protocol/backup contracts and all compatibility fixtures pending |
| QUAL-01/02/03 | Semantic browser controls, keyboard focus entrypoint, standalone canonical reading and no video/tracking dependencies | Full keyboard/screen-reader/contrast/scaling/platform journeys remain unverified; no formal conformance claim |

## Shared submodule updates

Consumers pin Shared independently. Updating Shared does not by itself update
Website, Android or Library; update only the consumers authorized for the change.
For an authorized coordinated update, use this publication order:

1. Finish and fully validate Shared, commit it, push it to its origin and wait
   for its required CI to pass. Select that exact published, validated commit;
   do not reference a local-only commit or an unvalidated branch tip.
2. In each affected consumer, preserve unrelated work, ensure the Shared checkout
   is clean, fetch Shared and check out the selected full SHA in detached HEAD
   mode. Do not automatically track the newest main revision. Verify the checkout
   matches the intended SHA and review the changes since that consumer's old pin.
3. Validate each consumer against that exact checkout using all applicable builds,
   tests and documentation checks. While bootstraps have no app tooling, also run
   `python shared\tools\check_repository.py` from each consumer and check the
   pinned Markdown links/fences. A documentation-only Shared update plus gitlink
   metadata may use the documentation-only exception; executable Shared changes
   still require their actual dependent conformance/build/test evidence.
4. Stage the consumer's `shared` gitlink and directly related documentation/history,
   verify the staged gitlink SHA, and rerun checks invalidated by final edits.
   Commit and push the consumers only after the Shared publication gate passes.
   Independent consumer commits/pushes may run in parallel; Shared comes first.
5. Verify each remote consumer main contains the intended mode-160000 gitlink,
   its local submodule matches that pin without modifications, and its CI passes.
   A fresh recursive checkout must resolve the pinned Shared commit from origin.

Record exact Shared/consumer revisions, commands/results and limitations only in
each affected HISTORY. Existing clones activate committed pins with
`git submodule update --init --recursive`; this does not authorize advancing pins
with `--remote`. A failed upstream or consumer check blocks that update rather
than silently selecting a different revision.

## Required implementation test matrix

The [approved lyric identity contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md#7-required-acceptance-evidence)
adds target acceptance obligations: text-only publication/reading, unchanged
personal and line/verse identities after media additions/removals, typed v1/v2
legacy compatibility and no inferred mapping/source mutation. The source/publication and separate canonical-reader slice has executable
evidence; fixture personal/transfer checks still do not prove typed-reference,
media-evolution or full lifecycle acceptance. Source/record migrations require
their own explicit authorization.

Use [requirements acceptance scenarios](requirements.md) and
[Shared traceability](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md#14-requirement-and-verification-traceability).
The [algorithm inventory](algorithm-analysis-tasks.md) defines proof/fixture work.
Selected libraries are not conformance evidence.

| Surface | Full applicable coverage once implemented |
| --- | --- |
| Shared | Contract/settings/catalog validation, independent accepted/rejected fixtures, canonical serialization, generated Android/web resource equality and compatible consumer checks |
| Library | Type/lint/build/unit/integration/source fixtures; strict producer/reference/draft/hold rules; deterministic publisher/index/ledger/package/host checks at appropriate post-merge stage |
| Website | Typecheck/lint/build, Vitest pure/React tests, critical Playwright browser/worker/storage/offline/multi-window/accessibility flows |
| Android | Complete configured build/lint/JVM/instrumentation suites; Room/lifecycle/Compose/background transfer/App Links/signature checks |
| Release/platform | API26/current/33-34 transfer boundaries, physical devices, supported browser current/previous majors, orientation/input/scaling/system-font rendering and manual accessibility evidence |

Source PRs validate sources/tooling fixtures but never generate actual item variants/
previews. Actual full generation/validation is post-merge before deploy; full-check
policy does not waive that boundary. First live API ingestion remains blocked
pending provider clarification; deterministic offline fixtures can be tested.

Vitest is selected for TypeScript tooling/pure algorithms, jsdom/Testing Library
for isolated React, Playwright for real browser/platform behavior. Android uses
JVM and instrumentation, not Robolectric by default. Exact runners/matrices/pins
remain design gates. State untested devices/browsers; latest Chromium/emulator
alone never proves broad platform support.

## Critical correctness and recovery evidence

- Exact code-point OSA fragments versus exhaustive oracle,3/4 and8/9 thresholds,
  adjacent swaps/overlap restrictions, supplementary characters and candidate
  completeness; abcd/acbd cannot be lost by an unsafe bigram filter.
- All-term metadata/lyric matching, ranking/signature/alias/case/marker/joiner/
  digit fixtures, no silent truncation and invalid-index errors not empty results.
- Selected-script excerpts/highlights/navigation, complete Source Latin mapping,
  grapheme safety and honest preview/unavailable states.
- Strict draft/hold/invalid sources, stable UUIDs, literal layout, grouped YAML,
  LF/CRLF offsets, filename-only rename/no-op hashes and public whitelist.
- Canonical JSON/gzip/SHA256/capability/version boundaries, ledger sequence/receipts,
  current-only mixed/stale/missing responses and reproducible byte accounting.
- Explicit Load search/size consent, IME/debounce/Enter/filter cancellation and
  stale results; independent UI locale/script, catalog/plurals/third-party strings.
- Full activation/cancel/crash/low-space, reader pins/locks/deadlock/GC, corruption/
  degraded repair, verified resume, no partial/mixed snapshot/false readiness.
- Repeated occurrences/placeholders/unresolved refs, duplicate-name confirmation,
  stable exact recitation/practice/bookmark identity and no guessed reanchoring.
- Minimal lists cross-platform/new-list-only, lossless size fallback; same-platform
  full backup/replace/revision/epoch and truthful postcommit locale failure.
  Exact capacity accounting, newer-format refusal and content/readiness exclusions.
- Routes/root scope/App Links/pending destinations, normal worker activation,
  offline lazy chunks, player only after Play, screen-awake lifecycle/failure.

## Best-effort performance

Advisory goals: search550ms p95, LCP2.5s, INP200ms, CLS0.1. A numeric miss alone
is not a hard implementation/release gate; report meaningful regressions.
Correctness, responsive cancellation, accessibility, integrity and safety limits
remain mandatory.

Measure input through selected-script excerpts/highlights including250ms debounce,
worker scheduling/ranking/render and item I/O, index already loaded. Representative
10,000-item all-rendering corpus, physical mid-range Android and desktop;
document network/device/browser/query mix/sample/warmup/cache conditions and
viewport/page completion. No mandatory20/50Mbps baseline. Cold loading/memory
separate; no prewarming/proxy scores/fake field analytics. No-user-analytics scope stays.

## Deployment and release

Only fully validated public output deploys, never repository sources. Normal main
protection requires PR/named checks, no admin exemption/mandatory second reviewer,
no force/deletion. Remove the temporary admin exception before release.
See [maintenance](maintenance.md) for current operational controls.

Website Pages deployment runs only from `main`, after successful workflow lint
and the complete web suite in the same run. Push is the normal trigger; an
authorized manual recovery must explicitly set `deploy_main=true`. Manual
dispatch defaults to validation only, and non-main branches cannot deploy.
Use the [recovery command and exact-head checks](maintenance.md#current-operating-policy);
neither a push nor dispatch proves that deployment completed.

CI produces unsigned Android candidates; maintainer verifies/signs locally,
protected workflow verifies package/version/certificate/source association and
publishes signed APK. No signing/API key in CI/logs. Keep secure key backups.
Verify direct routes/association, independent content/client compatibility, actual
APK/download/installed/update peak sizes, update/rollback recovery and provider hold.
Archive release check records in HISTORY; publish only accurate supported versions.
