'use client';
// Lecteur en carte du hub Shorts (thème Premium) : le short s'ouvre dans une carte verticale 9:16 au-dessus de la grille, sans quitter la page.
// Lecture automatique (son coupé au départ, comme le fil), toucher = pause, suivant / précédent (boutons, flèches du clavier), fin d'un short =
// passage au suivant, Échap = fermer et retour sur la vignette. Une vue est comptée après 2 secondes (comme dans le fil).
// « Ouvrir le fil » mène au fil vertical complet (/shorts/<id>) ; « Voir la vidéo » à la vidéo entière.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../Providers';
import ChannelAvatar from '../ChannelAvatar';

const MUTE_KEY = 'mejliss-shorts-muted'; // même réglage que le fil vertical

export default function PmShortCard({ items, index, onIndex, onClose, onNearEnd }) {
  const { t, call, locale } = useApp();
  const rtl = locale === 'ar';
  const s = items[index];
  const video = useRef(null);
  const closeBtn = useRef(null);
  const counted = useRef(new Set());
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { try { if (localStorage.getItem(MUTE_KEY) === '0') setMuted(false); } catch { /* stockage indisponible */ } }, []);
  useEffect(() => { closeBtn.current?.focus(); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);

  const go = useCallback((i) => { if (i >= 0 && i < items.length) onIndex(i); }, [items.length, onIndex]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); go(index + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); go(index - 1); }
      else if (e.key === 'm') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, onClose]);

  // Nouveau short : on repart de zéro ; la suite de la liste se charge à l'approche de la fin.
  useEffect(() => {
    setPaused(false); setProgress(0); setFailed(false);
    const v = video.current; if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    if (index >= items.length - 2) onNearEnd?.();
  }, [index, s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!s || counted.current.has(s.id)) return undefined;
    const id = setTimeout(() => { counted.current.add(s.id); call(`/shorts/${s.id}/view`, { method: 'POST' }); }, 2000);
    return () => clearTimeout(id);
  }, [s, call]);

  if (!s) return null;
  const toggleMute = () => setMuted((m) => { const n = !m; try { localStorage.setItem(MUTE_KEY, n ? '1' : '0'); } catch { /* sans stockage */ } return n; });
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); } };
  const theme = s.themes?.[0]?.name;

  return (
    <div className="pm-shc-back" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pm-shc" role="dialog" aria-modal="true" aria-label={s.title}>
        <div className="pm-shc-stage">
          {s.videoUrl && !failed ? (
            <video ref={video} key={s.id} src={s.videoUrl} poster={s.posterUrl || undefined} autoPlay playsInline muted={muted} preload="auto"
              onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
              onEnded={() => (index + 1 < items.length ? go(index + 1) : toggle())} onError={() => setFailed(true)} onClick={toggle} />
          ) : (
            <div className="pm-shc-miss" style={s.posterUrl ? { backgroundImage: `url("${String(s.posterUrl).replace(/"/g, '%22')}")` } : undefined}><p>{t('shrMissing')}</p></div>
          )}
          {paused && <span className="pm-shc-paused" aria-hidden="true">❚❚</span>}
          <span className="pm-shc-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
          <button ref={closeBtn} type="button" className="pm-shc-x" onClick={onClose} aria-label={t('pmShClose')}>×</button>
          <button type="button" className="pm-shc-mute" onClick={toggleMute} aria-label={muted ? t('shrSoundOn') : t('shrSoundOff')} aria-pressed={!muted}>{muted ? '🔇' : '🔊'}</button>
        </div>
        <div className="pm-shc-side">
          {theme && <span className="pm-shc-theme">{theme}</span>}
          <h2>{s.title}</h2>
          {s.channel && <Link href={`/chaines/${s.channel.slug}`} className="pm-shc-chan"><ChannelAvatar name={s.channel.name} url={s.channel.avatarUrl} /> <span>{s.channel.name}</span></Link>}
          <p className="pm-shc-meta">{t('shrViews').replace('{n}', s.views)}{s.talk?.premium ? ` · ${t('shrPremium')}` : ''}</p>
          <div className="pm-shc-nav">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t('shrPrev')}>{rtl ? '→' : '←'}</button>
            <bdi dir="ltr" aria-live="polite">{t('pmShPos').replace('{i}', index + 1).replace('{n}', items.length)}</bdi>
            <button type="button" onClick={() => go(index + 1)} disabled={index >= items.length - 1} aria-label={t('shrNext')}>{rtl ? '←' : '→'}</button>
          </div>
          <Link href={`/talks/${s.talk.id}`} className="pm-shc-link">{t('shrFull')} {rtl ? '←' : '→'}</Link>
          <Link href={`/shorts/${s.id}`} className="pm-shc-link ghost">{t('pmShOpenFeed')}</Link>
        </div>
      </div>
    </div>
  );
}
