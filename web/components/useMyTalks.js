'use client';
// Mes conférences avec leur état de traitement (GET /me/talks), rafraîchies toutes les 6 s tant qu'un traitement est en cours.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './Providers';
import { talkSteps, talkKind, talkProgress } from '../lib/talkState';

export default function useMyTalks() {
  const { call } = useApp();
  const [mine, setMine] = useState(null);
  const load = useCallback(() => call('/me/talks').then((r) => { if (r.ok) setMine(r.data); }), [call]);
  useEffect(() => { load(); }, [load]);
  const rows = useMemo(() => (mine || []).map((x) => {
    const steps = talkSteps(x);
    return { ...x, steps, kind: talkKind(x, steps), pct: talkProgress(steps) };
  }), [mine]);
  const running = rows.some((r) => r.kind === 'run');
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [running, load]);
  return { rows, loaded: mine !== null, reload: load };
}
