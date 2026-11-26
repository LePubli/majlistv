'use client';
// Extraits vidéo du thème Premium : mêmes extraits et mêmes réglages que les vignettes interactives (Paramètres → Vignettes des conférences :
// « aperçu vidéo » on/off, durée de l'extrait). Muets, en boucle. Jamais pour les visiteurs qui ont demandé de réduire les animations
// ni en mode économie de données ; un extrait est ignoré si la vidéo n'en a pas (premium sur YouTube, archive.org…).
import { useCallback, useEffect, useState } from 'react';
import { Preview, fetchHover } from '../TalkCard';
import { useApp } from '../Providers';

export function clipAllowed(cfg) {
  if (typeof window === 'undefined' || !cfg?.preview) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !navigator.connection?.saveData;
}

/** Charge l'extrait de la vidéo `talkId` après `delay` ms. Renvoie { info, seconds, playing, onReady } (info vide tant qu'il n'y en a pas). */
export function useClip(talkId, delay, enabled = true) {
  const { cards } = useApp();
  const [info, setInfo] = useState(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setInfo(null); setPlaying(false);
    if (!enabled || !talkId || !clipAllowed(cards)) return undefined;
    let dead = false;
    const timer = setTimeout(() => { fetchHover(talkId).then((i) => { if (!dead && i && i.kind !== 'none') setInfo(i); }); }, delay);
    return () => { dead = true; clearTimeout(timer); };
  }, [talkId, delay, enabled, cards]);
  const onReady = useCallback(() => setPlaying(true), []);
  return { info, seconds: cards?.previewSeconds || 15, playing, onReady };
}

/** Calque vidéo (fondu à l'apparition). className : pm-card-vid, pm-hero-vid ou pm-spot-vid ; le style est dans skin-premium.css. */
export function ClipLayer({ clip, className, children }) {
  if (!clip.info) return null;
  return (
    <span className={`${className}${clip.playing ? ' on' : ''}`} aria-hidden="true">
      <Preview info={clip.info} seconds={clip.seconds} muted onReady={clip.onReady} />
      {children}
    </span>
  );
}
