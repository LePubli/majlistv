'use client';
// Module « Doublage français » — petits éléments partagés par les écrans du Studio.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';

export const tf = (s, vars = {}) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s || '');

// « ≈ 1 h 05 min », « ≈ 12 min », « ≈ 40 s »
export function fmtDuration(sec, t) {
  if (sec == null) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} ${t('dbUnitS')}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${t('dbUnitMin')}`;
  return `${Math.floor(m / 60)} ${t('dbUnitH')} ${String(m % 60).padStart(2, '0')} ${t('dbUnitMin')}`;
}
export const fmtNum = (n, locale, digits = 2) => (n == null ? '—' : Number(n).toLocaleString(locale, { maximumFractionDigits: digits }));
export function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
export const fmtDay = (iso, locale) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'long' }) : '—');

// Chargement de l'état du module (réglages, voix…) avec gestion du module désactivé.
export function useDubbing(path) {
  const { call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null); // 'off' | 'missing' | message
  const load = useCallback(async () => {
    const r = await call(path);
    if (r.ok) { setD(r.data); setErr(null); } else setErr(r.data?.code === 'module_off' ? 'off' : r.status === 404 ? 'missing' : (r.data?.error || 'error'));
    return r;
  }, [call, path]);
  useEffect(() => { load(); }, [load]);
  return { d, setD, err, load };
}

// Cas où l'écran ne peut pas s'afficher : rôle, module désactivé, erreur.
export function Gate({ user, err, children }) {
  const { t } = useApp();
  if (!user) return null;
  if (user.role !== 'admin') {
    return (
      <main className="studio-page studio-narrow">
        <div className="studio-head"><h1 className="studio-title">{t('sdDub')}</h1></div>
        <section className="sd-card"><p>{t('dbAdminOnly')}</p><Link href="/studio/contents" className="btn ghost">{t('sdBackContents')}</Link></section>
      </main>
    );
  }
  if (err === 'off') {
    return (
      <main className="studio-page studio-narrow">
        <div className="studio-head"><h1 className="studio-title">{t('sdDub')}</h1></div>
        <section className="sd-card"><p>{t('dbModuleOff')}</p><Link href="/admin?tab=modules" className="btn">{t('dbOpenModules')}</Link></section>
      </main>
    );
  }
  if (err && err !== 'missing') return <main className="studio-page"><p className="error" role="alert">{err}</p></main>;
  return children;
}

// Bandeau honnête : la génération n'existe pas encore.
export function EngineNote({ engine }) {
  const { t } = useApp();
  if (!engine || engine.ready) return null;
  return <p className="db-engine" role="note"><strong>{t('dbEngineOffTitle')}</strong> {t('dbEngineOffText')}</p>;
}
