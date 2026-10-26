# DaasaVaani Requirements

- Status: Approved product scope; staged implementation authorized, production gates incomplete
- Scope: Initial release of the Android app, responsive website/PWA, and reviewed-content publication; YouTube ingestion automation is deferred to a later release

The [Shared implementation specification](https://github.com/DaasaVaani/shared/blob/main/docs/implementation-specification.md)
owns current technical contracts and unresolved gates. Staged implementation follows
the selected directions; each production slice still requires its applicable
exact contracts and evidence. Approval chronology and superseded scope belong
only in [HISTORY.md](../HISTORY.md).

## 1. Purpose

DaasaVaani makes Hari Dasa Sahitya available through a searchable, accessible
lyrics library. Kannada is the canonical lyric text. Users can read the same
lyrics in other scripts through transliteration, play the associated YouTube
video online, and download the reading library for offline use.

The primary journeys are finding a remembered lyric quickly, reading in a
preferred script, learning verse by verse, and reciting anywhere without an
internet connection. Favorites, personal recitation lists, and optional discovery
support repeated use without accounts or tracking.

This document defines product behavior, content ownership boundaries, automation,
and acceptance criteria. It does not select frameworks or implement the product.
Requirement IDs are stable references for implementation and testing.
The [design decision record](design-decisions.md) distinguishes selected
technical directions from unresolved contracts and unverified implementation.

## 2. Definitions and scope decisions

| Term | Meaning |
| --- | --- |
| Item | One independently reviewed lyric record/edition, identified by a permanent video-independent `lyricId`; videos and images are optional reviewed associations. |
| Canonical lyrics | Reviewed Kannada text from which other script variants are generated. |
| Transliteration | Representing the same lyric words in another script, without translating their meaning. |
| UI translation | Translating interface labels and messages, independently of lyric scripts. |
| Ingestion | Discovering new videos and proposing source content, thumbnails, and settings changes in a PR. |
| Publication generation | Building consumable content and indexes from reviewed repository files after merge. |
| Offline snapshot | A complete, validated version of the downloadable reading library and its assets/indexes. |
| Filter registry | Reviewed registry data defining structured classification values; settings choose enabled filters/order. Flat searchable tags are not filter values. |
| Recitation list | A locally stored, named, user-ordered collection of library references and intentional text placeholders, not a video playback queue. |
| Placeholder | A user-created entry with single-line plain text and no required library item/video ID; always distinguished from downloadable lyrics. |
| List snapshot | An independent copy of a list at sharing/export time; later sender edits do not update it. |
| List export | A versioned list snapshot with its name and ordered library references/placeholders, including only approved user-written fallback/placeholder text, not lyric copies. |
| Initial library preparation | Android's required explicit download and validation of a complete reading snapshot before lyric browsing/reading; the APK contains no bundled lyric library. |

Current scope boundaries:

- Item Markdown files are **flat within `library/`**, not grouped in taxonomy
  subfolders. Asset layout remains a technical-design decision.
- Offline support includes **lyrics, metadata, script variants, indexes, and
  required reading assets, not thumbnails or videos**, in both Android and the
  PWA. Use system fonts only (no bundled fallback fonts).
- Generate non-Kannada lyric variants from Kannada. Suitable supplied Latin may
  additionally appear as an explicitly labeled Source Latin option; it never
  replaces canonical Kannada or silently mixes with generated lines.
- Scripts generate groupings and indexes. Clients query those generated artifacts;
  they do not parse source Markdown or derive the taxonomy.
- Included capabilities are Latin spelling variants for search,
  matching-line previews, favorites and transferable recitation lists, focused
  recitation, verse navigation/resume, optional two-script reading, list offline
  readiness, and optional discovery.
- Product scope is not implementation or deployment authorization; selected
  technologies and unresolved contracts are in the current design.
- Reading themes, device-only recently opened lyrics, optional
  learning labels, skippable first-use setup, current-session browsing continuity,
  and verse bookmarks on both Android and the website/PWA. Find within an open
  lyric and in-app correction reporting remain deferred. Full personal
  backup/restore is separate from minimal-list transfer; automatic synchronization
  remains excluded.
- Sharing includes self-contained snapshot links with app/browser
  opening, text-only placeholders/fallback labels, and file fallback for
  oversized links and verified Android App Links.
- The website is fully static on GitHub Pages with no application backend or
  server-side user storage. Local device storage, static downloads, optional
  YouTube playback, and maintainer-side GitHub Actions remain permitted.
- Android uses a small APK without bundled lyrics and requires an explicit
  complete-library download during initial preparation before lyric browsing or
  reading. Preference setup remains skippable; library preparation does not.
  Removing content requires preparation again, with no bundled fallback.
- The website loads individual lyrics as needed online, plus the generated data
  required for search/browsing, and retains optional complete offline download.
  Content updates remain explicit and independent of APK releases. Measure
  actual APK/download/installed/update-storage sizes; no size estimate is an
  approved threshold or measured result.
- Included lifecycle behavior is active-downloaded-version reading even online,
  generator-owned soft update dates, safe resumable downloads and isolated-damage
  repair, repeated list occurrences, new-list-only imports, five initial generated Latin
  variants plus optional Source Latin, and three reading-density choices.
  These product choices do not select implementations or close technical gates.
- Guided client-compatibility recovery,
  visible removable search filters, most-recent-list recitation resume, and
  duplicate-name warnings that allow confirmed reuse. Unresolved references keep
  generic unavailable messaging without a special version-aware update action.
  Exact implementation contracts remain architectural work.
- Tags are searchable only, no upload-year filter. Source PRs have no real generated
  variants; no item-specific output overrides. Bengali/Assamese are separate,
  unsuitable Source Latin/status public but restricted, AND fragment search and
  explicit index consent required. Performance numbers are advisory. See
  [current design](design-decisions.md) for remaining implementation gates.

## 3. Platforms and distribution

| ID | Requirement |
| --- | --- |
| PLAT-01 | Provide an Android app and a mobile-first responsive website that is installable as a PWA where the browser supports installation. |
| PLAT-02 | Support phones, tablets, touch laptops, and desktops; portrait and landscape layouts; and touch, mouse, and keyboard interaction. |
| PLAT-03 | Support Android 8.0/API 26 and newer. |
| PLAT-04 | Support the current and previous major versions of Chrome, Edge, Firefox, and Safari, including Android Chrome and iOS Safari. Record exact tested versions for each release. |
| PLAT-05 | Support layouts from 320 CSS pixels upward without forced horizontal page scrolling. |
| PLAT-06 | Host the static website/PWA on organization-root GitHub Pages at `https://daasavaani.github.io/`, deployment base `/`, keeping the canonical base configurable. Publish generated Library content independently from the Library repository at `https://daasavaani.github.io/library/`; Website and Library deployments/bases are separate. Verify root deployment and direct routes; do not assume old project-site URLs redirect. |
| PLAT-07 | Distribute signed Android APKs through GitHub Releases. Google Play distribution is deferred. |
| PLAT-08 | Use a configurable canonical website base URL for item links and sharing. |
| PLAT-09 | Keep the website/PWA fully static on GitHub Pages. Do not require a runtime application backend, server database, hosted list/short-link service, or server-side user storage. Clients may fetch static published artifacts, use local device storage, and offer explicit YouTube playback. Maintainer-side discovery/generation/publication workflows are outside client runtime and remain allowed. |

PWA installation prompts, storage persistence, and other browser capabilities
vary by platform. The product must not promise identical installation behavior
across all browsers.

## 4. Content and metadata

### 4.1. Source and identity

Source channel:
<https://www.youtube.com/@bhajane-dasarahadugalu->

| ID | Requirement |
| --- | --- |
| DATA-01 | Give each reviewed lyric record/edition one permanent author-assigned canonical UUIDv4 `lyricId`, independent of videos, images, title, filename and content hash. Multiple reviewed performances may be associated with the same lyric; distinct lyric editions may remain separate. Never infer matches, automatically merge records or fabricate video IDs. |
| DATA-02 | Store one flat source Markdown per lyric in `library/`, named `<lyricId>.md`, with grouped public/provenance/review YAML metadata, one canonical Kannada fence with stable line IDs and any supplied Source Latin literal fence. Reviewed verses use ordered UUID/end-line metadata, not added inline verse-marker lines. No generated variants or companion source file. Existing source migration/renaming requires separate authorization; remaining exact production schemas are gated. |
| DATA-03 | Preserve Kannada lyric line breaks, verse boundaries, and spacing needed for reading. Blank/whitespace-only separators are explicit layout, not UUID-bearing lyric records or inferred verses. |
| DATA-04 | Store actual source identity/provenance and required rights evidence for owner-supplied or other reviewed lyrics. YouTube URLs/associations and images are optional; owner-supplied lyrics must be publishable/readable without either. Preserve lyric/line/verse identity and personal references when media is added later. Do not fabricate missing source metadata or present inferred classifications/matches as known facts. |
| DATA-05 | Support optional reviewer-maintained classification. Missing optional values remain unclassified and appear as Unknown where applicable. |
| DATA-06 | Make content and settings schemas extensible so new metadata and filter fields can be added without rewriting existing items. |
| DATA-07 | Exclude legitimate incomplete drafts and items with a nonempty publication-hold reason from all public content/indexes/groups/packages. No general status field is required. Structural, reference and duplicate errors fail validation rather than becoming silently accepted drafts. |
| DATA-08 | Persist opaque UUID line/verse identities assigned once by authoring tools. Retain identity for corrections/moves of the same logical content; conservatively allocate new IDs for ambiguous splits/merges. Missing saved locations become explicitly unresolved, without redirects, heuristic reanchoring or automatic personal-record rewriting initially. Never invent verse divisions. |

### 4.2. Field inventory

Exact YAML keys and the division between lyric sections and generated artifacts
will be selected in technical design. The following logical information is required:

| Information | Policy |
| --- | --- |
| Lyric ID | Required permanent canonical UUIDv4; author-assigned once during separately authorized authoring/import, never derived from title, media or a content hash. |
| YouTube associations and source URLs | Optional zero-or-more reviewed associations; actual supplied URL/ID must agree. Their absence does not block otherwise valid lyrics. Legacy video identifiers retain distinct typed semantics. |
| Public title | One reviewed title required for publication, not forced to the first lyric line. Original video title remains internal provenance; alternatives belong in tags. |
| Channel identity | Optional applicable video provenance when available; never fabricated or required for owner-supplied text-only lyrics. |
| Upload date | Optional applicable video provenance when available, not a lyric identity or upload-year filter. |
| Source description/provenance | Record actual owner-supplied provenance/required rights evidence; retain any description actually used for extraction. No video description is required when none exists; exclude private evidence from public files/artifacts. |
| Publication hold | A nonempty reviewed hold reason keeps otherwise complete uncertain content unpublished; legitimate incomplete drafts are also excluded. |
| Thumbnail information | Record the local asset reference and relevant source information when available. |
| Kannada lyrics | Required for publication; source of truth for transliteration. |
| Script variants | Generated from Kannada only after approved merge, including five initial Latin profiles and distinct Bengali/Assamese renderings. Hunterian is deferred. Supplied Source Latin/status is public even when unsuitable; eligibility remains restricted by LANG-11. |
| Composer/Haridasa and ankita | Separate optional, registry-backed, evidence-based multi-value fields; reviewed 1:1 library relationship, conflict validation and one combined filter. No automatic attribution from a signature. |
| Deity | Optional multiple reviewed flat-registry values/aliases; no hierarchy expansion. |
| Composition form | Optional multiple reviewed values, separate from category. |
| Broad category | Optional multiple reviewed values, not inferred from form. |
| Narrative context | Optional reviewed labels and a concise plain-text description, not occasion/festival metadata or translated meanings. Labels are filterable; description is searchable only. |
| Tags | Flat searchable strings, including alternative titles/miscellaneous metadata, not typed or filterable. |
| Library-added date | Publication-maintained date when an item first becomes publicly available in DaasaVaani; distinct from video upload date and retained on later edits. |

New optional fields must not invalidate older items solely because those fields
are absent. New filters must have a clear path through settings, generation, and
client presentation; schema extensibility does not imply automatic arbitrary UI.
Registry IDs are readable stable ASCII tokens separate from labels/aliases.
Missing classifications remain unclassified; multiple values mean genuinely
applicable values, not uncertain alternatives. Structured raga/tala is deferred.

### 4.3. Thumbnail assets

| ID | Requirement |
| --- | --- |
| IMG-01 | Download available thumbnails during ingestion and include the actual image assets in the same review PR as their items. |
| IMG-02 | Reduce thumbnail file size where practical without unacceptable visual degradation or distortion. Choose formats, dimensions, and optimization settings during technical design. |
| IMG-03 | Publish repository-managed thumbnails for on-demand online display from static hosting. Exclude thumbnails from offline packages on Android and the PWA. Offline use must show a simple icon and available title/metadata rather than require an image or a live YouTube image request. Missing/offline thumbnails must not block lyrics or offline readiness. |
| IMG-04 | Missing thumbnails must not prevent reading an otherwise valid item. Asset references must be validated before publication. |

## 5. Languages and transliteration

### 5.1. Lyric scripts

The initial script choices are:

1. Kannada: canonical/original lyrics.
2. Latin/English script.
3. Devanagari.
4. Telugu.
5. Tamil.
6. Malayalam.
7. Gujarati.
8. Bengali.
9. Assamese, as a distinct named rendering.
10. Gurmukhi.
11. Odia.

These are script choices, not claims that the lyrics have been translated into
the languages that use those scripts.

| ID | Requirement |
| --- | --- |
| LANG-01 | Never translate lyrics. Preserve the original words through transliteration only. |
| LANG-02 | Generate non-Kannada variants from canonical Kannada during content processing, not from supplied Latin. Retain raw supplied Latin as provenance; an additional selectable Source Latin variant is governed by LANG-11 rather than replacing generated variants. |
| LANG-03 | Generate actual item variants only after approved merge, with no committed generated variants or PR variant previews. PRs review source Kannada, supplied Source Latin, metadata and flags, and validate sources/applicable deterministic tooling fixtures. Full post-merge generation/validation failure blocks deployment and preserves the previous publication. Correct generated output only through reviewed global mapping/rule revisions, not per-item/per-line overrides or disguised video-specific exceptions. Preserve reviewed source corrections without changing correct Kannada to force output. No separate per-item/per-script human sign-off; structural success is not linguistic proof. |
| LANG-04 | Include approved script variants in published data and offline snapshots; do not require a runtime transliteration service. |
| LANG-05 | Default the lyric script to Kannada and remember the user's selected script locally in Android and the browser. |
| LANG-06 | Treat UI language and lyric script as independent preferences. Changing one must not implicitly translate lyrics or overwrite the other. |
| LANG-07 | Support multiple reviewed Latin transliteration/spelling variants for search, derived from the canonical lyric words. Keep search alternatives distinct from approved display text; they must not overwrite lyrics or manual corrections. |
| LANG-08 | Offer single-script reading or an optional Kannada/Latin helper beneath corresponding lines of the selected primary script. Remember the user's choice locally, preserve line/verse alignment, and make the published variants available offline. Use stacked lines on narrow screens; a helper is not a translation or a guarantee of pronunciation accuracy. Enable alignment-dependent features only with reliable correspondence, including for Source Latin; explain unavailable alignment rather than pairing unrelated lines. |
| LANG-09 | Use system fonts only; do not bundle, download or depend on an online font service (`font-strategy`). Validate readable glyph coverage/shaping for all supported scripts on the tested platforms, and state in release evidence which devices were not tested. Missing system-font coverage must not silently reduce the supported scripts or produce falsely ready offline reading. |
| LANG-10 | Provide five initial generated Latin display variants: ISO 15919:2001, IAST with defined Kannada conventions, Baraha Kannada, ITRANS Kannada, and Harvard-Kyoto with Kannada extensions. Hunterian is deferred. Include these in published/offline reading and eligible search. Exact pinned tables/independent fixtures remain under D3; a scheme name is not Kannada conformance evidence. Approved IAST conventions use e/ē, o/ō, ṛ/ṝ and vocalic l̥ distinct from lateral ḷ. |
| LANG-11 | Publish raw supplied Source Latin/status even when unsuitable; distinguish absence, completeness and reviewed alignment. Suitable complete corresponding but unaligned text may be read as a whole, but indexing/helpers/anchored features require reviewed canonical-line mapping. Unsuitable text is not selectable/indexed. Never manufacture alignment, generated-fill text or silently switch an unavailable choice. Absence does not block Kannada/generated publication; other internal provenance remains private. |
| LANG-12 | Let users choose and locally remember their Latin variant independently of UI language, including when Latin is used as a helper. Keep Kannada as the initial overall script. Decide any Latin recommendation after user review of side-by-side permitted sample previews; no generated scheme is yet approved as the default or recommendation. |

Not every script can represent every Kannada sound exactly. The transliteration
scheme, handling of ambiguous characters, and review guidance must be evaluated
in technical design. Generated output is not automatically linguistically correct.
Source Latin is an optional additional variant, not a sixth generated scheme.
The five initial schemes require reproducible Kannada-specific profiles; input
aliases must not be mistaken for agreed canonical generated output.
Tamil permits standard Grantha-origin letters and consonant superscript
distinction markers, not additional vocalic/nasal superscripts. For missing target-script
distinctions, reviewed native-script approximations are the baseline; marked
exceptions require explicit approval. This does not approve every upstream
mapping, silent omissions or unreviewed foreign-script fallbacks.

### 5.2. Interface localization

| ID | Requirement |
| --- | --- |
| I18N-01 | Initially provide Kannada and English translations of app/site-controlled interface labels and messages, including search, downloads, sharing, settings, and errors. |
| I18N-02 | On first use, choose a supported device/browser language; otherwise fall back to English. |
| I18N-03 | Allow an explicit override and remember it locally per installation/browser. |
| I18N-04 | Structure interface localization so additional languages can be added later without changing the lyric-transliteration policy. |

Ship manually authored or AI-assisted, human-reviewed UI translations, not
automatic runtime translation. Shared YAML catalogs generate bundled web and
native Android resources. Exact message/plural/escaping contracts remain open.

## 6. Ingestion and review workflow

**Later-release scope:** YouTube ingestion automation (ING-01 through ING-11)
is deferred and is not an initial-release implementation or acceptance gate.
These requirements remain the target for that later release; first API access
still requires provider clarification. Initial-release work continues using
reviewed existing content and its publication pipeline. Deferral does not waive
review before publication, source preservation or applicable provider terms.

| ID | Requirement |
| --- | --- |
| ING-01 | Use the official YouTube Data API for discovery and metadata retrieval. Run ingestion locally on the maintainer's machine; keep the API credential in an untracked local environment variable or file, never in repository files, logs, PRs or CI (`ingestion-credentials`). |
| ING-02 | Provide a manually run historical backfill for all existing public channel videos, divided into manageable review PRs. |
| ING-03 | Run incremental ingestion manually on the maintainer's machine; no scheduled or CI-run ingestion exists because no ingestion secret is stored in GitHub. A local run with new videos opens the review PR from a branch and never commits to `main`. |
| ING-04 | Incremental ingestion imports only newly discovered videos. Existing entries are updated manually, not automatically refreshed from changed source descriptions or titles. |
| ING-05 | Propose source Markdown, downloaded/optimized thumbnails and newly encountered missing reviewed classification-registry values in the same PR. Do not generate actual item variants/previews in PRs; publication follows LANG-03. |
| ING-06 | Propose missing source-supported filter values in reviewed registry data in the same PR; settings select registries/filter order. Preserve existing values and manual corrections. |
| ING-07 | Open one incremental review PR per run when changes exist. A run with no new changes creates no PR. Historical backfill may use separate batches. |
| ING-08 | Make retries idempotent across existing items and pending review work, avoiding duplicate items and duplicate open PRs. |
| ING-09 | When Kannada lyrics are absent or extraction is uncertain, create a clearly flagged unpublished draft with source material for manual correction. Do not invent lyrics, translate another script into Kannada lyrics, or automatically transcribe audio. |
| ING-10 | Publish content only after review and merge. Maintainers approve content and taxonomy changes together. |
| ING-11 | Produce sanitized local console and machine-readable reports plus a PR summary with imported, draft, skipped and error counts. No Actions summary is promised for local ingestion. Report API/quota/processing failures explicitly, never partial work as a successful complete import. |

Discovery must account for pagination and quota constraints so a successful run
does not silently omit newly discoverable public videos. The detailed batching
and pending-PR strategy belongs in technical design.
The provisional API ingestion design remains blocked before first ingestion
pending clarification of provider retention/refresh applicability.

Existing source videos may later become private, deleted, or restricted.
Automatically rescanning existing videos for those changes is outside the
confirmed ingestion scope. Playback must still handle unavailability at use time.

## 7. Settings and generation boundaries

### 7.1. Repository settings

| ID | Requirement |
| --- | --- |
| SET-01 | Put every configurable value in reviewed files under the owning repository's `settings/`, using strict YAML with generated runtime JSON where needed. Include identity/branding/endpoints, languages/scripts/defaults, filter order, mappings/aliases/normalization/ranking, feature switches, query/page/byte/decode/time/retry/concurrency limits, and ingestion/image/publication options. No hardcoded or duplicated production defaults; registry entries remain domain data. |
| SET-02 | Define each setting's owner, type/unit, default, bounds, application timing and compatibility impact; validate required values explicitly without hidden fallbacks. Apply build settings at generation/build, and bind published portable search policy by hash to its snapshot. New app/remote defaults must not change an old active index's semantics. Algorithms/protocol invariants remain tested code/specifications. |
| SET-03 | Keep credentials and signing secrets outside repository settings and committed content. |
| SET-04 | Store personal UI-language, lyric-script/helper-script and Latin-variant choices, font-size, reading density, theme, first-use setup state, offline-download state, favorites, recitation lists, most-recent-list recitation position, practice position, learning labels, verse bookmarks, and enabled recently opened history locally, not in repository settings. No account or automatic cross-device synchronization is required. |

Exact settings filenames and schemas are deferred except that classification
registry additions must be reviewed with ingestion PRs. Search-only flat tags
are not a filter registry.

### 7.2. Publication generation

| ID | Requirement |
| --- | --- |
| GEN-01 | After approved merge, generate publishable content, groups, filter indexes, and a weighted search index from reviewed Markdown and settings. |
| GEN-02 | Exclude drafts and reject invalid publishable content or inconsistent asset/settings references before deployment. |
| GEN-03 | Bundle the generated content/indexes so the same browsing/search behavior can work online and from a downloaded snapshot. |
| GEN-04 | Clients consume generated artifacts and query generated indexes; they must not parse repository Markdown or reconstruct groupings/taxonomy themselves. |
| GEN-05 | Keep generated content independently updateable from the APK. A compatible content publication must not require an Android app release. |
| GEN-06 | The content generator assigns each snapshot its generation date and update-recommended date, at least 7 days after generation. Publish these authoritative dates as compatible snapshot metadata for both clients; they belong to library generation, not APK compilation, installation, download time or last-check time. |

The importer proposes changes; the publication generator builds approved
artifacts; the app/PWA presents and queries those artifacts. The technical design
may share implementation helpers without collapsing these review boundaries.

## 8. Browsing, search, and filters

| ID | Requirement |
| --- | --- |
| SEARCH-01 | Provide interactive browsing of generated groups, search results, and individual items on both platforms. |
| SEARCH-02 | Initially search eligible descriptive metadata and full Kannada/Latin lyrics, including reviewed search-only Latin aliases and aligned eligible Source Latin. Other generated scripts remain readable, not initially lyric-query languages. Video IDs/upload dates/library-added dates are not text-search fields. |
| SEARCH-03 | Rank metadata-containing matches above lyrics-only results. Within buckets add the best field weight per distinct term: title100, composer=ankita80, deity60, tags=form=category40, context labels20, context description10, lyrics5. No duplicate rendering/alias/occurrence bonus. Enough lower-field evidence may outweigh title. Then compare worst term edits, total edits and ASCII canonical lyric ID; term quality comes from its winning-weight field. Values and identity semantics are snapshot-bound/versioned; existing fixture indexes retain legacy behavior. Exact equivalence/witness fixtures remain required. |
| SEARCH-04 | Provide generated filters for combined Composer/Haridasa-Ankita, deity, composition form, broad category and narrative-context labels. Flat tags and context descriptions are searchable only; upload year is not a filter. |
| SEARCH-05 | Combine multiple selected values within one field with OR, and selections across different fields with AND. Apply text search together with selected filters. |
| SEARCH-06 | Offer the same generated groups, search, ranking, and filters offline after a complete content download. |
| SEARCH-07 | Provide explicit loading, no-results, and error states. An index failure must not masquerade as an empty successful search. |
| SEARCH-08 | Support Kannada/Latin queries and reviewed global common/compact ASCII search-only profiles independently of UI language and selected reading script. Equivalent approved spellings resolve to the same item/line, displayed in the selected script. Include required mappings/indexes offline; search aliases never overwrite display text or create another reading variant. |
| SEARCH-09 | Show selected-script lyric excerpts from bounded item-artifact reads, local to the active snapshot after preparation and online as needed before PWA preparation. The global matching index supplies anchors, not all-rendering readable text copies. Count excerpt I/O in PERF-01. Highlight only reliable correspondence; metadata-only hits show metadata context, not a fabricated lyric match. |
| SEARCH-10 | Allow opening a lyric result at its matching verse within the full lyric, with surrounding verses still accessible. Preserve this behavior offline and include excerpt rendering in PERF-01's best-effort measurements. |
| SEARCH-11 | Keep active search filters clearly visible, allow individual removal, and offer Clear filters while retaining the typed search text. When no results match and filters are active, explain the active constraints and offer Clear filters. Do not clear or rewrite the query as a side effect, and do not substitute a no-results state for a loading/index error. Apply the same behavior online and offline. |
| SEARCH-12 | Require all query terms across eligible metadata fields/lyric lines, independent of term order. Support within-word literal substrings: `vadiraja krishna` must match `dir sh`. No automatic OR fallback, phrase mode or quote operators initially. |
| SEARCH-13 | Automatically include bounded approximate fragments using Unicode code-point optimal string alignment (restricted Damerau-Levenshtein). Per normalized query term: lengths 1-3 allow no fuzzy expansion, 4-8 allow at most one edit, 9+ at most two. Insertion/deletion/substitution/adjacent swap cost one under OSA restrictions. Short terms remain eligible literally. Do not substitute generic fuzzy scores, UTF-16 units or unrestricted edits. Exact normalization remains gated. |
| SEARCH-14 | For an unprepared online PWA, require explicit Load search with download size before fetching a missing/new global index. Opening the site/Search or typing does not authorize transfer. Fetch discovery/manifest information to establish size/compatibility; reuse matching valid cache. Loading an index does not download all lyrics or activate an offline snapshot. Prepared clients retain active-snapshot search. |
| SEARCH-15 | Use 250 ms trailing debounce after committed text edits; Enter flushes pending search and filters run immediately. Keep input responsive, wait for IME composition completion, cooperatively cancel superseded work and reject stale results. Count debounce in PERF-01. |

All approved scripts remain reading renderings; initial query coverage is
Kannada/Latin. Reviewed equivalents do not promise arbitrary script-pair
conversion, translation, unrestricted fuzzy matching or every ordinary spelling.
Preserve NFC, profile-significant case/diacritics, punctuation boundaries and
only reviewed joiner equivalences. Global alias profiles are a separate branch,
not permission to strip distinctions from display or technical scheme text.

## 9. Reading, playback, and sharing

### 9.1. Item reading and playback

| ID | Requirement |
| --- | --- |
| UX-01 | Provide a dedicated item page/view with readable lyrics, metadata, script selection, font controls, sharing, and the associated video playback option. |
| UX-02 | Allow increasing/decreasing lyric font size and remember it locally. These controls affect lyrics, not the entire interface. |
| UX-03 | Preserve approved lyric line breaks and verse boundaries in every script. Density controls may adjust vertical spacing while retaining distinct verse separation; never join lines, remove verses or rewrite approved text. |
| UX-04 | Play YouTube videos inline only when online. Load the player only after an explicit Play action, not on initial item rendering. |
| UX-05 | When offline, explain that video playback requires a connection without blocking downloaded lyrics. |
| UX-06 | For unavailable/restricted/failed playback, show an explicit message and an Open in YouTube option. The fallback does not guarantee the external video will be playable. |
| UX-07 | Provide a stable website URL for each lyric-ID-based item and support opening it directly under the configured canonical Pages base using the selected hash routing. Keep legacy video-based links distinguishable; do not reinterpret identifiers or infer redirects. Unresolved direct item links use generic unavailable messaging consistent with LIB-09. |
| UX-08 | Provide separate Share item link and Share YouTube link actions through the available platform share mechanism, with copy-link fallback. |
| UX-09 | Use website HTTPS links compatible with verified Android App Links for item/list navigation. Prefer opening the installed Android app when verification and user/platform settings permit; otherwise keep the website usable. Provide an explicit Open in app option on the website without trapping users in forced redirects or claiming installation guarantees app routing. Google Play distribution is not required for this association. |
| UX-10 | Draw usability inspiration from established reading, lyrics, and personal-library apps without copying their designs. Keep Search, My Library, and lyric reading central; Explore is optional and must not displace fast access to known lyrics. |
| UX-11 | Offer Light, Dark, and Warm reading themes, plus Follow device for automatic light/dark selection. Allow and remember an explicit local override, including Warm, and apply it offline. Maintain accessible contrast for lyrics, helper text, controls, focus, and search highlights in every theme. |
| UX-12 | Provide short, skippable preference setup on Android and the website/PWA: choose lyric script, applicable Latin variant, reading size, Compact/Normal/Relaxed density and optional helper script, previewing approved lyrics when content is available. Skipping preferences retains existing defaults; choices remain editable later, with Latin recommendation/default selection subject to LANG-12. The PWA permits immediate online browsing and offers optional complete offline download. Android separately requires explicit complete-library preparation before lyric browsing/reading under OFF-10, even if preferences are skipped. Show size before consent, remember preference completion/skip, and explain unavailable previews/download information without inventing content or downloading automatically. |
| UX-13 | Restore current-session search text, selected filters, and result position when returning from a lyric, and preserve the originating list/Explore position. Support natural website Back/Forward and Android Back online and offline. This does not require persistent search history or cross-session navigation restoration. If content/list changes make the old position unavailable, provide a valid context rather than claiming exact restoration. |
| UX-14 | Offer Compact, Normal and Relaxed reading densities during onboarding and in later reading/settings controls. Remember the choice locally and apply it consistently to primary/helper text, themes, normal reading, Recite and Practice, including offline. Use a comfortable bounded reading-column width on tablets/desktops while retaining responsive narrow-screen layouts. Select exact spacing/width through accessibility and device tests, preserving UX-03. |

### 9.2. Favorites and recitation lists

| ID | Requirement |
| --- | --- |
| LIB-01 | Let users favorite/unfavorite items and access favorites quickly through My Library. |
| LIB-02 | Support multiple named recitation lists with create, rename, and duplicate actions. Users can add/remove typed lyric references and reorder them, preserving distinct legacy video references. Adding videos/images never changes favorites, list references or bookmarks; distinct lyric editions and independent occurrences remain distinct. |
| LIB-03 | Confirm list deletion. Deleting a list or removing an entry must not delete the library item, other lists, or favorites. |
| LIB-04 | Persist favorites, list names, and entry order locally across restarts. Support list management and reading offline with available downloaded content, without accounts. |
| LIB-05 | Removing/refreshing content preserves all personal state and unresolved identifiers, with no guessed replacement/dropped entries. Explain browser-managed loss. Minimal list exports contain references/user text only; the separate full personal backup under XFER-09 covers approved personal state/preferences. Neither is automatic synchronization or a content snapshot. |
| LIB-06 | Provide a Recently opened section in My Library, ordered most-recent-first, with device-only history across restarts. Reopen lyrics in the preferred script and support offline reading of downloaded items. Offer clear-history and turn-off controls; disabling stops new history recording, and clearing history must not remove favorites, lists, bookmarks, or learning state. Do not send history to a service or treat this as permanent search-query history. |
| LIB-07 | Let users save multiple verse bookmarks per lyric and access them through Verse bookmarks in My Library. Open the full lyric at the corresponding reviewed verse in the selected script, including offline with downloaded content. Bookmarks persist independently of the last practised verse and can be removed without changing favorites, lists, or practice position. Preserve correspondence across scripts; explain changed/unresolved saved locations rather than jumping to an unrelated verse or inventing verse divisions. |
| LIB-08 | Allow intentional text-only placeholders in any recitation list without requiring a library item/video ID. Require user-entered single-line plain text and show it alongside the standard Lyrics unavailable in DaasaVaani message in lists and recitation. Support add/edit/reorder/remove and explicit manual replacement with a library reference while preserving position. Do not infer matches, create fake library IDs, or automatically replace placeholders. |
| LIB-09 | Allow a user-written single-line fallback label for an unresolved library reference, preserving its actual identifier. Distinguish intentional placeholders, unresolved identifiers, and known lyrics that only need downloading. Keep generic unavailable messaging for unresolved references, without a dedicated version-aware update-check action; ordinary library-update controls remain available. Before preparation, do not claim the identifier is definitely absent from an undownloaded library. Render user text as plain text, not executable markup or an automatic external link. No separate external-URL field is included. Placeholders/labels are local personal-list data, not publishable library content. |
| LIB-10 | Allow repeated occurrences of the same library item or placeholder within one list. Add, edit, move, remove and manually replace occurrences independently; removing one must not remove its repetitions. Preserve every occurrence and its order through duplication, sharing, export, import and previous/next recitation. Do not deduplicate lists by lyric/legacy reference or placeholder text. |
| LIB-11 | On create, rename, duplicate or import, warn when the chosen name is already used by another local list, but allow the same name after explicit confirmation. Do not force a unique name or numbered suffix. Lists remain independent; name matching must never merge, replace or overwrite them. Cancelling the operation leaves existing data unchanged. |

### 9.3. List sharing, export, and import

| ID | Requirement |
| --- | --- |
| XFER-01 | Export a versioned snapshot with only the list name and ordered entries: library identifiers with optional user-written fallback labels, or text-only placeholders. Preserve user text and position. Exclude ordinary library titles, lyric text, thumbnails, external-URL fields, favorites, recitation resume position, practice progress, recent history, learning labels, verse bookmarks, preferences, and other personal state. Exact serialization belongs to technical design. |
| XFER-02 | Support both self-contained HTTPS snapshot links and exported list files. Share through supported platform mechanisms with copy-link/save-download fallbacks. Sharing transfers an independent copy, not a hosted collaborative list, video queue, or live synchronized link. |
| XFER-03 | Allow importing a list file offline and decode shared-link payloads locally in Android and the website/PWA. Validate structure, entry kinds, identifier/text fields, size limits, and supported version before changing local data. Preview the name, order, placeholders, and unresolved entries, and require confirmation before saving. Invalid/unsupported imports must show an actionable error and leave existing lists unchanged; cancellation must also leave them unchanged. |
| XFER-04 | After preview and explicit save, import only as a new independent list, letting the user choose its name and applying LIB-11's duplicate-name warning/confirmation. Do not append, merge, replace or overwrite existing lists, including when names match. Preserve entry order, repeated occurrences, user text and unresolved identifiers. Resolve library details from available content. For an unavailable reference show its identifier, any user-written fallback label, and the generic unavailable state under LIB-09 rather than fabricating a title or converting it to an intentional placeholder. Before library preparation, explain that details are not yet resolved; do not claim an identifier is absent from an undownloaded library. |
| XFER-05 | Snapshot link/file formats must interoperate between Android and the PWA. Opening/importing a list does not itself download lyrics or establish offline readiness. List management and file transfer work offline; a first-ever browser visit still requires fetching the static site, whereas an installed app/available PWA shell can decode links locally. If Android lacks a complete library, allow the supplied-text/identifier preview and explicit list save, but gate lyric browsing/reading on OFF-10. Preserve the pending item/list destination through preparation and continue without silently saving a list. No account, automatic sync, or lyric redistribution package is included. |
| XFER-06 | Carry the snapshot in the shared HTTPS link and decode it entirely on the client; do not upload lists or use a backend, hosted short-link service, or redirect service. Opening previews the snapshot before explicit Save to My Library. Sender edits do not update prior links. Anyone receiving a link can read/forward its contents; warn against sensitive text and do not promise privacy, revocation, or remote deletion. |
| XFER-07 | Enable verified Android App Links for shared lists with usable browser fallback when the app is absent, routing is disabled, or a source browser does not hand off. Publish the static verification association at the website host root and test signed APK/domain association. A project-subpath-only file is insufficient; select a controllable root/domain before claiming automatic app opening. Respect user/platform choices and keep explicit Open in app available. |
| XFER-08 | Enforce the selected 2,048-ASCII-character complete-link ceiling and test interoperability across target sharing/browser/app surfaces. If a snapshot exceeds it, explain the limit and offer file export without truncating text or dropping entries. Reject malformed, unsupported, or oversized incoming payloads explicitly without partial mutation. The payload is versioned JSON, raw deflate and base64url in the hash fragment (`list-payload-encoding`); the ceiling is selected, but boundary interoperability is not yet measured. |
| XFER-09 | Both clients provide a separate versioned/validated/previewed full personal backup with explicit recoverable replacement, not merge. Full backups restore only within the same platform; minimal lists remain cross-platform. Refuse newer versions non-destructively. All backup-covered state/preferences use one personal database. Recheck preview revision and fence stale writers after replacement. Before commit, failure/cancel changes nothing; post-commit OS-language failure reports restored data plus unapplied-language/retry. Android system backup is best effort, with personal-only allowlists and quota/settings limitations; exclude content/transfer journals/readiness flags. Keep accepted local capacity exportable/restorable. |
| XFER-10 | Disclose in the privacy information that Android Auto Backup copies personal data to the user's Google account and that exported files contain personal lists and notes. |

### 9.4. Recitation and learning

| ID | Requirement |
| --- | --- |
| REC-01 | Offer a distraction-free Recite view using the user's selected script and font preferences. Hide video/secondary details, provide an obvious way to restore controls or leave the view, and retain normal item reading. |
| REC-02 | Offer an optional keep-screen-awake control while Recite view is open where the platform supports it. Explain unsupported/failed activation, reflect actual state, and release the request when leaving the view. Do not promise control over operating-system restrictions. |
| REC-03 | Provide large, accessible previous/next lyric controls when reciting a list, preserving its order and showing explicit boundary/unavailable-entry states. Recitation must work offline for available lyrics without audio or video. |
| REC-04 | Remember only the most recently recited list and its exact entry occurrence locally across restarts, including repeated entries. Offer an explicit Continue recitation action; never automatically enter Recite mode on launch. Continuing another list replaces this single saved position, not a separate position per list. Keep it independent of practice progress and exclude it from minimal-list transfers; approved full personal backups include it. Resume the list entry, not an exact lyric scroll position. If the saved list/occurrence was removed, explain that exact resume is unavailable and let the user choose where to continue rather than silently jumping to another entry. Support this offline subject to actual content availability and Android preparation. |
| LEARN-01 | Offer self-guided verse-by-verse navigation using reviewed verse boundaries, with previous/next controls and access to the full lyric. Do not invent verse divisions for unstructured text. |
| LEARN-02 | Remember the last practised item and verse locally across restarts and permit resuming offline. Script switching must preserve the corresponding verse. If content updates remove or change that location, explain the change and offer available text instead of silently claiming exact resume. |
| LEARN-03 | Keep learning independent of video playback. Hide/reveal recall exercises, automatic pronunciation scoring, translated meanings, and audio-synchronized lyrics are not included in this release. |
| LEARN-04 | Offer optional self-assigned Want to learn, Practising, and Comfortable reciting labels per item, with a filtered Learning view in My Library and quick access to Practice. Store labels locally across restarts, support offline use, and allow changing/clearing them at any time. Labels are not assessed scores, proof of memorization, automatic progress, streaks, reminders, or pronunciation evaluation. |

### 9.5. Optional discovery

| ID | Requirement |
| --- | --- |
| EXP-01 | Offer an optional Explore section with browsing by reviewed Haridasa/composer, deity, and category classifications (tags remain searchable only, not browse groups). Reuse generated groups; do not infer missing classifications or label browsing as personalized recommendations. |
| EXP-02 | Provide a Show another lyric action using the active downloaded version online/offline after full preparation under OFF-12, or available published static data before PWA preparation. Show an honest empty/unavailable state when no candidate is available. |
| EXP-03 | Show newly added items using their first library-publication date, not YouTube upload date. Preserve that date on later edits; establish a consistent initial-backfill policy during contract design. Offline discovery reflects the downloaded snapshot, not unseen server updates. |
| EXP-04 | Provide Favorite, Add to list, and Practice entry points from discovered items. Do not add push notifications, streak pressure, popularity claims, tracking, or a personalized recommendation service. |

## 10. Offline download and refresh

| ID | Requirement |
| --- | --- |
| OFF-01 | Provide an explicit Download complete library action. On Android require a successful complete-library download/validation before lyric browsing or reading; do not bundle the lyric library in the APK. On the PWA keep full download optional, loading selected lyric content and required generated search/browsing data online as needed. Opening a lyric online or incidental browser caching is not an explicit offline save. |
| OFF-02 | Include all publishable lyrics/metadata/approved variants/groups/filter/search/policy data and required reading assets, using system fonts only. Exclude thumbnails/video from both reading ZIP transfers and completeness requirements; online image references are separate. |
| OFF-03 | Make the app shell and required reading assets usable offline after successful complete-library preparation on both platforms, not just the content files. An Android first launch before any successful download must not claim lyrics are available offline. |
| OFF-04 | Show download size, progress, completion/failure state, and last-updated status. Offer cancellation, retry, and removal of downloaded content. |
| OFF-05 | Allow users to request a refresh at any time. Do not silently replace the user's offline snapshot through automatic content refresh. |
| OFF-06 | Download and validate the complete replacement before switching the active snapshot. An interrupted, cancelled, invalid, or storage-failed refresh must leave the last working snapshot usable. |
| OFF-07 | Keep metadata, lyrics, script variants, assets, and indexes consistent within the active snapshot. Do not mix incomplete versions. |
| OFF-08 | Explain that browser-managed PWA storage may be evicted or cleared. Detect unavailable offline data and provide actionable repair for isolated damage under OFF-16 or complete re-download for total loss, rather than claiming full readiness. |
| OFF-09 | Report per-list library-lyrics readiness from actual local item, app-shell, script/font/reading-asset, and index availability, separately from intentional placeholder counts/warnings. Distinguish checking, unprepared library, missing downloads, unresolved references, ready library lyrics, and errors. Placeholders retain their offline text/unavailable message and are not failed downloads; a placeholder-only list must not claim a complete offline lyrics list. Missing thumbnails do not affect readiness. Keep warnings visible and never use an import, skipped/completed onboarding flag, or stale completion flag as proof of readiness. |
| OFF-10 | During Android initial onboarding, require explicit consent to download and validate a complete, reviewed, compatible, versioned reading snapshot before enabling lyric browsing/search/reading/practice/recitation. Show size/progress and retain cancel/retry, setup, Settings, recovery and list-management/placeholder-preview access. A failed/cancelled first download leaves no active library and no false completion. First-ever offline launch explains that a connection is required. Preference setup may be skipped, library preparation may not; derive the gate from actual usable content, not a remembered onboarding flag. |
| OFF-11 | Both platforms must offer confirmed Remove offline content, preserving personal state/placeholder text and rechecking readiness without automatic re-download. There is no bundled Android fallback. After deliberate removal or total unusable-library loss, Android returns to download-required lyric access with setup/recovery/list management accessible. Isolated damage to previously validated content follows OFF-16. The PWA can still read online as needed after removal/total loss, but must show it is not ready offline. |
| OFF-12 | After complete download, both clients use the active downloaded version for lyric reading, browsing, search and discovery online as well as offline until explicit update. Do not silently substitute newer online content/indexes. Before a PWA full download, use current published, version-compatible static content online. Apply OFF-16 to isolated damage, without silently mixing versions. |
| OFF-13 | Honor GEN-06's update-recommended date with a soft reminder in both clients. It never expires content or blocks downloaded search, reading, learning or recitation. Downloading an older snapshot later does not extend its date; do not substitute a download-relative timer or APK date. |
| OFF-14 | Offer an update check. If a successful check confirms no newer compatible published version, suppress its reminder for 3 days without changing authoritative snapshot dates. Claim You have the latest published library only when no newer published version exists; when newer content is incompatible, distinguish the latest compatible library from newer content requiring a client update under OFF-17. Failed checks show an error, do not claim freshness and do not grant this suppression. Checking alone never replaces active content. |
| OFF-15 | Retain validated download progress across interruption and allow explicit resume of the same version where safe. Revalidate retained data and version identity; if resume is unsafe or the required version is unavailable, explain why a restart is needed. Never activate a partial first download or mix versions. Do not guarantee browser downloading continues after closing the browser. Preserve the previous active snapshot during failed updates. |
| OFF-16 | If isolated corruption/eviction damages a previously completely validated snapshot, retain independently verified unaffected content and capabilities. Mark readiness as degraded, identify damaged entries/capabilities and offer same-version repair, or explain when complete replacement is necessary. Never render corrupt text, claim full readiness, or turn an index failure into an empty successful search. Disable affected capabilities explicitly when they cannot be verified. This exception does not permit partial first-time activation, selective-save scope, or mixed-version repair; total unusable-library loss requires complete preparation again. |
| OFF-17 | When newer published content requires a newer client, explain the incompatibility and offer manual Android update guidance through GitHub Releases or an appropriate safe website-version update action. Keep the existing compatible downloaded library usable, including offline; do not force an upgrade just to continue reading it. For initial preparation, offer a compatible complete library if one is published; otherwise explain that a client update is required first. Never silently install an APK, replace library content or discard personal data. A client update does not authorize automatic content replacement. |

Removing a downloaded snapshot must not require resetting the user's language
and reading/theme preferences, first-use setup state, favorites, recitation lists,
most-recent-list recitation position, practice position, learning labels, verse bookmarks, or enabled recent-item
history. Snapshot versioning, integrity checks, and storage strategy will be
specified in technical design. OFF-09 retains the explicit whole-library download
model; selective downloads and offline video are not added. OFF-16 refines
post-validation recovery, not initial-download completeness. Reminder suppression
is local check state, not a change to the published snapshot's dates.

## 11. Accessibility, privacy, and reliability

| ID | Requirement |
| --- | --- |
| QUAL-01 | Provide best-effort accessibility for app/site-controlled UI with no formal conformance target and no WCAG claim (`accessibility-baseline`). Include keyboard operation, visible focus, screen-reader labels, sufficient contrast, readable text scaling, and touch-friendly controls; the requirements and scenarios here are the pass/fail bar. |
| QUAL-02 | Keep lyrics readable and navigable independently of the external video player. External YouTube UI remains subject to the provider's implementation. |
| QUAL-03 | Include no ads, analytics, tracking, accounts, or cross-device sync in the initial release. |
| QUAL-04 | Disclose that playing an embedded video connects to YouTube and is subject to its privacy and availability restrictions. No YouTube player is loaded before the user chooses Play. |
| QUAL-05 | Keep personal state device-local without collection/analytics/sync, except explicit minimal-list sharing/full backup and disclosed Android Auto Backup to the user's Google account. Minimal list sharing contains only XFER-01 fields; full backup is distinct. Keep link payloads outside host HTTP requests/logs/unintended third parties. Operational reports describe source processing, not user analytics. |
| QUAL-06 | Surface generation, validation, loading, download, storage, and playback errors explicitly. Never substitute a success-shaped result for a failure. |

## 12. Best-effort performance goals

These are approved advisory targets to measure during implementation, not
measurements of the current repository. Per S38, a numeric miss alone is not a
hard implementation/release gate. Report results and meaningful regressions.
Correctness, responsive cancellation, accessibility, integrity, safety bounds and
data preservation remain mandatory.

| ID | Target | Measurement conditions |
| --- | --- | --- |
| PERF-01 | Search results update within 550 ms at the 95th percentile. | Generated index already loaded; 10,000-item representative all-script corpus; mid-range Android device and desktop browser; online and offline. Measure input through visible excerpts/highlights, including the selected 250 ms debounce, scheduling, matching, filtering/ranking and rendering. |
| PERF-02 | Largest Contentful Paint (LCP) <= 2.5 seconds. | Key website pages under documented device/network/test conditions. |
| PERF-03 | Interaction to Next Paint (INP) <= 200 ms. | Key website interactions under documented conditions. |
| PERF-04 | Cumulative Layout Shift (CLS) <= 0.1. | Key website pages under documented conditions. |

Search timing must include the user-visible result update, not just a narrow
index lookup. Record corpus characteristics, query mix, test devices, browser
versions, sampling method, and results. Do not count deferred YouTube playback
loading as initial lyrics-page loading.
The advisory search goal is 550 ms p95. Cold index
download/loading and memory need separate evidence. All four numeric goals are
best effort. Document viewport/page completion, device/network and cache conditions;
no mandatory network baseline or whole-page-versus-viewport timing choice was
approved. There are no measured performance results yet.

## 13. Validation and release automation

| ID | Requirement |
| --- | --- |
| CI-01 | On PRs, validate source Markdown/YAML structure, publishable required fields versus drafts, unique video/line/verse IDs, settings/registry and asset references, and applicable deterministic tooling fixtures. Do not require actual item variant generation/previews in PRs. Full public-artifact/index/package generation and validation happen after merge under LANG-03/CI-03. |
| CI-02 | Distinguish legitimate drafts from invalid publishable items. Drafts may be reviewed without being included in generated public artifacts. |
| CI-03 | After an approved PR merges to `main`, automatically validate, generate and deploy that repository's public output: the Website root PWA from the Website repository and the Library publication to `/library/` from the Library repository. Never deploy invalid or partially generated artifacts; a failure leaves the live site unchanged. |
| CI-04 | Separate APK release: CI builds an unsigned candidate, maintainer verifies/signs locally, then a protected workflow verifies/publishes the signed APK. Signing keys never enter CI; retain secure local backup and release identity/source/certificate checks. |
| CI-05 | Validate that installed Android clients can consume compatible new content independently of APK releases. Preserve user-requested offline-refresh behavior. |
| CI-06 | Record actual APK/download/installed/update-peak sizes/version/item count before release, plus host-limit/headroom preflight. Verify Android preparation/removal/failure gates, offline operation, zero thumbnails/video in reading bundles and system-font coverage with explicit unsupported-rendering handling. Song counts are not measurements or permission to omit approved renderings. |

Repository maintainers must configure the permissions, review rules, GitHub Pages
deployment access, and release credentials needed to enforce this workflow.

## 14. End-to-end data flows

### 14.1. Content acquisition

Owner-supplied reviewed Kannada follows a text-authoring/review path without
YouTube or images. ID assignment/import still requires separate authorization.
The provider-ingestion path below is optional and remains externally blocked.

```text
Manual backfill OR manual local incremental discovery
    -> official YouTube Data API
    -> proposed flat Markdown + YAML metadata
    -> canonical Kannada extraction, supplied Source Latin and draft flags
    -> downloaded/optimized thumbnail assets
    -> missing reviewed classification-registry additions in settings
    -> one reviewable change set / PR
    -> validation + human review/corrections
    -> approved merge
```

Incomplete or uncertain lyrics branch into unpublished drafts for manual
correction. Existing reviewed entries are not automatically refreshed from YouTube.

### 14.2. Publication and consumption

```text
Reviewed library + reviewed settings + reviewed assets
    -> post-merge transliteration and full publication validation
    -> per-lyric JSON/gzip + groups/filter data + prebuilt global JSON/gzip index
    -> common SHA-256 manifest and shared ZIP STORE transport bundles
    -> GitHub Pages website/PWA and downloadable content artifacts
    -> Android/PWA generated-index queries and item display
```

### 14.3. Offline use

```text
User requests download/refresh
    -> show size and progress
    -> download complete content snapshot and required reading assets
    -> validate completeness and consistency
    -> switch active snapshot only on success
    -> offline browsing, filters, search, and reading without thumbnails/videos
```

On refresh failure, retain the previous usable snapshot and report the problem.
On initial-download failure there is no active snapshot; keep preparation and
recovery accessible. Android initially gates lyric access until a complete
snapshot exists, including after deliberate removal/total loss, and preserves
pending shared-link destinations through preparation. Isolated later damage
retains only verified unaffected capabilities under OFF-16. Both clients continue
using their downloaded version online until explicit update. PWA online reading
before preparation does not require this full download. Video
playback and repository-hosted thumbnail loading remain online operations.

## 15. Acceptance scenarios

The implementation must demonstrate at least the following outcomes.

| Scenario | Expected result | Requirements |
| --- | --- | --- |
| Historical import | A manual backfill accounts for existing public videos across paginated results and proposes manageable review batches. | ING-01, ING-02 |
| New-video import and retry | A new video produces one item proposal with associated assets/settings changes; retrying does not duplicate items or open PRs. | ING-04 to ING-08 |
| No new content | A successful incremental scan reports no changes and opens no PR. | ING-07, ING-11 |
| Missing or uncertain lyrics | Source text is retained in a flagged draft; the item never appears in public indexes or downloads until corrected and approved. | DATA-07, ING-09, CI-02 |
| API/quota failure | The workflow reports failure clearly and does not publish partial content or report a successful empty scan. | ING-11, QUAL-06 |
| Review corrections | Reviewed Kannada/source metadata/taxonomy corrections survive processing. Generated output is fixed through global profile/rule revisions, never per-item overrides or changes to correct Kannada merely to force conversion. | LANG-03, ING-06 |
| Thumbnail ingestion | An available thumbnail is committed in the item PR, optimized where practical and resolves for online display after publication. It is excluded from offline packages; offline icons/metadata do not block lyrics or readiness. | IMG-01 to IMG-04, OFF-02 |
| Existing source change | A source-description edit does not automatically overwrite an already imported item. | ING-04 |
| Localization | A supported device language is used initially; an unsupported language falls back to English; a remembered override survives restart. | I18N-01 to I18N-04 |
| Script independence | Choosing a UI language does not translate lyrics or change an explicit script preference; all approved script variants work offline. | LANG-01 to LANG-06 |
| Latin display variants | All five initial profiles pass independent pinned mapping/structural fixtures; Hunterian is deferred. Generate real variants only post-merge. Global fixes have regressions; generation failure blocks deployment. Explicit picker, no assumed reading default. | LANG-02 to LANG-04, LANG-10, LANG-12 |
| Source Latin | Suitable complete corresponding text is selectable/labeled. Unsuitable supplied text is public with explicit status, but not selectable or indexed as a reading variant; other internal provenance stays private to source processing. Absence does not block generation. Unavailable selections offer an explicit generated choice; helpers/search navigation require reliable correspondence. | LANG-08, LANG-11, LANG-12, SEARCH-09, SEARCH-10 |
| Search coverage and ranking | Kannada/Latin/descriptive-metadata queries and reviewed aliases match; all target scripts remain readable. Metadata-first buckets and approved additive field priorities have controlled expected-ranking cases; IDs/dates are not search fields. | SEARCH-02, SEARCH-03 |
| Substring and bounded typo search | `dir sh` matches `vadiraja krishna`; all terms are required across fields/lines, without OR fallback. OSA code-point fixtures test fragments, swaps, 1-3/4-8/9+ length boundaries and 0/1/2 edit limits; ordinary short literals are not excluded. | SEARCH-12, SEARCH-13 |
| Explicit online search loading | An unprepared PWA shows index size and requires Load search before a missing/new index transfer. Opening Search/typing does not download it; valid cache is reused. No full-library/offline-ready claim follows index loading. | SEARCH-14, OFF-10, OFF-12 |
| Search scheduling | Committed edits debounce 250 ms, Enter/filters run immediately, IME composition is preserved and obsolete work/results cannot overwrite current results. Measure debounce and visible excerpts/highlights against the best-effort 550 ms p95 goal. | SEARCH-15, PERF-01 |
| Latin spelling alternatives | Reviewed Kannada/Latin alternatives resolve the intended item/line, displayed in the selected reading script. UI language/display text stay independent; online/offline matching agrees. | LANG-07, SEARCH-06, SEARCH-08 |
| Search recognition and navigation | Selected-script excerpts identify the matching line; reliable highlights and metadata-only context are honest; opening a result reaches its corresponding verse with full-text access. Include alternative spellings and excerpt rendering in timing checks. | SEARCH-09, SEARCH-10, PERF-01 |
| Combined filters | Multiple values in one field use OR; selections in different fields use AND; search applies to the filtered set. | SEARCH-04, SEARCH-05 |
| Filter recovery | Active filters stay visible and can be removed individually. Clear filters preserves the typed query and is offered on filtered no-results states online/offline; loading/index failures do not look like empty success. | SEARCH-07, SEARCH-11, UX-13 |
| Generated-data boundary | Clients operate from generated artifacts without parsing source Markdown or deriving classifications. | GEN-01, GEN-04 |
| Performance | The documented 10,000-item test reports p95 user-visible search latency and key website metrics against advisory goals, including conditions and meaningful regressions; a numeric miss alone is not a hard release gate. | PERF-01 to PERF-04 |
| Offline completeness | After full download and loss of connectivity, launch, browse, filter, search/read all scripts and use required assets without thumbnails/videos. Show icons/available metadata; absence of a thumbnail does not block readiness. | OFF-01 to OFF-03, SEARCH-06, IMG-03 |
| Safe refresh | Interrupt, cancel, fail integrity validation, and simulate insufficient storage during refresh; the previous snapshot remains usable and the failure is visible. | OFF-04 to OFF-07 |
| Active library source | Publish a newer static library after full download; both clients keep the downloaded version online/offline until explicit validated update. Before full download, website online requests use compatible published data. | OFF-12 |
| Soft update dates | Update-recommended date is at least 7 days after generation, independent of APK/download dates. Download an already-due snapshot and verify reminder without blocked lyrics. Successful no-newer-compatible checks suppress it for 3 days without altering dates; failures neither claim freshness nor create suppression. | GEN-06, OFF-13, OFF-14 |
| Client update needed | A newer incompatible library produces clear client-update guidance, not a false latest-published claim. Existing compatible offline reading continues. Initial preparation offers a published compatible complete snapshot if available, otherwise explains the client-update prerequisite. Android guidance uses GitHub Releases; website updates are safe and preserve personal data. No automatic APK install or content replacement. | OFF-14, OFF-17, PLAT-07, CI-05 |
| Download resume | Interrupt initial and replacement downloads, restart and explicitly resume verified same-version progress. Reject damaged retained data and mixed versions; explain unavailable-version/restart cases. No partial initial activation, lost old snapshot or promise of closed-browser background downloading. | OFF-06, OFF-10, OFF-15 |
| Isolated damage and repair | Damage a previously validated item, index or required asset. Verified unaffected capabilities stay usable with degraded readiness; affected capabilities fail explicitly without corrupt text/false empty search. Same-version repair restores readiness; explain full replacement when needed. Initial partial and totally unusable libraries remain gated. | OFF-07 to OFF-11, OFF-16, SEARCH-07 |
| Cleared browser storage | The PWA recognizes missing offline data and offers re-download rather than displaying a false downloaded state. | OFF-08 |
| Reading preferences | Script, UI language, and lyric font size survive app/browser restart independently; verse layout is retained. | LANG-05, I18N-03, UX-02, UX-03 |
| Reading themes | Light, Dark, Warm, and Follow device work online/offline; a remembered manual choice overrides device changes. Lyrics/helper text, controls, focus, and search highlights retain accessible contrast. | UX-11, QUAL-01 |
| Reading density | Choose Compact, Normal or Relaxed in skippable onboarding and change it later; restart offline and retain the choice. Verify primary/helper scripts, all themes, Recite/Practice, preserved lines/verse separation, readable narrow layouts and bounded wide-screen columns under accessibility/text-scaling tests. | UX-02, UX-03, UX-12, UX-14, QUAL-01 |
| First-use setup | Skip or complete preferences without changing skipped defaults; choices remain editable. PWA online browsing is immediate, but Android requires explicit full preparation before lyric access. Size precedes consent; unavailable previews never invent content or trigger automatic downloads. | UX-12, LANG-05, OFF-01, OFF-04, OFF-10 |
| Browsing continuity | Open several results and return to the same query, filters, and result/list/Explore position using website Back/Forward and Android Back online/offline. Handle changed content/order without false exact restoration; no permanent search history is introduced. | UX-13 |
| Optional helper script | Users can choose primary-script-only or aligned Kannada/Latin helper lines, remember the choice, and read both offline without narrow-screen overflow or translation. | LANG-08, PLAT-05 |
| Personal library | Favorite/unfavorite; create, rename, duplicate, reorder, and confirm deletion of multiple lists; restart offline and preserve independent lists and library items. | LIB-01 to LIB-04 |
| Duplicate list names | Create/rename/duplicate/import using a name held by another list; warn and allow after explicit confirmation, without requiring a numbered name. Cancel without mutation. Identically named lists remain independent and imports never merge/overwrite. | LIB-11, XFER-04 |
| Repeated list occurrences | Repeat lyrics/placeholders, independently edit/move/remove one occurrence, duplicate and round-trip by link/file without deduplication. Recitation visits each ordered occurrence, including consecutive repetitions. | LIB-08 to LIB-10, XFER-04, REC-03 |
| Recently opened | Open items and verify most-recent-first history across restart, preferred-script reopening, and offline access. Clearing preserves other personal state; disabling stops new recording. No history is sent to a service or included in list exports. | LIB-06, QUAL-05, XFER-01 |
| Verse bookmarks | Save multiple verse locations, practise elsewhere, then reopen each bookmark in the full lyric across scripts/restarts and offline. Remove independently; unresolved locations after content edits are explained without unrelated jumps. | LIB-07, LIB-05 |
| Snapshot transfer | Link/file round trips preserve only name, format version, ordered library references, repetitions and user-entered placeholder/fallback text across Android/PWA. Validate/preview before explicit save as a newly named independent list, even when names match; no append/merge/replace or existing-list mutation. File transfer works offline; first-time browser use accurately requires the static shell. | XFER-01 to XFER-06, LIB-10 |
| Static runtime | Search, local personal state, link decoding, and import work without an application backend or server-side list storage. Fetch only static content/required assets plus explicitly requested video; maintainer ingestion remains separate. | PLAT-09, QUAL-04, QUAL-05 |
| App/browser list links | Test signed installed/absent Android app, verified/unverified host, user-disabled handling, source-browser non-handoff, and explicit Open in app/browser fallback. Without a library, Android previews supplied text/IDs and retains the intended destination through explicit download without auto-saving. Host-root verification is required; do not override user choices or force redirect loops. | UX-09, XFER-05, XFER-07, OFF-10 |
| Link limits and privacy | Supported-boundary links round-trip without loss; oversized outgoing lists offer file export. Malformed/oversized/unsupported input leaves existing lists unchanged. Shared payload stays out of host requests/logs; previews warn that received links can be forwarded and cannot be revoked. | XFER-03, XFER-06, XFER-08, QUAL-05 |
| Personal export and import | Export then import on a clean install restores personal data exactly; malformed, oversized, newer-version or cancelled imports change nothing; Auto Backup excludes content snapshots; the privacy disclosure names Auto Backup. | XFER-09, XFER-10, QUAL-05 |
| Intentional placeholders | Create/edit/reorder/remove single-line placeholders without IDs, retain text plus unavailable message during offline recitation, and replace manually with a library reference at the same position. Unresolved IDs with optional user labels remain distinct; no auto-match or clickable external-URL field. | LIB-08, LIB-09, REC-03 |
| Import failures and unresolved items | Invalid/unsupported files and cancellation leave existing data unchanged. Missing IDs remain visible without fabricated titles or replacements; import alone does not mark a list offline-ready. | LIB-05, XFER-03 to XFER-05, OFF-09 |
| Generic unavailable references | Shared-list references and direct item links retain generic unavailable messaging without a special version-aware update-check action. Preserve identifiers/fallback text, order and repetitions; intentional placeholders remain distinct and ordinary update controls still work. Before preparation, do not claim absence from an undownloaded library. | LIB-09, LIB-10, XFER-04, UX-07 |
| Offline list readiness | Check actual local library entries/assets and separate placeholder counts/warnings. Unprepared libraries, missing downloads, unresolved IDs, missing required fallback fonts/assets, eviction and placeholder-only lists never receive misleading complete-lyrics claims; absent thumbnails are permitted. Snapshot changes preserve personal state/placeholder text. | OFF-09, LIB-05, LIB-08, LIB-09 |
| Download-first Android | First launch without network shows preparation required, not lyrics. Skip preferences but retain the lyric-access gate; cancel/interrupt/fail storage or validation and remain unprepared with recovery/list controls. After explicit complete download, verify offline search/reading/assets and record actual size/storage evidence. | OFF-01, OFF-03, OFF-10, CI-06 |
| Offline removal and recovery | Remove the active library with confirmation; personal state/placeholders survive, no bundled content appears and no automatic re-download occurs. Android gates lyrics until complete preparation again; PWA online reading remains available with not-ready-offline status. | OFF-11, LIB-05 |
| System fonts | Validate primary/helper scripts and shaping on the tested platforms, including separate Bengali/Assamese renderings and Tamil superscripts; no fallback fonts are bundled. No approved rendering is silently dropped; untested devices are named in release evidence; thumbnails are not reading dependencies. | LANG-09, LANG-08, OFF-02, IMG-03 |
| Recitation | Enter/exit focused reading, restore controls, navigate a list offline, handle unavailable/boundary entries, and activate/release screen-awake where supported with honest unsupported/failure states. | REC-01 to REC-03 |
| Continue recitation | Recite one list, switch to another, restart offline and explicitly continue only the most recent list's saved occurrence, including consecutive repeated songs. Do not auto-enter Recite mode, restore exact lyric scroll, alter practice progress or export resume state. Explain removed lists/occurrences and offer user choice rather than an unrelated jump. Snapshot refresh/removal preserves the saved personal position, with lyric access gated when preparation is required. | REC-04, LIB-05, XFER-01, OFF-10 |
| Learning resume | Navigate reviewed verses, restart/resume offline, change scripts without losing the verse, and handle a changed/missing saved position explicitly. No hide/reveal or audio scoring is implied. | LEARN-01 to LEARN-03 |
| Learning labels | Set, change, clear, and filter optional learning labels across restart and offline; open Practice from the Learning view. No automatic assessment, reminders, remote collection, or labels in list exports. | LEARN-04, QUAL-05, XFER-01 |
| Discovery | Browse reviewed groups, request another available lyric, sort newly added by stable library-publication date, and favorite/add/practice offline without tracking or invented classifications. | EXP-01 to EXP-04 |
| Playback failure/offline | Lyrics remain usable; the player is absent until Play; offline/unavailable playback has an explicit explanation and appropriate external-link option. | UX-04 to UX-06 |
| Direct links and sharing | An item URL opens directly under the configured Pages base path; item/video sharing and copy fallback produce the intended URLs. | PLAT-08, UX-07 to UX-09 |
| Responsive accessibility | Validate the supported device/browser matrix, 320 CSS pixel layout, orientations, keyboard/focus, screen readers, contrast, and text scaling. | PLAT-02 to PLAT-05, QUAL-01 |
| Publication without APK update | Approved content appears through the generated distribution, and an existing compatible Android install can retrieve it without an APK release. | GEN-05, CI-03, CI-05 |
| Extensible metadata | Adding a new optional field preserves older items; adding a filter follows reviewed settings, generation, and presentation integration. | DATA-06, SET-01, SEARCH-04 |

## 16. Dependencies and risks

- **Source rights and provider terms:** The project has no rights/attribution
  publication gate and no per-item rights contract (`rights-attribution-gate`).
  Maintainers remain responsible for complying with applicable law and YouTube
  API and embedding terms; the provider-terms check for stored metadata is still
  pending before first ingestion.
- **YouTube access and quota:** Discovery depends on valid credentials, available
  quota, API access, and the channel's public content. Failures require visible
  reporting and retry, not silent omission. This is a deferred-ingestion risk,
  not an initial-release dependency.
- **Extraction quality:** Description formats may vary. Kannada extraction and
  optional classification require review; missing data must not be fabricated.
- **Transliteration quality:** Script mappings can be ambiguous or lossy. All five
  Latin profiles need pinned Kannada rules and tests, correction preservation
  and side-by-side samples before a recommendation. Supplied Source Latin may be
  unsuitable or unaligned; its absence must not hold up generated content.
- **Repository/build size:** Source/thumbnail assets increase repository size;
  post-merge generated variants/indexes increase public build/package size.
  Image optimization and a sustainable asset layout must be evaluated without
  committing generated variants or removing approved offline behavior.
  Five generated Latin variants increase content/index size; measure the real
  corpus rather than relying on unmeasured song-count/download estimates.
- **Offline storage:** Device capacity and browser eviction limit persistence.
  Atomic replacement may temporarily require space for both old and new data.
- **Static hosting:** GitHub Pages base paths and direct-item routing need an
  explicit implementation and validation strategy.
- **Content compatibility:** Independently published content requires a defined
  version/compatibility contract with already installed clients.
- **External video availability:** Videos may become inaccessible or restricted.
  No requirement guarantees online playback or automatic source revalidation.
- **Personal library portability:** Shared snapshots do not provide lyric copies
  or ordinary library titles for unresolved IDs; user-written fallback labels
  and placeholders are not authoritative library metadata. Local-only favorites,
  practice progress, recent history, learning labels, bookmarks, and preferences are not synchronized or
  included in minimal list exports and can be lost if app/browser data is cleared.
  Separate full personal export/restore and disclosed Android Auto Backup are
  included, not automatic synchronization or a guarantee that a backup exists.
- **Static app-link hosting:** Automatic Android routing depends on a signed
  app/domain association at the host root, plus user/platform settings. A Pages
  project path alone does not grant control of the required root location.
- **Shared-link limits and disclosure:** Self-contained snapshots may exceed
  messaging/browser limits, requiring file fallback. User-entered text travels
  with the share and is readable/forwardable, not private or remotely revocable.
- **Initial preparation and storage:** Android is not a lyric reader before its
  first complete download. Interruption, unavailable internet or insufficient
  storage must leave recovery accessible without false readiness. Measure APK,
  download, installed and old/new snapshot staging storage rather than relying on
  song-count estimates; no bundled fallback exists after content removal.
- **System font coverage:** Device fonts may lack readable glyphs/shaping.
  System fonts only; no packaged/downloaded fallback. Confirmed failures must
  disclose the unsupported rendering/environment and offer an explicit alternate
  choice, never silently switch or claim false readiness.
- **Aligned reading/search:** Latin alternatives, helper lines, matching-verse
  navigation, practice resume, and verse bookmarks need stable line/verse
  correspondence across approved variants and a clear policy when reviewed text
  changes.
- **Global search index:** Whole-index transfer on relevant changes, JSON
  parse/materialization peaks and per-tab worker memory remain unmeasured.
  Bounded fuzzy fragments need candidate-complete matching, not an approximation
  that silently omits results. The 550 ms target includes 250 ms debounce.
- **Screen-awake support:** Browser/device support and operating-system policy
  vary. Recitation must remain usable when screen-awake requests are unavailable.
- **Operations:** Schedules can be delayed; maintainers must provide review
  capacity, deployment permissions, API secrets, and protected APK signing keys.

## 17. Initial exclusions

- Offline video downloading or playback.
- Lyric translation or automatic audio transcription.
- Accounts, sign-in, automatic cross-device synchronization, hosted collaborative
  lists, and public user content uploads. Client-decoded snapshot sharing and
  local list-file import/export with text placeholders are included.
- Ads, analytics, user tracking, and push notifications.
- Video playback playlists and portable lyric-content export packages. Favorites
  and recitation lists with library references/text placeholders are included.
- Automatic refresh of existing YouTube-derived entries.
- Google Play distribution. Verified Android App Links are now included.
- Application backends, server-side databases, hosted list/short-link storage, live shared
  lists, remote snapshot revocation, and separate clickable placeholder URL fields.
- Append/merge/replace list imports; the initial import action creates a new
  independent list only. Local device/browser databases remain permitted.
- Automatic query translation, unrestricted fuzzy/typo matching, and arbitrary
  conversion between every script pair. Reviewed Latin spelling variants and
  selected-script matching are included.
- Hide/reveal recall exercises, automatic pronunciation scoring, translated
  meanings, audio-synchronized lyrics, and automatic scrolling.
- Selective offline downloads; the initial model remains Download all content.
- Bundled Android lyric libraries, Android online-only lyric browsing before full
  preparation, and thumbnails in offline packages. Online PWA reading and online
  repository-hosted thumbnails remain included.
- Find within an open lyric and an in-app lyric/transliteration correction-report
  builder. Existing library search and external project-support routes remain.
- Cross-session general browsing-position restoration. Minimal list transfer,
  separate full personal backup/restore and current-session continuity remain
  included. REC-04 additionally remembers only the most recent
  recitation list/entry, not general navigation, per-list positions or exact lyric
  scroll restoration.

## 18. Selected design and remaining decisions

The [current design](design-decisions.md) documents selected technical directions
and outstanding gates; approval history/alternatives belong only in HISTORY.
Native Kotlin/Compose and React/TypeScript/Vite are selected, not open framework
questions. Source/parser/identity direction, global post-merge corrections,
common JSON/gzip/ZIP/SHA-256 publication, platform storage/network/navigation/UI
libraries, localization, global prebuilt search, worker execution and normal
shell-update lifecycle also have selected directions.

**Overall production design closure remains pending; staged implementation is
authorized.** The fixture milestone provides only the partial evidence mapped in
[testing and release](testing-and-release.md#partial-requirement-evidence), not a
complete coding-ready production specification or full acceptance. Outstanding
work includes:

- Compatible pinned toolchain/dependencies, package manager/workspace/locks and
  actual bootstrap/build/test commands.
- Exact source/settings/public/item/manifest/index/policy/backup schemas and type
  coverage. JSON Schema 2020-12 and strict-producer/compatible-consumer roles are
  selected; exact serialized keys/capabilities remain open.
- Source template, markers/UUID serialization, filename slug rules and profile;
  metadata coverage audit, vocabularies and aliases (UUID, markers, filenames and
  drafts are selected in the Shared specification; no rights fields).
- Five exact initial Kannada Latin profiles (Hunterian deferred),
  target-script approximation rules, independent fixtures and permitted samples
  before a Latin recommendation/default. Exact Source Latin eligibility/alignment
  contracts remain open.
- Translation catalog schema, plural/placeholder/escaping generation, React Aria
  Kannada announcements and real-device rendering of every script with system fonts.
- Global index data structures, normalization/tokenization, candidate completeness,
  bounds, ranking weights/ties, excerpt loading and memory/performance evidence.
- Planner byte/request budgets and exact ledger/journal/reader/GC structures.
  Current-only remote hosting, no-op stability, Web Locks/fencing with optional
  BroadcastChannel, artifact-level resume and up-to-100/32-MiB bundles are selected.
- Personal schemas/migrations and exact backup format,
  most-recent recitation position and pending-destination/navigation details.
  New-list-only import and confirmed duplicate names are already settled.
- List file/link serialization/compression, safe bounded decoding/size limits,
  text rules, legacy support and sharing/file fallbacks.
- Exact ledger/backfill and API request/batch parameters, thumbnail paths/
  optimization and local runbook. Full-scan uploads pagination/reconciliation is
  selected; no schedule wiring. First API ingestion remains on provider hold.
- Exact themes/density/columns, accessible navigation/reordering, player,
  screen-awake and file/sharing libraries and failure handling.
- Signed application ID/certificate association, root-site route/deployment
  verification, permissions, safe code/content compatibility, release/rollback
  procedures and actual APK/download/installed/update peak-storage evidence.

Resolve the applicable [architecture gates](architecture.md) before each owning
production slice; staged fixture work does not waive them. Significant unresolved
choices still need approval. These remaining decisions must preserve the
requirements above.
