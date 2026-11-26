'use client';
// Shorts de l'accueil sur smartphone : le bloc occupe tout l'écran, un short par écran (le balayage donne le short suivant,
// lecture automatique en muet du short visible). Une flèche en bas fait reprendre le défilement de la page après le bloc.
// Le balayage continue vers la page quand on est sur le premier ou le dernier short.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import { mmss } from '../ShortsRail';
import { shortSub } from './PmShortTile';

export default function PmShortsPhone({ shorts, head }) {
  const { t } = useApp();
  const root = useRef(null);
  const feed = useRef(null);
  const videos = useRef({});
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false); // le bloc est à l'écran
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);

  // Le bloc est « à l'écran » quand plus de la moitié est visible.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Short actif = celui qui occupe l'écran.
  useEffect(() => {
    const el = feed.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number(e.target.dataset.i));
    }, { root: el, threshold: [0.6] });
    el.querySelectorAll('.pm-shm-item').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [shorts.length]);

  // Seul le short actif joue, et seulement quand le bloc est à l'écran.
  useEffect(() => {
    setPaused(false);
    Object.entries(videos.current).forEach(([i, v]) => {
      if (!v) return;
      if (visible && Number(i) === active) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause();
    });
  }, [active, visible]);

  const togglePlay = (i) => {
    const v = videos.current[i]; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
  };
  // Flèche : la page reprend son défilement juste après le bloc.
  const onward = useCallback(() => {
    const el = root.current; if (!el) return;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().bottom, behavior: 'smooth' });
  }, []);

  return (
    <section className="pm-shm" ref={root} aria-label={head}>
      <div className="pm-shm-feed" ref={feed} role="feed" aria-label={head}>
        {shorts.map((s, i) => (
          <article key={s.id} className="pm-shm-item" data-i={i} aria-posinset={i + 1} aria-setsize={shorts.length} aria-label={s.title}>
            {Math.abs(i - active) <= 1 && s.videoUrl ? (
              <video ref={(el) => { videos.current[i] = el; }} className="pm-shm-video" src={s.videoUrl} poster={s.posterUrl || undefined}
                loop playsInline muted={muted} preload={i === active ? 'auto' : 'metadata'} onClick={() => togglePlay(i)} aria-label={s.title} />
            ) : <div className="pm-shm-video pm-shm-poster" style={s.posterUrl ? { backgroundImage: `url("${String(s.posterUrl).replace(/"/g, '%22')}")` } : undefined} />}
            {i === active && paused && <span className="pm-shm-paused" aria-hidden="true">▶</span>}
            <div className="pm-shm-info">
              <span className="pm-shm-tag">{t('pmShortTag')}{s.duration != null ? ` · ${mmss(s.duration)}` : ''}</span>
              <h3>{s.title}</h3>
              {shortSub(s) && <p>{shortSub(s)}</p>}
              {s.talk?.id && <Link href={`/talks/${s.talk.id}`} className="pm-shm-full">{t('shrFull')}</Link>}
            </div>
          </article>
        ))}
      </div>
      <div className="pm-shm-top">
        <span>{head}</span>
        <Link href="/shorts">{t('pmShortsAll')} <span className="pm-chev" aria-hidden="true">›</span></Link>
      </div>
      <button type="button" className="pm-shm-mute" onClick={() => setMuted((m) => !m)} aria-pressed={!muted} aria-label={muted ? t('shrSoundOn') : t('shrSoundOff')}>{muted ? '🔇' : '🔊'}</button>
      <button type="button" className="pm-shm-next" onClick={onward} aria-label={t('pmShortsContinue')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </section>
  );
}
