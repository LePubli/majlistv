'use client';
// Lecteur de récitation GLOBAL du site (monté dans Providers) : la récitation continue quand on change de page
// (navigation interne) et, sur téléphone, écran verrouillé — commandes sur l'écran de verrouillage via Media Session.
// Une mini-barre fixe permet de reprendre la sourate ou d'arrêter, sur toutes les pages.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { afterError, followingAya, nowPlayingTitle, retryDelay } from '../lib/quranQueue';

const Ctx = createContext({ current: null, err: false, start: () => {}, stop: () => {}, clearErr: () => {}, title: '' });
export const useQuranPlayer = () => useContext(Ctx);

export function QuranPlayerProvider({ children, t }) {
  const audioRef = useRef(null);
  const warmRef = useRef(null);       // verset suivant préchargé (transition plus courte, utile écran verrouillé)
  const track = useRef(null);
  const retries = useRef(0);
  const timer = useRef(null);
  const [current, setCurrent] = useState(null); // { sura, aya }
  const [err, setErr] = useState(false);
  const [title, setTitle] = useState('');

  const audio = () => {
    if (!audioRef.current && typeof Audio !== 'undefined') { const a = new Audio(); a.preload = 'auto'; audioRef.current = a; }
    return audioRef.current;
  };
  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const warm = (tr, aya) => {
    const next = followingAya(tr.ayas, aya, tr.chain);
    const url = next && tr.urlOf(next);
    if (!url || typeof Audio === 'undefined') return;
    const w = new Audio(); w.preload = 'auto'; w.src = url; warmRef.current = w;
  };

  const fail = useCallback((aya) => {
    if (timer.current) return;
    if (afterError(retries.current) === 'retry') {
      const wait = retryDelay(retries.current); retries.current += 1;
      timer.current = setTimeout(() => { timer.current = null; if (track.current && track.current.aya === aya) load(aya); }, wait);
      return;
    }
    retries.current = 0; track.current = null; setErr(true); setCurrent(null); setTitle('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback((aya) => {
    const tr = track.current; const a = audio();
    if (!tr || !a) return;
    const url = tr.urlOf(aya);
    if (!url) { setErr(true); setCurrent(null); track.current = null; return; }
    track.current = { ...tr, aya };
    const label = nowPlayingTitle(tr.suraName, aya, tr.verseWord);
    setCurrent({ sura: tr.sura, aya }); setTitle(label);
    a.src = url;
    a.play().then(() => warm(track.current, aya)).catch((e) => { if (e && e.name === 'AbortError') return; fail(aya); });
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: label, artist: tr.artist, album: 'Mejliss TV' });
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch { /* Media Session indisponible */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail]);

  const start = useCallback((tr) => { clearTimer(); retries.current = 0; setErr(false); track.current = tr; load(tr.aya); }, [load]);
  const stop = useCallback(() => {
    clearTimer(); retries.current = 0; track.current = null;
    const a = audioRef.current; if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
    try { if ('mediaSession' in navigator) { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } } catch { /* ignoré */ }
    setCurrent(null); setTitle('');
  }, []);

  useEffect(() => {
    const a = audio(); if (!a) return undefined;
    const onEnd = () => {
      const tr = track.current; if (!tr) return;
      retries.current = 0;
      const next = followingAya(tr.ayas, tr.aya, tr.chain);
      if (next) load(next); else { track.current = null; setCurrent(null); setTitle(''); }
    };
    const onErr = () => { const tr = track.current; if (tr) fail(tr.aya); };
    a.addEventListener('ended', onEnd); a.addEventListener('error', onErr);
    // Commandes de l'écran verrouillé : pause / lecture / verset suivant ou précédent.
    try {
      if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', () => { a.play().catch(() => {}); ms.playbackState = 'playing'; });
        ms.setActionHandler('pause', () => { a.pause(); ms.playbackState = 'paused'; });
        ms.setActionHandler('stop', () => stop());
        ms.setActionHandler('nexttrack', () => { const tr = track.current; const n = tr && tr.ayas.includes(tr.aya + 1) ? tr.aya + 1 : null; if (n) load(n); });
        ms.setActionHandler('previoustrack', () => { const tr = track.current; const p = tr && tr.ayas.includes(tr.aya - 1) ? tr.aya - 1 : null; if (p) load(p); });
      }
    } catch { /* actions non prises en charge */ }
    return () => { a.removeEventListener('ended', onEnd); a.removeEventListener('error', onErr); };
  }, [load, fail, stop]);

  const value = useMemo(() => ({ current, err, start, stop, clearErr: () => setErr(false), title }), [current, err, start, stop, title]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {current && (
        <div className="qpl-bar" role="region" aria-label={t('qrReciter')}>
          <Link href={`/coran/${current.sura}#v${current.aya}`} className="qpl-title">{title}</Link>
          <button type="button" className="qpl-stop" aria-label={t('qrStop')} onClick={stop}>■</button>
        </div>
      )}
    </Ctx.Provider>
  );
}
