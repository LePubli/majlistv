'use client';
// Briques « OTT » du thème Premium (maquette V22 : cartes 16:9 avec le titre sur l'image, rangées de 5, survol qui agrandit).
// Utilisées par l'accueil, le catalogue et les séries. Rien n'est inventé : badge, durée et progression viennent des vraies données.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { thumbOf, posterArt } from '../../lib/thumb';
import { useClip, ClipLayer } from './PmClip';

const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;
export const coverOf = (x) => { const u = x && thumbOf(x); return u ? cssUrl(u) : posterArt(x?.id); };

const minutes = (sec, t) => (sec > 0 ? `${Math.max(1, Math.round(sec / 60))} ${t('minutes')}` : '');

/** Avancement du membre sur des vidéos (GET /me/progress) : { [idVidéo]: { pct, done } }. Vide pour un visiteur ou en cas d'erreur. */
export function useTalkProgress(ids) {
  const { call, user } = useApp();
  const [map, setMap] = useState({});
  const key = user ? [...new Set(ids)].filter(Boolean).slice(0, 100).sort().join(',') : '';
  useEffect(() => {
    if (!key) { setMap({}); return undefined; }
    let dead = false;
    call('/me/progress?ids=' + key).then((r) => {
      if (!dead && r.ok && Array.isArray(r.data)) setMap(Object.fromEntries(r.data.map((p) => [p.talkId, p])));
    });
    return () => { dead = true; };
  }, [key, call]);
  return map;
}

/** Carte vidéo ou série. `href` : lien ; `badge` : petite étiquette en haut à gauche ; `pct` : progression 0–100 (reprise) ; `done` : terminé. */
export function OttCard({ x, href, badge, pct, kind, done }) {
  const { t, formatName } = useApp();
  const isSeries = kind === 'series';
  // Survol (souris) ou sélection (clavier) : la vignette grossit (CSS) et, après un court instant, l'extrait muet démarre. Pas pour les séries.
  const [active, setActive] = useState(false);
  const [fine, setFine] = useState(false);
  useEffect(() => { setFine(window.matchMedia('(hover: hover) and (pointer: fine)').matches); }, []);
  const clip = useClip(x.id, 450, active && fine && !isSeries);
  const dur = isSeries ? (x.episodeCount ? t('episodeCount').replace('{n}', x.episodeCount) : '') : minutes(x.durationSeconds || Math.round((x.durationMs || 0) / 1000), t);
  const label = badge === undefined ? (isSeries ? t('seriesNav') : (x.format && formatName ? formatName(x.format) : '')) : badge;
  return (
    <Link className="pm-card" href={href || (isSeries ? `/series/${x.slug || x.id}` : `/talks/${x.id}`)} style={{ '--cover': coverOf(x) }}
      onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)}>
      <span className="pm-card-art" aria-hidden="true" />
      <ClipLayer clip={clip} className="pm-card-vid" />
      {label && <span className="pm-card-badge">{label}</span>}
      {done && <span className="pm-card-done"><span aria-hidden="true">✓ </span>{t('pmLnTagDone')}</span>}
      <span className="pm-card-play" aria-hidden="true">▶</span>
      <b className="pm-card-title">{x.title}</b>
      <span className="pm-card-sub">{[x.speaker, dur].filter(Boolean).join(' · ')}</span>
      {pct > 0 && !done && <span className="pm-card-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>}
    </Link>
  );
}

/** Rangée : titre, lien « Tout voir ›» et ligne de cartes (défilement horizontal sur téléphone). tall : affiches verticales (2:3) au lieu des vignettes 16:9. */
export function OttRail({ title, href, children, id, tall = false }) {
  const { t } = useApp();
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className={tall ? 'pm-rail pm-rail-tall' : 'pm-rail'} aria-label={title}>
      <div className="pm-rail-head">
        <h2 id={id}>{title}</h2>
        {href && <Link href={href}>{t('rowSeeAll')} <span className="pm-chev" aria-hidden="true">›</span></Link>}
      </div>
      <div className="pm-rail-track">{children}</div>
    </section>
  );
}
