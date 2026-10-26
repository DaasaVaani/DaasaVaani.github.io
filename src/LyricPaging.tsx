import { useEffect, useId, useRef, useState } from "react";
import messages from "../shared/generated/web/ui.json";

export function useLyricPaging(readPrefix: string) {
  const [query, setQuery] = useState(""), [pages, setPages] = useState(1);
  const nextFocus = useRef<string | undefined>(undefined), resultsId = useId();
  useEffect(() => { setPages(1); nextFocus.current = undefined; }, [query]);
  useEffect(() => {
    const id = nextFocus.current;
    if (!id) return;
    nextFocus.current = undefined;
    const frame = requestAnimationFrame(() => document.getElementById(`${readPrefix}-${id}`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [pages, readPrefix]);
  return { query, setQuery, resultsId, limit: pages * __WEB_CONFIG__.lyricPreview.pageSize,
    readId: (id: string) => `${readPrefix}-${id}`,
    more: (id: string | undefined) => { nextFocus.current = id; setPages(value => value + 1); } };
}
export function LyricPagination({ count, nextId, paging, labels }: {
  count: number; nextId?: string; paging: ReturnType<typeof useLyricPaging>; labels: typeof messages.en;
}) {
  if (count <= __WEB_CONFIG__.lyricPreview.pageSize) return null;
  const shown = Math.min(count, paging.limit);
  return <div>
    <p role="status">{labels.resultCount.replace("{shown}", String(shown)).replace("{total}", String(count))}</p>
    {shown < count && <button aria-controls={paging.resultsId} onClick={() => paging.more(nextId)}>{labels.showMoreResults}</button>}
  </div>;
}
