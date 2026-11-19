'use client';
// Catalogue du thème Premium : reproduction du catalogue de la maquette V20 (classes « v20-cv11-… »), avec les vraies données.
//   - En-tête : « Explorer … », titre, phrase, champ de recherche (/catalogue?q=…).
//   - Colonne de gauche : « Tout le catalogue » puis les thèmes principaux avec leur nombre réel de vidéos (GET /talks/facets),
//     puis les autres rubriques du Catalogue (Shorts, Collections, Chaînes, Audyn, En direct…), puis l'encart « Apprendre ».
//   - Barre : formats qui ont des vidéos (GET /formats?used=1), tri (plus récents, A → Z, durée), grille ou liste.
//   - Résultats : nombre réel, cartes (image, format, titre, intervenant, thème, durée, « Ma liste »), « Afficher plus ».
//   - Bas de page : liens vers Apprendre et Kids (si ces rubriques sont actives).
// Mode « séries » (page /series) : mêmes écrans, avec la liste des séries publiées (GET /series) et leur nombre par thème.
// Les filtres sont dans l'adresse (?q=, ?cat=, ?format=, ?sort=) : le bouton « retour » du navigateur fonctionne.
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../Providers';
import { thumbOf, posterArt } from '../../lib/thumb';
import { catalogueTabs } from '../SectionTabs';
import Glyph, { glyphOfCategory } from './Glyph';

const PAGE = 24;
const SORTS = ['recent', 'alpha', 'duration'];

export default function PmCatalogue(props) {
  return <Suspense fallback={<div className="v20-app pm-page" aria-busy="true" />}><Inner {...props} /></Suspense>;
}

/** Adresse du Catalogue (ou de /series) avec les filtres donnés ; les valeurs vides sont retirées. */
function hrefOf(base, cur, patch) {
  const q = new URLSearchParams();
  const v = { ...cur, ...patch };
  for (const k of ['q', 'cat', 'format', 'sort']) if (v[k] && !(k === 'sort' && v[k] === 'recent')) q.set(k, String(v[k]));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

const minutes = (sec, t) => (sec > 0 ? `${Math.max(1, Math.round(sec / 60))} ${t('minutes')}` : '');

function Inner({ series = false }) {
  const { t, call, ready, user, feat, allCats, formatName, inMyList, toggleMyList, appName, hasSeries, hasBooks } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const base = series ? '/series' : '/catalogue';
  const cur = {
    q: (sp.get('q') || '').trim().slice(0, 80),
    cat: /^\d{1,9}$/.test(sp.get('cat') || '') ? sp.get('cat') : '',
    format: /^[a-z0-9-]{2,40}$/.test(sp.get('format') || '') ? sp.get('format') : '',
    sort: SORTS.includes(sp.get('sort')) ? sp.get('sort') : 'recent',
  };
  const [q, setQ] = useState(cur.q);
  useEffect(() => { setQ(cur.q); }, [cur.q]);
  const [view, setView] = useState('grid');
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
  const key = JSON.stringify(cur);
  const params = useCallback((offset) => {
    const p = new URLSearchParams();
    if (cur.q) p.set('q', cur.q);
    if (cur.cat) p.set('category', cur.cat);
    if (cur.format) p.set('format', cur.format);
    if (cur.sort !== 'recent') p.set('sort', cur.sort);
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
  const title = cur.q ? t('cgResults').replace('{q}', cur.q)
    : [cur.format ? (formatName(cur.format) || cur.format) : '', catName].filter(Boolean).join(' · ') || (series ? t('pmAllSeries') : t('pmAllContents'));

  return (
    <div className="v20-app pm-page">
      <div className="v20-catalogue-v11">
        <div className="v20-cv11-heading">
          <div>
            <span className="v20-cv11-eyebrow">{t('pmExploreBrand').replace('{name}', appName)}</span>
            <h1>{heading}</h1>
            <p>{series ? t('pmSeriesIntro') : t('pmCatIntro')}</p>
          </div>
          <form className="v20-cv11-search" role="search" onSubmit={submit}>
            <span aria-hidden="true"><Glyph name="search" /></span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pmSearchPh')} aria-label={t('pmSearchPh')} maxLength={80} enterKeyHint="search" autoComplete="off" />
            <kbd aria-hidden="true">⌕</kbd>
          </form>
        </div>
        <main className="v20-cv11-layout">
          <aside className="v20-cv11-sidebar">
            <div className="v20-cv11-side-title"><span>{t('pmCategories')}</span><small>{t('pmExplore')}</small></div>
            <nav aria-label={t('pmCategories')}>
              <Link href={hrefOf(base, cur, { cat: '' })} className={`v20-cv11-side-link${cur.cat ? '' : ' v20-active'}`} aria-current={cur.cat ? undefined : 'page'}>
                <Glyph name="grid" /><span>{series ? t('pmAllSeries') : t('cgAll')}</span>{(series ? allTotal : (facets && !cur.q && !cur.format ? facets.total : null)) != null && <small>{series ? allTotal : facets.total}</small>}
              </Link>
              {roots.filter((c) => !facets && !series ? true : (counts[c.id] || 0) > 0 || String(curRoot) === String(c.id)).map((c) => {
                const on = String(curRoot) === String(c.id);
                return (
                  <Link key={c.id} href={hrefOf(base, cur, { cat: String(c.id) })} className={`v20-cv11-side-link${on ? ' v20-active' : ''}`} aria-current={on ? 'page' : undefined}>
                    <Glyph name={glyphOfCategory(c.name)} /><span>{c.name}</span>{counts[c.id] != null && <small>{counts[c.id]}</small>}
                  </Link>
                );
              })}
            </nav>
            {tabs.length > 0 && (
              <>
                <div className="v20-cv11-side-title pm-side-more"><span>{t('pmMoreToSee')}</span></div>
                <nav aria-label={t('pmMoreToSee')}>
                  {tabs.map(([href, label]) => <Link key={href} href={href} className="v20-cv11-side-link"><Glyph name="compass" /><span>{label}</span></Link>)}
                </nav>
              </>
            )}
            {feat('learning') && (
              <div className="v20-cv11-sidebar-promo">
                <span aria-hidden="true"><Glyph name="cap" /></span>
                <b>{t('pmLearnWith').replace('{name}', appName)}</b>
                <p>{t('pmLearnWithSub')}</p>
                <Link href="/learning">{t('pmLearnWithCta')} →</Link>
              </div>
            )}
          </aside>
          <section className="v20-cv11-main">
            <div className="v20-cv11-toolbar">
              <div className="v20-cv11-format-filters" role="group" aria-label={t('cgByFormat')}>
                {!series && formats.length >= 1 && (
                  <>
                    <Link href={hrefOf(base, cur, { format: '' })} className={cur.format ? undefined : 'v20-active'} aria-current={cur.format ? undefined : 'true'}>{t('pmAll')}</Link>
                    {formats.map((f) => <Link key={f.slug} href={hrefOf(base, cur, { format: f.slug })} className={cur.format === f.slug ? 'v20-active' : undefined} aria-current={cur.format === f.slug ? 'true' : undefined}>{formatName(f.slug) || f.nameFr}</Link>)}
                  </>
                )}
              </div>
              <div className="v20-cv11-toolbar-end">
                <label>{t('pmSortBy')} <select value={cur.sort} onChange={(e) => go({ sort: e.target.value })} aria-label={t('pmSortBy')}>
                  <option value="recent">{t('pmSortRecent')}</option>
                  <option value="alpha">{t('pmSortAlpha')}</option>
                  <option value="duration">{series ? t('pmSortEpisodes') : t('pmSortDuration')}</option>
                </select></label>
                <div className="v20-cv11-view-switch">
                  <button type="button" className={view === 'grid' ? 'v20-active' : undefined} onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label={t('pmViewGrid')}><Glyph name="grid" /></button>
                  <button type="button" className={view === 'list' ? 'v20-active' : undefined} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label={t('pmViewList')}>☷</button>
                </div>
              </div>
            </div>
            <div id="cv11-results" aria-busy={shown === null}>
              <div className="v20-cv11-results-header">
                <div>
                  <h2>{title}</h2>
                  {total != null && <p>{t(total === 1 ? 'pmResult1' : 'pmResultN').replace('{n}', total)}</p>}
                </div>
              </div>
              {shown && shown.length === 0 ? (
                <div className="v20-cv11-empty">
                  <Glyph name="search" />
                  <h3>{t('pmEmptyTitle')}</h3>
                  <p>{t('pmEmptyText')}</p>
                  <Link href={base}>{t('pmShowAll')}</Link>
                </div>
              ) : (
                <div className={`v20-cv11-cards${view === 'list' ? ' v20-as-list' : ''}`}>
                  {(shown || []).map((x) => (series
                    ? <SeriesCardV20 key={x.id} s={x} t={t} />
                    : <TalkCardV20 key={x.id} x={x} t={t} formatName={formatName} listOn={listOn} user={user} mine={listOn && inMyList(x.id)} onMine={() => toggleMyList(x.id)} />))}
                </div>
              )}
              {!series && items && total != null && total > items.length && (
                <div className="v20-cv11-more">
                  <button type="button" onClick={loadMore} disabled={more}>{t('pmShowMore')} <span>{t('pmRemaining').replace('{n}', total - items.length)}</span> ↓</button>
                </div>
              )}
            </div>
            {(feat('learning') || feat('kids')) && (
              <section className="v20-cv11-cross">
                {feat('learning') && (
                  <Link href="/learning" className="v20-cv11-cross-learn">
                    <span aria-hidden="true"><Glyph name="cap" /></span>
                    <div><b>{t('pmCrossLearn')}</b><small>{t('pmCrossLearnSub')}</small></div>
                    <i aria-hidden="true">↗</i>
                  </Link>
                )}
                {feat('kids') && (
                  <Link href="/kids" className="v20-cv11-cross-kids">
                    <span aria-hidden="true"><Glyph name="game" /></span>
                    <div><b>{t('pmCrossKids').replace('{name}', appName.replace(/\s*TV$/i, ''))}</b><small>{t('pmCrossKidsSub')}</small></div>
                    <i aria-hidden="true">↗</i>
                  </Link>
                )}
              </section>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function Visual({ x, alt, tag }) {
  const img = thumbOf(x);
  return (
    <div className="v20-cv11-card-visual" style={img ? undefined : { backgroundImage: posterArt(x.id), backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {img && <img src={img} alt={alt} loading="lazy" />}
      <span className="v20-cv11-card-tag">{tag}</span>
      <span className="v20-cv11-play-ring" aria-hidden="true">▶</span>
    </div>
  );
}

function TalkCardV20({ x, t, formatName, listOn, user, mine, onMine }) {
  const tag = (x.format ? (formatName(x.format) || x.format) : t('pmVideo')).toUpperCase();
  return (
    <article className="v20-cv11-card">
      <Link href={`/talks/${x.id}`} className="v20-cv11-card-link" aria-label={x.title}>
        <Visual x={x} alt="" tag={tag} />
        <div className="v20-cv11-card-copy">
          <h3>{x.title}</h3>
          {x.speaker && <p>{x.speaker}</p>}
          <div className="v20-cv11-card-meta">
            {x.category && <span>{x.category}</span>}
            {x.category && x.durationSeconds > 0 && <i />}
            {x.durationSeconds > 0 && <span>{minutes(x.durationSeconds, t)}</span>}
          </div>
        </div>
      </Link>
      {listOn && (user
        ? <button type="button" className={`v20-cv11-fav${mine ? ' v20-saved' : ''}`} onClick={onMine} aria-pressed={mine} aria-label={`${mine ? t('mlRemove') : t('mlAdd')} : ${x.title}`} title={mine ? t('mlRemove') : t('mlAdd')}>{mine ? '♥' : '♡'}</button>
        : <Link href="/login" className="v20-cv11-fav" aria-label={`${t('mlAdd')} : ${x.title}`} title={t('mlAdd')}>♡</Link>)}
    </article>
  );
}

function SeriesCardV20({ s, t }) {
  return (
    <article className="v20-cv11-card">
      <Link href={`/series/${s.slug || s.id}`} className="v20-cv11-card-link" aria-label={s.title}>
        <Visual x={{ id: s.id, posterUrl: s.posterUrl }} alt="" tag={t('seriesTag').toUpperCase()} />
        <div className="v20-cv11-card-copy">
          <h3>{s.title}</h3>
          {s.speaker && <p>{s.speaker}</p>}
          <div className="v20-cv11-card-meta">
            {s.category && <span>{s.category}</span>}
            {s.category && <i />}
            <span>{t('episodeCount').replace('{n}', s.episodeCount)}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
