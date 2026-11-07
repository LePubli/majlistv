// Lecteur Audyn GLOBAL (monté à la racine) : le livre audio continue écran éteint ou en changeant de page, avec les commandes
// sur l'écran verrouillé / la notification. Reprise là où l'on s'est arrêté (gardée sur le téléphone), minuteur de sommeil avec
// fondu du volume, vitesse, saut de 15 s. Un seul lecteur pour toute l'application : les écrans ne font que le piloter.
// Le même moteur servira aux histoires du soir de l'espace Kids (étape 4).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import * as SecureStore from 'expo-secure-store';
import { useSession } from '@/lib/session';
import { useQuranPlayer } from '@/lib/quranPlayer';
import { absoluteUrl } from '@/lib/api';
import { API_URL } from '@/lib/config';
import {
  NO_TIMER, decodeResume, encodeResume, nextPlayable, nextSpeed, prevPlayable, resumeKey, resumePoint, seekTarget, shouldSaveResume,
  sleepTick, startSleep, type AudynChapter, type AudynDetail, type PlayInfo, type SleepTimer,
} from '@/lib/audyn';

export type AudynState = {
  book: AudynDetail | null;
  index: number;                 // chapitre courant
  playing: boolean;
  loading: boolean;
  pos: number;                   // secondes
  dur: number;
  speed: number;
  timer: SleepTimer;
  timerLeftMs: number | null;
  preview: boolean;              // lecture de l'aperçu (limité par le serveur)
  previewEnded: boolean;
  err: boolean;
};
type Ctx = AudynState & {
  chapter: AudynChapter | null;
  open: (book: AudynDetail, index?: number, pos?: number) => Promise<void>;
  openResume: (book: AudynDetail) => Promise<void>;
  toggle: () => void;
  skip: (delta: number) => void;
  seekTo: (sec: number) => void;
  next: () => void;
  prev: () => void;
  cycleSpeed: () => void;
  setSleep: (minutes: number | null) => void;
  stop: () => void;
  savedFor: (itemId: string) => Promise<{ index: number; pos: number } | null>;
};

const EMPTY: AudynState = {
  book: null, index: 0, playing: false, loading: false, pos: 0, dur: 0, speed: 1, timer: NO_TIMER, timerLeftMs: null,
  preview: false, previewEnded: false, err: false,
};
const noop = () => {};
const PlayerCtx = createContext<Ctx>({
  ...EMPTY, chapter: null, open: async () => {}, openResume: async () => {}, toggle: noop, skip: noop, seekTo: noop, next: noop, prev: noop,
  cycleSpeed: noop, setSleep: noop, stop: noop, savedFor: async () => null,
});
export const useAudyn = () => useContext(PlayerCtx);

const URL_LIFETIME_MS = 50 * 60 * 1000; // les liens d'écoute durent 1 h : on les renouvelle avant

export function AudynPlayerProvider({ children }: { children: React.ReactNode }) {
  const { api } = useSession();
  const quran = useQuranPlayer();
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 1;
    p.preservesPitch = true;
  });
  const [st, setSt] = useState<AudynState>(EMPTY);
  const stRef = useRef(st); stRef.current = st;
  const patch = useCallback((p: Partial<AudynState>) => { stRef.current = { ...stRef.current, ...p }; setSt(stRef.current); }, []);

  const loaded = useRef<{ cid: string; at: number } | null>(null); // chapitre chargé dans le lecteur (et quand)
  const token = useRef(0);
  const retries = useRef(0);
  const lastSaved = useRef(NaN);
  const limit = useRef(0); // aperçu : durée écoutable (le fichier reçu est coupé mais sa durée annoncée reste celle du livre)
  const capDur = (d: number) => (limit.current > 0 ? Math.min(d, limit.current) : d);

  const save = useCallback((pos: number) => {
    const s = stRef.current; const ch = s.book?.chapters[s.index];
    if (!s.book || !ch || s.preview) return;
    lastSaved.current = pos;
    SecureStore.setItemAsync(resumeKey(s.book.id), encodeResume({ cid: ch.id, pos, at: Date.now() })).catch(() => {});
  }, []);

  const savedFor = useCallback(async (itemId: string) => {
    try { return decodeResume(await SecureStore.getItemAsync(resumeKey(itemId))) as never; } catch { return null; }
  }, []);

  // Charge un chapitre (lien signé ou aperçu), se place à `pos`, lit si `play`.
  const load = useCallback(async (book: AudynDetail, index: number, pos: number, play: boolean) => {
    const ch = book.chapters[index];
    if (!ch) return;
    const my = ++token.current;
    patch({ book, index, loading: true, err: false, previewEnded: false, pos, dur: ch.durationSeconds });
    try {
      const info = await api.get<PlayInfo>(`/audyn/${book.id}/chapters/${ch.id}/play`);
      if (my !== token.current) return;
      const uri = absoluteUrl(API_URL, info.url);
      limit.current = info.preview ? Number(info.limitSeconds) || 0 : 0;
      await player.replaceAsync({ uri, metadata: { title: ch.title || book.title, artist: book.narrator || book.author || book.title, artwork: book.coverUrl ?? undefined } });
      if (my !== token.current) return;
      loaded.current = { cid: ch.id, at: Date.now() };
      player.volume = 1;
      player.playbackRate = stRef.current.speed;
      if (pos > 0) player.currentTime = pos;
      patch({ loading: false, preview: info.preview, pos });
      if (play) player.play();
    } catch {
      if (my !== token.current) return;
      if (retries.current < 2) { retries.current += 1; setTimeout(() => { if (my === token.current) void load(book, index, stRef.current.pos, play); }, 1500 * retries.current); return; }
      retries.current = 0;
      patch({ loading: false, err: true, playing: false });
    }
  }, [api, player, patch]);

  const open = useCallback(async (book: AudynDetail, index = 0, pos = 0) => {
    quran.stop();
    retries.current = 0; lastSaved.current = NaN;
    patch({ timer: NO_TIMER, timerLeftMs: null });
    await load(book, index, pos, true);
  }, [load, patch, quran]);

  const openResume = useCallback(async (book: AudynDetail) => {
    const rp = resumePoint(book.chapters, await savedFor(book.id));
    await open(book, rp.index, rp.pos);
  }, [open, savedFor]);

  const stop = useCallback(() => {
    token.current += 1; retries.current = 0;
    save(stRef.current.pos);
    try { player.pause(); player.volume = 1; } catch { /* lecteur libéré */ }
    loaded.current = null;
    stRef.current = { ...EMPTY, speed: stRef.current.speed }; setSt(stRef.current);
  }, [player, save]);

  const toggle = useCallback(() => {
    const s = stRef.current;
    if (!s.book) return;
    if (s.playing) { player.pause(); save(s.pos); return; }
    const ch = s.book.chapters[s.index];
    // Lien d'écoute périmé (pause longue) ou lecteur vidé (fin de chapitre avec minuteur) : on recharge à la position courante.
    if (!loaded.current || loaded.current.cid !== ch?.id || Date.now() - loaded.current.at > URL_LIFETIME_MS || s.previewEnded) {
      retries.current = 0; void load(s.book, s.index, s.previewEnded ? 0 : s.pos, true);
    } else { player.volume = 1; player.play(); }
  }, [player, load, save]);

  const seekTo = useCallback((sec: number) => {
    const s = stRef.current;
    if (!s.book || !loaded.current) return;
    const t = seekTarget(0, sec, s.dur);
    player.currentTime = t; patch({ pos: t }); save(t);
  }, [player, patch, save]);
  const skip = useCallback((delta: number) => { seekTo(seekTarget(stRef.current.pos, delta, stRef.current.dur)); }, [seekTo]);

  const goTo = useCallback((i: number) => {
    const s = stRef.current;
    if (!s.book || i < 0) return;
    retries.current = 0; void load(s.book, i, 0, true);
  }, [load]);
  const next = useCallback(() => { const s = stRef.current; if (s.book) goTo(nextPlayable(s.book.chapters, s.index)); }, [goTo]);
  const prev = useCallback(() => {
    const s = stRef.current;
    if (!s.book) return;
    if (s.pos > 5) { seekTo(0); return; } // comme un lecteur audio : d'abord le début du chapitre
    goTo(prevPlayable(s.book.chapters, s.index));
  }, [goTo, seekTo]);

  const cycleSpeed = useCallback(() => { const sp = nextSpeed(stRef.current.speed); player.playbackRate = sp; patch({ speed: sp }); }, [player, patch]);

  const setSleep = useCallback((minutes: number | null) => {
    if (minutes === null) { player.volume = 1; patch({ timer: NO_TIMER, timerLeftMs: null }); return; }
    const tm = startSleep(minutes, Date.now());
    patch({ timer: tm, timerLeftMs: tm.endAt ? tm.endAt - Date.now() : null });
  }, [player, patch]);

  // --- Événements du lecteur
  useEventListener(player, 'playingChange', ({ isPlaying }) => { patch({ playing: isPlaying }); if (!isPlaying) save(stRef.current.pos); });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const s = stRef.current;
    if (!s.book || !loaded.current) return;
    const d = capDur(player.duration > 0 ? player.duration : s.dur);
    patch({ pos: currentTime, dur: d });
    if (s.playing && shouldSaveResume(lastSaved.current, currentTime)) save(currentTime);
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    const s = stRef.current;
    if (status === 'error' && s.book && !s.loading) {
      if (retries.current < 2) { retries.current += 1; void load(s.book, s.index, s.pos, true); } else { retries.current = 0; patch({ err: true, playing: false }); }
    }
  });
  useEventListener(player, 'playToEnd', () => {
    const s = stRef.current;
    if (!s.book) return;
    if (s.preview) { loaded.current = null; patch({ playing: false, previewEnded: true, pos: 0 }); return; } // fin de l'aperçu : abonnement nécessaire
    const n = nextPlayable(s.book.chapters, s.index);
    if (s.timer.endOfChapter) { // minuteur « fin du chapitre » : on s'arrête, la prochaine lecture reprend au chapitre suivant
      player.volume = 1; loaded.current = null;
      const target = n >= 0 ? n : s.index;
      patch({ timer: NO_TIMER, timerLeftMs: null, playing: false, index: target, pos: 0 });
      SecureStore.setItemAsync(resumeKey(s.book.id), encodeResume({ cid: s.book.chapters[target].id, pos: 0, at: Date.now() })).catch(() => {});
      return;
    }
    if (n >= 0) goTo(n);
    else { // livre terminé
      loaded.current = null;
      SecureStore.setItemAsync(resumeKey(s.book.id), encodeResume({ cid: s.book.chapters[0].id, pos: 0, at: Date.now() })).catch(() => {});
      patch({ playing: false, index: 0, pos: 0 });
    }
  });

  // --- Minuteur de sommeil : un tic par seconde (volume en descente sur les 30 dernières secondes, puis pause)
  useEffect(() => {
    if (!st.timer.endAt && !st.timer.endOfChapter) return undefined;
    const h = setInterval(() => {
      const s = stRef.current;
      const rem = s.dur > 0 ? s.dur - s.pos : null;
      const tick = sleepTick(s.timer, Date.now(), rem);
      if (tick.stop) {
        try { player.pause(); player.volume = 1; } catch { /* libéré */ }
        save(s.pos);
        patch({ timer: NO_TIMER, timerLeftMs: null, playing: false });
        return;
      }
      if (s.playing) { try { player.volume = tick.volume; } catch { /* libéré */ } }
      patch({ timerLeftMs: tick.remainingMs });
    }, 1000);
    return () => clearInterval(h);
  }, [st.timer, player, patch, save]);

  // La récitation du Coran démarre : on met le livre en pause (un seul son à la fois).
  useEffect(() => { if (quran.current && stRef.current.playing) { player.pause(); } }, [quran.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const chapter = st.book ? st.book.chapters[st.index] ?? null : null;
  const value = useMemo<Ctx>(() => ({ ...st, chapter, open, openResume, toggle, skip, seekTo, next, prev, cycleSpeed, setSleep, stop, savedFor }),
    [st, chapter, open, openResume, toggle, skip, seekTo, next, prev, cycleSpeed, setSleep, stop, savedFor]);
  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}
