'use client';
// Amélioration 7.2 — Tests A/B : côté navigateur.
// L'identifiant du visiteur est un nombre aléatoire gardé dans le navigateur (aucune donnée personnelle ; le serveur n'en garde que l'empreinte).
// Un visiteur qui demande de ne pas être suivi (Do Not Track, Global Privacy Control) ne reçoit jamais de variante : il voit l'original et n'est pas compté.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../components/Providers';

const KEY = 'mtv_xp';

/** Vrai si le navigateur demande de ne pas être suivi. */
export function trackingRefused() {
  if (typeof navigator === 'undefined') return true;
  return navigator.doNotTrack === '1' || (typeof window !== 'undefined' && window.doNotTrack === '1') || navigator.globalPrivacyControl === true;
}

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

/** Identifiant du visiteur (créé au premier appel) ; null si le suivi est refusé ou si le stockage du navigateur est indisponible. */
export function visitorId({ create = true } = {}) {
  if (trackingRefused()) return null;
  try {
    let v = localStorage.getItem(KEY);
    if (!v && create) { v = uuid(); localStorage.setItem(KEY, v); }
    return v && /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : null;
  } catch { return null; }
}

// Une seule demande /xp/active par chargement de page, partagée par toutes les zones.
let pending = null;
function active(call) {
  const v = visitorId();
  if (!v) return Promise.resolve([]);
  if (!pending) pending = call(`/xp/active?visitor=${encodeURIComponent(v)}`, {}, null).then((r) => (r.ok ? r.data.experiments || [] : [])).catch(() => []);
  return pending;
}

/**
 * Variante de ce visiteur pour une zone.
 * Retourne { ready, variant, options, tx(clé), expose(), click() } (options = réglages de présentation de la variante, ex. { highlight: 'month' }) : tx(clé) donne le texte de la variante (dans la langue de la page) ou, à défaut, le texte normal.
 * Tant que `ready` est faux, le site montre l'original (aucun clignotement : la variante n'est connue qu'après la réponse).
 */
export function useExperiment(zone) {
  const { t, call, locale, feat } = useApp();
  const [exp, setExp] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let off = false;
    if (!feat('experiments')) { setReady(true); return undefined; }
    active(call).then((list) => { if (!off) { setExp(list.find((e) => e.zone === zone) || null); setReady(true); } });
    return () => { off = true; };
  }, [call, zone, feat]);

  const tx = useCallback((key) => exp?.texts?.[locale]?.[key] ?? t(key), [exp, locale, t]);
  const send = useCallback((path) => {
    const v = visitorId({ create: false });
    if (exp && v) call(path, { method: 'POST', body: JSON.stringify({ visitor: v, experiment: exp.id }) }, null).catch(() => {});
  }, [exp, call]);
  const expose = useCallback(() => {
    if (!exp) return;
    try { const k = `xp_seen_${exp.id}`; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* stockage indisponible : le serveur ignore les doublons */ }
    send('/xp/expose');
  }, [exp, send]);
  const click = useCallback(() => send('/xp/click'), [send]);
  return { ready, variant: exp?.variant || null, options: exp?.options || {}, tx, expose, click };
}

/** Appelé juste après une inscription réussie : compte l'inscription pour les tests auxquels ce visiteur a été exposé. */
export function reportSignup(call, token) {
  const v = visitorId({ create: false });
  if (!v) return Promise.resolve();
  return call('/xp/convert', { method: 'POST', body: JSON.stringify({ visitor: v }) }, token).catch(() => {});
}
