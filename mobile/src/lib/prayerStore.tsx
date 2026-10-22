// État de la fonction Prière dans l'application (étape 22b-4) : réglages, horaires calculés, rappel sur le téléphone, prières déjà traitées.
// Mêmes réglages que le site : sur le compte (GET/PUT /me/prayer) quand on est connecté, sur le téléphone sinon.
// Le calcul vient du site (src/lib/prayer/, copie de web/lib) : mêmes horaires, mêmes limites.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useSession } from './session';
import { buildSchedule, resolvePrefs, storable, rememberDone } from './prayer/prayerLogic';
import { civilDate } from './prayer/prayerTimes';
import { configureNotifications, notificationPermission, registerPush, syncPrayerNotifications } from './notifications';

type Prefs = ReturnType<typeof resolvePrefs>;
type Items = ReturnType<typeof buildSchedule>;
type Stored = Partial<ReturnType<typeof storable>> | null;
export type PrayerCfg = { defaultEnabled?: boolean; pill?: boolean; method?: string; asr?: string; blockMinutes?: number; maxBlockMinutes?: number; city?: string };

const K_PREFS = 'mejliss.prayerPrefs';
const K_NOTIFY = 'mejliss.prayerNotify';
const K_DONE = 'mejliss.prayerDone';
const K_ASKED = 'mejliss.notifAsked';
const get = async (k: string) => { try { return await SecureStore.getItemAsync(k); } catch { return null; } };
const put = async (k: string, v: string) => { try { await SecureStore.setItemAsync(k, v); } catch { /* coffre indisponible : réglage gardé en mémoire */ } };
const parse = <T,>(s: string | null, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

type PrayerCtx = {
  /** Fonction activée sur le serveur (Admin → Fonctions → Prière) ET configuration reçue. */
  on: boolean;
  ready: boolean;
  prefs: Prefs;
  cfg: PrayerCfg | null;
  /** Horaires d'hier, d'aujourd'hui et de demain (inclut « sunrise »). */
  items: Items;
  save: (patch: Record<string, unknown>) => Promise<void>;
  /** Position du téléphone (autorisation demandée à ce moment-là seulement). */
  locate: () => Promise<{ ok: boolean }>;
  /** Rappel de prière sur le téléphone (réglage propre à cet appareil). */
  notify: boolean;
  setNotify: (v: boolean) => Promise<void>;
  /** Prières déjà traitées (« J'ai prié » / « Continuer » / fin de la pause) : { clé: instant }. */
  done: Record<string, number>;
  markDone: (key: string) => void;
  deviceTz: string;
};
const Ctx = createContext<PrayerCtx | null>(null);

export function PrayerProvider({ children }: { children: React.ReactNode }) {
  const { api, user, config, feat, locale, ready: sessionReady } = useSession();
  const cfg = ((config as unknown as { prayer?: PrayerCfg | null })?.prayer ?? null) as PrayerCfg | null;
  const on = Boolean(cfg && feat('prayer'));
  const deviceTz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch { return 'Europe/Paris'; } }, []);
  const [stored, setStored] = useState<Stored>(null);
  const [notify, setNotifyState] = useState(true);
  const [done, setDone] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [dayKey, setDayKey] = useState('');

  // Réglages gardés sur le téléphone : lus tout de suite.
  useEffect(() => {
    (async () => {
      setStored(parse<Stored>(await get(K_PREFS), null));
      setNotifyState((await get(K_NOTIFY)) !== '0'); // activé par défaut
      setDone(parse(await get(K_DONE), {}));
      setLoaded(true);
    })();
  }, []);

  // Compte connecté : les réglages du compte font foi ; s'il n'en a pas, ceux du téléphone y sont envoyés une fois.
  useEffect(() => {
    if (!on || !user || !loaded) return undefined;
    let alive = true;
    api.get<{ prefs: Stored }>('/me/prayer').then(async (r) => {
      if (!alive) return;
      if (r.prefs) { setStored(r.prefs); await put(K_PREFS, JSON.stringify(r.prefs)); }
      else if (stored) await api.put('/me/prayer', { prefs: storable(resolvePrefs(stored, cfg, deviceTz)) }).catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [on, user?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const prefs = useMemo(() => resolvePrefs(stored, cfg, deviceTz), [stored, cfg, deviceTz]);

  // Le jour change : horaires recalculés (vérification toutes les 30 s ; un seul rendu par jour).
  useEffect(() => {
    if (!on || !loaded) return undefined;
    const tick = () => { const c = civilDate(Date.now(), prefs.loc.tz); setDayKey(`${c.y}-${c.m}-${c.d}`); };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [on, loaded, prefs.loc.tz]);

  const items = useMemo<Items>(() => (on && loaded && dayKey ? buildSchedule(Date.now(), prefs) : []), [on, loaded, dayKey, prefs]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    const next = storable(resolvePrefs({ ...storable(prefs), ...patch }, cfg, deviceTz));
    setStored(next);
    await put(K_PREFS, JSON.stringify(next));
    if (user) await api.put('/me/prayer', { prefs: next }).catch(() => {});
  }, [prefs, cfg, deviceTz, user, api]);

  const locate = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return { ok: false };
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      await save({ loc: { mode: 'geo', lat: pos.coords.latitude, lon: pos.coords.longitude, tz: deviceTz, name: '' } });
      return { ok: true };
    } catch { return { ok: false }; }
  }, [save, deviceTz]);

  const setNotify = useCallback(async (v: boolean) => {
    setNotifyState(v);
    await put(K_NOTIFY, v ? '1' : '0');
    if (v) await notificationPermission(true); // la demande n'apparaît que si le système l'autorise encore
  }, []);

  const markDone = useCallback((key: string) => {
    setDone((d) => { const n = rememberDone(d, key, Date.now()); void put(K_DONE, JSON.stringify(n)); return n; });
  }, []);

  // Rappels sur le téléphone : reprogrammés à chaque changement de réglage ou de langue, et à chaque retour dans l'application.
  const syncRef = useRef({ on, notify, prefs, locale });
  syncRef.current = { on, notify, prefs, locale };
  const resync = useCallback(() => {
    const s = syncRef.current;
    void syncPrayerNotifications({ enabled: s.on && s.notify, prefs: s.prefs, locale: s.locale });
  }, []);
  useEffect(() => { if (loaded && sessionReady) resync(); }, [loaded, sessionReady, on, notify, prefs, locale, resync]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') resync(); });
    return () => sub.remove();
  }, [resync]);

  // Première ouverture : on demande l'autorisation des notifications (une seule fois), puis le téléphone s'annonce au serveur.
  useEffect(() => {
    void configureNotifications();
  }, []);
  useEffect(() => {
    if (!sessionReady || !loaded) return;
    (async () => {
      if (!(await get(K_ASKED))) { await put(K_ASKED, '1'); await notificationPermission(true); resync(); }
      if (user) await registerPush(api, locale);
    })();
  }, [sessionReady, loaded, user?.id, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<PrayerCtx>(() => ({ on, ready: loaded, prefs, cfg, items, save, locate, notify, setNotify, done, markDone, deviceTz }),
    [on, loaded, prefs, cfg, items, save, locate, notify, setNotify, done, markDone, deviceTz]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrayer(): PrayerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrayer doit être utilisé dans <PrayerProvider>');
  return v;
}
