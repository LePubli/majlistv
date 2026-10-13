'use client';
// Contexte global : textes (i18n), session utilisateur (token en localStorage) et appels API.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Réglages d'affichage des vignettes si l'API ne les fournit pas (valeurs par défaut).
const DEFAULT_CARDS = { hover: true, preview: true, previewDelay: 1500, previewSeconds: 20,
  show: { access: true, duration: true, speaker: true, category: true, language: true, description: true, favorite: true, progress: true } };

export default function Providers({ locale, dict, appName, trialDays = 0, cards = null, children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [favs, setFavs] = useState(() => new Set()); // identifiants des conférences en favoris (vignettes)
  const t = (key) => dict[key] || key;

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
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + tk } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u) { setToken(tk); setUser(u); } else localStorage.removeItem('token'); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Favoris de l'utilisateur connecté (cœur sur les vignettes).
  useEffect(() => {
    if (!token) { setFavs(new Set()); return; }
    fetch('/api/me/favorites', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setFavs(new Set(rows.map((x) => x.id))))
      .catch(() => {});
  }, [token]);
  const toggleFav = useCallback(async (id) => {
    const on = favs.has(id);
    setFavs((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
    const r = await call(`/me/favorites/${id}`, { method: on ? 'DELETE' : 'PUT' });
    if (!r.ok) setFavs((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; }); // échec : on annule
  }, [favs, call]);

  const login = (tk, u) => { localStorage.setItem('token', tk); setToken(tk); setUser(u); };
  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null); };

  return <Ctx.Provider value={{ locale, t, appName, trialDays, cards: cards || DEFAULT_CARDS, favs, toggleFav, user, ready, call, login, logout }}>{children}</Ctx.Provider>;
}
