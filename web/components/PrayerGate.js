'use client';
// Pause de la lecture à l'heure de la prière (étape 23a) — blocage souple.
// Quand une prière commence et qu'une vidéo ou un son est en cours (ou démarre pendant la fenêtre), la lecture est mise en pause
// et un écran indique la prière. « J'ai prié » et « Continuer quand même » reprennent tout de suite ; sans choix, la pause s'achève
// toute seule à la fin de la durée réglée. Une prière n'interrompt qu'une fois.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './Providers';
import { useNow } from '../lib/usePrayer';
import { countdown, rememberDone, statusAt } from '../lib/prayerLogic';
import { fmtTime } from '../lib/prayerTimes';
import { playingMedia } from '../lib/mediaRegistry';

const DONE = 'prayerDone';
const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE)) || {}; } catch { return {}; } };
const nameKey = (id) => 'pry' + id[0].toUpperCase() + id.slice(1);

export default function PrayerGate() {
  const { prayer, t, locale } = useApp();
  const active = prayer.on && prayer.ready && prayer.prefs.enabled && prayer.items.length > 0;
  const now = useNow(1000, active);
  const [blocked, setBlocked] = useState(null); // clé de la prière qui a interrompu la lecture
  const [done, setDone] = useState({});
  const paused = useRef([]); // médias mis en pause par nous, à reprendre
  const btn = useRef(null);

  useEffect(() => { setDone(readDone()); }, []);

  const st = active && now != null ? statusAt(prayer.items, now, prayer.prefs) : { current: null, next: null };
  const cur = st.current;

  // Chaque seconde : si la fenêtre est ouverte, pas encore traitée, et qu'une lecture est en cours → pause + écran.
  useEffect(() => {
    if (!cur || done[cur.key] || blocked === cur.key) return;
    const playing = playingMedia();
    if (!playing.length) return;
    playing.forEach((m) => { try { m.pause(); } catch { /* lecteur indisponible */ } });
    paused.current = playing;
    setBlocked(cur.key);
  }, [now, cur, done, blocked]);

  const visible = Boolean(cur && blocked === cur.key && !done[cur.key]);
  useEffect(() => { if (visible) btn.current?.focus(); }, [visible]);

  const finish = (resume) => {
    const next = rememberDone(done, cur.key, Date.now());
    setDone(next);
    try { localStorage.setItem(DONE, JSON.stringify(next)); } catch { /* sans mémoire : on ne redemandera pas pendant cette visite */ }
    if (resume) paused.current.forEach((m) => { try { m.play(); } catch { /* lecture refusée : la personne relancera */ } });
    paused.current = [];
    setBlocked(null);
  };

  // Échap = « Continuer » (jamais de piège au clavier).
  useEffect(() => {
    if (!visible) return undefined;
    const esc = (e) => { if (e.key === 'Escape') finish(true); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  });

  if (!visible || typeof document === 'undefined') return null;
  const name = t(nameKey(cur.id));
  return createPortal(
    <div className="pry-backdrop">
      <div className="pry-card" role="alertdialog" aria-modal="true" aria-labelledby="pry-t" aria-describedby="pry-d">
        <svg className="pry-moon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" /></svg>
        <p className="pry-eyebrow">{t('pryNow')}</p>
        <h2 id="pry-t" className="pry-big">{name}</h2>
        <p className="pry-sub" dir="ltr">{fmtTime(cur.at, prayer.prefs.loc.tz, locale)}</p>
        <p id="pry-d" className="pry-help">{t('pryHelp').replace('{n}', String(prayer.prefs.blockMinutes))}</p>
        <p className="pry-left" role="timer" dir="ltr">{t('pryRemaining').replace('{time}', countdown(cur.endsAt - now))}</p>
        <div className="pry-buttons">
          <button type="button" className="btn" ref={btn} onClick={() => finish(true)}>{t('pryPrayed')}</button>
          <button type="button" className="btn ghost" onClick={() => finish(true)}>{t('pryContinue')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
