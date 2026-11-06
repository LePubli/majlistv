'use client';
// Adhan à l'heure de la prière quand le site est ouvert (si le visiteur l'a choisi dans Prière → Réglages).
// Un site fermé ne peut pas sonner : pour cela, l'application. Notification du navigateur en plus si elle est autorisée.
import { useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { useNow } from '../lib/usePrayer';
import { ADHAN_DONE_KEY, ADHAN_KEY, adhanUrl, dueAdhan, pickAdhan, readAdhanPrefs } from '../lib/adhanWeb';

const readDone = () => { try { return JSON.parse(localStorage.getItem(ADHAN_DONE_KEY)) || {}; } catch { return {}; } };
const nameKey = (id) => 'pry' + id[0].toUpperCase() + id.slice(1);

export default function AdhanPlayer() {
  const { prayer, t } = useApp();
  const [on, setOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = useRef(null);
  // Réglage relu à chaque changement (le sélecteur des réglages émet « adhan-prefs »).
  useEffect(() => {
    const read = () => { try { setOn(readAdhanPrefs(localStorage.getItem(ADHAN_KEY)).mode === 'adhan'); } catch { setOn(false); } };
    read(); window.addEventListener('adhan-prefs', read); window.addEventListener('storage', read);
    return () => { window.removeEventListener('adhan-prefs', read); window.removeEventListener('storage', read); };
  }, []);
  const active = on && prayer.on && prayer.ready && prayer.items.length > 0;
  const now = useNow(1000, active);

  useEffect(() => {
    if (!active || now == null) return;
    const done = readDone();
    const due = dueAdhan(prayer.items, now, prayer.prefs.prayers, done);
    if (!due) return;
    try { localStorage.setItem(ADHAN_DONE_KEY, JSON.stringify({ [due.key]: now })); } catch { /* sans mémoire : une seule tentative par chargement grâce à la garde ci-dessous */ }
    const a = new Audio(adhanUrl(pickAdhan(readAdhanPrefs(localStorage.getItem(ADHAN_KEY)).id)));
    audio.current = a;
    a.addEventListener('ended', () => setPlaying(false));
    a.play().then(() => setPlaying(true)).catch(() => { /* lecture refusée par le navigateur (aucune interaction avec la page) : la notification reste */ });
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(t('pryNow'), { body: t(nameKey(due.id)), icon: '/icon-192.png', tag: due.key });
    } catch { /* notifications indisponibles */ }
  }, [now, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => { const a = audio.current; if (a) { a.pause(); a.removeAttribute('src'); } setPlaying(false); };
  if (!playing) return null;
  return (
    <div className="qpl-bar" role="region" aria-label={t('adhTitle')}>
      <span className="qpl-title">{t('adhPlaying')}</span>
      <button type="button" className="qpl-stop" aria-label={t('adhStop')} onClick={stop}>■</button>
    </div>
  );
}
