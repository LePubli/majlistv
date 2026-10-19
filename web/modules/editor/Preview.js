'use client';
// Éditeur de montage (étape E1) — aperçu dans le navigateur : la qualité 360p déjà produite par la conversion (hls.js),
// jouée en suivant le montage. À la fin d'un extrait, le lecteur saute au début de l'extrait suivant : c'est un aperçu
// (petit temps de chargement possible aux raccords) ; le rendu final de l'étape E4 sera continu et en haute qualité.
// Étape E2 : le son suit les réglages — volume de la voix d'origine (baissée sous la voix française), voix française
// (piste « voix seule » du doublage, calée sur la vidéo d'origine) et musiques de fond, avec fondus et baisse automatique.
// Les volumes passent par l'élément audio/vidéo (0 à 100 %) : un gain au-dessus de 0 dB n'est entendu qu'au rendu final.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { layout, locate, clock, musicTime } from './ops';

const Preview = forwardRef(function Preview({ src, clips, T, onTime, playing, setPlaying, caption, poster, sound, children, hideCaption }, ref) {
  const { t } = useApp();
  const video = useRef(null);
  const clipsRef = useRef(clips);
  const idx = useRef(0);
  const lastSet = useRef(-1); // dernier temps envoyé par la lecture (évite de relancer une recherche pour lui-même)
  const [state, setState] = useState('loading'); // loading | ready | error
  const Tref = useRef(T); const playRef = useRef(playing);
  clipsRef.current = clips; Tref.current = T; playRef.current = playing;
  const soundRef = useRef(sound); soundRef.current = sound;
  const dubEl = useRef(null);
  const musicEls = useRef(new Map()); // id de la musique → élément <audio>

  // Son : volumes et positions de la voix française et des musiques au temps tt du montage (srcT = temps de la vidéo d'origine).
  const syncSound = (tt, srcT, isPlaying) => {
    const snd = soundRef.current; const v = video.current;
    if (!snd || !v) return;
    const mix = snd.getMix(tt);
    v.volume = mix.orig; v.dataset.vol = mix.orig.toFixed(3);
    const follow = (el, want, vol) => {
      if (!el) return;
      el.volume = vol; el.dataset.vol = vol.toFixed(3);
      if (!isPlaying || want == null || vol <= 0) { if (!el.paused) el.pause(); if (want != null && Math.abs(el.currentTime - want) > 0.3) { try { el.currentTime = want; } catch { /* rien */ } } return; }
      if (Math.abs(el.currentTime - want) > 0.3) { try { el.currentTime = want; } catch { /* rien */ } }
      if (el.paused) el.play().catch(() => {});
    };
    follow(dubEl.current, srcT, mix.dub);
    for (const m of snd.music || []) follow(musicEls.current.get(m.item.id), musicTime(m.item, tt, m.assetDur), mix.music[m.item.id] || 0);
  };
  const syncRef = useRef(syncSound); syncRef.current = syncSound;
  // À l'arrêt ou quand les réglages changent : volumes à jour, sons en pause.
  useEffect(() => {
    if (playing) return;
    const loc = locate(clips, T);
    syncRef.current(T, loc ? loc.src : null, false);
  }, [T, clips, playing, sound]);

  // Chargement du flux 360p.
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return undefined;
    let hls = null; let alive = true;
    const ready = () => alive && setState('ready');
    const failed = () => alive && setState('error');
    v.addEventListener('loadedmetadata', ready);
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = src; v.addEventListener('error', failed); }
    else {
      import('hls.js').then(({ default: Hls }) => {
        if (!alive) return;
        if (!Hls.isSupported()) { failed(); return; }
        hls = new Hls({ maxBufferLength: 20, startPosition: 0 });
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) failed(); });
        hls.loadSource(src); hls.attachMedia(v);
      }).catch(failed);
    }
    return () => { alive = false; v.removeEventListener('loadedmetadata', ready); v.removeEventListener('error', failed); if (hls) hls.destroy(); };
  }, [src]);

  // La vidéo suit la tête de lecture quand elle bouge d'ailleurs que la lecture (clic sur la timeline, « » …), à l'arrêt
  // comme pendant la lecture.
  useEffect(() => {
    const v = video.current;
    if (!v || state !== 'ready') return;
    if (Math.abs(T - lastSet.current) < 0.001) return;
    const loc = locate(clipsRef.current, T);
    if (!loc) return;
    idx.current = loc.index; lastSet.current = T;
    if (Math.abs(v.currentTime - loc.src) > 0.04) { try { v.currentTime = loc.src; } catch { /* pas encore prêt */ } }
  }, [T, state]);
  // Le montage change (coupe, déplacement) : on retrouve l'extrait en cours.
  useEffect(() => {
    const loc = locate(clips, playRef.current ? Math.max(0, lastSet.current) : Tref.current);
    if (!loc) return;
    idx.current = loc.index;
    const v = video.current;
    if (v && !playRef.current && state === 'ready' && Math.abs(v.currentTime - loc.src) > 0.04) { try { v.currentTime = loc.src; } catch { /* rien */ } }
  }, [clips, state]);

  // Lecture : on suit le montage extrait par extrait.
  useEffect(() => {
    const v = video.current;
    if (!v || state !== 'ready') return undefined;
    if (!playing) { v.pause(); return undefined; }
    const loc = locate(clipsRef.current, T);
    if (!loc) return undefined;
    idx.current = loc.index;
    if (loc.clip.end - T < 0.05 && loc.index === clipsRef.current.length - 1) { setPlaying(false); return undefined; }
    try { v.currentTime = loc.src; } catch { /* rien */ }
    v.play().catch(() => setPlaying(false));
    let raf = 0; let seeking = false;
    const onSeeked = () => { seeking = false; };
    v.addEventListener('seeked', onSeeked);
    const tick = () => {
      const L = layout(clipsRef.current);
      let i = Math.min(idx.current, L.length - 1);
      const c = L[i];
      if (c && !seeking) {
        const s = v.currentTime;
        if (s >= c.out - 0.04 || s < c.in - 0.5) {
          if (i + 1 >= L.length) { lastSet.current = c.end; onTime(c.end); setPlaying(false); return; }
          i += 1; idx.current = i; seeking = true;
          v.currentTime = L[i].in;
          lastSet.current = L[i].start; onTime(L[i].start);
        } else {
          const tt = c.start + Math.max(0, s - c.in);
          lastSet.current = tt; onTime(tt);
          syncRef.current(tt, s, true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf); v.removeEventListener('seeked', onSeeked); v.pause();
      if (dubEl.current) dubEl.current.pause();
      for (const el of musicEls.current.values()) el.pause();
    };
    // T n'est lu qu'au démarrage de la lecture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, state]);

  useImperativeHandle(ref, () => ({ el: video.current }), []);

  const totalS = layout(clips).at(-1)?.end || 0;
  return (
    <div className="mt-preview">
      <div className="mt-screen">
        <video ref={video} playsInline preload="auto" poster={poster || undefined} aria-label={t('mtPreviewAria')} onClick={() => setPlaying(!playing)} />
        {caption && !hideCaption && <p className="mt-caption" dir="auto">{caption}</p>}
        {children}
        {sound?.dubUrl && <audio ref={dubEl} src={sound.dubUrl} preload="auto" className="mt-hidden-audio" data-role="dub" />}
        {(sound?.music || []).map((m) => (
          <audio key={m.item.id} src={m.url} preload="auto" loop={false} className="mt-hidden-audio" data-role="music" data-id={m.item.id}
            ref={(el) => { if (el) musicEls.current.set(m.item.id, el); else musicEls.current.delete(m.item.id); }} />
        ))}
        {state === 'loading' && <p className="mt-screen-msg">{t('dbLoading')}</p>}
        {state === 'error' && <p className="mt-screen-msg error" role="alert">{t('mtPreviewError')}</p>}
        {!playing && state === 'ready' && (
          <button type="button" className="mt-bigplay" onClick={() => setPlaying(true)} aria-label={t('mtPlay')}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </button>
        )}
      </div>
      <div className="mt-transport" dir="ltr">
        <button type="button" className="mt-round" onClick={() => onTime(Math.max(0, T - 10))} aria-label={t('mtBack10')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
        </button>
        <button type="button" className="mt-round play" onClick={() => setPlaying(!playing)} aria-label={playing ? t('mtPause') : t('mtPlay')} disabled={state !== 'ready'}>
          {playing
            ? <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
        </button>
        <button type="button" className="mt-round" onClick={() => onTime(Math.min(totalS, T + 10))} aria-label={t('mtFwd10')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
        </button>
        <span className="mt-clock" dir="ltr"><b>{clock(T)}</b> / {clock(totalS)}</span>
      </div>
    </div>
  );
});

export default Preview;
