'use client';
// Étape 31.2 — « Mon évolution » (Apprentissage) : par thème et par mois, ce qui a été appris et ce qui a été mis en pratique.
// Des faits, jamais de score, de pourcentage ni de comparaison avec d'autres personnes. Rien n'est partagé.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

export default function Evolution({ t, call, locale }) {
  const [d, setD] = useState(null);
  const [month, setMonth] = useState('');
  const load = useCallback(async (m) => {
    const r = await call(`/me/evolution${m ? `?month=${m}` : ''}`);
    if (r.ok) { setD(r.data); setMonth(r.data.month); }
  }, [call]);
  useEffect(() => { load(''); }, [load]);
  if (!d) return null;
  const label = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return (
    <section className="lr-block ev-block" id="evolution">
      <h2>{t('evTitle')}</h2>
      <p className="meta">{t('evIntro')}</p>
      <label className="fld ev-month"><span>{t('evMonth')}</span>
        <select value={month} onChange={(e) => load(e.target.value)}>
          {d.months.map((m) => <option key={m} value={m}>{label(m)}</option>)}
        </select>
      </label>
      {d.themes.length === 0 ? (
        <p className="meta">{t('evEmpty')} {d.themesEnabled && <Link className="link u" href="/themes">{t('evDiscover')}</Link>}</p>
      ) : (
        <ul className="ev-list">
          {d.themes.map((x) => (
            <li key={x.id} className="ev-item">
              <Link href={`/themes/${x.id}`}><b>{x.title}</b></Link>
              <div className="ev-cols">
                <div>
                  <h3>{t('evLearned')}</h3>
                  <ul>
                    <li>{t('evWatched').replace('{n}', x.watched)}</li>
                    <li>{t('evQuizzes').replace('{n}', x.quizzes)}</li>
                  </ul>
                </div>
                <div>
                  <h3>{t('evPracticed')}</h3>
                  <ul>
                    <li>{t('evMade').replace('{n}', x.made)}</li>
                    <li>{t('evDone').replace('{n}', x.done)}</li>
                    {x.goals > 0 && <li>{t('evGoal').replace('{n}', x.goals)}{(x.achieved + x.progress + x.notYet) > 0 && <> — {t('evChecks').replace('{a}', x.achieved).replace('{b}', x.progress).replace('{c}', x.notYet)}</>}</li>}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="meta small">{t('evPrivacy')}</p>
    </section>
  );
}
