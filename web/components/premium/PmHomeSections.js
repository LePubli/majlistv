'use client';
// Sections de l'accueil du thème Premium. Chacune est autonome (elle charge ses propres données) : l'accueil d'origine les pose
// dans l'ordre historique, et l'éditeur visuel (blocs « Premium : … ») les pose dans l'ordre choisi par l'administrateur.
//   La une · Univers (téléphone) · Continuer à regarder · Rangées du catalogue · Collections · Shorts · Encart Kids · Bandeau Apprendre
// Rien n'est inventé : une section sans données réelles n'affiche rien (ex. « Continuer à regarder » pour un visiteur).
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { useReducedMotion } from '../HomeHero';
import { thumbOf, posterArt } from '../../lib/thumb';
import Glyph, { glyphOfCategory } from './Glyph';
import { OttCard, OttRail } from './PmOtt';
import { ShortsRail } from '../ShortsRail';
import { KidsBand } from '../KidsBanner';

const HERO_FALLBACK = '/premium/andalousie-large.webp';
const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;
const coverOf = (x) => { const u = x && thumbOf(x); return u ? cssUrl(u) : posterArt(x?.id); };
const long = (s, n) => (String(s || '').length > n ? 'pm-long' : undefined);
const durMs = (x) => (x?.durationMs || (x?.durationSeconds || 0) * 1000);

// Plusieurs sections demandent les mêmes données (ex. « /home » pour la une et pour les rangées) : une seule demande par 20 s.
const CACHE = new Map();
/** Charge une adresse de l'API. data : undefined = en cours, null = échec, sinon la réponse. auth = faux : sans jeton de connexion. */
export function usePmData(path, { on = true, auth = true } = {}) {
  const { call, ready, user } = useApp();
  const [data, setData] = useState(undefined);
  useEffect(() => {
    if (!ready || !on || !path) { setData(undefined); return undefined; }
    let dead = false;
    const key = `${user?.id || '-'}|${auth ? 'a' : 'n'}|${path}`;
    let hit = CACHE.get(key);
    if (!hit || Date.now() - hit.at > 20000) {
      hit = { at: Date.now(), p: auth ? call(path) : call(path, {}, null) };
      CACHE.set(key, hit);
      if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value);
    }
    hit.p.then((r) => { if (!dead) setData(r.ok ? r.data : null); }).catch(() => { if (!dead) setData(null); });
    return () => { dead = true; };
  }, [call, ready, on, path, auth, user?.id]);
  return data;
}

// Image de la une en grande taille : pour YouTube, on essaie la miniature haute définition (gardée seulement si elle existe).
function useHeroImage(it) {
  const base = it ? thumbOf(it) : null;
  const [src, setSrc] = useState(base);
  useEffect(() => {
    setSrc(base);
    if (!it || it.posterUrl || it.source !== 'youtube') return undefined;
    let dead = false;
    const img = new window.Image();
    img.onload = () => { if (!dead && img.naturalWidth > 320) setSrc(img.src); };
    img.src = `https://i.ytimg.com/vi/${it.video_ref}/maxresdefault.jpg`;
    return () => { dead = true; };
  }, [base, it]);
  return src;
}

function Hero({ items, t }) {
  const { user, feat, inMyList, toggleMyList, formatName, appName } = useApp();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const n = items.length;
  useEffect(() => {
    if (reduced || paused || n < 2) return undefined;
    timer.current = setInterval(() => setI((v) => (v + 1) % n), 8000);
    return () => clearInterval(timer.current);
  }, [reduced, paused, n, i]);
  const x = n ? items[Math.min(i, n - 1)] : null;
  const img = useHeroImage(x);
  const mins = x && x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : '';
  const listOn = feat('favorites') || feat('watchlater');
  const mine = Boolean(x) && listOn && inMyList(x.id);
  const format = x?.format ? formatName?.(x.format) : '';
  const go = (d) => setI((v) => (v + d + n) % n);
  return (
    <section className="v20-hero v20-faithful-hero v20-hero-home" style={{ '--hero': cssUrl(img || HERO_FALLBACK) }}
      aria-roledescription="carousel" aria-label={t('heroEyebrow')}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="v20-shell v20-hero-inner">
        {x ? (
          <div className="v20-hero-copy" key={x.id} aria-live={paused ? 'polite' : 'off'}>
            <span className="v20-eyebrow">{x.category || t('heroEyebrow')}</span>
            <h1 className={`v20-serif ${long(x.title, 26) || ''}`.trim()}>{x.title}</h1>
            {x.speaker && <h2>{x.speaker}</h2>}
            <div className="v20-meta">
              <span>▱ &nbsp; {format || t('pmVideo')}</span>
              {mins && <><b className="v20-meta-dot">•</b><span>{mins}</span></>}
              {x.category && <span>◈ &nbsp; {x.category}</span>}
            </div>
            <div className="v20-actions">
              <Link href={`/talks/${x.id}`} className="v20-btn v20-btn-primary">▶ &nbsp; {t('pmWatchNow')}</Link>
              {listOn && (user
                ? <button type="button" className="v20-btn v20-btn-outline" onClick={() => toggleMyList(x.id)} aria-pressed={mine} title={mine ? t('mlRemove') : t('mlAdd')}>{mine ? `✓   ${t('pmInList')}` : `+   ${t('lbMyList')}`}</button>
                : <Link href="/login" className="v20-btn v20-btn-outline">+ &nbsp; {t('lbMyList')}</Link>)}
            </div>
          </div>
        ) : (
          <div className="v20-hero-copy">
            <span className="v20-eyebrow">{t('heroEyebrow')}</span>
            <h1 className="v20-serif">{appName}</h1>
            <h2>{t('tagline')}</h2>
            <div className="v20-actions"><Link href="/catalogue" className="v20-btn v20-btn-primary">▶ &nbsp; {t('navCatalogue')}</Link></div>
          </div>
        )}
      </div>
      {n > 1 && (
        <>
          <button type="button" className="v20-hero-arrow v20-prev" onClick={() => go(-1)} aria-label={t('pmPrev')}>‹</button>
          <button type="button" className="v20-hero-arrow v20-next" onClick={() => go(1)} aria-label={t('pmNext')}>›</button>
          <div className="v20-hero-dots">
            {items.map((it, k) => <button key={it.id} type="button" className={k === i ? 'v20-active' : undefined} aria-current={k === i} aria-label={t('heroGoTo').replace('{n}', k + 1)} onClick={() => setI(k)} />)}
          </div>
        </>
      )}
    </section>
  );
}

// Données de /home : { hero, rows }. En cas d'échec : un accueil vide mais utilisable (comme avant).
function useHome() {
  const d = usePmData('/home');
  return d === undefined ? null : d || { hero: { mode: 'text' }, rows: [] };
}

/** La une (caroussel). count : nombre de vidéos qui défilent (1 à 5). */
export function PmHeroSection({ count = 5 }) {
  const { t } = useApp();
  const home = useHome();
  const items = useMemo(() => {
    const h = home?.hero;
    const latest = (home?.rows || []).find((r) => r.talks)?.talks || [];
    return (h?.mode === 'featured' && h.items?.length ? h.items : latest).slice(0, Math.max(1, Math.min(5, Number(count) || 5)));
  }, [home, count]);
  return home ? <Hero items={items} t={t} /> : <section className="v20-hero v20-faithful-hero v20-hero-home" aria-busy="true" />;
}

/** Univers : les 4 premières catégories (téléphone). */
export function PmUniversesSection() {
  const { t, cats } = useApp();
  const univ = (cats || []).slice(0, 4);
  if (!univ.length) return null;
  return (
    <nav className="v20-mobile-universes v20-shell" aria-label={t('pmUniverses')}>
      {univ.map((c) => <Link key={c.id} href={`/catalogue?cat=${c.id}`} className="v20-mobile-universe"><Glyph name={glyphOfCategory(c.name)} /><span>{c.name}</span></Link>)}
      <Link href="/catalogue" className="v20-mobile-universe"><Glyph name="grid" /><span>{t('pmMore')}</span></Link>
    </nav>
  );
}

/** Continuer à regarder (la personne connectée). */
export function PmContinueSection({ title, limit = 10 }) {
  const { t, user } = useApp();
  const d = usePmData('/me/continue', { on: Boolean(user) });
  const cont = user && Array.isArray(d) ? d : [];
  return (
    <OttRail title={title || t('continueWatching')} href="/library">
      {cont.slice(0, Math.max(1, Math.min(10, Number(limit) || 10))).map((x) => {
        const dur = durMs(x);
        return <OttCard key={x.id} x={x} badge="" pct={dur ? Math.round(((x.positionMs || 0) / dur) * 100) : 0} />;
      })}
    </OttRail>
  );
}

/** Rangées de l'accueil (nouveautés, « Pour vous », débutant, séries, une par catégorie). */
export function PmRowsSection({ max = 12 }) {
  const { t } = useApp();
  const home = useHome();
  const rowTitle = (r) => (r.key === 'new' ? t('rowNew') : r.key === 'foryou' ? t('forYou') : r.key === 'beginner' ? t('rowBeginner') : r.key === 'series' ? t('rowSeries') : r.title);
  const rowHref = (r) => (r.key === 'series' ? '/series' : r.categoryId ? `/catalogue?cat=${r.categoryId}` : r.key === 'foryou' ? undefined : '/catalogue');
  return (
    <>
      {(home?.rows || []).slice(0, Math.max(1, Number(max) || 12)).map((r) => {
        const list = r.series || r.talks || [];
        return (
          <OttRail key={r.key} title={rowTitle(r)} href={rowHref(r)}>
            {list.slice(0, 10).map((x) => <OttCard key={x.id} x={x} kind={r.series ? 'series' : undefined} />)}
          </OttRail>
        );
      })}
    </>
  );
}

/** Collections publiées « sur l'accueil » : la première (3 vidéos ou plus) en grand cadre, les autres en rangées. */
export function PmCollectionsSection({ limit = 12 }) {
  const { t, appName } = useApp();
  const d = usePmData('/collections/home', { auth: false });
  const cols = (Array.isArray(d?.collections) ? d.collections : []).slice(0, Math.max(1, Number(limit) || 12));
  const spot = cols.find((c) => (c.talks || []).length >= 3);
  return (
    <>
      {spot && (
        <section className="pm-spot" style={{ '--cover': coverOf(spot.talks[0]) }} aria-label={spot.title}>
          <div className="pm-spot-copy">
            <span className="pm-spot-kicker">{t('pmSelection').replace('{name}', appName)}</span>
            <h2>{spot.title}</h2>
            {spot.description && <p>{spot.description}</p>}
            {spot.mode !== 'personal' && <Link href={`/collections/${spot.id}`} className="pm-spot-cta">{t('pmExploreCollection')} <span aria-hidden="true">↗</span></Link>}
          </div>
          <div className="pm-spot-cards">
            {spot.talks.slice(0, 3).map((x) => <OttCard key={x.id} x={x} badge="" />)}
          </div>
        </section>
      )}
      {cols.filter((c) => c !== spot).map((c) => (
        <OttRail key={c.id} title={c.title} href={c.mode === 'personal' ? undefined : `/collections/${c.id}`}>
          {(c.talks || []).slice(0, 10).map((x) => <OttCard key={x.id} x={x} />)}
        </OttRail>
      ))}
    </>
  );
}

/** Rangée des derniers shorts publiés. */
export function PmShortsSection({ title, limit = 10 }) {
  const { t, feat } = useApp();
  const n = Math.max(2, Math.min(20, Number(limit) || 10));
  const d = usePmData(`/shorts?limit=${n}`, { on: feat('shorts'), auth: false });
  const shorts = feat('shorts') && Array.isArray(d) ? d : [];
  if (!shorts.length) return null;
  const head = title || t('shrTitle');
  return (
    <section className="pm-rail pm-shorts-rail" aria-label={head}>
      <div className="pm-rail-head"><h2>{head}</h2><Link href="/shorts">{t('rowSeeAll')} <span className="pm-chev" aria-hidden="true">›</span></Link></div>
      <ShortsRail list={shorts} />
    </section>
  );
}

/** Encart Kids : dernières vidéos Kids ; sans vidéo Kids publiée, la bannière illustrée sert de repli. */
export function PmKidsSection() {
  const { t, feat, appName } = useApp();
  const d = usePmData('/home/kids', { on: feat('kids'), auth: false });
  const kids = feat('kids') && d !== undefined ? (d && d.enabled ? d : { enabled: false, talks: [] }) : null;
  const brandFirst = (appName || 'Mejliss TV').replace(/\s*TV$/i, '');
  if (!feat('kids') || !kids) return null;
  if (kids.talks?.length > 0) return <KidsBand data={kids} />;
  return (
    <Link href="/kids" className="pm-kids-promo" style={{ backgroundImage: "linear-gradient(90deg,#030a16ee,#030a1600),url('/premium/kids-hero-day-v7.webp')" }}>
      <span className="pm-kids-title">{brandFirst} <em>Kids</em></span>
      <small>{t('kdTagline')}</small>
    </Link>
  );
}

/** Bandeau « Mon espace Apprendre » (progression du parcours avec la formule Apprentissage). */
export function PmLearnSection() {
  const { t, feat, user } = useApp();
  // Progression : seulement avec la formule Apprentissage (sinon l'API répond « formule requise »).
  const learn = usePmData('/me/learning', { on: Boolean(user) && feat('learning') });
  const course = useMemo(() => {
    const list = (learn?.series || []).filter((s) => s.total > 0 && !s.complete);
    const s = list.find((x) => x.passed > 0) || list[0];
    return s ? { title: s.title, pct: Math.round((s.passed / s.total) * 100) } : null;
  }, [learn]);
  if (!feat('learning')) return null;
  return (
    <Link href="/learning" className="v20-big-learn-banner">
      <span className="v20-learn-cap" aria-hidden="true"><Glyph name="cap" /></span>
      <span className="v20-banner-label"><strong>{t('pmLearnTitle')}</strong><small>{t('pmLearnSub')}</small></span>
      <span className="v20-banner-landscape" />
      {course && (
        <>
          <span className="v20-banner-progress" style={{ '--pm-pct': `${course.pct}%` }}>{course.pct}%</span>
          <span className="v20-banner-label v20-progress-label"><small>{t('pmLearnCur')}</small><span>{course.title}</span></span>
        </>
      )}
    </Link>
  );
}
