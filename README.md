# DaasaVaani

Hari Dasa Sahitya discovery, reading, practice and recitation through a responsive
static PWA and a separate native Android app.

**Status: text-only prelaunch reading and isolated fixture features; not a production release.**
The approved [lyric identity and optional media contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
defines permanent lyric UUIDs and text-only publication without YouTube/images.
Library publishes owner-approved canonical lyrics without videos or images.
The [real lyric reader](docs/lyric-preview.md) loads verified catalog metadata
when online browsing or an exact UUID link is opened, then downloads only the
selected lyric. Verified content stays in memory. Successful opens update optional device-only Recently opened
history, initially enabled with separate disable/clear controls; disabling
recording preserves existing entries. Catalog loading and previews do not record
activity. Explicit controls save
typed lyric favorites and independent list occurrences locally. List v2 transfers
preserve lyric/legacy identities and user text; v1 imports remain supported.
Existing identifiers are never guessed or remapped. Persistent offline Library state,
production metadata adapters and the complete production lifecycle remain open.

The responsive React Website reads hash-verified artifacts from the Library fixture
publisher, with explicit indexed-search consent, canonical Kannada reading,
transactional favorites and independent interface-language/theme preferences.
First use follows the first supported browser-language preference, falling back
to configured English; an explicit saved language overrides browser preferences.
Light, Dark, Warm and Follow device appearance choices persist locally. System
light/dark changes affect only Follow device, without changing personal records,
UI language or canonical text.
Library/Favorites searches and result positions survive in-session reading and
Back/Forward navigation, without persistent search history.
Canonical catalog/readers offer **Show another lyric** from the entire verified
catalog, independently of title filtering or visible pages. It avoids the current
or last successfully opened lyric in that catalog session and explains when no
other candidate exists. Selection is not personalized, does not prepare a library
or save separate choice history; opening the result uses normal reader controls
and optional Recently opened recording.
Loaded Website and native readers also offer focused **Recite**, explicit exit/restorable
controls and optional screen-awake requests with honest support/lifecycle/error
feedback. Individual mode does not write personal data, reload text or force full
screen. Website and native saved lists additionally offer explicit ordered Recite with every
independent repetition/placeholder, honest unavailable/empty/boundary states and
Previous/Next without wrapping. Website remembers the exact latest occurrence
and offers explicit **Continue recitation**, including after restart; it never
automatically enters mode or substitutes a missing occurrence. This is not
durable offline content readiness. Native retains its complete-preparation gate.
Successful selected lyrics use normal recent history. See the
[focused-reading guide](docs/lyric-preview.md#focused-recite).
Recently opened retains the configured latest50 distinct typed references across
restarts, never search queries or lyric copies, and never sends history to a service.
Both clients' readers also support optional self-assigned Want to learn, Practising
and Comfortable reciting labels. The [Learning view](docs/lyric-preview.md#local-learning-labels)
filters and manages exact typed assignments locally, including unresolved
references, without downloading lyrics. Assignments survive restart and work
offline with the installed interface; they are excluded from minimal list
exports. Reviewed verse-based Practice is explicitly unavailable, not inferred
from these labels or the published flat lines.
Loaded search results expose every ranked match through explicit configured-size
pages; Show more focuses the first newly revealed result and retains the expanded
context through in-session reading.
Settings can preview bounded list files/links locally, re-export snapshots and
explicitly save new independent lists. Lists supports creation, rename,
duplication and confirmed deletion, with repeated occurrences and duplicate-name
confirmation. Occurrences can be added, edited, moved, removed and explicitly
replaced without changing their independent identities or other repetitions.
Production builds cache the interface and lazy workers separately from Library
content. An installed interface can reopen Settings and decode local transfers
offline, but does not make lyrics ready offline. New app code shows a notice to
close all website windows and reopen, without forced reload/activation or personal
data replacement. Registration/update errors have explicit retry; unsupported
browsers retain online features. See the [shell protocol](docs/architecture.md#web-app-interface-shell-and-normal-updates).
The [installation metadata](docs/architecture.md#web-installation-metadata-and-original-icons)
provides a stable app identity, original maskable/touch icons and standalone launch.
Use the browser's Install/Add to Home Screen command where offered; the site never
forces a prompt or redirects into an app. Actual OS installation and the complete
supported-browser/device matrix remain unverified. Persistent Library snapshots
remain incomplete.
Saved lists export independent minimal gzip files/links with stable-read revision
checks. Supported browsers offer explicit system sharing and clipboard copy;
selectable links and complete downloads remain available as fallbacks. System
handoff is not delivery confirmation. Available verified catalog titles resolve list references without fetching
lyrics; explicit Read opens known entries, and readers can add independent
occurrences to chosen lists. Settings also exports a separate same-platform
personal backup and previews it before explicit replacement of all current
personal data, including the saved recitation pair. Files are not encrypted and
contain personal settings, lists and activity; nothing is uploaded. Restore is
atomic, preserves identities and unresolved records, and refuses stale previews
without merging. An installed interface can perform this locally offline.
See the [backup protocol](docs/architecture.md#same-platform-personal-backup-v1).
Native backups, future bookmarks/Practice and durable offline recitation remain
incomplete; personal backups contain no lyric content or offline-readiness state.
Shared generates the English/Kannada UI resources; Android has separate real
text-only preparation/reading and fixture features with typed Room favorites,
durable lists/independent occurrences, recent history, learning labels, preferences and locale/theme controls.
Strict v1/v2 file/pasted-link previews can be explicitly saved as independent
lists; readers and list entries use exact typed identities without guessing.
Native preview and list management work before preparation.
Native Learning likewise filters and manages local assignments offline before
preparation; explicit Read remains behind complete canonical preparation.
After complete canonical preparation, its catalog and readers offer the same
whole-catalog Show another lyric action without fetching or preparing content.
Successive choices retain the original catalog, collection or unsaved-preview
return context through Settings and Android Back. This remains session-memory
preparation, not durable offline readiness.
Explicit complete-link exports can open Android's standard Sharesheet while
retaining selectable/copyable links and complete-file export. Handoff is not
delivery confirmation; verified App Links and real receiving-app delivery remain open.
Production contracts, reviewed transliteration, persistent
offline snapshots and the remaining product journeys are incomplete.
Staged implementation and the reviewed owner-text import/publication are authorized.
Unapproved source reinterpretation, inferred media mappings and first live API
ingestion are not.

[AI instructions](AGENTS.md) | [Documentation](docs/README.md) |
[Requirements](docs/requirements.md) | [Current design](docs/design-decisions.md) |
[Roadmap](docs/implementation-roadmap.md) | [Validation](docs/testing-and-release.md)

## Product scope

- Kannada is canonical; transliterate, never translate. Nine non-Latin and five
  generated Latin profiles, optional reviewed Source Latin, independent UI/script
  preferences, system fonts, reading themes/density and aligned helpers.
- Kannada/Latin metadata/lyric AND search with exact bounded OSA fragments,
  filters, selected-script excerpts and matching-verse navigation. Explicit
  consent before an unprepared PWA downloads a missing/new search index.
- Device-local favorites, repeated ordered list entries/placeholders/fallbacks,
  bookmarks, learning state, recents and explicit latest-list recitation resume.
  Portable minimal list links/files create new lists only. Separate same-platform
  full backups replace personal state after validation/preview/confirmation.
- Android contains no lyrics and requires complete validated preparation; setup/
  recovery/list management remain accessible. PWA supports individual online
  reading and optional full preparation. No offline video/images.
- Prepared clients keep the active snapshot even online until explicit update.
  Failures preserve usable data; resume/repair is truthful. Soft reminder dates
  never expire content. YouTube player loads only after Play.
- Reviewed sources/metadata/assets are proposed via Library PRs. Real variants
  generate post-merge with global rules only. First API ingestion is blocked
  pending provider clarification; no invented lyrics/attribution.

See [requirements](docs/requirements.md) for the complete scope, exclusions,
acceptance scenarios and advisory performance goals.

## Repository ownership

| Repository | Responsibility |
| --- | --- |
| [Website](https://github.com/DaasaVaani/DaasaVaani.github.io) | React/TypeScript/Vite static PWA at https://daasavaani.github.io/ |
| [Android](https://github.com/DaasaVaani/AndroidApp) | Kotlin/Compose app/core, API26+, signed GitHub Releases APKs |
| [Shared](https://github.com/DaasaVaani/shared) | Contracts/settings/fixtures/UI catalogs, generator and committed resources |
| [Library](https://github.com/DaasaVaani/library) | Reviewed sources/assets/registries/ingestion/publisher, generated-only https://daasavaani.github.io/library/ |

Each consumer pins Shared independently and consumes validated published Library
artifacts. Website has no library source directory; settings owns web configuration.
Portable defaults/search/transfer bounds remain owned by Shared. No
backend/accounts/analytics/live sync/hosted short links or bundled lyric fallback.
All configurable product values use owned settings; native toolchain manifests/
locks own dependency pins.

## Contributing and validation

Start with [AGENTS](AGENTS.md), [the index](docs/README.md) and
[contributing guidance](docs/CONTRIBUTING.md). Do not install an assumed stack.
Current commands and full finalization/push gates are in
[testing and release](docs/testing-and-release.md). Run `npm ci` and `npm run check`
for fixture publication, build, unit and browser checks. The demo publisher requires
the clean validated Library revision in settings/tooling.yml with its Node
dependencies installed. `npm run demo` publishes synthetic
fixtures and serves the local demo on the configured port. No actual lyrics are
bundled in Website builds; the real reader requests published artifacts only
after consent. Original owner inputs remain local and uncommitted. For authorized Shared pin updates,
follow the [Shared-first publication order](docs/testing-and-release.md#shared-submodule-updates).

Update current guides with changes. Past decisions, dated observations and test
records belong only in [HISTORY.md](HISTORY.md), not current instructions.
Preserve unrelated work/staging; validation does not authorize commits or pushing.

## Community, privacy and licensing

[Support](docs/SUPPORT.md) | [Security reporting](docs/SECURITY.md) |
[Code of Conduct](docs/CODE_OF_CONDUCT.md) |
[Content/provider policy](https://github.com/DaasaVaani/library/blob/main/docs/content-rights.md)

Personal state is local except explicit sharing/backup and disclosed Android
system backup. Shared files/links can be forwarded; gzip is not encryption.
No secrets, credentials, private correspondence or payload logs in the repository.
Project-authored software is [Apache2.0](LICENSE); third-party lyrics, images,
recordings and trademarks retain their rights. Public availability is not permission.
