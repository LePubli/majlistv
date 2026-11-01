'use client';
// Lecture du Coran en 30 jours (étape 45E) : 1 juz par jour, case « lu », progression, rappel quotidien facultatif.
// Gratuit pour tout membre connecté ; affichée en haut de la page Coran (et de l'onglet Coran d'Apprendre).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export default function QuranPlan() {
  const { t, locale, call, user } = useApp();
  const [juzs, setJuzs] = useState(null);
  const [plan, setPlan] = useState(undefined);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { call('/quran/juzs', {}, null).then((r) => setJuzs(r.ok ? r.data : null)); }, [call]);
  const load = useCallback(() => { if (user) call('/quran/plan').then((r) => setPlan(r.ok ? r.data.plan : null)); }, [call, user]);
  useEffect(() => { load(); }, [load]);
  const act = async (path, method, body) => {
    setErr('');
    const r = await call(path, { method, body: body ? JSON.stringify(body) : undefined });
    if (r.ok) setPlan(r.data.plan); else setErr(r.data?.error || t('errGeneric'));
  };
  if (!juzs) return null;
  const nameOf = (p) => (locale === 'ar' ? p.ar : p.name);
  const range = (j) => `${nameOf(j.start)} ${j.start.aya} → ${nameOf(j.end)} ${j.end.aya}`;

  if (!user) {
    return (
      <section className="kh kh-intro" aria-label={t('khTitle')}>
        <h2>{t('khTitle')}</h2><p className="meta">{t('khIntro')}</p>
        <p><Link className="btn" href="/login?next=/coran">{t('khLogin')}</Link></p>
      </section>
    );
  }
  if (plan === undefined) return null;
  if (!plan) {
    return (
      <section className="kh kh-intro" aria-label={t('khTitle')}>
        <h2>{t('khTitle')}</h2><p className="meta">{t('khIntro')}</p>
        {err && <p className="error" role="alert">{err}</p>}
        <p><button type="button" className="btn" onClick={() => act('/quran/plan/start', 'POST', {})}>{t('khStart')}</button></p>
      </section>
    );
  }
  const read = new Set(plan.reads);
  const today = plan.todayJuz ? juzs[plan.todayJuz - 1] : null;
  const pct = Math.round((plan.reads.length / 30) * 100);
  return (
    <section className="kh" aria-label={t('khTitle')}>
      <div className="kh-head">
        <h2>{t('khTitle')}</h2>
        <span className="meta">{plan.day >= 1 && plan.day <= 30 ? t('khDay').replace('{n}', plan.day) : plan.day > 30 ? t('khOver') : t('khSoon')}</span>
      </div>
      <div className="kh-bar" role="progressbar" aria-valuemin={0} aria-valuemax={30} aria-valuenow={plan.reads.length} aria-label={t('khProgress')}><span style={{ width: `${pct}%` }} /></div>
      <p className="meta small">{t('khRead').replace('{n}', plan.reads.length)}{plan.completed > 0 ? ` · ${t('khCompleted').replace('{n}', plan.completed)}` : ''}</p>
      {plan.finished && <p className="kh-done">✓ {t('khFinished')}</p>}
      {today && (
        <div className={`kh-today${read.has(today.n) ? ' done' : ''}`}>
          <div>
            <b>{t('khToday').replace('{n}', today.n)}</b>
            <span className="meta small" dir="auto">{range(today)}</span>
          </div>
          <Link className="btn" href={`/coran/${today.start.sura}#v${today.start.aya}`}>{t('khReadNow')}</Link>
          <label className="chk"><input type="checkbox" checked={read.has(today.n)} onChange={(e) => act(`/quran/plan/juz/${today.n}`, 'PUT', { read: e.target.checked })} /> {t('khMark')}</label>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <button type="button" className="link u small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t('khHideAll') : t('khShowAll')}</button>
      {open && (
        <>
          <ol className="kh-grid">
            {juzs.map((j) => (
              <li key={j.n} className={`${read.has(j.n) ? 'done' : ''}${plan.todayJuz === j.n ? ' now' : ''}`}>
                <label className="chk" title={range(j)}><input type="checkbox" checked={read.has(j.n)} onChange={(e) => act(`/quran/plan/juz/${j.n}`, 'PUT', { read: e.target.checked })} /> {t('khJuz').replace('{n}', j.n)}</label>
                <Link className="link u small" href={`/coran/${j.start.sura}#v${j.start.aya}`} dir="auto">{range(j)}</Link>
              </li>
            ))}
          </ol>
          <div className="kh-tools">
            <label>{t('khRemind')}
              <select value={plan.remindHour ?? ''} onChange={(e) => act('/quran/plan/prefs', 'PUT', { remindHour: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t('atNoRemind')}</option>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <button type="button" className="btn ghost small" onClick={() => { if (window.confirm(t('khRestartAsk'))) act('/quran/plan/start', 'POST', {}); }}>{t('khRestart')}</button>
            <button type="button" className="btn ghost small" onClick={() => { if (window.confirm(t('khStopAsk'))) act('/quran/plan', 'DELETE'); }}>{t('khStop')}</button>
          </div>
        </>
      )}
    </section>
  );
}
