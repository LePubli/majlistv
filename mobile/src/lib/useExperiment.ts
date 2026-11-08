// Amélioration 7.2 (étape 3) — Tests A/B dans l'application : variante de ce visiteur pour une zone.
// Tant que la réponse n'est pas arrivée (ou hors connexion, ou fonction coupée), l'original est affiché : aucun clignotement.
import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useSession } from './session';
import { XP_KEY, XpExperiment, newVisitorId, pickExperiment, validVisitor, variantText } from './experiments';

async function visitorId(create: boolean): Promise<string | null> {
  try {
    let v = validVisitor(await SecureStore.getItemAsync(XP_KEY));
    if (!v && create) { v = newVisitorId(); await SecureStore.setItemAsync(XP_KEY, v); }
    return v;
  } catch { return null; }
}

// Une seule demande /xp/active par lancement de l'application, partagée par toutes les zones.
let pending: Promise<XpExperiment[]> | null = null;

export function useExperiment(zone: string) {
  const { api, feat, locale, ready } = useSession();
  const [exp, setExp] = useState<XpExperiment | null>(null);
  const on = feat('experiments');
  useEffect(() => {
    if (!ready || !on) return undefined;
    let off = false;
    if (!pending) {
      pending = visitorId(true).then(async (v) => {
        if (!v) return [];
        const r = await api.get<{ experiments?: XpExperiment[] }>('/xp/active', { visitor: v }, false);
        return r.experiments || [];
      }).catch(() => { pending = null; return []; });
    }
    pending.then((list) => { if (!off) setExp(pickExperiment(list, zone)); });
    return () => { off = true; };
  }, [api, on, ready, zone]);

  const tx = useCallback((key: string, fallback: string) => variantText(exp, locale, key, fallback), [exp, locale]);
  const send = useCallback(async (path: string) => {
    const v = await visitorId(false);
    if (exp && v) api.post(path, { visitor: v, experiment: exp.id }, false).catch(() => {});
  }, [exp, api]);
  const expose = useCallback(() => { void send('/xp/expose'); }, [send]);
  return { variant: exp?.variant ?? null, tx, expose };
}

/** Appelé juste après une inscription réussie : compte l'inscription pour les tests auxquels ce visiteur a été exposé. */
export async function reportSignup(api: { post: (p: string, b?: unknown, auth?: boolean) => Promise<unknown> }): Promise<void> {
  const v = await visitorId(false);
  if (v) await api.post('/xp/convert', { visitor: v }).catch(() => {});
}
