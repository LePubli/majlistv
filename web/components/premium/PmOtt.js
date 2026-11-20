'use client';
// Briques « OTT » du thème Premium (maquette V22 : cartes 16:9 avec le titre sur l'image, rangées de 5, survol qui agrandit).
// Utilisées par l'accueil, le catalogue et les séries. Rien n'est inventé : badge, durée et progression viennent des vraies données.
import Link from 'next/link';
import { useApp } from '../Providers';
import { thumbOf, posterArt } from '../../lib/thumb';

const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;
export const coverOf = (x) => { const u = x && thumbOf(x); return u ? cssUrl(u) : posterArt(x?.id); };

const minutes = (sec, t) => (sec > 0 ? `${Math.max(1, Math.round(sec / 60))} ${t('minutes')}` : '');

/** Carte vidéo ou série. `href` : lien ; `badge` : petite étiquette en haut à gauche ; `pct` : progression 0–100 (reprise). */
export function OttCard({ x, href, badge, pct, kind }) {
  const { t, formatName } = useApp();
  const isSeries = kind === 'series';
  const dur = isSeries ? (x.episodeCount ? t('episodeCount').replace('{n}', x.episodeCount) : '') : minutes(x.durationSeconds || Math.round((x.durationMs || 0) / 1000), t);
  const label = badge === undefined ? (isSeries ? t('seriesNav') : (x.format && formatName ? formatName(x.format) : '')) : badge;
  return (
    <Link className="pm-card" href={href || (isSeries ? `/series/${x.slug || x.id}` : `/talks/${x.id}`)} style={{ '--cover': coverOf(x) }}>
      <span className="pm-card-art" aria-hidden="true" />
      {label && <span className="pm-card-badge">{label}</span>}
      <span className="pm-card-play" aria-hidden="true">▶</span>
      <b className="pm-card-title">{x.title}</b>
      <span className="pm-card-sub">{[x.speaker, dur].filter(Boolean).join(' · ')}</span>
      {pct > 0 && <span className="pm-card-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, pct)}%` }} /></span>}
    </Link>
  );
}

/** Rangée : titre, lien « Tout voir ›» et ligne de cartes (défilement horizontal sur téléphone). */
export function OttRail({ title, href, children, id }) {
  const { t } = useApp();
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className="pm-rail" aria-label={title}>
      <div className="pm-rail-head">
        <h2 id={id}>{title}</h2>
        {href && <Link href={href}>{t('rowSeeAll')} <span className="pm-chev" aria-hidden="true">›</span></Link>}
      </div>
      <div className="pm-rail-track">{children}</div>
    </section>
  );
}
