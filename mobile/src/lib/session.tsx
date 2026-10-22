// Session de l'utilisateur (jeton gardé dans le coffre sécurisé du téléphone) et langue de l'application.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import { createApi, Api, ApiError } from './api';
import { API_URL } from './config';
import { DIR, Key, Locale, pickLocale, translate } from './i18n';
import type { AppConfig, User } from './types';
import { unregisterPush } from './notifications';
import { runLogoutHooks } from './hooks';

const TOKEN_KEY = 'mejliss.token';
const LOCALE_KEY = 'mejliss.locale';

// Le coffre peut être indisponible (rare) : on ne bloque jamais l'application pour ça.
const read = async (k: string) => { try { return await SecureStore.getItemAsync(k); } catch { return null; } };
const write = async (k: string, v: string) => { try { await SecureStore.setItemAsync(k, v); } catch { /* ignoré */ } };
const remove = async (k: string) => { try { await SecureStore.deleteItemAsync(k); } catch { /* ignoré */ } };

type Session = {
  ready: boolean;
  user: User | null;
  api: Api;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  isRTL: boolean;
  /** Configuration publique du site (fonctions activées, essai gratuit, nom) ; null tant qu'elle n'est pas lue. */
  config: AppConfig | null;
  /** Une fonction est-elle activée sur le site ? (Admin → Fonctions). Vrai par défaut tant que la configuration n'est pas lue. */
  feat: (id: string) => boolean;
  /** Favoris du membre (identifiants) et bascule. */
  favs: Set<string>;
  toggleFav: (talkId: string) => Promise<void>;
  /** À mettre sur la vue racine de chaque écran : fait basculer la mise en page pour l'arabe. */
  dirStyle: { direction: 'ltr' | 'rtl' };
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [locale, setLocaleState] = useState<Locale>('fr');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const tokenRef = useRef<string | null>(null);

  // Session effacée (jeton expiré : le serveur n'accepte déjà plus rien, inutile de lui parler).
  const clear = useCallback(async () => {
    tokenRef.current = null;
    setUser(null);
    await remove(TOKEN_KEY);
  }, []);

  const api = useMemo(
    () => createApi({ baseUrl: API_URL, getToken: () => tokenRef.current, onUnauthorized: () => { void clear(); } }),
    [clear],
  );

  // Déconnexion voulue : le serveur cesse d'écrire à ce téléphone pour ce compte, puis la session est effacée.
  const logout = useCallback(async () => {
    await unregisterPush(api);
    await runLogoutHooks(); // efface les téléchargements de ce compte (22b-6)
    await clear();
  }, [api, clear]);

  // Configuration publique du site (une fois, sans jeton) : l'application suit les mêmes réglages que le site.
  useEffect(() => {
    let alive = true;
    api.get<AppConfig>('/config', undefined, false).then((c) => { if (alive) setConfig(c); }).catch(() => { /* hors connexion : valeurs par défaut */ });
    return () => { alive = false; };
  }, [api]);

  // Favoris du membre : chargés à la connexion, vidés à la déconnexion.
  useEffect(() => {
    if (!user) { setFavs(new Set()); return undefined; }
    let alive = true;
    api.get<{ id: string }[]>('/me/favorites').then((l) => { if (alive) setFavs(new Set(l.map((x) => x.id))); }).catch(() => {});
    return () => { alive = false; };
  }, [api, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFav = useCallback(async (talkId: string) => {
    const has = favs.has(talkId);
    const next = new Set(favs);
    if (has) next.delete(talkId); else next.add(talkId);
    setFavs(next); // immédiat, annulé si le serveur refuse
    try { if (has) await api.del(`/me/favorites/${talkId}`); else await api.put(`/me/favorites/${talkId}`); }
    catch { setFavs(favs); }
  }, [api, favs]);

  const feat = useCallback((id: string) => (config ? config.features[id] !== false : true), [config]);

  // Démarrage : langue enregistrée (sinon celle du téléphone), puis session enregistrée.
  useEffect(() => {
    let alive = true;
    (async () => {
      const savedLocale = await read(LOCALE_KEY);
      const l = savedLocale ? pickLocale(savedLocale) : pickLocale(getLocales()[0]?.languageCode);
      if (alive) setLocaleState(l);
      const token = await read(TOKEN_KEY);
      if (token) {
        tokenRef.current = token;
        try {
          const me = await api.get<User>('/auth/me');
          if (alive) setUser(me);
        } catch (err) {
          // 401 : le jeton est expiré, onUnauthorized a déjà déconnecté. Hors connexion : on garde le jeton pour la prochaine fois.
          if (err instanceof ApiError && err.status === 401) tokenRef.current = null;
        }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [api]);

  const finish = useCallback(async (res: { token: string; user: User }) => {
    tokenRef.current = res.token;
    await write(TOKEN_KEY, res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await finish(await api.post<{ token: string; user: User }>('/auth/login', { email: email.trim(), password }));
  }, [api, finish]);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const body: Record<string, string> = { email: email.trim(), password, locale: locale };
    if (name?.trim()) body.name = name.trim();
    await finish(await api.post<{ token: string; user: User }>('/auth/register', body));
  }, [api, finish, locale]);

  const setLocale = useCallback((l: Locale) => { setLocaleState(l); void write(LOCALE_KEY, l); }, []);
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);

  const value = useMemo<Session>(() => ({
    ready, user, api, login, register, logout, locale, setLocale, t, config, feat, favs, toggleFav,
    isRTL: DIR[locale] === 'rtl',
    dirStyle: { direction: DIR[locale] },
  }), [ready, user, api, login, register, logout, locale, setLocale, t, config, feat, favs, toggleFav]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return v;
}
