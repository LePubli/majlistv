'use client';
// Contexte global : textes (i18n), session utilisateur (token en localStorage) et appels API.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePrayerState } from '../lib/usePrayer';

const Ctx = createContext(null);
// Un jeton « espace enfant » (Mejliss Kids) porte l'identifiant du profil ; le serveur le refuse hors de l'espace enfant.
const kidIdOf = (tk) => { try { return JSON.parse(atob(tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).kid || null; } catch { return null; } };
export const useApp = () => useContext(Ctx);

// Réglages d'affichage des vignettes si l'API ne les fournit pas (valeurs par défaut).
const DEFAULT_CARDS = { hover: true, preview: true, previewDelay: 1500, previewSeconds: 20,
  show: { access: true, duration: true, speaker: true, category: true, language: true, description: true, favorite: true, progress: true } };

export default function Providers({ locale, dict, appName, trialDays = 0, prayerCfg = null, cards = null, hasSeries = false, hasBooks = false, statsOn = true, features = {}, modules = {}, layout = null, children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [kid, setKid] = useState(null); // profil enfant actif (espace Kids) : { id, name, avatar, band }
  const router = useRouter();
  const path = usePathname();
  const [viewAs, setViewAs] = useState(null); // aperçu de l'éditeur : 'visitor' = voir le site comme un visiteur non connecté
  const [layoutPreview, setLayoutPreview] = useState(null); // aperçu de l'éditeur (Admin → Pages) : remplace les réglages publiés
  const [prefs, setPrefs] = useState(null); // préférences du compte : langue des sous-titres, thèmes
  const [formats, setFormats] = useState([]); // liste des formats (conférence, cours…) : nom selon la langue, pour les badges et le catalogue
  const [cats, setCats] = useState([]); // catégories principales (menu latéral et tiroir du téléphone)
  const [favs, setFavs] = useState(() => new Set()); // identifiants des conférences en favoris (vignettes)
  const [blockEdits, setBlockEdits] = useState({}); // mode édition sur la page : blocs modifiés (id → bloc), vus tout de suite par l'administrateur
  const [textPatch, setTextPatch] = useState({});   // mode édition sur la page : textes modifiés (clé → texte), pour la langue courante
  const t = (key) => textPatch[key] || dict[key] || key;

  // Appel de l'API via le proxy same-origin /api (pas de CORS).
  const call = useCallback(async (path, opts = {}, tk = token) => {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(tk ? { Authorization: 'Bearer ' + tk } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }, [token]);

  // Au chargement : restaure la session si un token valide est stocké.
  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) { setReady(true); return; }
    if (kidIdOf(tk)) { // session enfant : on ne charge que le profil
      fetch('/api/kids/me', { headers: { Authorization: 'Bearer ' + tk } })
        .then((r) => { if (r.ok) return r.json(); if (r.status === 401 || r.status === 403) localStorage.removeItem('token'); return null; }) // erreur passagère : on garde le jeton
        .then((p) => { if (p) { setToken(tk); setKid(p); } })
        .catch(() => {}).finally(() => setReady(true));
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + tk } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u) { setToken(tk); setUser(u); } else localStorage.removeItem('token'); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => { fetch('/api/formats').then((r) => (r.ok ? r.json() : [])).then((f) => Array.isArray(f) && setFormats(f)).catch(() => {}); }, []);
  useEffect(() => { fetch('/api/categories').then((r) => (r.ok ? r.json() : [])).then((c) => Array.isArray(c) && setCats(c.filter((x) => x.parentId == null))).catch(() => {}); }, []);
  // Nom d'un format (slug) dans la langue courante ; vide si inconnu.
  const formatName = (slug) => { const f = formats.find((x) => x.slug === slug); return f ? (f['name' + locale[0].toUpperCase() + locale.slice(1)] || f.nameFr) : ''; };
  // Favoris de l'utilisateur connecté (cœur sur les vignettes).
  useEffect(() => {
    if (!token || kid) { setFavs(new Set()); return; }
    fetch('/api/me/favorites', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setFavs(new Set(rows.map((x) => x.id))))
      .catch(() => {});
  }, [token, kid]);
  useEffect(() => {
    if (!token || kid) { setPrefs(null); return; }
    fetch('/api/me/preferences', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : null)).then((p) => p && setPrefs(p)).catch(() => {});
  }, [token, kid]);
  // Enfant : il ne quitte jamais l'espace Kids. Le verrou se base sur le jeton lui-même, pour tenir même si l'API répond mal.
  const kidMode = Boolean(kid) || Boolean(token && kidIdOf(token));
  // Fonction Prière (étape 23a) : réglages, horaires calculés, localisation ; l'en-tête et l'écran de pause la lisent ici.
  const prayer = usePrayerState({ call, token, kidMode, cfg: prayerCfg, featureOn: features.prayer !== false });
  useEffect(() => { if (kidMode && !path.startsWith('/kids')) router.replace('/kids'); }, [kidMode, path, router]);
  // Thème coloré de l'espace Kids (page des parents et espace enfant).
  useEffect(() => { document.body.classList.toggle('kd-theme', kidMode || path.startsWith('/kids')); }, [kidMode, path]);
  const toggleFav = useCallback(async (id) => {
    const on = favs.has(id);
    setFavs((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
    const r = await call(`/me/favorites/${id}`, { method: on ? 'DELETE' : 'PUT' });
    if (!r.ok) setFavs((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }); // échec : on annule
  }, [favs, call]);

  const login = (tk, u) => { localStorage.setItem('token', tk); setToken(tk); setUser(u); setKid(null); };
  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null); setKid(null); };
  // Entrée dans l'espace enfant (jeton enfant) ; la sortie passe par le code parental (POST /kids/exit) puis login().
  const enterKid = (tk, profile) => { localStorage.setItem('token', tk); setToken(tk); setUser(null); setKid(profile); };

  return <Ctx.Provider value={{ formats, formatName, cats, features, feat: (id) => features[id] !== false,
    // Registre, point 4 (étape E2) : un module SANS fonction associée (doublage, stockage, éditeur) désactivé dans Admin → Modules
    // disparaît des menus et des liens pour les organisateurs ; l'administrateur garde l'entrée (la page l'invite à l'activer).
    modUsable: (id) => features[id] !== false && (modules[id] !== false || user?.role === 'admin'),
    locale, t, appName, statsOn, trialDays, prayer, hasSeries, hasBooks, cards: cards || DEFAULT_CARDS, favs, toggleFav, prefs, setPrefs, user: viewAs === 'visitor' ? null : user, ready, call, login, logout, kid, kidMode, enterKid, setViewAs, dict, blockEdits, setBlockEdits, textPatch, setTextPatch, layout: layoutPreview || layout, layoutIsPreview: Boolean(layoutPreview), setLayoutPreview }}>{children}</Ctx.Provider>;
}
