// Étape M4 — Pastille « validations en attente » (comme le site, étape B5) : nombre d'actions que les enfants disent avoir faites
// (petites actions + circuit de Ramadan) et que le parent n'a pas encore validées. Un seul appel partagé par tous les écrans,
// rafraîchi au retour dans l'application, toutes les 5 minutes et après chaque validation (refreshKidsPending()).
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from './session';
import { useKid } from './kidSession';
import type { PendingResponse } from './ramadan';

const store = { data: null as PendingResponse | null, at: 0, busy: null as Promise<void> | null, subs: new Set<(d: PendingResponse | null) => void>() };
const refreshers = new Set<() => void>();
/** À appeler après une validation : la pastille et le bandeau se mettent à jour. */
export const refreshKidsPending = () => { refreshers.forEach((f) => f()); };

export function useKidsPending(): PendingResponse | null {
  const { user, api, feat } = useSession();
  const { kid } = useKid();
  const on = Boolean(user && !kid && feat('kids'));
  const [d, setD] = useState<PendingResponse | null>(store.data);
  useEffect(() => {
    if (!on) { setD(null); return undefined; }
    store.subs.add(setD);
    const load = async (force = false) => {
      if (store.busy) return store.busy;
      if (!force && Date.now() - store.at < 60_000) { setD(store.data); return undefined; }
      store.busy = api.get<PendingResponse>('/me/kids/pending')
        .then((r) => { store.data = r; }).catch(() => { store.data = null; })
        .finally(() => { store.at = Date.now(); store.busy = null; store.subs.forEach((f) => f(store.data)); });
      return store.busy;
    };
    void load();
    const force = () => { void load(true); };
    refreshers.add(force);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void load(); });
    const id = setInterval(force, 5 * 60_000);
    return () => { store.subs.delete(setD); refreshers.delete(force); sub.remove(); clearInterval(id); };
  }, [on, api, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return on ? d : null;
}
