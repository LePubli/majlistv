'use client';
// Accueil du thème Premium : reproduction de l'accueil de la maquette V20 (même structure HTML, classes « v20-… »),
// remplie avec les vraies données du site. Rien n'est inventé : une partie sans données réelles n'est pas affichée
// (ex. « Continuer à regarder » pour un visiteur, progression du parcours sans formule Apprentissage).
//   1. La une (vidéos choisies dans Admin, à défaut les 5 plus récentes) avec flèches et points.
//   2. Univers (téléphone) : les 4 premières catégories + « Plus ».
//   3. Continuer à regarder (4 vidéos) · 4. Nouveautés (6 affiches) · 5. Bandeau « Mon espace Apprendre ».
//   6. Quatre tuiles : Kids, application, lecteur, télé.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { useReducedMotion } from '../HomeHero';
import { thumbOf, posterArt } from '../../lib/thumb';
import Glyph, { glyphOfCategory } from './Glyph';
import { BrandWord } from './PmBrand';

const HERO_FALLBACK = '/premium/andalousie-large.webp';
const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;
const coverOf = (x) => { const u = x && thumbOf(x); return u ? cssUrl(u) : posterArt(x?.id); };
const clock = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};
const long = (s, n) => (String(s || '').length > n ? 'pm-long' : undefined);
const durMs = (x) => (x?.durationMs || (x?.durationSeconds || 0) * 1000);

// Arabe : la flèche « Tout voir › » est retournée par skin-premium.css ; les flèches de la une (« ‹ » « › », caractères
// « miroir ») sont retournées par le navigateur, et « précédent » passe à droite.

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

function SectionTitle({ title, href, t }) {
  return <div className="v20-section-title"><h2>{title}</h2><Link href={href}>{t('rowSeeAll')} <span className="pm-chev" aria-hidden="true">›</span></Link></div>;
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
                ? <button type="button" className="v20-btn v20-btn-outline" onClick={() => toggleMyList(x.id)} aria-pressed={mine} title={mine ? t('mlRemove') : t('mlAdd')}>{mine ? `✓   ${t('pmInList')}` : `+   ${t('lbMyList')}`}</button>
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

export default function PmHome() {
  const { t, user, ready, call, feat, cats, appName } = useApp();
  const [home, setHome] = useState(null);
  const [cont, setCont] = useState([]);
  const [learn, setLearn] = useState(null);
  useEffect(() => { if (ready) call('/home').then((r) => setHome(r.ok ? r.data : { hero: { mode: 'text' }, rows: [] })); }, [call, ready]);
  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok && Array.isArray(r.data) ? r.data : [])); else setCont([]); }, [user, call]);
  // Progression du bandeau « Apprendre » : seulement avec la formule Apprentissage (sinon l'API répond « formule requise »).
  useEffect(() => { if (user && feat('learning')) call('/me/learning', {}, null).then((r) => setLearn(r.ok ? r.data : null)); else setLearn(null); }, [user, call, feat]);

  const latest = useMemo(() => (home?.rows || []).find((r) => r.talks)?.talks || [], [home]);
  const heroItems = useMemo(() => {
    const h = home?.hero;
    return (h?.mode === 'featured' && h.items?.length ? h.items : latest).slice(0, 5);
  }, [home, latest]);
  const course = useMemo(() => {
    const list = (learn?.series || []).filter((s) => s.total > 0 && !s.complete);
    const s = list.find((x) => x.passed > 0) || list[0];
    return s ? { title: s.title, pct: Math.round((s.passed / s.total) * 100) } : null;
  }, [learn]);
  const univ = (cats || []).slice(0, 4);
  const resume = cont[0];
  const playerItem = resume || latest[0];
  const tvItem = heroItems[0] || latest[0];
  const brandFirst = (appName || 'Mejliss TV').replace(/\s*TV$/i, '');
  const hasPreview = feat('kids') || feat('app_install') || Boolean(playerItem);

  return (
    <div className="v20-app pm-home">
      <div className="v20-signature-home v20-faithful-home">
        {home ? <Hero items={heroItems} t={t} /> : <section className="v20-hero v20-faithful-hero v20-hero-home" aria-busy="true" />}
        {univ.length > 0 && (
          <nav className="v20-mobile-universes v20-shell" aria-label={t('pmUniverses')}>
            {univ.map((c) => <Link key={c.id} href={`/catalogue?cat=${c.id}`} className="v20-mobile-universe"><Glyph name={glyphOfCategory(c.name)} /><span>{c.name}</span></Link>)}
            <Link href="/catalogue" className="v20-mobile-universe"><Glyph name="grid" /><span>{t('pmMore')}</span></Link>
          </nav>
        )}
        <main className="v20-shell v20-home-overlap">
          {cont.length > 0 && (
            <section className="v20-section v20-continue-section">
              <SectionTitle title={t('continueWatching')} href="/library" t={t} />
              <div className="v20-continue-grid">
                {cont.slice(0, 4).map((x) => {
                  const d = durMs(x);
                  const left = d ? Math.max(1, Math.round((d - (x.positionMs || 0)) / 60000)) : 0;
                  const pct = d ? Math.min(100, Math.round(((x.positionMs || 0) / d) * 100)) : 0;
                  return (
                    <Link key={x.id} className="v20-continue-card" href={`/talks/${x.id}`}>
                      <div className="v20-continue-art" style={{ backgroundImage: coverOf(x) }}>
                        <span className="v20-continue-play" aria-hidden="true">▶</span>
                        {left > 0 && <small>{t('pmLeft').replace('{n}', left)}</small>}
                        <div className="v20-continue-track"><i style={{ width: `${pct}%` }} /></div>
                      </div>
                      <div className="v20-continue-text"><b>{x.title}</b>{x.speaker && <small>{x.speaker}</small>}</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
          {latest.length > 0 && (
            <section className="v20-section v20-signature-new">
              <SectionTitle title={t('rowNew')} href="/catalogue" t={t} />
              <div className="v20-poster-grid">
                {latest.slice(0, 6).map((x, k) => (
                  <Link key={x.id} className="v20-poster-card" href={`/talks/${x.id}`} style={{ '--cover': coverOf(x) }}>
                    {k === 0 && <span className="v20-poster-tag">{t('pmNewTag')}</span>}
                    <div className="v20-poster-copy">
                      <b className={long(x.title, 20)}>{x.title}</b>
                      <small>{[x.speaker, x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : ''].filter(Boolean).join(' · ')}</small>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {feat('learning') && (
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
          )}
          {hasPreview && (
            <div className="v20-preview-cards">
              {feat('kids') && (
                <Link href="/kids" className="v20-preview-kids" style={{ backgroundImage: "linear-gradient(0deg,#06152522,#06152500),url('/premium/kids-hero-day-v7.webp')" }}>
                  <span className="v20-preview-kids-title">{brandFirst} <em>Kids</em></span>
                  <small>{t('kdTagline')}</small>
                </Link>
              )}
              {feat('app_install') && (
                <Link href="/application" className="v20-preview-mobile">
                  <img src={tvItem && thumbOf(tvItem) ? thumbOf(tvItem) : '/premium/andalousie.webp'} alt="" />
                  <div>
                    <span className="v20-brand v20-mini-brand">▶ <BrandWord name={appName} /></span>
                    <strong>{(resume || tvItem)?.title || t('pwaNav')}</strong>
                    <span className="v20-mini-watch">▶ {resume ? t('pmResume') : t('watchNow')}</span>
                    <small>{[t('home'), t('navCatalogue'), feat('learning') ? t('msLearnShort') : null].filter(Boolean).join('　')}</small>
                  </div>
                </Link>
              )}
              {playerItem && (
                <Link href={`/talks/${playerItem.id}`} className="v20-preview-player" style={{ backgroundImage: `linear-gradient(0deg,#001326fa,#00132618),${coverOf(playerItem)}` }}>
                  <div>
                    <small>▣{'　'} {playerItem.title}</small>
                    <strong aria-hidden="true">{resume ? 'Ⅱ' : '▶'}</strong>
                    {durMs(playerItem) > 0 && <span>▶ {clock(resume ? resume.positionMs : 0)} / {clock(durMs(playerItem))}</span>}
                  </div>
                </Link>
              )}
              {feat('app_install') && tvItem && (
                <Link href="/application" className="v20-preview-tv" style={{ backgroundImage: `linear-gradient(90deg,#021228d9,#02122800),${coverOf(tvItem)}` }}>
                  <div>
                    <span className="v20-brand v20-mini-brand">▶ <BrandWord name={appName} /></span>
                    <strong className={long(tvItem.title, 24)}>{tvItem.title}</strong>
                    <span className="v20-mini-watch">▶ {t('watchNow')}</span>
                  </div>
                </Link>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
