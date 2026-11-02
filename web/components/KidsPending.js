'use client';
// Étape B5 — Pastille « validations en attente » sur l'entrée Kids du menu (parent connecté, pas en mode enfant).
// Un seul appel partagé par tous les menus (en-tête, menu du téléphone, barre latérale, barre du bas), rafraîchi au retour
// sur l'onglet, toutes les 5 minutes, et après chaque validation (refreshKidsPending()).
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

const store = { n: 0, at: 0, busy: null, subs: new Set() };
const EVENT = 'kids:pending-refresh';
export const refreshKidsPending = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

export function useKidsPending() {
  const { user, kidMode, call, feat } = useApp();
  const [n, setN] = useState(store.n);
  const on = Boolean(user && !kidMode && feat('kids'));
  useEffect(() => {
    if (!on) { setN(0); return undefined; }
    const sub = (v) => setN(v);
    store.subs.add(sub);
    const load = async (force = false) => {
      if (store.busy) return store.busy;
      if (!force && Date.now() - store.at < 60000) { setN(store.n); return undefined; }
      store.busy = call('/me/kids/pending').then((r) => {
        store.n = r.ok ? r.data.total : 0; store.at = Date.now(); store.busy = null;
        store.subs.forEach((f) => f(store.n));
      });
      return store.busy;
    };
    load();
    const refresh = () => load(true);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener(EVENT, refresh); document.addEventListener('visibilitychange', onVis);
    const id = setInterval(() => load(true), 5 * 60 * 1000);
    return () => { store.subs.delete(sub); window.removeEventListener(EVENT, refresh); document.removeEventListener('visibilitychange', onVis); clearInterval(id); };
  }, [on, call]);
  return on ? n : 0;
}

export function KidsPendingBadge() {
  const { t } = useApp();
  const n = useKidsPending();
  if (!n) return null;
  return <span className="kp-badge" aria-label={t('kpBadge').replace('{n}', n)}>{n > 9 ? '9+' : n}</span>;
}
