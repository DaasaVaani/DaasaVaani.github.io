import { Link } from "react-router-dom";
import type messages from "../shared/generated/web/ui.json";
import type { Publication } from "./artifacts";
import { typedEntry, type ListSnapshot } from "./list-transfer-types";
import type { LyricLibrary } from "./lyric-publication";

export function ListEntryView({ entry, labels, publication, lyrics, readable = false }: {
  entry: ListSnapshot["entries"][number]; labels: typeof messages.en; publication?: Publication; lyrics?: LyricLibrary; readable?: boolean;
}) {
  const value = typedEntry(entry);
  const summary = value.kind === "legacyVideo" ? publication?.summary(value.videoId)
    : value.kind === "lyric" ? lyrics?.summary(value.lyricId) : undefined;
  return <>
    <span>{value.kind === "placeholder" ? labels.transferPlaceholder : value.kind === "lyric" ? labels.lyricReference : labels.legacyReference}: </span>
    {value.kind === "placeholder" ? <><span>{value.text}</span><p>{labels.lyricsUnavailable}</p></> : <>
      <code>{value.kind === "lyric" ? value.lyricId : value.videoId}</code>
      {value.fallback !== undefined && <p>{value.fallback}</p>}
      {summary ? <>
        <p lang="kn">{summary.title}</p><p>{labels.referenceKnown}</p>
      </> : <p>{value.kind === "lyric" ? lyrics ? labels.lyricsUnavailable : labels.lyricCatalogPending
        : publication ? labels.lyricsUnavailable : labels.referencePending}</p>}
      {readable && (summary || value.kind === "lyric") && <Link
        to={value.kind === "lyric" ? `/lyrics/${value.lyricId}` : `/item/${encodeURIComponent(value.videoId)}`}
        state={{ browseFrom: "/lists" }} onClick={event => event.currentTarget.focus({ preventScroll: true })}>{labels.open}</Link>}
    </>}
  </>;
}
