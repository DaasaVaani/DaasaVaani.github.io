import type { LyricItem } from "../shared/types/lyrics";
import type { FixtureItem } from "../shared/types/publication";
import styles from "./App.module.css";

export function LyricText({ item, selectedLine = null }: { item: LyricItem | FixtureItem; selectedLine?: string | null }) {
  return <div lang="kn" className={styles.lyrics}>{"lyricId" in item
    ? item.lines.map((line, index) => <p key={line.kind === "line" ? line.lineId : `layout-${index}`}
      {...(line.kind === "line" ? { id: line.lineId } : { "data-layout": true })}>{line.text || <br />}</p>)
    : item.lines.map(line => <p id={line.id} key={line.id} data-selected={line.id === selectedLine}>{line.text || "\u00a0"}</p>)}
  </div>;
}
