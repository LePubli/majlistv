'use client';
// Étape B1 — Bloc « Aujourd'hui » : la courte liste de ce que le membre peut faire aujourd'hui (juz du jour, athkar du moment,
// action de Ramadan, cartes et révisions). Chaque ligne mène directement à l'action ; les lignes faites passent en bas, cochées.
// Rien ne s'affiche pour un visiteur ni quand il n'y a aucune ligne. Données : GET /me/today (chaque module ajoute ses lignes).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export function todayLabel(it, t) {
  switch (it.kind) {
    case 'quranJuz': return t('tdQuranJuz').replace('{n}', it.juz);
    case 'quranStart': return t('tdQuranStart');
    case 'athkar': return t(`tdAthkar_${it.moment}`);
    case 'ramadan': return t('tdRamadan').replace('{d}', it.day);
    case 'ramadanBilan': return t('tdRamadanBilan').replace('{y}', it.year);
    case 'cards': return it.done ? t('tdCardsDone') : t('tdCards');
    case 'revision': return t('tdRevision');
    default: return '';
  }
}

// Petit compteur à droite : « 3 / 8 » (athkar, Ramadan) ou « 12 » (cartes, révisions).
const countOf = (it) => (it.total ? `${it.n} / ${it.total}` : it.n > 0 ? String(it.n) : '');

export default function TodayBlock({ compact = false }) {
  const { t, user, ready, call, locale } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!ready || !user) { setD(null); return undefined; }
    let dead = false;
    call(`/me/today?lang=${locale}`).then((r) => { if (!dead) setD(r.ok ? r.data : null); });
    return () => { dead = true; };
  }, [ready, user, call, locale]);
  if (!d || !d.items.length) return null;
  return (
    <section className={`today${compact ? ' today-compact' : ''}`} aria-label={t('tdAria')}>
      <header className="today-head">
        <h2>{t('tdTitle')}</h2>
        <span className={`today-left${d.left ? '' : ' ok'}`}>{d.left ? t('tdLeft').replace('{n}', d.left) : t('tdAllDone')}</span>
      </header>
      <ul className="today-list">
        {d.items.map((it) => (
          <li key={`${it.kind}-${it.moment || it.juz || it.day || it.year || ''}`} className={it.done ? 'done' : ''}>
            <Link href={it.href}>
              <span className="today-box" aria-hidden="true">{it.done ? '✓' : ''}</span>
              <span className="today-label">{todayLabel(it, t)}</span>
              {countOf(it) && <span className="today-count" dir="ltr">{countOf(it)}</span>}
              <span className="sr-only">{it.done ? t('tdDone') : t('tdTodo')}</span>
              <span className="today-go" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
