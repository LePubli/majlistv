'use client';
// Étape B1 — Bloc « Aujourd'hui » : la courte liste de ce que le membre peut faire aujourd'hui (juz du jour, adhkar du moment,
// action de Ramadan, cartes et révisions). Chaque ligne mène directement à l'action ; les lignes faites passent en bas, cochées.
// Rien ne s'affiche pour un visiteur ni quand il n'y a aucune ligne. Données : GET /me/today (chaque module ajoute ses lignes).
// Étape N3 (15/11) — `home` : version de l'accueil, la seule carte « À faire aujourd'hui » (titre dédié, ligne « quiz à passer »,
// lien « Tout voir dans Apprendre ») ; elle remplace les rangées « À réviser » et « Quiz à passer » de l'accueil.
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
    case 'quiz': return t('tdQuiz');
    default: return '';
  }
}

// Petit compteur à droite : « 3 / 8 » (adhkar, Ramadan) ou « 12 » (cartes, révisions).
const countOf = (it) => (it.total ? `${it.n} / ${it.total}` : it.n > 0 ? String(it.n) : '');

/** Ajoute la ligne « quiz à passer » (accueil) à sa place (après les cartes, avant les révisions) et recompte ce qui reste. */
export function withQuizLine(data, quizN) {
  if (!data || !quizN) return data;
  const quiz = { kind: 'quiz', order: 35, n: quizN, done: false, href: '/learning?tab=rev&s=quiz' };
  const items = [...data.items, quiz].sort((a, b) => Number(a.done) - Number(b.done) || (a.order ?? 99) - (b.order ?? 99));
  return { ...data, items, left: (data.left || 0) + 1 };
}

export default function TodayBlock({ compact = false, home = false }) {
  const { t, user, ready, call, locale, feat } = useApp();
  const [d, setD] = useState(null);
  const [quizN, setQuizN] = useState(0);
  useEffect(() => {
    if (!ready || !user) { setD(null); return undefined; }
    let dead = false;
    call(`/me/today?lang=${locale}`).then((r) => { if (!dead) setD(r.ok ? r.data : { items: [], left: 0 }); });
    return () => { dead = true; };
  }, [ready, user, call, locale]);
  useEffect(() => {
    if (!home || !ready || !user || !feat('quiz')) { setQuizN(0); return undefined; }
    let dead = false;
    call('/me/quiz/todo').then((r) => { if (!dead) setQuizN(r.ok ? (Array.isArray(r.data) ? r.data : r.data?.items || []).length : 0); });
    return () => { dead = true; };
  }, [home, ready, user, call, feat]);
  const data = home ? withQuizLine(d, quizN) : d;
  if (!data || !data.items.length) return null;
  return (
    <section className={`today${compact ? ' today-compact' : ''}${home ? ' today-home' : ''}`} aria-label={t('tdAria')}>
      <header className="today-head">
        <h2>{home ? t('tdHomeTitle') : t('tdTitle')}</h2>
        <span className={`today-left${data.left ? '' : ' ok'}`}>{data.left ? t('tdLeft').replace('{n}', data.left) : t('tdAllDone')}</span>
      </header>
      <ul className="today-list">
        {data.items.map((it) => (
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
      {home && <p className="today-more"><Link className="link u" href="/learning">{t('tdOpenLearn')} ›</Link></p>}
    </section>
  );
}
