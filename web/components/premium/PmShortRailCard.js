'use client';
// Carte Short de l'accueil Premium : même présentation que les autres cartes (coins, étiquette, titre en majuscules, grossit au survol)
// en format vertical 9:16. Au survol (souris) ou à la sélection (clavier), le short démarre en muet dans la carte.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { mmss } from '../ShortsRail';
import { clipAllowed } from './PmClip';
import { shortSub } from './PmShortTile';

export default function PmShortRailCard({ s }) {
  const { t, cards } = useApp();
  const [active, setActive] = useState(false);
  const [fine, setFine] = useState(false);
  const [playing, setPlaying] = useState(false);
  const vid = useRef(null);
  useEffect(() => { setFine(window.matchMedia('(hover: hover) and (pointer: fine)').matches); }, []);
  // Petit délai avant de charger la vidéo (évite de tout charger quand la souris traverse la rangée).
  const [load, setLoad] = useState(false);
  useEffect(() => {
    setLoad(false); setPlaying(false);
    if (!active || !fine || !s.videoUrl || !clipAllowed(cards)) return undefined;
    const id = setTimeout(() => setLoad(true), 300);
    return () => clearTimeout(id);
  }, [active, fine, s.videoUrl, cards]);
  const sub = [shortSub(s), s.duration != null ? mmss(s.duration) : ''].filter(Boolean).join(' · ');
  return (
    <Link className="pm-card pm-shc" href={`/shorts/${s.id}`} aria-label={s.title}
      style={s.posterUrl ? { '--cover': `url("${String(s.posterUrl).replace(/"/g, '%22')}")` } : undefined}
      onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)}>
      <span className="pm-card-art" aria-hidden="true" />
      {load && (
        <span className={`pm-sh-vid${playing ? ' on' : ''}`} aria-hidden="true">
          <video ref={vid} src={s.videoUrl} poster={s.posterUrl || undefined} muted loop playsInline autoPlay onPlaying={() => setPlaying(true)} />
        </span>
      )}
      <span className="pm-card-badge">{t('pmShortTag')}</span>
      <span className="pm-card-play" aria-hidden="true">▶</span>
      <b className="pm-card-title">{s.title}</b>
      <span className="pm-card-sub">{sub}</span>
    </Link>
  );
}
