# Real canonical online reading

## Scope and contracts

The separate `#/lyrics` route reads Library's public `lyric-preview-v1` family.
The [Shared lyric identity contract](https://github.com/DaasaVaani/shared/blob/main/docs/lyric-identity.md)
and [public schema](../shared/schemas/lyric-publication.schema.json) own permanent
UUIDs, line/layout records and capability/version semantics. Videos, thumbnails,
images and Latin text are not prerequisites for canonical Kannada reading.
Clients consume published artifacts only, never original text files or Library
Markdown. Source approval/publication does not imply reviewed transliteration,
registry completeness, rights metadata or release readiness.

This bounded prelaunch slice implements the Website's selected individual
online-reading direction, not the complete production publication/search or
optional durable offline lifecycle. Metadata and verified requested items stay
only in memory. Reload discards them and loads the current publication for the
new online session; there is no service-worker/offline snapshot, background
refresh, replacement UI, resume or persistent content cache here.

## Online loading and failure behavior

- Opening `#/lyrics` or an explicit lyric reader link fetches only the descriptor
  and its hash-pinned catalog manifest initially. Browsing requires no complete
  download. Reading requests only the selected catalog item's immutable object.
  This does not download an index or establish offline readiness.
- Settings, Favorites, lists/list previews, Learning and Recently opened do not implicitly
  fetch owner content. An explicit Read link is an online-reading action and may
  load the catalog and selected item. Fixture metadata loads independently.
- Strict build-time [web settings](../settings/web.yml) and their
  [schema](../settings/web.schema.json) own `lyricPreview.descriptorUrl`, page
  size, catalog item count and aggregate in-memory encoded/decoded ceilings. The URL
  must be absolute, credential-free HTTPS. Shared publication safety owns
  per-artifact byte and request-time limits.
- Transport uses `no-store`. Validate the complete catalog schema/capabilities,
  unique identities, literal metadata and every declared object reference before
  exposing it. An exposed catalog is not a claim that every item's text was
  downloaded or validated.
- Cache accounting includes descriptor/manifest bytes and successful/in-flight
  requested items. Reserve the selected item's declared encoded/decoded bytes
  before requesting it; refuse excess explicitly, release failed/cancelled or
  duplicate reservations and preserve prior verified content. Do not silently
  evict, trim a catalog, fetch unrelated items or raise limits from remote data.
- Each selected item validates gzip, SHA256, encoded/decoded sizes, paths,
  format/capabilities, summary/item UUID/title/tags agreement, meaningful Kannada
  lines, controls/scalars and conflicts with catalog/loaded line identities before
  exposure. Layout rows cannot acquire line IDs. Compatible unknown optional
  fields are accepted; required unknown capabilities/future versions are not.
- Metadata errors expose no partial catalog. Item errors retain the verified
  catalog and report an explicit error; retry requests the same pinned object
  without refreshing metadata or guessing a replacement. Verified cached items
  are reused within the session, not silently replaced with a newer publication.
- Cancellation aborts the active request, exposes a cancelled status and allows
  explicit retry. Leaving the route cancels its read. Late responses cannot
  activate abandoned content, fill its cache or record an open. A failed fixture
  endpoint does not block real catalog loading or reading.
- The complete-preparation conformance helper separately retains whole-plan
  validation before item requests and bounded `concurrentRequests` workers with
  abort/settle behavior. The Website online UI does not invoke that helper or
  claim a persistent offline download.

## Browsing and reading

After metadata loading, the catalog's literal case-sensitive title substring filter
and explicit configured-size pages expose every matching item. This is not the
production Kannada/Latin linguistic search/index. Show more focuses the first
newly revealed result; changing the query resets expansion.

`#/lyrics/<lyricId>` performs exact UUID lookup in the verified catalog.
Unknown IDs display unavailable rather than inferring another lyric/video.
Unknown IDs request no item. A known uncached item is downloaded and verified
before canonical text or save controls appear; cached reads make no new request.
Reading preserves canonical text, whitespace, line identities and blank layout
rows. UI language/theme do not alter the lyrics.
The catalog/query/expanded page and available focus/scroll survive in-session
reader return and Back/Forward. Reload resets this context and performs a fresh
online metadata/selected-item load, without a complete-download gate.

## Show another lyric

EXP-02's explicit action is available on the verified canonical catalog and a
successfully loaded canonical reader. It samples from the entire same verified
catalog, never only title-filter matches, visible pages, favorites or history.
The notice makes that independent scope and non-personalized behavior explicit.
It does not load discovery metadata, classify items, prepare content or infer
missing source fields.

The reader excludes its current UUID. Catalog choice excludes the most recently
successfully opened canonical UUID in that same catalog session, when present.
This single process-local reference is not persisted or derived from Recently
opened. If no eligible candidate exists, including a sole/current lyric, the
action is disabled and an explicit unavailable status is shown. A malformed empty
published catalog remains a manifest error under the unchanged nonempty schema;
it is not converted into a successful empty discovery result.

The selector filters the bounded catalog then uses the platform's ordinary
non-security random fraction to select an eligible index. It validates injected
fractions and reports faults explicitly rather than choosing a fallback.
Selection costs O(catalog items) time/temporary references within `maxItems`.
It changes no library objects or personal data and fetches nothing itself.
The existing reader downloads/verifies only the chosen uncached object, or reuses
that catalog's verified in-memory item. Failure/retry stays pinned to that object,
not a silently chosen replacement. Literal text/layout/IDs and Favorite/Add to
list controls remain the ordinary canonical reader.

The first catalog choice pushes a reader; consecutive choices replace that reader,
preserving its original Catalog/Favorites/Lists/Recently opened/Learning return context.
Back therefore does not traverse a generated chain of reader choices. Catalog
filter/pages and available originating focus/scroll survive normal return.
Only a successful exposed reader records the existing optional history, once;
selection failures and unavailable actions record nothing. Disabled history keeps
reading fully no-write. Reload discards this discovery context.

This is not reviewed Explore groups, first-publication-date discovery, Practice,
personalized recommendations or complete persistent offline-version support.
The native application independently exposes the same action only from its
completely prepared canonical catalog and valid reader. Its pure selector uses
a validated ordinary bounded random index over eligible summaries, not the
Website fraction interface. It never initiates preparation, fetches an item or
writes personal state. The prepared reader retains normal successful-exposure
history and typed controls. Consecutive choices replace reader state while
preserving Catalog/Favorites/Lists/Recently opened/Learning/unsaved-preview origin and
Settings/Android Back continuity; an unsaved preview is not saved by discovery.
Current native preparation and the last-opened reference are process-local,
not durable offline snapshots. Its owning
[guide](https://github.com/DaasaVaani/AndroidApp/blob/main/README.md)
defines native setup and validation.

## Personal reading and references

The real route hides fixture notices/errors and synthetic preparation messages.
Personal-storage errors remain explicit. Explicit reader controls save typed
lyric favorites and new independent list occurrences; merely loading/reading
never changes favorites/lists/preferences. Successful explicit reading records
optional device-only recent history; disabled recording makes reading fully
no-write. A lyric reference uses `kind:"lyric",lyricId`;
legacy fixture/video references retain `kind:"legacyVideo",videoId`, even for
UUID-looking old values. No reference is matched or rewritten from a title,
attached video or catalog coincidence.

Favorites retain unresolved lyric IDs across reload without automatic requests.
Exact titles appear only from the available verified catalog, without item reads.
Real Favorites use independent configured-size pages, with the same literal
title filter available after catalog loading, query-reset and new-page focus rules
as the real catalog. Filtering/paging never writes personal data; unresolved
references remain available when the filter is cleared. Legacy search is labeled
separately and does not pretend to search canonical lyrics.
Unresolved legacy favorites remain visible/removable, not silently discarded.
List forms offer explicit lyric-ID versus legacy-ID creation and placeholder
replacement, preserving occurrence IDs/order/user text. A real-reference Read
loads the requested UUID online, not a guessed substitute. Preview/save/export
alone never downloads lyrics. List/Favorites origins restore
available focus/scroll and the selected unsaved list editor in the same session.

The [personal v8 protocol](architecture.md#web-typed-personal-storage-v8) validates
and structurally upgrades old local schemas atomically without changing existing
list/occurrence IDs or raw legacy values. Transport families remain independent:
v1 previews can re-export unchanged; confirmed v1 imports adapt to typed legacy
records, and all saved-list exports use minimal v2 without local IDs/lyric copies.

## Focused Recite

Loaded canonical and fixture readers offer explicit focused Recite with an
obvious exit and restorable reading controls. The same literal text/layout,
font/density/theme and normal reader remain in place. Entering/exiting does not
write preferences, labels, history or other personal data and requests no
content. Replacing/leaving the reader ends mode; restart never auto-enters it.
The [Recite lifecycle](architecture.md#focused-individual-recite-and-screen-awake)
owns exact focus/control visibility and optional screen-awake handling.

Screen awake is an explicit optional request, initially off. Its status reflects
pending, actual active/released, unsupported or failed adapter state, not a
guarantee against OS restrictions. Exit/navigation/background release it; late
acquisition cannot reactivate an abandoned reader and foreground return does not
silently reacquire. Unsupported/failure paths keep Recite usable.
Native independently exposes this bounded mode after its existing complete
in-memory preparation. Android Back first exits focused Recite; native
screen-awake requests preserve pre-existing view ownership and are released on
background/navigation/disposal without foreground reacquisition. Consult the
[native guide](https://github.com/DaasaVaani/AndroidApp/blob/main/README.md)
for its platform lifecycle and separate validation boundaries.
Already verified session text remains usable without a network connection, but
this is not durable offline readiness: reload retains the existing online/
preparation gate.

Website and native saved lists offer an explicit Recite list action over the exact stored
order. Repetitions and raw placeholders remain independent occurrences;
Previous/Next do not wrap or skip missing entries. Empty/start/end states and
unavailable/failed/cancelled downloads are explicit, with retry only on request.
Website loads only the selected lyric; native selects from completely prepared
verified content. Successful opens use normal typed recent history,
never storing local occurrence IDs/fallbacks there. List movement retains one
focused/optional-awake owner and the same independent reading preferences.
Exit/Escape/Back restore the original mounted list drafts and start focus;
Forward/reload never reenter. An active stored-list change/deletion ends mode
with a stale-state error rather than silently changing order. See the
[occurrence lifecycle](architecture.md#saved-list-recite-occurrences).
Website additionally persists the exact latest list occurrence and offers
explicit Continue and per-entry Recite. Position writes precede cursor changes,
are independent of successful-read history, retain unavailable references and
roll back on failure; empty lists do not replace the pair. Continue uses current
order/contents, explains missing lists/occurrences without substitution and never
automatically enters after restart or reacquires screen awake. See the
[position lifecycle](architecture.md#exact-latest-occurrence-and-explicit-continue).
Native's equivalent upgrade and device validation are independently owned.
Website [backup v1](architecture.md#same-platform-personal-backup-v1) separately
includes this pair. Native full-backup inclusion and complete offline readiness remain unimplemented;
management/preview is not native preparation.

## Local learning labels

Both clients' canonical and fixture readers offer optional Want to learn, Practising and
Comfortable reciting labels, plus explicit clearing. These are self-assigned
local intent, not scores, inferred progress or evidence of memorization.
The [Shared learning-label contract](https://github.com/DaasaVaani/shared/blob/main/docs/learning-labels.md)
owns exact tokens, typed identity, order, limits, no-op and migration semantics.
Changing a label never changes lyric text/layout, favorites/lists/preferences or
Recently opened, and never replays an already exposed reader's successful open.
Minimal list links/files never include labels.

`#/learning` manages persisted assignments before catalog preparation, with All
and three label filters. Filtering/page expansion never writes or fetches
content. It uses configured canonical page sizes, stable first-assignment order
and first-new-result focus. A change retains position; clearing removes only the
exact typed identity. Unresolved IDs and UUID-looking legacy references remain
independent and editable; titles resolve only from already available catalogs.
Canonical Read links explicitly load their exact UUID online. Unknown legacy
references do not gain guessed links. Reader return/Back/Forward and consecutive
Show another lyric retain the original Learning filter/pages and available focus.
Reload resets browsing context, not assignments.

The interface shell can reopen Learning offline and manage the local record after
restart. This does not establish lyric readiness or durable offline snapshots.
Practice remains explicitly unavailable until reviewed verse-based Practice is
implemented. No verse divisions, Practice action, automatic assessment or reminder
is fabricated; LEARN-04 remains partial until that separate entrypoint exists.
Native Room6 independently preserves earlier collections/preferences/history,
initializing only empty labels. Its offline Learning view is available before
preparation and retains filters/pages/origin through readers, Settings, Back and
consecutive discovery. Explicit canonical Read still requires complete
preparation; pending destinations retain their Learning origin. Native local
labels do not make the process-local prepared catalog durable.

## Coverage and open work

This slice provides partial DATA-01/02/04/05, UX-07/13, EXP-02/04, OFF-02 and SET-01/02
coverage, with partial LIB-01/02/03/04/05/06/08/09/10/11 and XFER-01/02/03/04/05/06/08
for the Website typed personal slice, plus partial LEARN-04/QUAL-05 for local
labels and filtering without Practice. See [validation commands and obligations](testing-and-release.md) and
the [roadmap](implementation-roadmap.md). The native application independently
implements full-preparation reading with the same media independence, typed
favorites, durable lists/occurrences and device-only recent history. Native
complete preparation and Website online loading remain memory-only; local
collections do not establish persistent offline content readiness.

Website Recently opened retains typed references across restarts, with default-on
recording, independent disable/clear controls and no automatic content request.
Only a verified explicitly opened reader updates it; catalog loading and preview
never record. Clear/disable preserve favorites/lists/preferences; unknown
references remain visible. See the [history lifecycle](architecture.md#recently-opened-lifecycle).

Still open: complete production-profile reading, bookmarks/verse Practice/
native full-personal backups including recitation position, full linguistic search/
profiles/helpers, populated classification/context/verse/media/eligible-Latin
public adapters, rights/registry closure, persistent offline activation/repair,
publication ledger/date/ZIP protocols and release/platform acceptance.

Owner originals remain local and uncommitted. Library's
[import guide](https://github.com/DaasaVaani/library/blob/main/docs/source-import.md)
owns the conservative footer adapter and explicit unchanged-input retry.
Ambiguous content, controls and undecodable inputs stay held; text review does
not authorize guessing missing encodings, video associations or metadata.
