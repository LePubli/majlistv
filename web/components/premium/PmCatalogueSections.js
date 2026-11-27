'use client';
// Catalogue du thème Premium, découpé en sections (étape 4b de l'éditeur visuel).
// Reproduit le catalogue de la maquette V20 (classes « v20-cv11-… », « pm-cat-… ») avec les vraies données :
//   1. bannière : « Explorer … », titre, phrase, champ de recherche (/catalogue?q=…) · 2. puces des thèmes (nombre réel de vidéos, GET /talks/facets)
//   3. rangées par thème (sans filtre) · 4. résultats : formats (GET /formats?used=1), tri, filtres, grille, « Afficher plus » · 5. liens Apprendre et Kids.
// Mode « séries » (page /series) : mêmes écrans, avec la liste des séries publiées (GET /series).
// Les filtres sont dans l'adresse (?q=, ?cat=, ?format=, ?sort=…) : le bouton « retour » du navigateur fonctionne.
import Link from 'next/link';
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../Providers';
import { thumbOf } from '../../lib/thumb';
import { catalogueTabs } from '../SectionTabs';
import Glyph, { chipGlyph, formatGlyph } from './Glyph';
import { OttCard, OttRail, useTalkProgress } from './PmOtt';
import { PmSpotSection } from './PmHomeSections';
import TalkFilters, { FILTER_KEYS, filtersFrom } from '../TalkFilters';

const PAGE = 24;
const SORTS = ['recent', 'alpha', 'duration'];

/** Adresse du Catalogue (ou de /series) avec les filtres donnés ; les valeurs vides sont retirées. */
function hrefOf(base, cur, patch) {
  const q = new URLSearchParams();
  const v = { ...cur, ...patch };
  for (const k of ['q', 'cat', 'format', 'sort']) if (v[k] && !(k === 'sort' && v[k] === 'recent')) q.set(k, String(v[k]));
  for (const k of FILTER_KEYS) if (v[k]) q.set(k, String(v[k])); // phase 5 : langue, audio, sous-titres, durée, niveau, progression, ressources
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Tout l'état du Catalogue : filtres lus dans l'adresse, données chargées, cartes. */

/** Images immersives du Catalogue (plein écran, sans personnage) : une au hasard pour le bandeau, une par thème pour son bloc. */
const IMMERSIVE = ['learn-bg-1', 'learn-bg-2', 'learn-bg-3', 'learn-bg-4', 'learn-bg-5', 'hero-salahuddin', 'andalousie-large', 'coran-large', 'caravane-large', 'salahuddin-large', 'al-khwarizmi-large'].map((n) => `/premium/${n}.webp`);
/** Tirage au hasard (à chaque visite) : identique côté serveur (ordre fixe), mélangé une fois la page affichée pour éviter tout décalage. */
function useShuffledImages() {
  const [list, setList] = useState(IMMERSIVE);
  useEffect(() => { setList([...IMMERSIVE].sort(() => Math.random() - 0.5)); }, []);
  return list;
}

export function useCatalogueState(series = false, toolbar = false) {
  const { t, call, ready, user, feat, allCats, formatName, inMyList, toggleMyList, appName, hasSeries, hasBooks } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const base = series ? '/series' : '/catalogue';
  const cur = {
    q: (sp.get('q') || '').trim().slice(0, 80),
    cat: /^\d{1,9}$/.test(sp.get('cat') || '') ? sp.get('cat') : '',
    format: /^[a-z0-9-]{2,40}$/.test(sp.get('format') || '') ? sp.get('format') : '',
    sort: SORTS.includes(sp.get('sort')) ? sp.get('sort') : 'recent',
    ...(series ? {} : filtersFrom(sp)), // les filtres de la phase 5 ne concernent que les vidéos
  };
  const hasExtras = FILTER_KEYS.some((k) => cur[k]);
  const [q, setQ] = useState(cur.q);
  useEffect(() => { setQ(cur.q); }, [cur.q]);
  const [view, setView] = useState('grid');          // grille ou liste (résultats)
  const [showAll, setShowAll] = useState(false);      // « Afficher plus de contenus » : ouvre la grille complète sous les rangées
  const roots = useMemo(() => (allCats || []).filter((c) => c.parentId == null), [allCats]);
  const rootOf = useCallback((id) => { const c = (allCats || []).find((x) => String(x.id) === String(id)); return c ? (c.parentId ?? c.id) : null; }, [allCats]);
  const curRoot = cur.cat ? rootOf(cur.cat) : null;
  const catName = cur.cat ? ((allCats || []).find((c) => String(c.id) === cur.cat)?.name || '') : '';

  // Formats qui ont des vidéos (barre du haut).
  const [formats, setFormats] = useState([]);
  useEffect(() => { if (!series) call('/formats?used=1', {}, null).then((r) => setFormats(r.ok && Array.isArray(r.data) ? r.data : [])); }, [call, series]);

  // Vidéos (ou séries) affichées, et chiffres.
  const [items, setItems] = useState(null);
  const [facets, setFacets] = useState(null);
  const [allSeries, setAllSeries] = useState(null);
  const [mySeries, setMySeries] = useState({}); // { idSérie: épisodes terminés } du membre (GET /me/series), vide pour un visiteur
  const key = JSON.stringify(cur);
  const params = useCallback((offset) => {
    const p = new URLSearchParams();
    if (cur.q) p.set('q', cur.q);
    if (cur.cat) p.set('category', cur.cat);
    if (cur.format) p.set('format', cur.format);
    if (cur.sort !== 'recent') p.set('sort', cur.sort);
    for (const k of FILTER_KEYS) if (cur[k]) p.set(k, cur[k]);
    p.set('limit', PAGE); p.set('offset', offset);
    return p;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready || series) return undefined;
    let dead = false;
    setItems(null);
    call('/talks?' + params(0), {}, null).then((r) => { if (!dead) setItems(r.ok ? r.data : []); });
    const f = params(0); f.delete('limit'); f.delete('offset'); f.delete('sort');
    call('/talks/facets?' + f, {}, null).then((r) => { if (!dead) setFacets(r.ok ? r.data : null); });
    return () => { dead = true; };
  }, [ready, series, call, params]);
  useEffect(() => { if (series && ready) call('/series?limit=100', {}, null).then((r) => setAllSeries(r.ok && Array.isArray(r.data) ? r.data : [])); }, [series, ready, call]);

  useEffect(() => {
    if (!series || !user) { setMySeries({}); return undefined; }
    let dead = false;
    call('/me/series').then((r) => { if (!dead && r.ok && Array.isArray(r.data)) setMySeries(Object.fromEntries(r.data.map((s) => [s.id, s.watched || 0]))); });
    return () => { dead = true; };
  }, [series, user, call]);

  // Mode séries : filtres et tri faits ici (la liste complète tient en une page).
  const seriesShown = useMemo(() => {
    if (!series || !allSeries) return null;
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let list = allSeries.filter((s) => (!cur.cat || String(rootOf(s.categoryId)) === String(curRoot) && (String(cur.cat) === String(curRoot) || String(s.categoryId) === cur.cat))
      && (!cur.q || norm([s.title, s.speaker, s.summary, s.category].join(' ')).includes(norm(cur.q))));
    if (cur.sort === 'alpha') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (cur.sort === 'duration') list = [...list].sort((a, b) => a.episodeCount - b.episodeCount);
    return list;
  }, [series, allSeries, key, rootOf, curRoot]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const m = {};
    if (series) { for (const s of allSeries || []) { const r = rootOf(s.categoryId); if (r != null) m[r] = (m[r] || 0) + 1; } return m; }
    for (const c of facets?.categories || []) m[c.id] = c.n;
    return m;
  }, [series, allSeries, facets, rootOf]);
  const total = series ? (seriesShown ? seriesShown.length : null) : (facets ? facets.total : null);
  const allTotal = series ? (allSeries?.length ?? null) : null;
  const shown = series ? seriesShown : items;
  const [more, setMore] = useState(false);
  const loadMore = async () => {
    setMore(true);
    const r = await call('/talks?' + params(items.length), {}, null);
    setItems([...items, ...(r.ok ? r.data : [])]);
    setMore(false);
  };

  const go = (patch) => router.push(hrefOf(base, cur, patch), { scroll: false });
  const submit = (e) => { e.preventDefault(); go({ q: q.trim() }); };
  const listOn = feat('favorites') || feat('watchlater');
  const tabs = catalogueTabs({ t, feat, hasSeries, hasBooks }).filter(([href]) => href !== '/catalogue' && href !== '/series');
  const heading = series ? t('pmSeriesTitle') : t('cgTitle');
  const heroTitle = series ? heading : t('ctHeroTitle');
  const title = cur.q ? t('cgResults').replace('{q}', cur.q)
    : [cur.format ? (formatName(cur.format) || cur.format) : '', catName].filter(Boolean).join(' · ') || (series ? t('pmAllSeries') : hasExtras ? t('fltTitle') : t('pmAllContents'));

  // Mode « rangées » (accueil du Catalogue sans filtre) : « À découvrir » puis une rangée par grand thème, chargées au fil du défilement (3 par 3).
  const [rails, setRails] = useState([]);
  const [railIdx, setRailIdx] = useState(0);
  const [railsDone, setRailsDone] = useState(false);
  const busy = useRef(false);
  const railMode = !series && !cur.q && !cur.cat && !hasExtras && cur.sort === 'recent'; // un format choisi reste en rangées (une par thème)
  // Tout le contenu est rangé par thème : d'abord les grands thèmes qui ont des vidéos, puis les « autres thèmes » (sous-thèmes), 40 au plus.
  const themeRoots = useMemo(() => {
    const main = roots.filter((c) => (counts[c.id] || 0) > 0);
    const ids = new Set(main.map((c) => c.id));
    const sub = (allCats || []).filter((c) => c.parentId != null && ids.has(c.parentId)).slice(0, 40).map((c) => ({ ...c, other: true }));
    return [...main, ...sub];
  }, [roots, counts, allCats]);
  const imgs = useShuffledImages();
  useEffect(() => { setRails([]); setRailIdx(0); setRailsDone(false); busy.current = false; }, [railMode, cur.format, facets === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRails = useCallback(async () => {
    if (!ready || !railMode || !facets || busy.current || railsDone) return;
    busy.current = true;
    const fmt = cur.format ? `&format=${encodeURIComponent(cur.format)}` : '';
    const batch = themeRoots.slice(railIdx, railIdx + 3);
    const get = (url, c) => call(url, {}, null).then((r) => ({ c, list: r.ok && Array.isArray(r.data) ? r.data : [] }));
    const got = await Promise.all([...(railIdx === 0 ? [get(`/talks?limit=10${fmt}`, null)] : []), ...batch.map((c) => get(`/talks?category=${c.id}&limit=10${fmt}`, c))]);
    setRails((old) => [...old, ...got.filter((x) => x.list.length)]);
    setRailIdx(railIdx + batch.length);
    if (railIdx + batch.length >= themeRoots.length) setRailsDone(true);
    busy.current = false;
  }, [ready, railMode, facets, railsDone, railIdx, themeRoots, cur.format, call]);
  // Avancement réel du membre sur les cartes vidéo affichées (grille et rangées) ; rien pour un visiteur.
  const prog = useTalkProgress(series ? [] : [...(shown || []).map((x) => x.id), ...(railMode ? rails.flatMap((r) => r.list.map((x) => x.id)) : [])]);
  const talkCard = (x) => <OttCard key={x.id} x={x} time={toolbar} pct={prog[x.id]?.pct} done={prog[x.id]?.done} />;
  const seriesCard = (x) => {
    const w = mySeries[x.id] || 0;
    const full = x.episodeCount > 0 && w >= x.episodeCount;
    return <OttCard key={x.id} x={x} kind="series" href={`/series/${x.slug || x.id}`} pct={x.episodeCount ? Math.round((Math.min(w, x.episodeCount) / x.episodeCount) * 100) : 0} done={full} />;
  };

  // Image du bandeau : celle de la première vidéo (ou série) affichée, à défaut le visuel du thème.
  const heroImg = series ? ((shown && shown[0] && thumbOf(shown[0])) || '/premium/andalousie-large.webp') : imgs[0];
  return { imgs, railsDone, loadRails, heroTitle, toolbar, view, setView, showAll, setShowAll, series, t, base, cur, hasExtras, q, setQ, roots, curRoot, catName, heading, title, heroImg, tabs, counts, facets, total, allTotal, shown, items, more, loadMore, go, submit, formats, railMode, rails, talkCard, seriesCard, feat, appName, hrefOf, listOn };
}

// ---------------------------------------------------------------------------------------------------------------- sections
// Le Catalogue Premium est fait de cinq sections. Dans l'ordre d'origine : bannière, thèmes, rangées, résultats, liens Apprendre / Kids.
// Chaque section lit l'état partagé (filtres de l'adresse, données chargées) : on peut donc les réordonner ou les mélanger à d'autres blocs.
const CatCtx = createContext(null);
export const useCat = () => useContext(CatCtx);

/** Fournit l'état du Catalogue (filtres dans l'adresse, données) à ses sections. */
export function CatProvider({ series = false, toolbar = false, children }) {
  const c = useCatalogueState(series, toolbar);
  return <CatCtx.Provider value={c}>{children}</CatCtx.Provider>;
}

export function CatHeroSection() {
  const { series, t, appName, heroTitle, q, setQ, submit, heroImg } = useCat();
  return (
    <header className="pm-cat-hero" style={{ '--hero': `url("${String(heroImg).replace(/"/g, '%22')}")` }}>
      <div className="pm-cat-intro">
        <span className="pm-cat-eyebrow">{series ? t('pmExploreBrand').replace('{name}', appName) : t('ctEyebrow')}</span>
        <h1>{heroTitle}</h1>
        <p>{series ? t('pmSeriesIntro') : t('ctHeroSub')}</p>
        <form className="pm-cat-search" role="search" onSubmit={submit}>
          <span aria-hidden="true"><Glyph name="search" /></span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pmSearchPh')} aria-label={t('pmSearchPh')} maxLength={80} enterKeyHint="search" autoComplete="off" />
        </form>
      </div>
    </header>
  );
}

export function CatChipsSection() {
  const { series, t, base, cur, roots, curRoot, facets, counts, tabs, hrefOf, toolbar } = useCat();
  // Six thèmes en puces ; les autres dans « Plus de thèmes » (le thème choisi reste toujours visible).
  const all = roots.filter((c) => !facets && !series ? true : (counts[c.id] || 0) > 0 || String(curRoot) === String(c.id));
  const head = all.slice(0, 6);
  const cut = all.slice(6);
  const visible = cut.some((c) => String(curRoot) === String(c.id)) ? [...head, cut.find((c) => String(curRoot) === String(c.id))] : head;
  const rest = cut.filter((c) => !visible.includes(c));
  return (
    <nav className="pm-cat-chips" aria-label={t('pmCategories')}>
      <Link href={hrefOf(base, cur, { cat: '' })} className={cur.cat ? undefined : 'pm-on'} aria-current={cur.cat ? undefined : 'page'}>{series ? t('pmAllSeries') : t('cgAll')}</Link>
      {visible.map((c) => {
        const on = String(curRoot) === String(c.id);
        return <Link key={c.id} href={hrefOf(base, cur, { cat: String(c.id) })} className={on ? 'pm-on' : undefined} aria-current={on ? 'page' : undefined}><Glyph name={chipGlyph(c.name)} />{c.name}</Link>;
      })}
      {rest.length > 0 && (
        <details className="pm-cat-more">
          <summary>{t('ctMoreThemes')} <span aria-hidden="true">⌄</span></summary>
          <div className="pm-cat-more-menu">
            {rest.map((c) => <Link key={c.id} href={hrefOf(base, cur, { cat: String(c.id) })} className={String(curRoot) === String(c.id) ? 'pm-on' : undefined}>{c.name}</Link>)}
          </div>
        </details>
      )}
      {!toolbar && tabs.map(([href, label]) => <Link key={href} href={href} className="pm-chip-more">{label}</Link>)}
    </nav>
  );
}

/** Barre d'outils sous les thèmes : formats (onglets), filtres avancés, tri, grille / liste ; puis le titre et le nombre de contenus. */
export function CatToolbarSection() {
  const { series, t, base, cur, formats, go, title, total, view, setView, hrefOf, railMode, toolbar } = useCat();
  const { formatName } = useApp();
  if (!toolbar) return null;
  return (
    <section className="pm-cat-toolbar" aria-label={t('cgByFormat')}>
      <div className="pm-cat-trow">
        {!series && formats.length >= 1 && (
          <div className="pm-cat-ftabs" role="group" aria-label={t('cgByFormat')}>
            {formats.map((f) => {
              const on = cur.format === f.slug;
              return <Link key={f.slug} href={hrefOf(base, cur, { format: on ? '' : f.slug })} className={on ? 'pm-on' : undefined} aria-current={on ? 'true' : undefined}><Glyph name={formatGlyph(f.slug)} />{formatName(f.slug) || f.nameFr}</Link>;
            })}
          </div>
        )}
        <span className="pm-cat-sep" aria-hidden="true" />
        <div className="pm-cat-tools">
          {!series && <div className="pm-cat-filters"><TalkFilters floating={toolbar} /></div>}
          <label className="pm-cat-sort"><span>{t('ctSortShort')}</span> <select value={cur.sort} onChange={(e) => go({ sort: e.target.value })} aria-label={t('pmSortBy')}>
            <option value="recent">{t('pmSortRecent')}</option>
            <option value="alpha">{t('pmSortAlpha')}</option>
            <option value="duration">{series ? t('pmSortEpisodes') : t('pmSortDuration')}</option>
          </select><Glyph name="chevron" /></label>
          <div className="pm-cat-view" role="group" aria-label={t('ctView')}>
            <button type="button" aria-pressed={view === 'grid'} className={view === 'grid' ? 'pm-on' : undefined} onClick={() => setView('grid')} aria-label={t('ctViewGrid')} title={t('ctViewGrid')}><Glyph name="gridview" /></button>
            <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'pm-on' : undefined} onClick={() => setView('list')} aria-label={t('ctViewList')} title={t('ctViewList')}><Glyph name="listview" /></button>
          </div>
        </div>
      </div>
      {railMode && cur.format && <div className="pm-cat-headline"><h2>{cur.format ? (formatName(cur.format) || title) : t('pmAllContents')}</h2>{total != null && <p>{t(total === 1 ? 'pmResult1' : 'pmResultN').replace('{n}', total)}</p>}</div>}
    </section>
  );
}

/** Apparition douce : le bloc se fond et glisse légèrement quand il entre à l'écran. */
function Reveal({ children }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={on ? 'pm-reveal pm-in' : 'pm-reveal'}>{children}</div>;
}

const SIZES = ['', 'tall', 'big']; // vignettes 16:9 · affiches 2:3 · grandes vignettes 16:9 — en alternance, comme l'accueil
export function CatRailsSection() {
  const { railMode, rails, base, cur, talkCard, hrefOf, t } = useCat();
  if (!railMode || !rails.length) return null;
  const out = [];
  rails.forEach(({ c, list }, i) => {
    out.push(
      <Reveal key={c ? c.id : 'discover'}>
        <OttRail title={c ? c.name : t('ctDiscover')} href={c ? hrefOf(base, cur, { cat: String(c.id) }) : undefined} size={SIZES[i % 3]}>
          {list.map(talkCard)}
        </OttRail>
      </Reveal>);
    // Une « sélection » (collection) après la 3e et la 6e rangée, avec le même style que l'accueil.
    if (i === 2) out.push(<div key="spot1" className="pm-ins"><PmSpotSection n={1} /></div>);
    if (i === 5) out.push(<div key="spot2" className="pm-ins"><PmSpotSection n={2} /></div>);
  });
  if (rails.length < 3) out.push(<div key="spot1" className="pm-ins"><PmSpotSection n={1} /></div>);
  return out;
}

/** Défilement infini : quand ce repère approche de l'écran, on charge la suite (d'abord les rangées de thèmes, puis les vidéos une page à la fois). */
function InfiniteSentinel({ onMore, busy }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) onMore(); }, { rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [onMore, busy]);
  return <div ref={ref} className="pm-cat-sentinel" aria-hidden="true">{busy ? <i /> : null}</div>;
}

export function CatResultsSection() {
  const { series, t, base, cur, railMode, title, total, formats, go, shown, items, more, loadMore, talkCard, seriesCard, hrefOf, toolbar, view, railsDone, loadRails } = useCat();
  // Catalogue en rangées : les rangées se chargent au défilement ; la grille complète suit quand elles sont toutes affichées.
  if (toolbar && railMode) return railsDone ? null : <InfiniteSentinel onMore={loadRails} busy />;
  const hasMore = !series && items && total != null && total > items.length;
  return (
    <section className="pm-cat-all" aria-busy={shown === null}>
      <div className="pm-cat-bar">
        <div>
          <h2>{railMode ? t('pmAllContents') : title}</h2>
          {total != null && <p>{t(total === 1 ? 'pmResult1' : 'pmResultN').replace('{n}', total)}</p>}
        </div>
        {!toolbar && <div className="pm-cat-tools">
          {!series && formats.length >= 1 && (
            <div className="pm-cat-formats" role="group" aria-label={t('cgByFormat')}>
              <Link href={hrefOf(base, cur, { format: '' })} className={cur.format ? undefined : 'pm-on'} aria-current={cur.format ? undefined : 'true'}>{t('pmAll')}</Link>
              {formats.map((f) => <Link key={f.slug} href={hrefOf(base, cur, { format: f.slug })} className={cur.format === f.slug ? 'pm-on' : undefined} aria-current={cur.format === f.slug ? 'true' : undefined}>{f.name}</Link>)}
            </div>
          )}
          <label className="pm-cat-sort">{t('pmSortBy')} <select value={cur.sort} onChange={(e) => go({ sort: e.target.value })} aria-label={t('pmSortBy')}>
            <option value="recent">{t('pmSortRecent')}</option>
            <option value="alpha">{t('pmSortAlpha')}</option>
            <option value="duration">{series ? t('pmSortEpisodes') : t('pmSortDuration')}</option>
          </select></label>
        </div>}
      </div>
      {!series && !toolbar && <div className="pm-cat-filters"><TalkFilters /></div>}
      {shown && shown.length === 0 ? (
        <div className="v20-cv11-empty">
          <Glyph name="search" />
          <h3>{t('pmEmptyTitle')}</h3>
          <p>{t('pmEmptyText')}</p>
          <Link href={base}>{t('pmShowAll')}</Link>
        </div>
      ) : (
        <div className={view === 'list' ? 'pm-cat-grid pm-list' : 'pm-cat-grid'}>
          {(shown || []).map((x) => (series ? seriesCard(x) : talkCard(x)))}
        </div>
      )}
      {toolbar && hasMore && <InfiniteSentinel onMore={() => { if (!more) loadMore(); }} busy={more} />}
      {!toolbar && hasMore && (
        <div className="v20-cv11-more">
          <button type="button" onClick={loadMore} disabled={more}>{t('pmShowMore')} <span>{t('pmRemaining').replace('{n}', total - items.length)}</span> ↓</button>
        </div>
      )}
    </section>
  );
}

export function CatCrossSection() {
  const { t, feat, appName } = useCat();
  if (!(feat('learning') || feat('kids'))) return null;
  const brand = appName.replace(/\s*TV$/i, '');
  return (
    <section className="pm-cat-promos">
      {feat('learning') && (
        <div className="pm-cat-promo pm-cat-promo-learn">
          <div>
            <h2>{t('ctPromoLearnTitle')}</h2>
            <p>{t('ctPromoLearnSub')}</p>
            <Link href="/learning" className="pm-cat-promo-btn pm-fill">{t('ctPromoLearnCta')} <span aria-hidden="true">›</span></Link>
          </div>
        </div>
      )}
      {feat('kids') && (
        <div className="pm-cat-promo pm-cat-promo-kids">
          <div>
            <h2>{brand} <em>Kids</em></h2>
            <p>{t('ctPromoKidsSub')}</p>
            <Link href="/kids" className="pm-cat-promo-btn">{t('ctPromoKidsCta')} <span aria-hidden="true">›</span></Link>
          </div>
        </div>
      )}
    </section>
  );
}

/** Une section du Catalogue posée dans un bloc de l'éditeur (thème Premium seulement, sinon rien). */
export function PmCatFrame({ type }) {
  const { skin } = useApp();
  const inside = useCat();
  if (skin !== 'premium') return null;
  const head = type === 'pm_cat_hero' || type === 'pm_cat_chips';
  const map = { pm_cat_hero: <CatHeroSection />, pm_cat_chips: <CatChipsSection />, pm_cat_rails: <CatRailsSection />, pm_cat_results: <CatResultsSection />, pm_cat_cross: <CatCrossSection /> };
  const inner = map[type];
  if (!inner) return null;
  const frame = <div className="v20-app pm-page pm-ott pm-ott-cat pm-blk">{head ? inner : <div className="pm-ott-body pm-ott-blk">{inner}</div>}</div>;
  // Hors du Catalogue (page libre, aperçu de l'éditeur) : la section prépare elle-même son état.
  return inside ? frame : <Suspense fallback={null}><CatProvider>{frame}</CatProvider></Suspense>;
}
