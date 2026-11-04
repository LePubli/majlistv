'use client';
// Série de jours et objectif de la semaine (palier « Apprentissage »). Sobre : un chiffre, sept pastilles, une barre. Aucun badge.
// Données : GET /me/learning/streak ; réglage : PUT /me/learning/goal { goal, show }.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

export default function StreakCard() {
  const { t, locale, call } = useApp();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('/me/learning/streak').then((r) => { if (r.ok) setS(r.data); }), [call]);
  useEffect(() => { load(); }, [load]);

  const save = async (body) => {
    setBusy(true);
    const r = await call('/me/learning/goal', { method: 'PUT', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) setS(r.data);
  };

  if (!s) return null;
  if (!s.show) return <p className="sk-hidden"><button type="button" className="link u" onClick={() => save({ show: true })} disabled={busy}>{t('skShow')}</button></p>;

  const letter = (date) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, { timeZone: 'UTC', weekday: 'narrow' }).format(new Date(`${date}T12:00:00Z`));
  const w = s.week;
  const pct = Math.min(100, Math.round((w.done / w.goal) * 100));

  return (
    <section className="sk" aria-label={t('skTitle')}>
      <div className="sk-main">
        <p className="sk-big"><b>{s.current}</b> <span>{s.current === 1 ? t('skDay1') : t('skDayN')}</span></p>
        <p className="meta small">
          {s.current === 0 ? t('skZero') : s.atRisk ? t('skRisk') : s.activeToday ? t('skDone') : ''}
          {s.best > s.current ? ` ${t('skBest').replace('{n}', s.best)}` : ''}
        </p>
        <ol className="sk-week" aria-label={t('skWeek')}>
          {w.days.map((d) => (
            <li key={d.date} className={`${d.active ? 'on' : ''}${d.today ? ' is-today' : ''}${d.future ? ' future' : ''}`.trim() || undefined} aria-label={`${d.date}${d.active ? ' ✓' : ''}`}>
              <span aria-hidden="true">{d.active ? '✓' : ''}</span><small>{letter(d.date)}</small>
            </li>
          ))}
        </ol>
        <p className="meta small">{s.graceUsedThisWeek ? t('skRestUsed') : t('skRest')}</p>
      </div>
      <div className="sk-goal">
        <h3>{t('skGoalTitle')}</h3>
        <p className="sk-prog"><b>{w.done}</b> / {w.goal} {t('skGoalUnit')}</p>
        <div className="sk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={w.goal} aria-valuenow={Math.min(w.done, w.goal)}><i style={{ width: `${pct}%` }} /></div>
        {w.reached && <p className="ok-msg small">{t('skReached')}</p>}
        <p className="meta small">{t('skGoalSet')}</p>
        <div className="sk-pick" role="group" aria-label={t('skGoalSet')}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} type="button" className={n === w.goal ? 'on' : undefined} aria-pressed={n === w.goal} disabled={busy} onClick={() => n !== w.goal && save({ goal: n })}>{n}</button>)}
        </div>
        <p className="meta small">{t('skRule')}</p>
        <button type="button" className="link u small" onClick={() => save({ show: false })} disabled={busy}>{t('skHide')}</button>
      </div>
    </section>
  );
}
