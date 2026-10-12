'use client';
// Contexte global : textes (i18n), session utilisateur (token en localStorage) et appels API.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function Providers({ locale, dict, appName, trialDays = 0, children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
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

  const login = (tk, u) => { localStorage.setItem('token', tk); setToken(tk); setUser(u); };
  const logout = () => { localStorage.removeItem('token'); setToken(null); setUser(null); };

  return <Ctx.Provider value={{ locale, t, appName, trialDays, user, ready, call, login, logout }}>{children}</Ctx.Provider>;
}
