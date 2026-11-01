'use client';
// Compteur d'athkar (étape 45D) — onglet « Athkar » de la page Apprendre (formule Apprentissage).
// Dhikr saisis et validés dans Admin → Athkar (avec leur référence). Un toucher = +1 ; les touchers rapprochés partent ensemble.
// Compte du jour en heure de Paris ; objectif (nombre de dhikr terminés par jour), série de jours, rappel facultatif.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';

const CATS = ['morning', 'evening', 'after_prayer', 'sleep', 'general'];

export default function Athkar() {
  const { t, locale, call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('');
  const [prefs, setPrefs] = useState(null);
  const pending = useRef(new Map()); // id → nombre de touchers pas encore envoyés
  const timer = useRef(null);

  const load = useCallback(() => call(`/athkar?lang=${locale}`).then((r) => {
    if (r.ok) { setD(r.data); setPrefs({ goal: r.data.goal, remindHour: r.data.remindHour }); setErr(''); } else setErr(r.data?.error || t('errGeneric'));
  }), [call, locale, t]);
  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    timer.current = null;
    const batch = [...pending.current.entries()];
    pending.current.clear();
    for (const [id, n] of batch) {
      const r = await call(`/athkar/${id}/tap`, { method: 'POST', body: JSON.stringify({ n }) });
      if (!r.ok) { setErr(r.data?.error || t('errGeneric')); load(); return; }
    }
    load(); // série et objectif du jour à jour
  }, [call, load, t]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); flush(); } }, [flush]);

  const tap = (it) => {
    setD((x) => ({ ...x, items: x.items.map((y) => (y.id === it.id ? { ...y, count: y.count + 1 } : y)) }));
    if (it.count + 1 === it.target) { try { navigator.vibrate?.(60); } catch { /* sans vibreur */ } }
    pending.current.set(it.id, (pending.current.get(it.id) || 0) + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  const reset = async (it) => {
    if (!window.confirm(t('atResetAsk'))) return;
    pending.current.delete(it.id);
    await call(`/athkar/${it.id}/reset`, { method: 'POST' });
    load();
  };
  const savePrefs = async (p) => {
    setPrefs(p);
    const r = await call('/athkar/prefs', { method: 'PUT', body: JSON.stringify(p) });
    if (r.ok) load(); else setErr(r.data?.error || t('errGeneric'));
  };

  if (err && !d) return <p className="error" role="alert">{err}</p>;
  if (!d) return <p className="meta">…</p>;
  const cats = CATS.filter((c) => d.items.some((i) => i.category === c));
  const list = d.items.filter((i) => !cat || i.category === cat);
  return (
    <section className="at" aria-label={t('atTab')}>
      <div className="at-stats">
        <div className="at-stat"><span>{t('atToday')}</span><b>{d.doneToday} / {d.goal}</b></div>
        <div className="at-stat"><span>{t('atStreak')}</span><b>{t('atDays').replace('{n}', d.streak)}</b></div>
      </div>
      {prefs && (
        <div className="at-prefs">
          <label>{t('atGoal')}
            <input type="number" min="1" max="100" value={prefs.goal} onChange={(e) => setPrefs({ ...prefs, goal: e.target.value })} onBlur={() => savePrefs({ ...prefs, goal: Math.min(100, Math.max(1, Number(prefs.goal) || 1)) })} dir="ltr" />
          </label>
          <label>{t('atRemind')}
            <select value={prefs.remindHour ?? ''} onChange={(e) => savePrefs({ ...prefs, goal: Number(prefs.goal) || 1, remindHour: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">{t('atNoRemind')}</option>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      {d.items.length === 0 ? <p className="soon">{t('atEmpty')}</p> : (
        <>
          {cats.length > 1 && (
            <div className="at-cats" role="group" aria-label={t('atCats')}>
              <button type="button" className={`chip${!cat ? ' on' : ''}`} aria-pressed={!cat} onClick={() => setCat('')}>{t('atAll')}</button>
              {cats.map((c) => <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{t(`atCat_${c}`)}</button>)}
            </div>
          )}
          <ol className="at-list">
            {list.map((it) => {
              const done = it.count >= it.target;
              return (
                <li key={it.id} className={`at-item${done ? ' done' : ''}`}>
                  <p className="qr-ar at-ar" lang="ar" dir="rtl">{it.ar}</p>
                  {it.translit && <p className="at-ph" dir="ltr">{it.translit}</p>}
                  {it.tr && <p className="at-tr">{it.tr}</p>}
                  <p className="at-ref meta small">{t('atRef')} : {it.reference}</p>
                  <div className="at-row">
                    <button type="button" className="at-tap" onClick={() => tap(it)} aria-label={`${t('atTapLabel')} — ${it.count} / ${it.target}`}>
                      <b>{it.count}</b><span>/ {it.target}</span>
                    </button>
                    <span className="at-state" aria-live="polite">{done ? `✓ ${t('atDone')}` : ''}</span>
                    {it.count > 0 && <button type="button" className="btn ghost small" onClick={() => reset(it)}>{t('atReset')}</button>}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="meta small">{t('atNote')}</p>
    </section>
  );
}
