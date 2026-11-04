// Boussole du téléphone pour la Qibla. États : off · wait (en attente du capteur) · on · denied · none.
// Utilise expo-location (déjà dans l'application, donc pas de nouveau module natif) : watchHeadingAsync, autorisation de position demandée au clic.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { smoothHeading } from './prayer/prayerExtras';
import { headingOf } from './compassHeading';

export type CompassState = 'off' | 'wait' | 'on' | 'denied' | 'none';

export function useCompass() {
  const [state, setState] = useState<CompassState>('off');
  const [heading, setHeading] = useState<number | null>(null);
  const ref = useRef<{ sub: Location.LocationSubscription | null; h: number | null; timer: ReturnType<typeof setTimeout> | null; gen: number }>({ sub: null, h: null, timer: null, gen: 0 });

  const release = useCallback(() => {
    const r = ref.current;
    r.gen += 1; // une mise en route encore en cours est abandonnée
    if (r.sub) { try { r.sub.remove(); } catch { /* déjà arrêté */ } r.sub = null; }
    if (r.timer) { clearTimeout(r.timer); r.timer = null; }
    r.h = null;
  }, []);
  const stop = useCallback(() => { release(); setHeading(null); setState('off'); }, [release]);
  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    release();
    const gen = ref.current.gen;
    setState('wait');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (gen !== ref.current.gen) return;
      if (perm.status !== 'granted') { setState('denied'); return; }
      const sub = await Location.watchHeadingAsync((s) => {
        const h = headingOf(s);
        if (h == null) return;
        ref.current.h = smoothHeading(ref.current.h, h);
        setHeading(ref.current.h);
        setState('on');
        if (ref.current.timer) { clearTimeout(ref.current.timer); ref.current.timer = null; }
      });
      if (gen !== ref.current.gen) { sub.remove(); return; }
      ref.current.sub = sub;
      // Aucune mesure au bout de 2,5 s : pas de capteur sur cet appareil.
      ref.current.timer = setTimeout(() => { if (ref.current.h == null) { release(); setState('none'); } }, 2500);
    } catch {
      if (gen === ref.current.gen) setState('none');
    }
  }, [release]);

  return { state, heading, start, stop };
}
