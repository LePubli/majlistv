'use client';
// État de la fonction Prière pour toute l'application web (étape 23a) : réglages de la personne, horaires calculés, localisation.
// Réglages : sur le compte (GET/PUT /me/prayer) quand la personne est connectée, sur l'appareil sinon (visiteur, espace enfant).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSchedule, resolvePrefs, storable } from './prayerLogic';
import { civilDate } from './prayerTimes';

const LS = 'prayerPrefs';
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } };
const writeLocal = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* stockage indisponible : réglages gardés en mémoire */ } };

export function usePrayerState({ call, token, kidMode, cfg, featureOn }) {
  const [stored, setStored] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [dayKey, setDayKey] = useState('');
  const deviceTz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch { return 'Europe/Paris'; } }, []);
  const account = Boolean(token) && !kidMode;

  // Réglages gardés sur l'appareil : lus tout de suite (pas d'attente du réseau).
  useEffect(() => { setStored(readLocal()); setMounted(true); }, []);

  // Compte connecté : les réglages du compte font foi. Si le compte n'en a pas encore, ceux de l'appareil y sont envoyés une fois.
  useEffect(() => {
    if (!featureOn || !account) return undefined;
    let alive = true;
    call('/me/prayer').then((r) => {
      if (!alive || !r.ok) return;
      if (r.data.prefs) { setStored(r.data.prefs); writeLocal(r.data.prefs); }
      else { const local = readLocal(); if (local) call('/me/prayer', { method: 'PUT', body: JSON.stringify({ prefs: storable(resolvePrefs(local, cfg, deviceTz)) }) }); }
    });
    return () => { alive = false; };
  }, [featureOn, account, call]); // eslint-disable-line react-hooks/exhaustive-deps

  const prefs = useMemo(() => resolvePrefs(stored, cfg, deviceTz), [stored, cfg, deviceTz]);

  // Le jour change : les horaires sont recalculés (vérification toutes les 30 s, un seul rendu par jour).
  useEffect(() => {
    if (!mounted) return undefined;
    const tick = () => { const c = civilDate(Date.now(), prefs.loc.tz); setDayKey(`${c.y}-${c.m}-${c.d}`); };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [mounted, prefs.loc.tz]);

  const items = useMemo(() => (mounted && dayKey ? buildSchedule(Date.now(), prefs) : []), [mounted, dayKey, prefs]);

  /** Change un ou plusieurs réglages (ex. save({ method: 'mwl' })) : appliqué tout de suite, enregistré ensuite. */
  const save = useCallback(async (patch) => {
    const next = storable(resolvePrefs({ ...storable(prefs), ...patch }, cfg, deviceTz));
    setStored(next); writeLocal(next);
    if (account) await call('/me/prayer', { method: 'PUT', body: JSON.stringify({ prefs: next }) });
  }, [prefs, cfg, deviceTz, account, call]);

  /** Position de l'appareil (la permission est demandée à ce moment-là, jamais avant). Résout { ok } . */
  const locate = useCallback(() => new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve({ ok: false }); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => { await save({ loc: { mode: 'geo', lat: pos.coords.latitude, lon: pos.coords.longitude, tz: deviceTz, name: '' } }); resolve({ ok: true }); },
      () => resolve({ ok: false }),
      { maximumAge: 3_600_000, timeout: 10_000 },
    );
  }), [save, deviceTz]);

  return { on: Boolean(featureOn && cfg), ready: mounted, prefs, items, save, locate, deviceTz, cfg };
}

/** Horloge qui bat toutes les `ms` millisecondes (côté navigateur seulement). */
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
