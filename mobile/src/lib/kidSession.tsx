// Session de l'espace enfant (22b-9a). Le jeton enfant (12 h) et le profil sont gardés dans le coffre sécurisé : après un redémarrage,
// l'application reste dans l'espace enfant jusqu'à ce qu'un parent saisisse le code. Le jeton est renouvelé en silence avec la session du parent
// (sans jamais ouvrir l'espace parent à l'enfant). Le jeton enfant n'est accepté par le serveur que sur les routes de l'espace enfant.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createApi, Api } from './api';
import { API_URL } from './config';
import { useSession } from './session';
import { onLogout } from './hooks';
import { KidSessionData, PING_EVERY_MS, needsRenew, parseKidSession, serializeKidSession } from './kids';
import type { KidProfile, KidTime, User } from './types';

const KEY = 'mejliss.kid';
const read = async () => { try { return await SecureStore.getItemAsync(KEY); } catch { return null; } };
const write = async (v: string) => { try { await SecureStore.setItemAsync(KEY, v); } catch { /* ignoré */ } };
const remove = async () => { try { await SecureStore.deleteItemAsync(KEY); } catch { /* ignoré */ } };

type KidCtx = {
  /** La session enfant a-t-elle été lue dans le coffre ? */
  ready: boolean;
  /** Profil et jeton de l'enfant ; null = espace parent. */
  kid: KidSessionData | null;
  /** Client de l'API avec le jeton enfant. */
  kidApi: Api;
  /** Augmente après un renouvellement du jeton : les écrans rechargent leurs données. */
  epoch: number;
  /** Temps du jour (mis à jour toutes les 30 s par le « ping » du serveur et à chaque chargement du catalogue). */
  time: KidTime | null;
  setTime: (t: KidTime) => void;
  enter: (profileId: string) => Promise<KidProfile>;
  /** Quitte l'espace enfant avec le code parental ; lève l'erreur du serveur (code refusé, essais restants, blocage). */
  exit: (code: string) => Promise<void>;
};

const Ctx = createContext<KidCtx | null>(null);

export function KidProvider({ children }: { children: React.ReactNode }) {
  const { api, user, adopt, ready: sessionReady } = useSession();
  const [ready, setReady] = useState(false);
  const [kid, setKid] = useState<KidSessionData | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [time, setTime] = useState<KidTime | null>(null);
  const ref = useRef<KidSessionData | null>(null);
  const renewing = useRef<Promise<boolean> | null>(null);

  const set = useCallback(async (s: KidSessionData | null) => {
    ref.current = s; setKid(s);
    if (s) await write(serializeKidSession(s)); else await remove();
  }, []);

  useEffect(() => {
    let alive = true;
    void read().then((raw) => { const s = parseKidSession(raw); if (alive) { ref.current = s; setKid(s); setReady(true); } });
    return () => { alive = false; };
  }, []);

  // Renouvelle le jeton enfant avec la session du parent (profil inchangé). Un seul renouvellement à la fois.
  const renew = useCallback((): Promise<boolean> => {
    const cur = ref.current;
    if (!cur) return Promise.resolve(false);
    if (renewing.current) return renewing.current;
    renewing.current = (async () => {
      try {
        const r = await api.post<{ token: string; profile: KidProfile }>(`/me/kids/profiles/${cur.profile.id}/enter`);
        await set({ token: r.token, profile: r.profile, issuedAt: Date.now() });
        setEpoch((e) => e + 1);
        return true;
      } catch { return false; } finally { renewing.current = null; }
    })();
    return renewing.current;
  }, [api, set]);

  // Jeton proche de sa fin (ou déjà expiré après une longue pause) : renouvelé dès que la session du parent est lue.
  useEffect(() => {
    if (ready && sessionReady && user && kid && needsRenew(kid)) void renew();
  }, [ready, sessionReady, user?.id, kid?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const kidApi = useMemo(() => createApi({ baseUrl: API_URL, getToken: () => ref.current?.token ?? null, onUnauthorized: () => { void renew(); } }), [renew]);

  // « Ping » : tant que l'enfant est dans l'espace et que l'application est ouverte, le serveur compte le temps passé (limite quotidienne du parent).
  useEffect(() => {
    if (!kid) { setTime(null); return undefined; }
    let alive = true;
    const ping = () => { void kidApi.post<KidTime>('/kids/ping').then((tm) => { if (alive) setTime(tm); }).catch(() => { /* hors connexion : pas de comptage */ }); };
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) { ping(); timer = setInterval(ping, PING_EVERY_MS); } };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') start(); else stop(); });
    return () => { alive = false; stop(); sub.remove(); };
  }, [kid?.profile.id, kidApi]); // eslint-disable-line react-hooks/exhaustive-deps

  const enter = useCallback(async (profileId: string) => {
    const r = await api.post<{ token: string; profile: KidProfile }>(`/me/kids/profiles/${profileId}/enter`);
    await set({ token: r.token, profile: r.profile, issuedAt: Date.now() });
    return r.profile;
  }, [api, set]);

  const exit = useCallback(async (code: string) => {
    const r = await kidApi.post<{ token: string; user: User }>('/kids/exit', { code });
    await adopt(r);
    await set(null);
  }, [kidApi, adopt, set]);

  // Le parent se déconnecte (ou la session est effacée) : l'espace enfant se ferme aussi.
  useEffect(() => onLogout(async () => { await set(null); }), [set]);

  const value = useMemo<KidCtx>(() => ({ ready, kid, kidApi, epoch, time, setTime, enter, exit }), [ready, kid, kidApi, epoch, time, enter, exit]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKid(): KidCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKid doit être utilisé dans <KidProvider>');
  return v;
}
