'use client';
// Compte une page vue à chaque changement de page (statistiques anonymes, étape 18). N'affiche rien.
// Ignoré : espace d'administration / Studio, espace enfant (compté à part), et tant que la session n'est pas restaurée.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { claimEntry } from '../lib/stats';

export default function StatsBeacon() {
  const { call, ready, kidMode, statsOn } = useApp();
  const path = usePathname();
  useEffect(() => {
    if (!statsOn || !ready || kidMode) return;
    if (path.startsWith('/admin') || path.startsWith('/studio') || path.startsWith('/kids')) return;
    call('/stats/hit', { method: 'POST', body: JSON.stringify({ type: 'page', ...claimEntry('page') }), keepalive: true }).catch(() => {});
  }, [path, ready, kidMode, statsOn]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
