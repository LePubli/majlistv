'use client';
// Lecteur Audyn GLOBAL du site (monté dans Providers) : le livre continue quand on change de page et, sur téléphone, écran verrouillé
// (commandes via Media Session). Reprise gardée dans le navigateur, minuteur de sommeil avec fondu, vitesse, mode veille (écran noir).
// Le même lecteur servira aux histoires du soir de l'espace Kids (étape 4). Un seul son à la fois : lancer un livre arrête la récitation du Coran.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuranPlayer } from './QuranPlayer';
import {
  NO_TIMER, decodeResume, encodeResume, fmtClock, nextPlayable, nextSpeed, prevPlayable, resumeKey, resumePoint, seekTarget, shouldSaveResume,
  sleepTick, startSleep,
} from '../lib/audyn';

const EMPTY = { book: null, index: 0, playing: false, loading: false, pos: 0, dur: 0, speed: 1, timer: NO_TIMER, timerLeftMs: null, preview: false, previewEnded: false, err: false };
const noop = () => {};
const Ctx = createContext({ ...EMPTY, chapter: null, open: async () => {}, openResume: async () => {}, toggle: noop, skip: noop, seekTo: noop, next: noop, prev: noop, cycleSpeed: noop, setSleep: noop, stop: noop, savedFor: () => null, dark: false, setDark: noop });
export const useAudyn = () => useContext(Ctx);

const URL_LIFETIME_MS = 50 * 60 * 1000; // liens d'écoute valables 1 h : renouvelés avant

const readSaved = (id) => { try { return decodeResume(localStorage.getItem(resumeKey(id))); } catch { return null; } };
const writeSaved = (id, r) => { try { localStorage.setItem(resumeKey(id), encodeResume(r)); } catch { /* stockage indisponible */ } };

export function AudynPlayerProvider({ children, t, call }) {
  const quran = useQuranPlayer();
  const audioRef = useRef(null);
  const [st, setSt] = useState(EMPTY);
  const [dark, setDark] = useState(false);
  const stRef = useRef(st); stRef.current = st;
  const patch = useCallback((p) => { stRef.current = { ...stRef.current, ...p }; setSt(stRef.current); }, []);
  const loaded = useRef(null);   // { cid, at }
  const blobUrl = useRef(null);  // aperçu chargé en mémoire (certains navigateurs exigent des « Range » que l'aperçu ne gère pas)
  const token = useRef(0);
  const retries = useRef(0);
  const lastSaved = useRef(NaN);
  const limit = useRef(0);       // aperçu : durée écoutable (le fichier reçu est coupé, mais sa durée annoncée reste celle du livre)
  const capDur = (d) => (limit.current > 0 ? Math.min(d, limit.current) : d);

  const audio = () => {
    if (!audioRef.current && typeof Audio !== 'undefined') { const a = new Audio(); a.preload = 'auto'; audioRef.current = a; }
    return audioRef.current;
  };
  const freeBlob = () => { if (blobUrl.current) { URL.revokeObjectURL(blobUrl.current); blobUrl.current = null; } };

  const save = useCallback((pos) => {
    const s = stRef.current; const ch = s.book?.chapters[s.index];
    if (!s.book || !ch || s.preview) return;
    lastSaved.current = pos; writeSaved(s.book.id, { cid: ch.id, pos, at: Date.now() });
  }, []);

  const media = (book, ch) => {
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: ch.title || book.title, artist: book.narrator || book.author || book.title, album: book.title,
          artwork: book.coverUrl ? [{ src: book.coverUrl, sizes: '512x512' }] : [],
        });
      }
    } catch { /* Media Session indisponible */ }
  };

  const load = useCallback(async (book, index, pos, play) => {
    const ch = book.chapters[index]; const a = audio();
    if (!ch || !a) return;
    const my = ++token.current;
    patch({ book, index, loading: true, err: false, previewEnded: false, pos, dur: ch.durationSeconds });
    try {
      const r = await call(`/audyn/${book.id}/chapters/${ch.id}/play`);
      if (my !== token.current) return;
      if (!r.ok) throw new Error('play');
      let src = r.data.url;
      limit.current = r.data.preview ? Number(r.data.limitSeconds) || 0 : 0;
      freeBlob();
      if (r.data.preview) { // aperçu : octets servis par l'API du site (même origine), gardés en mémoire
        const res = await fetch(`/api${r.data.url}`);
        if (!res.ok) throw new Error('preview');
        blobUrl.current = URL.createObjectURL(await res.blob()); src = blobUrl.current;
        if (my !== token.current) return;
      }
      a.src = src; a.volume = 1; a.playbackRate = stRef.current.speed;
      await new Promise((ok, ko) => {
        const done = () => { a.removeEventListener('loadedmetadata', done); a.removeEventListener('error', fail); ok(); };
        const fail = () => { a.removeEventListener('loadedmetadata', done); a.removeEventListener('error', fail); ko(new Error('load')); };
        a.addEventListener('loadedmetadata', done); a.addEventListener('error', fail);
      });
      if (my !== token.current) return;
      if (pos > 0) a.currentTime = pos;
      loaded.current = { cid: ch.id, at: Date.now() };
      media(book, ch);
      patch({ loading: false, preview: !!r.data.preview, pos, dur: capDur(Number.isFinite(a.duration) ? a.duration : ch.durationSeconds) });
      if (play) await a.play().catch(() => { /* lecture refusée par le navigateur : l'utilisateur appuiera sur lecture */ });
    } catch {
      if (my !== token.current) return;
      if (retries.current < 2) { retries.current += 1; setTimeout(() => { if (my === token.current) load(book, index, stRef.current.pos, play); }, 1500 * retries.current); return; }
      retries.current = 0; patch({ loading: false, err: true, playing: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, patch]);

  const open = useCallback(async (book, index = 0, pos = 0) => {
    quran.stop(); retries.current = 0; lastSaved.current = NaN; patch({ timer: NO_TIMER, timerLeftMs: null });
    await load(book, index, pos, true);
  }, [load, patch, quran]);
  const savedFor = useCallback((id) => readSaved(id), []);
  const openResume = useCallback(async (book) => { const rp = resumePoint(book.chapters, readSaved(book.id)); await open(book, rp.index, rp.pos); }, [open]);

  const stop = useCallback(() => {
    token.current += 1; retries.current = 0; save(stRef.current.pos);
    const a = audioRef.current; if (a) { a.pause(); a.volume = 1; a.removeAttribute('src'); a.load(); }
    freeBlob(); loaded.current = null; setDark(false);
    try { if ('mediaSession' in navigator) { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } } catch { /* ignoré */ }
    stRef.current = { ...EMPTY, speed: stRef.current.speed }; setSt(stRef.current);
  }, [save]);

  const toggle = useCallback(() => {
    const s = stRef.current; const a = audioRef.current;
    if (!s.book || !a) return;
    if (s.playing) { a.pause(); save(s.pos); return; }
    const ch = s.book.chapters[s.index];
    if (!loaded.current || loaded.current.cid !== ch?.id || Date.now() - loaded.current.at > URL_LIFETIME_MS || s.previewEnded) {
      retries.current = 0; load(s.book, s.index, s.previewEnded ? 0 : s.pos, true);
    } else { a.volume = 1; a.play().catch(() => {}); }
  }, [load, save]);

  const seekTo = useCallback((sec) => {
    const a = audioRef.current; const s = stRef.current;
    if (!a || !s.book || !loaded.current) return;
    const t0 = seekTarget(0, sec, s.dur); a.currentTime = t0; patch({ pos: t0 }); save(t0);
  }, [patch, save]);
  const skip = useCallback((d) => seekTo(seekTarget(stRef.current.pos, d, stRef.current.dur)), [seekTo]);
  const goTo = useCallback((i) => { const s = stRef.current; if (s.book && i >= 0) { retries.current = 0; load(s.book, i, 0, true); } }, [load]);
  const next = useCallback(() => { const s = stRef.current; if (s.book) goTo(nextPlayable(s.book.chapters, s.index)); }, [goTo]);
  const prev = useCallback(() => { const s = stRef.current; if (!s.book) return; if (s.pos > 5) { seekTo(0); return; } goTo(prevPlayable(s.book.chapters, s.index)); }, [goTo, seekTo]);
  const cycleSpeed = useCallback(() => { const sp = nextSpeed(stRef.current.speed); const a = audioRef.current; if (a) a.playbackRate = sp; patch({ speed: sp }); }, [patch]);
  const setSleep = useCallback((minutes) => {
    const a = audioRef.current;
    if (minutes === null) { if (a) a.volume = 1; patch({ timer: NO_TIMER, timerLeftMs: null }); return; }
    const tm = startSleep(minutes, Date.now()); patch({ timer: tm, timerLeftMs: tm.endAt ? tm.endAt - Date.now() : null });
  }, [patch]);

  // Événements de l'élément audio + commandes de l'écran verrouillé
  useEffect(() => {
    const a = audio(); if (!a) return undefined;
    const onPlay = () => { patch({ playing: true }); try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; } catch { /* */ } };
    const onPause = () => { patch({ playing: false }); save(stRef.current.pos); try { if ('mediaSession' in navigator && stRef.current.book) navigator.mediaSession.playbackState = 'paused'; } catch { /* */ } };
    const onTime = () => {
      const s = stRef.current; if (!s.book || !loaded.current) return;
      const d = capDur(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : s.dur);
      patch({ pos: a.currentTime, dur: d });
      if (!a.paused && shouldSaveResume(lastSaved.current, a.currentTime)) save(a.currentTime);
      try { if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d > 0) navigator.mediaSession.setPositionState({ duration: d, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, d) }); } catch { /* */ }
    };
    const onEnd = () => {
      const s = stRef.current; if (!s.book) return;
      if (s.preview) { loaded.current = null; patch({ playing: false, previewEnded: true, pos: 0 }); return; }
      const n = nextPlayable(s.book.chapters, s.index);
      if (s.timer.endOfChapter) {
        a.volume = 1; loaded.current = null;
        const target = n >= 0 ? n : s.index;
        patch({ timer: NO_TIMER, timerLeftMs: null, playing: false, index: target, pos: 0 });
        writeSaved(s.book.id, { cid: s.book.chapters[target].id, pos: 0, at: Date.now() });
        return;
      }
      if (n >= 0) goTo(n);
      else { loaded.current = null; writeSaved(s.book.id, { cid: s.book.chapters[0].id, pos: 0, at: Date.now() }); patch({ playing: false, index: 0, pos: 0 }); }
    };
    const onErr = () => {
      const s = stRef.current; if (!s.book || s.loading || !loaded.current) return;
      if (retries.current < 2) { retries.current += 1; load(s.book, s.index, s.pos, true); } else { retries.current = 0; patch({ err: true, playing: false }); }
    };
    a.addEventListener('play', onPlay); a.addEventListener('pause', onPause); a.addEventListener('timeupdate', onTime); a.addEventListener('ended', onEnd); a.addEventListener('error', onErr);
    try {
      if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', () => toggle()); ms.setActionHandler('pause', () => { a.pause(); });
        ms.setActionHandler('seekbackward', () => skip(-15)); ms.setActionHandler('seekforward', () => skip(15));
        ms.setActionHandler('previoustrack', () => prev()); ms.setActionHandler('nexttrack', () => next());
        ms.setActionHandler('seekto', (d) => { if (Number.isFinite(d.seekTime)) seekTo(d.seekTime); });
        ms.setActionHandler('stop', () => stop());
      }
    } catch { /* actions non prises en charge */ }
    return () => { a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause); a.removeEventListener('timeupdate', onTime); a.removeEventListener('ended', onEnd); a.removeEventListener('error', onErr); };
  }, [patch, save, goTo, load, toggle, skip, prev, next, seekTo, stop]);

  // Minuteur : un tic par seconde (volume en descente sur les 30 dernières secondes, puis pause)
  useEffect(() => {
    if (!st.timer.endAt && !st.timer.endOfChapter) return undefined;
    const h = setInterval(() => {
      const s = stRef.current; const a = audioRef.current; if (!a) return;
      const tick = sleepTick(s.timer, Date.now(), s.dur > 0 ? s.dur - s.pos : null);
      if (tick.stop) { a.pause(); a.volume = 1; save(s.pos); patch({ timer: NO_TIMER, timerLeftMs: null }); return; }
      if (!a.paused) a.volume = tick.volume;
      patch({ timerLeftMs: tick.remainingMs });
    }, 1000);
    return () => clearInterval(h);
  }, [st.timer, patch, save]);

  // Enregistre aussi la position quand l'onglet se ferme / passe en arrière-plan
  useEffect(() => {
    const f = () => { if (stRef.current.book) save(stRef.current.pos); };
    window.addEventListener('pagehide', f); document.addEventListener('visibilitychange', f);
    return () => { window.removeEventListener('pagehide', f); document.removeEventListener('visibilitychange', f); };
  }, [save]);

  // La récitation du Coran démarre : le livre se met en pause (un seul son à la fois)
  useEffect(() => { if (quran.current && audioRef.current && !audioRef.current.paused) audioRef.current.pause(); }, [quran.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const chapter = st.book ? st.book.chapters[st.index] || null : null;
  const value = useMemo(() => ({ ...st, chapter, open, openResume, toggle, skip, seekTo, next, prev, cycleSpeed, setSleep, stop, savedFor, dark, setDark }),
    [st, chapter, open, openResume, toggle, skip, seekTo, next, prev, cycleSpeed, setSleep, stop, savedFor, dark]);
  const timerText = st.timer.endOfChapter ? t('awSleepLeftEnd') : st.timerLeftMs != null ? t('awSleepLeft').replace('{t}', fmtClock(st.timerLeftMs / 1000)) : '';
  return (
    <Ctx.Provider value={value}>
      {children}
      {st.book && chapter && !dark && (
        <div className="aw-bar" role="region" aria-label={t('awPlayer')}>
          <Link href={`/audyn/${st.book.id}`} className="aw-title"><strong>{st.book.title}</strong><span>{chapter.title}</span></Link>
          <button type="button" className="aw-btn gold" aria-label={st.playing ? t('awPause') : t('awPlay')} onClick={toggle} disabled={st.loading}>{st.playing ? '❚❚' : '▶'}</button>
          <button type="button" className="aw-btn" aria-label={t('awStop')} onClick={stop}>✕</button>
        </div>
      )}
      {st.book && dark && (
        <button type="button" className="aw-dark" aria-label={t('awDarkHint')} onClick={() => setDark(false)}><span>{timerText || t('awDarkHint')}</span></button>
      )}
    </Ctx.Provider>
  );
}
