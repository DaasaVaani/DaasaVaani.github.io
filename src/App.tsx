import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HashRouter, NavLink, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import messages from "../shared/generated/web/ui.json";
import type { FixtureItem, SearchIndex, SearchPolicy } from "../shared/types/publication";
import { Publication, loadPublication } from "./artifacts";
import { browserDefaultPersonal, recordOpened, watchPersonal, updatePersonal, type Personal, type PersonalStore } from "./personal";
import type { Hit } from "./search";
import { NavigationContinuity } from "./navigation";
import { ListPreview } from "./ListPreview";
import { Lists } from "./Lists";
import { AddToList } from "./AddToList";
import { Lyrics, ReferenceFavorites } from "./Lyrics";
import { HistoryControls, RecentHistory } from "./RecentHistory";
import { Learning, LearningControl } from "./Learning";
import { Recite } from "./Recite";
import { LyricText } from "./LyricText";
import { ReadingPreferences, type ReadingPreferencesProps } from "./ReadingPreferences";
import { PersonalBackup } from "./PersonalBackup";
import { useAppShell } from "./app-shell";
import type { LyricLibrary } from "./lyric-publication";
import type { PersonalReference } from "./list-transfer-types";
import { hasFavorite, learningLabelFor, toggleFavorite } from "./personal-model";
import styles from "./App.module.css";

type Labels = typeof messages.en;
function ShellNotices({ labels, shell }: { labels: Labels; shell: ReturnType<typeof useAppShell> }) {
  return <>
    {shell.updateAvailable && <aside className={styles.notice} role="status">{labels.appUpdateAvailable}</aside>}
    {shell.unsupported && <p role="status">{labels.appShellUnsupported}</p>}
    {shell.error && <section role="alert" className={styles.error}><h2>{labels.appShellFailed}</h2>
      <p>{shell.error}</p><button onClick={shell.retry}>{labels.retry}</button></section>}
  </>;
}
function FixtureOnly({ children }: { children: ReactNode }) {
  return /^\/(?:lyrics(?:\/|$)|learning$)/u.test(useLocation().pathname) ? null : children;
}
function ListRoute({ labels, personal, publication, lyrics }: {
  labels: Labels; personal?: PersonalStore; publication?: Publication; lyrics?: LyricLibrary;
}) {
  const location = useLocation();
  const link = new URL(__WEB_CONFIG__.listLinkPath, __WEB_CONFIG__.canonicalBaseUrl).href +
    "#" + location.pathname + location.search + location.hash;
  return <section className={styles.reader}><ListPreview labels={labels} personal={personal} publication={publication} lyrics={lyrics} initialLink={link} /></section>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
interface ReaderProps {
  publication: Publication; labels: Labels; personal: Personal; store: PersonalStore;
  toggle: (reference: PersonalReference) => void; opened: (reference: PersonalReference, epoch: string | undefined) => void;
  change: ReadingPreferencesProps["change"];
}

function Reader({ publication, labels, personal, store, toggle, opened, change }: ReaderProps) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state: unknown = location.state;
  const origin = state && typeof state === "object" && "browseFrom" in state ? state.browseFrom : undefined;
  const fromBrowsing = origin === "/" || origin === "/favorites" || origin === "/lists" || origin === "/recent" || origin === "/learning";
  const [params] = useSearchParams();
  const [item, setItem] = useState<FixtureItem>();
  const readingEpoch = useRef(store.control.epoch);
  const [error, setError] = useState("");
  const lineId = params.get("line");
  useEffect(() => {
    const controller = new AbortController();
    readingEpoch.current = store.control.epoch;
    setItem(undefined);
    setError("");
    if (!id) { setError("Missing item identity"); return; }
    publication.item(id, controller.signal).then(value => {
      setItem(value);
      if (lineId && !value.lines.some(line => line.id === lineId)) setError("The matching line is unavailable; no location was guessed");
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); });
    return () => controller.abort();
  }, [id, lineId, publication]);
  useEffect(() => {
    if (item && lineId) document.getElementById(lineId)?.scrollIntoView({ block: "center" });
  }, [item, lineId]);
  useEffect(() => {
    if (item && item.videoId === id) opened({ kind: "legacyVideo", videoId: item.videoId }, readingEpoch.current);
  }, [id, item, opened]);
  return <section className={styles.reader}>
    <Link to={fromBrowsing ? origin : "/"} className={styles.back}
      onClick={event => {
        if (fromBrowsing && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          navigate(-1);
        }
      }}>← {origin === "/lists" ? labels.backToList : origin === "/favorites" ? labels.favorites
        : origin === "/recent" ? labels.recentHistory : origin === "/learning" ? labels.learning : labels.back}</Link>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!item && !error && <p role="status">{labels.loading}</p>}
    {item && item.videoId === id && <Recite key={`${item.videoId}:${location.key}`} labels={labels}
      heading={<header className={styles.readerHeader}><h1 lang="kn">{item.title}</h1></header>}
      controls={<><p className={styles.eyebrow}>{labels.canonical}</p>
        <button className={styles.secondary} aria-pressed={hasFavorite(personal, { kind: "legacyVideo", videoId: item.videoId })}
          onClick={() => toggle({ kind: "legacyVideo", videoId: item.videoId })}>
          {hasFavorite(personal, { kind: "legacyVideo", videoId: item.videoId }) ? labels.removeFavorite : labels.addFavorite}
        </button>
      <ReadingPreferences labels={labels} personal={personal} change={change} />
      <LearningControl key={item.videoId} labels={labels} reference={{ kind: "legacyVideo", videoId: item.videoId }}
        label={learningLabelFor(store.learning, { kind: "legacyVideo", videoId: item.videoId })} revision={store.control} />
      </>}
      secondary={<><p className={styles.muted}>{item.description}</p>
        <AddToList key={item.videoId} labels={labels} personal={store} reference={{ kind: "legacyVideo", videoId: item.videoId }} /></>}>
      <LyricText item={item} selectedLine={lineId} />
    </Recite>}
  </section>;
}

function ListsSession({ labels, personal, publication, lyrics, onLyrics, opened, change }: {
  labels: Labels; personal: PersonalStore; publication?: Publication; lyrics?: LyricLibrary;
  onLyrics: (library: LyricLibrary) => void; opened: ReaderProps["opened"]; change: ReaderProps["change"];
}) {
  const location = useLocation();
  const state: unknown = location.state;
  const fromLists = state && typeof state === "object" && "browseFrom" in state && state.browseFrom === "/lists";
  if (location.pathname !== "/lists" && !(/^\/(?:item|lyrics)\//u.test(location.pathname) && fromLists)) return null;
  return <div hidden={location.pathname !== "/lists"}><Lists labels={labels} personal={personal} publication={publication}
    lyrics={lyrics} onLyrics={onLyrics} opened={opened} change={change} /></div>;
}
function BrowsingSession(props: {
  publication: Publication; labels: Labels; personal: Personal; favoritesOnly: boolean;
}) {
  const location = useLocation();
  const active = location.pathname === (props.favoritesOnly ? "/favorites" : "/");
  return <div hidden={!active}><Library {...props} /></div>;
}

function Library({ publication, labels, personal, favoritesOnly }: {
  publication: Publication; labels: Labels; personal: Personal; favoritesOnly: boolean;
}) {
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [forced, setForced] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{ index: SearchIndex; policy: SearchPolicy }>();
  const [hits, setHits] = useState<Hit[]>([]);
  const [pages, setPages] = useState(1);
  const nextPageFocus = useRef<string | undefined>(undefined);
  const resultsId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { setPages(1); nextPageFocus.current = undefined; }, [query, prepared]);
  useEffect(() => {
    if (!prepared || composing) return;
    if (!query.trim()) { setHits([]); setBusy(false); setError(""); return; }
    let worker: Worker | undefined;
    let active = true;
    setBusy(true);
    const timer = setTimeout(() => {
      worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ hits?: Hit[]; error?: string }>) => {
        if (!active) return;
        setBusy(false);
        if (event.data.error) { setError(event.data.error); setHits([]); }
        else { setError(""); setHits(event.data.hits ?? []); }
      };
      worker.onerror = event => { if (active) { setError(event.message || "Search worker failed"); setHits([]); setBusy(false); } };
      worker.postMessage({ id: 1, query, ...prepared });
    }, forced === query ? 0 : prepared.policy.debounceMs);
    return () => { active = false; clearTimeout(timer); worker?.terminate(); };
  }, [query, prepared, composing, forced]);
  async function prepare() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    try { setPrepared(await publication.prepareSearch(current.signal)); }
    catch (reason) { if (!current.signal.aborted) setError(errorText(reason)); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  const matching = new Map(hits.map(hit => [hit.itemId, hit]));
  const searching = Boolean(prepared && query.trim());
  let entries = searching
    ? hits.map(hit => publication.summary(hit.itemId)).filter(value => value !== undefined)
    : publication.manifest.catalog;
  if (favoritesOnly) entries = entries.filter(item => hasFavorite(personal, { kind: "legacyVideo", videoId: item.videoId }));
  const shown = entries.slice(0, (prepared?.policy.pageSize ?? publication.manifest.catalog.length) * pages);
  return <>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>{labels.ready}</p>
      <h1 id={favoritesOnly ? "favorites-title" : undefined} tabIndex={favoritesOnly ? -1 : undefined}>
        {favoritesOnly ? labels.favorites : labels.library}<span className={styles.count}>
          {favoritesOnly && !searching ? personal.favorites.length : entries.length}</span></h1>
      <p className={styles.muted}>{labels.tagline}</p>
      {!favoritesOnly && <Link to="/recent">{labels.recentHistory}</Link>}
      {favoritesOnly && <h2>{labels.legacyReference}</h2>}
      {!prepared ? <div className={styles.consent}>
        <p>{labels.searchConsent}</p>
        <button onClick={() => void prepare()} disabled={busy}>{labels.loadSearch} · {Math.ceil(publication.manifest.objects[publication.manifest.named.index]!.encodedBytes / 1024)} KiB</button>
      </div> : <form onSubmit={event => { event.preventDefault(); if (!composing) setForced(query); }}>
        <label className={styles.srOnly} htmlFor="query">{labels.search}</label>
        <input id="query" type="search" placeholder={labels.search} value={query}
          onChange={event => { setQuery(event.target.value); setForced(null); }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={event => { setComposing(false); setQuery(event.currentTarget.value); }} />
      </form>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
    <section id={resultsId} className={styles.grid} aria-label={favoritesOnly ? labels.favorites : labels.library} aria-busy={busy}>
      {shown.map((item, position) => {
        const line = matching.get(item.videoId)?.lineIds[0];
        return <article className={styles.card} key={item.videoId}>
          <div className={styles.cardTop}><span className={styles.number}>{String(position + 1).padStart(2, "0")}</span>
            <span className={styles.muted}>{hasFavorite(personal, { kind: "legacyVideo", videoId: item.videoId }) ? "★" : "✦"}</span></div>
          <h2 lang="kn">{item.title}</h2>
          <p className={styles.muted}>{item.description}</p>
          <div className={styles.tags}>{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <Link className={styles.readLink} state={{ browseFrom: favoritesOnly ? "/favorites" : "/" }}
            ref={node => { if (node && nextPageFocus.current === item.videoId) { node.focus(); nextPageFocus.current = undefined; } }}
            onClick={event => event.currentTarget.focus({ preventScroll: true })}
            to={`/item/${encodeURIComponent(item.videoId)}${line ? "?line=" + encodeURIComponent(line) : ""}`}>
            {labels.open}<span aria-hidden="true"> ↗</span>
          </Link>
        </article>;
      })}
      {!shown.length && !busy && !error && (!favoritesOnly || searching || !personal.favorites.length) &&
        <p role="status">{favoritesOnly && !searching ? labels.emptyFavorites : labels.noResults}</p>}
    </section>
    {prepared && entries.length > prepared.policy.pageSize && <div>
      {!busy && <p role="status">{labels.resultCount.replace("{shown}", String(shown.length)).replace("{total}", String(entries.length))}</p>}
      {shown.length < entries.length && <button disabled={busy} aria-controls={resultsId} onClick={() => {
        nextPageFocus.current = entries[shown.length]?.videoId; setPages(value => value + 1);
      }}>{labels.showMoreResults}</button>}
    </div>}
  </>;
}

export default function App() {
  const shell = useAppShell();
  const [publication, setPublication] = useState<Publication>();
  const [lyrics, setLyrics] = useState<LyricLibrary>();
  const [personalReady, setPersonalReady] = useState(false);
  const [store, setStore] = useState<PersonalStore>();
  const observedEpoch = useRef<string | undefined>(undefined);
  const [personal, setPersonal] = useState<Personal>(browserDefaultPersonal);
  const [deviceDark, setDeviceDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [error, setError] = useState("");
  const [fixtureError, setFixtureError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const labels = messages[personal.language];
  const opened = useCallback((reference: PersonalReference, epoch: string | undefined) => {
    void recordOpened(reference, epoch).catch(reason => setError(errorText(reason)));
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setDeviceDark(media.matches);
    changed(); media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setFixtureError("");
    setPersonalReady(false);
    setStore(undefined);
    observedEpoch.current = undefined;
    const failed = (reason: unknown) => {
      if (!controller.signal.aborted) setError(current => [current, errorText(reason)].filter(Boolean).join("\n"));
    };
    loadPublication(controller.signal).then(library => {
      if (!controller.signal.aborted) setPublication(library);
    }).catch(reason => { if (!controller.signal.aborted) setFixtureError(errorText(reason)); });
    const stop = watchPersonal(state => {
      if (!controller.signal.aborted) {
        observedEpoch.current = state.control.epoch;
        setStore(state);
        setPersonal(state.personal ?? browserDefaultPersonal());
        setPersonalReady(true);
      }
    }, reason => { observedEpoch.current = undefined; setPersonalReady(false); setStore(undefined); failed(reason); });
    return () => { controller.abort(); stop(); };
  }, [attempt]);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = personal.language;
    document.title = labels.appName;
    root.style.setProperty("--font", __WEB_CONFIG__.fontFamily);
    const theme = personal.theme === "device" ? deviceDark ? "dark" : "light" : personal.theme;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "dark" ? "dark" : "light";
    for (const [name, value] of Object.entries(__WEB_CONFIG__.themes[theme])) root.style.setProperty(`--${name}`, value);
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.append(themeColor);
    }
    themeColor.content = __WEB_CONFIG__.themes[theme].accent;
    root.style.setProperty("--reader-line-height", String(__WEB_CONFIG__.readerLineHeights[personal.density]));
    for (const [name, value] of Object.entries({ space: __WEB_CONFIG__.space, "reader-font": personal.fontSize,
      "content-width": __WEB_CONFIG__.contentWidth, "reader-width": __WEB_CONFIG__.readerWidth })) root.style.setProperty(`--${name}`, `${value}px`);
  }, [personal.language, personal.theme, personal.fontSize, personal.density, deviceDark]);
  async function change(mutator: (state: Personal) => Personal) {
    const epoch = store?.control.epoch;
    try {
      const value = await updatePersonal(mutator, epoch);
      if (observedEpoch.current === epoch) setPersonal(value);
    }
    catch (reason) { setError(errorText(reason)); }
  }
  const toggle = (reference: PersonalReference) => { void change(state => toggleFavorite(state, reference)); };
  return <HashRouter>
    <NavigationContinuity />
    <a className={styles.skip} href="#content" onClick={event => {
      event.preventDefault(); document.getElementById("content")?.focus();
    }}>{labels.skipToContent}</a>
    <header className={styles.header}><Link className={styles.brand} to="/">
      <span className={styles.mark} aria-hidden="true">ದಾ</span><span>{labels.appName}<small>{labels.tagline}</small></span>
    </Link><nav aria-label={labels.appName}>
      <NavLink to="/" end>{labels.library}</NavLink>
      <NavLink to="/lyrics">{labels.ownerLyrics}</NavLink>
      <NavLink to="/favorites">{labels.favorites}</NavLink>
      <NavLink to="/recent">{labels.recentHistory}</NavLink>
      <NavLink to="/learning">{labels.learning}</NavLink>
      <NavLink to="/lists">{labels.lists}</NavLink>
      <NavLink to="/settings">{labels.settings}</NavLink>
    </nav></header>
    <main id="content" tabIndex={-1} className={styles.main}>
      <ShellNotices labels={labels} shell={shell} />
      <FixtureOnly><aside className={styles.notice}>{labels.fixtureNotice}</aside></FixtureOnly>
      {error && <section className={styles.error} role="alert"><h2>{labels.error}</h2><p>{error}</p>
        <button onClick={() => setAttempt(value => value + 1)}>{labels.retry}</button></section>}
      <FixtureOnly>
        {fixtureError && <section className={styles.error} role="alert"><h2>{labels.error}</h2><p>{fixtureError}</p>
          <button onClick={() => setAttempt(value => value + 1)}>{labels.retry}</button></section>}
        {(!publication || !personalReady) && !error && !fixtureError && <p role="status">{labels.loading}</p>}
      </FixtureOnly>
      <Lyrics labels={labels} publication={lyrics} onPrepared={setLyrics} personal={store} preferences={personal} change={change} toggle={toggle} opened={opened} />
      {publication && personalReady && <>
        <BrowsingSession key={`all-${attempt}`} publication={publication} labels={labels} personal={personal} favoritesOnly={false} />
        <BrowsingSession key={`favorites-${attempt}`} publication={publication} labels={labels} personal={personal} favoritesOnly />
      </>}
      {store && <ReferenceFavorites labels={labels} personal={store} publication={lyrics} legacyPublication={publication} toggle={toggle} />}
      {store && <RecentHistory labels={labels} personal={store} publication={publication} lyrics={lyrics} />}
      {store && <Learning labels={labels} personal={store} publication={publication} lyrics={lyrics} />}
      {store && <ListsSession key={attempt} labels={labels} personal={store} publication={publication} lyrics={lyrics}
        onLyrics={setLyrics} opened={opened} change={change} />}
        <Routes>
        <Route path="/" element={null} />
        <Route path="/favorites" element={null} />
        <Route path="/recent" element={null} />
        <Route path="/learning" element={null} />
        <Route path="/lists" element={null} />
        <Route path="/lyrics/*" element={null} />
        <Route path="/item/:id" element={publication && personalReady && store
          ? <Reader publication={publication} labels={labels} personal={personal} store={store} toggle={toggle} opened={opened} change={change} /> : null} />
        <Route path="/settings" element={<section className={styles.reader}><h1>{labels.settings}</h1>
          {personalReady && <>
          <fieldset><legend>{labels.language}</legend>
            {__WEB_CONFIG__.uiLanguages.map(language => <button key={language} className={styles.secondary}
              aria-pressed={personal.language === language} onClick={() => void change(state => ({ ...state, language }))}>
              {messages[language].languageName}</button>)}
          </fieldset>
          <fieldset><legend>{labels.appearance}</legend>
            {__WEB_CONFIG__.uiThemes.map(theme => <button key={theme} className={styles.secondary}
              aria-pressed={personal.theme === theme} onClick={() => void change(state => ({ ...state, theme }))}>
              {theme === "device" ? labels.followDevice : labels[theme]}</button>)}
          </fieldset>
          <ReadingPreferences labels={labels} personal={personal} change={change} />
          {store && <HistoryControls labels={labels} history={store.history} epoch={store.control.epoch} />}
          {store && <PersonalBackup labels={labels} store={store} />}
          </>}
          <ListPreview labels={labels} personal={store} publication={publication} lyrics={lyrics} />
          <section><h2>{labels.appShell}</h2><p>{labels.appShellNotice}</p></section>
        </section>} />
        <Route path="/list/:payload" element={<ListRoute labels={labels} personal={store} publication={publication} lyrics={lyrics} />} />
        <Route path="*" element={<p role="alert">{labels.unknownRoute} <Link to="/">{labels.back}</Link></p>} />
      </Routes>
      <FixtureOnly><footer className={styles.footer}>{labels.unavailableFeatures}</footer></FixtureOnly>
    </main>
  </HashRouter>;
}
