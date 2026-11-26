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
import { useClip, ClipLayer, useInView } from './PmClip';
import PmShortTile from './PmShortTile';
import { KidsBand } from '../KidsBanner';

const HERO_FALLBACK = '/premium/andalousie-large.webp';
const COVER_MS = 2000; // l'image de couverture reste seule 2 secondes, puis l'extrait vidéo prend le relais
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
    timer.current = setInterval(() => setI((v) => (v + 1) % n), 14000); // 2 s d'image + un extrait
    return () => clearInterval(timer.current);
  }, [reduced, paused, n, i]);
  const x = n ? items[Math.min(i, n - 1)] : null;
  const clip = useClip(x?.id, COVER_MS, Boolean(x));
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
      <ClipLayer clip={clip} className="pm-hero-vid" />
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

/** Rangées de l'accueil (nouveautés, « Pour vous », débutant, séries, une par catégorie).
 *  inserts : éléments posés entre les rangées, comme dans la maquette (après la 4e, la 7e, la 10e…) ; ceux qui n'ont pas de place sont ajoutés à la fin. */
export function PmRowsSection({ max = 12, inserts = [] }) {
  const { t } = useApp();
  const home = useHome();
  const rowTitle = (r) => (r.key === 'new' ? t('rowNew') : r.key === 'foryou' ? t('forYou') : r.key === 'beginner' ? t('rowBeginner') : r.key === 'series' ? t('rowSeries') : r.title);
  const rowHref = (r) => (r.key === 'series' ? '/series' : r.categoryId ? `/catalogue?cat=${r.categoryId}` : r.key === 'foryou' ? undefined : '/catalogue');
  const rows = (home?.rows || []).slice(0, Math.max(1, Number(max) || 12));
  const extra = inserts.filter(Boolean);
  const GAP = 3; // une rangée sur 3 après la 4e : rangées 4, 7, 10…
  const out = [];
  let used = 0;
  rows.forEach((r, i) => {
    const list = r.series || r.talks || [];
    out.push(
      <OttRail key={r.key} title={rowTitle(r)} href={rowHref(r)} tall={i % 2 === 1}>
        {list.slice(0, 10).map((x) => <OttCard key={x.id} x={x} kind={r.series ? 'series' : undefined} />)}
      </OttRail>,
    );
    if (i >= 3 && (i - 3) % GAP === 0 && used < extra.length) { out.push(<div key={`ins${used}`} className="pm-ins">{extra[used]}</div>); used += 1; }
  });
  while (used < extra.length) { out.push(<div key={`ins${used}`} className="pm-ins">{extra[used]}</div>); used += 1; }
  return <>{out}</>;
}

// Collections publiées « sur l'accueil » (GET /collections/home). Les deux premières qui ont au moins 2 vidéos deviennent des
// « sélections » en grand cadre (maquette V22) ; les autres restent des rangées.
function useHomeCollections() {
  const d = usePmData('/collections/home', { auth: false });
  const cols = Array.isArray(d?.collections) ? d.collections : [];
  const spots = cols.filter((c) => (c.talks || []).length >= 2).slice(0, 2);
  return { cols, spots, rest: cols.filter((c) => !spots.includes(c)) };
}

/** Grand cadre « Sélection » : texte à gauche, deux affiches à droite, image de la collection en fond. */
export function PmSpot({ c }) {
  const { t, appName } = useApp();
  // Sélection en grand cadre : l'extrait démarre dès que le bloc apparaît à l'écran (pas d'attente) et s'arrête quand on ne le voit plus.
  const [ref, seen] = useInView();
  const clip = useClip(c?.talks?.[0]?.id, 0, Boolean(c) && seen);
  if (!c) return null;
  return (
    <section ref={ref} className="pm-spot" style={{ '--cover': coverOf(c.talks[0]) }} aria-label={c.title}>
      <ClipLayer clip={clip} className="pm-spot-vid" />
      <div className="pm-spot-copy">
        <span className="pm-spot-kicker">{t('pmSelection').replace('{name}', appName)}</span>
        <h2>{c.title}</h2>
        {c.description && <p>{c.description}</p>}
        {c.mode !== 'personal' && <Link href={`/collections/${c.id}`} className="pm-spot-cta">{t('pmExploreCollection')} <span aria-hidden="true">↗</span></Link>}
      </div>
      <div className="pm-spot-cards">
        {c.talks.slice(0, 2).map((x) => <OttCard key={x.id} x={x} />)}
      </div>
    </section>
  );
}

/** Collections de l'accueil : sélections en grand cadre (spots) puis rangées. spots = faux : seulement les rangées (les sélections sont posées ailleurs). */
export function PmCollectionsSection({ limit = 12, spots = true }) {
  const { spots: sp, rest, cols } = useHomeCollections();
  const lim = Math.max(1, Number(limit) || 12);
  const shown = (spots ? cols : rest).slice(0, lim);
  return (
    <>
      {spots && sp.filter((c) => shown.includes(c)).map((c) => <PmSpot key={c.id} c={c} />)}
      {shown.filter((c) => !sp.includes(c)).map((c, i) => (
        <OttRail key={c.id} title={c.title} href={c.mode === 'personal' ? undefined : `/collections/${c.id}`} tall={i % 2 === 1}>
          {(c.talks || []).slice(0, 10).map((x) => <OttCard key={x.id} x={x} />)}
        </OttRail>
      ))}
    </>
  );
}

/** Une seule « sélection » en grand cadre : n = 1 pour la première, 2 pour la deuxième. Invisible s'il n'y en a pas. */
export function PmSpotSection({ n = 1 }) {
  const { spots } = useHomeCollections();
  return <PmSpot c={spots[Math.max(1, Math.min(2, Number(n) || 1)) - 1]} />;
}

/** Composition d'origine du corps de l'accueil, comme la maquette V22 : rangées du catalogue avec, entre elles, la 1re sélection, les Shorts
 *  puis la 2e sélection ; les autres collections suivent en rangées. */
export function PmFeedSection() {
  const { spots } = useHomeCollections();
  return (
    <>
      <PmRowsSection inserts={[spots[0] && <PmSpot key="s1" c={spots[0]} />, <PmShortsSection key="sh" />, spots[1] && <PmSpot key="s2" c={spots[1]} />]} />
      <PmCollectionsSection spots={false} />
    </>
  );
}

/** Rangée des derniers shorts publiés (maquette V22 : tuiles verticales « SHORT », durée, bouton lecture, titre, thème). */
export function PmShortsSection({ title, limit = 10 }) {
  const { t, feat, appName } = useApp();
  const n = Math.max(2, Math.min(20, Number(limit) || 10));
  const d = usePmData(`/shorts?limit=${n}`, { on: feat('shorts'), auth: false });
  const shorts = feat('shorts') && Array.isArray(d) ? d : [];
  if (!shorts.length) return null;
  const brand = (appName || 'Mejliss TV').replace(/\s*TV$/i, '');
  const head = title || `${brand} ${t('shrTitle')} · ${t('pmShortsSub')}`;
  return (
    <section className="pm-rail pm-shorts-rail" aria-label={head}>
      <div className="pm-rail-head">
        <h2>{title ? title : <>{brand} <em>{t('shrTitle')}</em> · {t('pmShortsSub')}</>}</h2>
        <Link href="/shorts">{t('pmShortsAll')} <span className="pm-chev" aria-hidden="true">›</span></Link>
      </div>
      <ul className="pm-sh-track">
        {shorts.map((s) => <li key={s.id}><PmShortTile s={s} /></li>)}
      </ul>
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

/** Fonds du bandeau « Mon espace Apprendre » : 5 images qui se succèdent en fondu (6 s chacune). « flip » = image retournée pour garder le sujet côté droit. */
const LEARN_BG = [
  { src: '/premium/learn-bg-1.webp', flip: false },
  { src: '/premium/learn-bg-2.webp', flip: true },
  { src: '/premium/learn-bg-3.webp', flip: true },
  { src: '/premium/learn-bg-4.webp', flip: true },
  { src: '/premium/learn-bg-5.webp', flip: false },
];

/** Bandeau « Mon espace Apprendre » : grande carte immersive (fonds qui changent), progression du parcours et chiffres réels (formule Apprentissage). */
export function PmLearnSection() {
  const { t, feat, user } = useApp();
  const on = Boolean(user) && feat('learning');
  const learn = usePmData('/me/learning', { on });
  const streak = usePmData('/me/learning/streak', { on });
  const cont = usePmData('/me/continue', { on });
  const course = useMemo(() => {
    const list = (learn?.series || []).filter((s) => s.total > 0 && !s.complete);
    const s = list.find((x) => x.passed > 0) || list[0];
    return s ? { title: s.title, pct: Math.round((s.passed / s.total) * 100) } : null;
  }, [learn]);
  // Fonds : un changement toutes les 6 s (fixe si le visiteur a demandé moins d'animations).
  const calm = useReducedMotion();
  const [bg, setBg] = useState(0);
  useEffect(() => {
    if (calm || !on) return undefined;
    const id = setInterval(() => setBg((i) => (i + 1) % LEARN_BG.length), 6000);
    return () => clearInterval(id);
  }, [calm, on]);
  if (!feat('learning')) return null;
  const next = Array.isArray(cont) && cont[0] ? cont[0] : null;
  const stats = learn ? [
    { k: 'days', n: streak && streak.show !== false ? streak.current || 0 : null, label: t('pmLearnDays'), d: 'M5 6h16v15H5zM5 11h16M9 3v5M17 3v5' },
    { k: 'quiz', n: learn.quizzesPassed ?? 0, label: t('pmLearnQuizzes'), d: 'M7 4h12v19H7zM10 4V2h6v2M10 14l2.5 2.5L17 11' },
    { k: 'paths', n: (learn.series || []).filter((s) => s.complete).length, label: t('pmLearnPaths'), d: 'M13 3 3 8l10 5 10-5-10-5ZM3 13l10 5 10-5M3 18l10 5 10-5' },
  ].filter((x) => x.n !== null) : [];
  return (
    <section className="pm-ln2" aria-label={t('pmLearnTitle')}>
      <div className="pm-ln2-bg" aria-hidden="true">
        {LEARN_BG.map((b, i) => (
          <div key={b.src} className={`pm-ln2-slide${i === bg ? ' pm-on' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.src} alt="" className={b.flip ? 'pm-flip' : undefined} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
          </div>
        ))}
      </div>
      <div className="pm-ln2-copy">
        <div className="pm-ln2-kick"><Glyph name="cap" /><i /><span>{t('pmLearnKick')}</span></div>
        <h2 className="v20-serif">{t('pmLearnTitle')}</h2>
        <p>{t('pmLearnLead')}</p>
        <div className="pm-ln2-btns">
          <Link href={next ? `/talks/${next.id}` : '/learning'} className="pm-ln2-cta"><span aria-hidden="true">▶</span> {t('pmLearnResume')}</Link>
          <Link href="/learning" className="pm-ln2-link">{t('pmLearnSee')} <span className="pm-arr" aria-hidden="true">→</span></Link>
        </div>
        {course && (
          <div className="pm-ln2-prog">
            <span>{t('pmLearnYour')}</span>
            <span className="pm-ln2-bar" role="img" aria-label={`${course.pct} %`}><b style={{ width: `${course.pct}%` }} /></span>
            <strong>{course.pct} %</strong>
          </div>
        )}
      </div>
      {(stats.length > 0 || next) && (
        <div className="pm-ln2-glass">
          {stats.length > 0 && (
            <div className="pm-ln2-stats">
              {stats.map((x) => (
                <div key={x.k}>
                  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={x.d} /></svg>
                  <strong>{x.n}</strong>
                  <span>{x.label}</span>
                </div>
              ))}
            </div>
          )}
          {next && (
            <Link href={`/talks/${next.id}`} className="pm-ln2-next">
              <span aria-hidden="true">▶</span><span className="pm-ln2-nt"><small>{t('pmLearnNext')}</small> {next.title}</span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** Bandeau de fin de l'accueil : « La découverte continue. » et bouton vers tout le catalogue (maquette V22). */
export function PmDiscoverSection() {
  const { t } = useApp();
  return (
    <section className="pm-discover" aria-label={t('pmDiscoverTitle')}>
      <h2 className="v20-serif">{t('pmDiscoverTitle')}</h2>
      <p>{t('pmDiscoverSub')}</p>
      <Link href="/catalogue" className="v20-btn v20-btn-outline">{t('pmDiscoverCta')} <span aria-hidden="true">→</span></Link>
    </section>
  );
}
