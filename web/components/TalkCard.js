'use client';
// Vignette d'une conférence.
// - Toujours : miniature, badge, durée, barre de progression, titre, intervenant (selon les réglages du back-office).
// - Ordinateur (souris) : si la souris reste dessus, la vignette s'agrandit (fenêtre flottante) avec boutons, infos et description ;
//   si elle y reste encore, un court extrait muet démarre (délai et durée réglables).
// progress (0..1) : barre « Continuer à regarder ». onRemove : bouton de retrait (bibliothèque).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { langName } from './Transcript';
import { levelLabel } from '../lib/levels';

const previewCache = new Map(); // id -> promesse de { kind, src|ref } : un seul appel par conférence

export const thumbOf = (talk) => talk.posterUrl || (talk.source === 'youtube' ? `https://i.ytimg.com/vi/${talk.video_ref}/hqdefault.jpg` : null);
const minutesOf = (talk, t) => (talk.durationSeconds > 0 ? `${Math.max(1, Math.round(talk.durationSeconds / 60))} ${t('minutes')}` : '');

// Extrait vidéo muet en boucle (vidéo envoyée : HLS ; YouTube / Vimeo gratuits : lecteur intégré).
function Preview({ info, seconds, muted, onReady }) {
  const ref = useRef(null);
  useEffect(() => {
    if (info?.kind !== 'hls') return undefined;
    const video = ref.current;
    let hls; let dead = false;
    const src = `/api${info.src}`;
    const loop = () => { if (video.currentTime >= seconds) video.currentTime = 0; };
    const again = () => { video.currentTime = 0; video.play().catch(() => {}); }; // vidéo plus courte que l'extrait
    video.addEventListener('timeupdate', loop);
    video.addEventListener('ended', again);
    video.addEventListener('playing', onReady, { once: true });
    import('hls.js').then(({ default: Hls }) => {
      if (dead) return;
      if (Hls.isSupported()) { hls = new Hls({ maxBufferLength: 8 }); hls.loadSource(src); hls.attachMedia(video); } else video.src = src;
      video.play().catch(() => {});
    });
    return () => { dead = true; video.removeEventListener('timeupdate', loop); video.removeEventListener('ended', again); if (hls) hls.destroy(); video.removeAttribute('src'); video.load(); };
  }, [info, seconds, onReady]);
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted, info]);
  if (info?.kind === 'hls') return <video ref={ref} className="hc-video" muted playsInline loop={false} aria-hidden="true" />;
  if (info?.kind === 'youtube') {
    const q = new URLSearchParams({ autoplay: 1, mute: muted ? 1 : 0, controls: 0, modestbranding: 1, playsinline: 1, rel: 0, loop: 1, playlist: info.ref, start: 0, end: seconds, disablekb: 1, iv_load_policy: 3 });
    return <iframe className="hc-video" title="" aria-hidden="true" tabIndex={-1} allow="autoplay; encrypted-media" onLoad={onReady} src={`https://www.youtube-nocookie.com/embed/${info.ref}?${q}`} />;
  }
  if (info?.kind === 'vimeo') return <iframe className="hc-video" title="" aria-hidden="true" tabIndex={-1} allow="autoplay" onLoad={onReady} src={`https://player.vimeo.com/video/${info.ref}?autoplay=1&muted=${muted ? 1 : 0}&background=${muted ? 1 : 0}&loop=1`} />;
  return null;
}

// Fenêtre agrandie, posée en position fixe au-dessus de la vignette (elle n'est pas coupée par la rangée qui défile).
function HoverCard({ talk, rect, t, locale, cfg, progress, onEnter, onLeave }) {
  const { user, favs, toggleFav } = useApp();
  const router = useRouter();
  const [info, setInfo] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const show = cfg.show;
  const W = Math.min(Math.max(rect.width * 1.35, 300), 380);
  const left = Math.min(Math.max(rect.left - (W - rect.width) / 2, 8), window.innerWidth - W - 8);
  const estH = W * 0.5625 + 190;
  const top = Math.min(Math.max(rect.top - 12, 8), Math.max(8, window.innerHeight - estH - 8));

  useEffect(() => {
    if (!cfg.preview) return undefined;
    const timer = setTimeout(() => {
      if (!previewCache.has(talk.id)) previewCache.set(talk.id, fetch(`/api/talks/${talk.id}/hover`).then((r) => (r.ok ? r.json() : { kind: 'none' })).catch(() => ({ kind: 'none' })));
      previewCache.get(talk.id).then(setInfo);
    }, cfg.previewDelay);
    return () => clearTimeout(timer);
  }, [talk.id, cfg.preview, cfg.previewDelay]);

  const fav = favs.has(talk.id);
  const meta = [show.access && t(talk.access), show.duration && minutesOf(talk, t), show.language && talk.language && langName(String(talk.language).split('-')[0], locale), show.category && talk.category].filter(Boolean);
  const thumb = thumbOf(talk);
  const onFav = (e) => { e.preventDefault(); if (!user) { router.push('/login'); return; } toggleFav(talk.id); };
  const withVideo = info && info.kind !== 'none';
  return createPortal(
    <div className="hc" style={{ left, top, width: W }} onMouseEnter={onEnter} onMouseLeave={onLeave} role="group" aria-label={talk.title}>
      <Link href={`/talks/${talk.id}`} className="hc-media" tabIndex={-1} aria-hidden="true">
        <div className="hc-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} />
        {withVideo && <div className={`hc-vid${playing ? ' on' : ''}`}><Preview info={info} seconds={cfg.previewSeconds} muted={muted} onReady={() => setPlaying(true)} /></div>}
        {progress > 0 && show.progress && <span className="progress"><span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} /></span>}
      </Link>
      {playing && info?.kind === 'hls' && (
        <button type="button" className="hc-sound" onClick={() => setMuted((m) => !m)} aria-label={muted ? t('cardSound') : t('cardMute')} title={muted ? t('cardSound') : t('cardMute')}>{muted ? '🔇' : '🔊'}</button>
      )}
      <div className="hc-body">
        <div className="hc-actions">
          <Link href={`/talks/${talk.id}`} className="hc-btn play" aria-label={`${t('cardPlay')} : ${talk.title}`} title={t('cardPlay')}>▶</Link>
          {show.favorite && <button type="button" className={`hc-btn${fav ? ' on' : ''}`} onClick={onFav} aria-pressed={fav} aria-label={fav ? t('favRemove') : t('favAdd')} title={fav ? t('favRemove') : t('favAdd')}>{fav ? '♥' : '♡'}</button>}
          <Link href={`/talks/${talk.id}`} className="hc-btn more" aria-label={t('cardDetails')} title={t('cardDetails')}>⌄</Link>
        </div>
        <h3 className="hc-title">{talk.title}</h3>
        {show.speaker && talk.speaker && <p className="hc-speaker">{talk.speaker}</p>}
        {talk.level && <p className="hc-meta"><span className={`lvl ${talk.level}`}>{levelLabel(talk.level, t)}</span></p>}
        {meta.length > 0 && <p className="hc-meta">{meta.map((m, i) => <span key={i} className={i === 0 && show.access && m === t(talk.access) && talk.access === 'premium' ? 'prem' : undefined}>{m}</span>)}</p>}
        {show.description && talk.summary && <p className="hc-desc">{talk.summary}</p>}
      </div>
    </div>,
    document.body,
  );
}

export default function TalkCard({ talk, t, progress, onRemove, removeLabel }) {
  const { cards, locale } = useApp();
  const cfg = cards;
  const show = cfg.show;
  const wrap = useRef(null);
  const [rect, setRect] = useState(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const canHover = useRef(false);
  useEffect(() => {
    canHover.current = cfg.hover && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, [cfg.hover]);

  const close = useCallback(() => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); setRect(null); }, []);
  const enter = () => {
    clearTimeout(closeTimer.current);
    if (!canHover.current || rect) return;
    openTimer.current = setTimeout(() => { if (wrap.current) setRect(wrap.current.getBoundingClientRect()); }, 350);
  };
  const leave = () => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setRect(null), 90); // laisse le temps d'entrer dans la fenêtre agrandie
  };
  useEffect(() => {
    if (!rect) return undefined;
    const off = () => setRect(null);
    const esc = (e) => e.key === 'Escape' && off();
    window.addEventListener('scroll', off, true); window.addEventListener('resize', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('resize', off); window.removeEventListener('keydown', esc); };
  }, [rect]);
  useEffect(() => close, [close]);

  const thumb = thumbOf(talk);
  // Épisode de série : « Titre de la série · S1 É3 » à la place de l'intervenant ; « épisode suivant » à la place du badge d'accès.
  const place = talk.series ? [talk.series.seasonNumber ? t('sShort').replace('{n}', talk.series.seasonNumber) : '', t('eShort').replace('{n}', talk.series.number)].filter(Boolean).join(' ') : '';
  const sub = talk.series
    ? [talk.series.title, place].join(' · ')
    : [show.speaker && talk.speaker, show.category && talk.category].filter(Boolean).join(' · ');
  const mins = minutesOf(talk, t);
  return (
    <div className="talk-wrap" ref={wrap} onMouseEnter={enter} onMouseLeave={leave}>
      <Link href={talk.quizState ? `/talks/${talk.id}?quiz=1` : `/talks/${talk.id}`} className="talk">
        <div className="thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
          {talk.quizState
            ? <span className="badge next">{talk.quizState === 'retry' ? `${t('qpRevise')} · ${talk.bestPercent} %` : t('qpTodo')}</span>
            : talk.nextUp
            ? <span className="badge next">{t('nextEp')}</span>
            : show.access && <span className={`badge ${talk.access}`}>{t(talk.access)}</span>}
          {show.duration && mins && <span className="dur">{mins}</span>}
          {progress > 0 && show.progress && <span className="progress"><span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} /></span>}
        </div>
        <h3>{talk.title}</h3>
        {(talk.level || sub) && <p>{talk.level && <span className={`lvl ${talk.level}`}>{levelLabel(talk.level, t)}</span>}{sub}</p>}
      </Link>
      {onRemove && <button type="button" className="card-remove" onClick={onRemove} aria-label={removeLabel} title={removeLabel}>×</button>}
      {rect && <HoverCard talk={talk} rect={rect} t={t} locale={locale} cfg={cfg} progress={progress} onEnter={() => clearTimeout(closeTimer.current)} onLeave={close} />}
    </div>
  );
}
