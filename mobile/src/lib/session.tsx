// Session de l'utilisateur (jeton gardé dans le coffre sécurisé du téléphone) et langue de l'application.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import { createApi, Api, ApiError } from './api';
import { API_URL } from './config';
import { MENUS_PATH, parseMenus, type AppMenus } from './menus';
import { DIR, Key, Locale, pickLocale, translate } from './i18n';
import type { AppConfig, User } from './types';
import { unregisterPush } from './notifications';
import { readLogin, type LoginResponse } from './twoFactor';
import { runLogoutHooks } from './hooks';
import { applySkin, currentSkin, pickSkin, type Skin } from './theme';
import { setCarSession } from '../../modules/audyn-car';

const TOKEN_KEY = 'mejliss.token';
const LOCALE_KEY = 'mejliss.locale';
const SKIN_KEY = 'mejliss.skin'; // dernier thème reçu du site (appliqué dès le démarrage, même hors connexion)
const SKIN_PICK_KEY = 'mejliss.skinPick'; // choix du membre, seulement si l'administrateur l'autorise

// Le coffre peut être indisponible (rare) : on ne bloque jamais l'application pour ça.
const read = async (k: string) => { try { return await SecureStore.getItemAsync(k); } catch { return null; } };
const write = async (k: string, v: string) => { try { await SecureStore.setItemAsync(k, v); } catch { /* ignoré */ } };
const remove = async (k: string) => { try { await SecureStore.deleteItemAsync(k); } catch { /* ignoré */ } };

type Session = {
  ready: boolean;
  user: User | null;
  api: Api;
  /** Renvoie un défi si le compte a la double authentification (à compléter avec verifyTwoFactor), sinon null (connecté). */
  login: (email: string, password: string) => Promise<{ challenge: string } | null>;
  verifyTwoFactor: (challenge: string, code: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Adopte un jeton de parent renvoyé par le serveur (sortie de l'espace enfant). */
  adopt: (res: { token: string; user: User }) => Promise<void>;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  isRTL: boolean;
  /** Configuration publique du site (fonctions activées, essai gratuit, nom) ; null tant qu'elle n'est pas lue. */
  config: AppConfig | null;
  /** Menus de l'application créés dans Admin → Menus (menu ☰, onglets) ; null = menus d'origine. */
  menus: AppMenus | null;
  /** Une fonction est-elle activée sur le site ? (Admin → Fonctions). Vrai par défaut tant que la configuration n'est pas lue. */
  feat: (id: string) => boolean;
  /** Favoris du membre (identifiants) et bascule. */
  favs: Set<string>;
  toggleFav: (talkId: string) => Promise<void>;
  /** « À regarder plus tard » (identifiants) et bascule ; renvoie 'added' | 'removed' | 'full' | 'error'. */
  later: Set<string>;
  toggleLater: (talkId: string) => Promise<'added' | 'removed' | 'full' | 'error'>;
  /** Thème visuel en cours (réglage de l'administrateur) ; changer de thème redessine toute l'application. */
  skin: Skin;
  /** Le site laisse-t-il chaque visiteur choisir son thème ? */
  skinChoice: boolean;
  /** Choix du membre (null : celui de l'administrateur). Sans effet si skinChoice est faux. */
  setSkinPick: (s: Skin | null) => void;
  skinPick: Skin | null;
  /** Modifie le profil gardé en mémoire (ex. onboarded: true après « Par quoi commencer ? »). */
  patchUser: (p: Partial<User>) => void;
  /** À mettre sur la vue racine de chaque écran : fait basculer la mise en page pour l'arabe. */
  dirStyle: { direction: 'ltr' | 'rtl' };
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [locale, setLocaleState] = useState<Locale>('fr');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [menus, setMenus] = useState<AppMenus | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [later, setLater] = useState<Set<string>>(new Set());
  const [skin, setSkin] = useState<Skin>(currentSkin());
  const [skinPick, setSkinPickState] = useState<Skin | null>(null);
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
    // Projet Menus : menus de l'application affectés dans Admin → Menus. Sans réponse (hors connexion, fonction coupée) : menus d'origine.
    api.get<unknown>(MENUS_PATH, undefined, false).then((d) => { if (alive) setMenus(parseMenus(d)); }).catch(() => { /* menus d'origine */ });
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

  // « À regarder plus tard » : identifiants chargés à la connexion (si la fonction est activée), vidés à la déconnexion.
  const laterOn = config ? config.features.watchlater !== false : true;
  useEffect(() => {
    if (!user || !laterOn) { setLater(new Set()); return undefined; }
    let alive = true;
    api.get<string[]>('/me/watchlater/ids').then((r) => { if (alive) setLater(new Set(Array.isArray(r) ? r : [])); }).catch(() => {});
    return () => { alive = false; };
  }, [api, user?.id, laterOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLater = useCallback(async (talkId: string) => {
    const has = later.has(talkId);
    const next = new Set(later);
    if (has) next.delete(talkId); else next.add(talkId);
    setLater(next);
    try {
      if (has) await api.del(`/me/watchlater/${talkId}`); else await api.put(`/me/watchlater/${talkId}`);
      return has ? 'removed' : 'added';
    } catch (err) {
      setLater(later);
      return err instanceof ApiError && err.code === 'full' ? 'full' : 'error';
    }
  }, [api, later]);

  // Thème : celui de l'administrateur (/config), ou le choix du membre si le site l'autorise.
  const skinChoice = config?.skin?.choice === true;
  useEffect(() => {
    if (!config) return;
    const def = pickSkin(config.skin?.def);
    const want = skinChoice && skinPick ? skinPick : def;
    void write(SKIN_KEY, def);
    if (applySkin(want)) setSkin(want);
  }, [config, skinChoice, skinPick]);
  const setSkinPick = useCallback((v: Skin | null) => {
    setSkinPickState(v);
    if (v) void write(SKIN_PICK_KEY, v); else void remove(SKIN_PICK_KEY);
  }, []);

  const feat = useCallback((id: string) => (config ? config.features[id] !== false : true), [config]);

  // Démarrage : langue enregistrée (sinon celle du téléphone), puis session enregistrée.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Thème mémorisé : appliqué avant le premier affichage (pas d'éclair de l'autre thème).
      const [savedSkin, savedPick] = await Promise.all([read(SKIN_KEY), read(SKIN_PICK_KEY)]);
      if (savedPick) setSkinPickState(pickSkin(savedPick));
      const first = savedPick ? pickSkin(savedPick) : pickSkin(savedSkin);
      if (applySkin(first) && alive) setSkin(first);
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

  // Android Auto (Audyn dans la voiture) : même compte et même langue que l'application ; déconnexion = visiteur (aperçus).
  useEffect(() => {
    if (ready) setCarSession(API_URL, tokenRef.current, locale);
  }, [ready, user, locale]);

  const finish = useCallback(async (res: { token: string; user: User }) => {
    tokenRef.current = res.token;
    await write(TOKEN_KEY, res.token);
    setUser(res.user);
    // Profil complet (dont « onboarded », absent de la réponse d'inscription) : relu en arrière-plan (étape M6).
    api.get<User>('/auth/me').then((me) => { if (tokenRef.current === res.token) setUser(me); }).catch(() => {});
  }, [api]);
  const patchUser = useCallback((p: Partial<User>) => setUser((u) => (u ? { ...u, ...p } : u)), []);

  const login = useCallback(async (email: string, password: string) => {
    const out = readLogin(await api.post<LoginResponse>('/auth/login', { email: email.trim(), password }));
    if (out.kind === 'challenge') return { challenge: out.challenge };
    await finish({ token: out.token, user: out.user });
    return null;
  }, [api, finish]);

  const verifyTwoFactor = useCallback(async (challenge: string, code: string) => {
    await finish(await api.post<{ token: string; user: User }>('/auth/2fa/verify', { challenge, code: code.trim() }));
  }, [api, finish]);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const body: Record<string, string> = { email: email.trim(), password, locale: locale };
    if (name?.trim()) body.name = name.trim();
    await finish(await api.post<{ token: string; user: User }>('/auth/register', body));
  }, [api, finish, locale]);

  const setLocale = useCallback((l: Locale) => { setLocaleState(l); void write(LOCALE_KEY, l); }, []);
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);

  const value = useMemo<Session>(() => ({
    ready, user, api, login, verifyTwoFactor, register, logout, adopt: finish, locale, setLocale, t, config, menus, feat, favs, toggleFav,
    later, toggleLater, skin, skinChoice, skinPick, setSkinPick, patchUser,
    isRTL: DIR[locale] === 'rtl',
    dirStyle: { direction: DIR[locale] },
  }), [ready, user, api, login, verifyTwoFactor, register, logout, finish, locale, setLocale, t, config, menus, feat, favs, toggleFav, later, toggleLater, skin, skinChoice, skinPick, setSkinPick, patchUser]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return v;
}
