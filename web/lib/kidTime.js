'use client';
// Temps passé dans l'espace enfant : la page « pingue » le serveur toutes les 30 s tant qu'elle est visible (ou qu'une vidéo se lit).
// Le serveur mesure lui-même le temps écoulé ; la page ne dit jamais « j'ai passé X secondes ».
import { useEffect, useState } from 'react';

export function useKidTime(call, kid, initial) {
  const [time, setTime] = useState(initial || null);
  useEffect(() => { if (initial) setTime(initial); }, [initial]);
  useEffect(() => {
    if (!kid) return undefined;
    let stop = false;
    const ping = async () => {
      const playing = document.querySelector('video')?.paused === false;
      if (document.visibilityState !== 'visible' && !playing) return;
      const r = await call('/kids/ping', { method: 'POST' });
      if (!stop && r.ok) setTime(r.data);
    };
    ping();
    const id = setInterval(ping, 30000);
    return () => { stop = true; clearInterval(id); };
  }, [kid, call]);
  return time;
}

export const leftMin = (time) => (time && time.leftSec != null ? Math.max(1, Math.ceil(time.leftSec / 60)) : null);
