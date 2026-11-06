// Lecteur de récitation GLOBAL (monté à la racine de l'application) : la récitation continue quand on change de page
// ou que le téléphone se verrouille, avec les commandes sur l'écran verrouillé / la notification (pause, lecture).
// Un seul lecteur pour toute l'application : l'écran d'une sourate ne fait que le piloter.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { MAX_RETRY, afterError, followingAya, nowPlayingTitle, retryDelay } from '@/lib/quranQueue';

export type QuranTrack = {
  sura: number;
  aya: number;
  ayas: number[];                       // numéros des versets de la sourate (pour enchaîner)
  urlOf: (aya: number) => string | null; // adresse du fichier d'un verset
  chain: boolean;
  suraName: string;
  verseWord: string;
  artist: string;                        // nom du récitateur
};

type State = { sura: number; aya: number } | null;
type Ctx = {
  current: State;
  err: boolean;
  start: (t: QuranTrack) => void;
  stop: () => void;
  clearErr: () => void;
  title: string;
};

const PlayerCtx = createContext<Ctx>({ current: null, err: false, start: () => {}, stop: () => {}, clearErr: () => {}, title: '' });
export const useQuranPlayer = () => useContext(PlayerCtx);

export function QuranPlayerProvider({ children }: { children: React.ReactNode }) {
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;     // continue en arrière-plan / écran verrouillé
    p.showNowPlayingNotification = true;  // notification (Android) / écran verrouillé (iPhone) avec pause/lecture
  });
  const [current, setCurrent] = useState<State>(null);
  const [err, setErr] = useState(false);
  const [title, setTitle] = useState('');
  const track = useRef<QuranTrack | null>(null);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef(0); // invalide les chargements devenus inutiles (arrêt, nouveau verset)

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const load = useCallback(async (aya: number) => {
    const tr = track.current;
    if (!tr) return;
    const url = tr.urlOf(aya);
    if (!url) { setErr(true); setCurrent(null); track.current = null; return; }
    const my = ++token.current;
    const label = nowPlayingTitle(tr.suraName, aya, tr.verseWord);
    track.current = { ...tr, aya };
    setCurrent({ sura: tr.sura, aya }); setTitle(label);
    try {
      await player.replaceAsync({ uri: url, metadata: { title: label, artist: tr.artist } });
      if (my !== token.current) return; // un autre verset a été demandé entre-temps
      player.play();
    } catch {
      if (my !== token.current) return;
      fail(aya);
    }
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

  // Échec d'un verset : on retente (réseau, source qui limite), puis on affiche l'erreur.
  function fail(aya: number) {
    if (timer.current) return; // une nouvelle tentative est déjà programmée (erreur signalée deux fois)
    if (afterError(retries.current) === 'retry') {
      const wait = retryDelay(retries.current);
      retries.current += 1;
      clearTimer();
      timer.current = setTimeout(() => { timer.current = null; if (track.current && track.current.aya === aya) void load(aya); }, wait);
      return;
    }
    retries.current = 0;
    track.current = null; token.current += 1;
    setErr(true); setCurrent(null); setTitle('');
  }

  const start = useCallback((t: QuranTrack) => {
    clearTimer(); retries.current = 0; setErr(false);
    track.current = t;
    void load(t.aya);
  }, [load]);

  const stop = useCallback(() => {
    clearTimer(); token.current += 1; retries.current = 0;
    track.current = null;
    try { player.pause(); } catch { /* lecteur libéré */ }
    setCurrent(null); setTitle('');
  }, [player]);

  useEventListener(player, 'playToEnd', () => {
    const tr = track.current;
    if (!tr) return;
    retries.current = 0;
    const next = followingAya(tr.ayas, tr.aya, tr.chain);
    if (next) void load(next); else { track.current = null; setCurrent(null); setTitle(''); }
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    const tr = track.current;
    if (status === 'error' && tr) fail(tr.aya);
  });

  useEffect(() => () => { clearTimer(); }, []);

  const value = useMemo<Ctx>(() => ({ current, err, start, stop, clearErr: () => setErr(false), title }), [current, err, start, stop, title]);
  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export { MAX_RETRY };
