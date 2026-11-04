'use client';
// Compteur d'athkar (étape 45D, refonte 45D2) — onglet « Adhkar » de la page Apprendre (formule Apprentissage).
// Parcours : 4 moments (matin, soir, après la prière, sommeil) + thèmes ; réglages d'affichage gardés sur l'appareil.
// Dhikr saisis et validés dans Admin → Adhkar (avec leur référence). Un toucher = +1 ; les touchers rapprochés partent ensemble.
// Compte du jour en heure de Paris ; objectif (nombre de dhikr terminés par jour), série de jours, rappel facultatif.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import EmptyState from './EmptyState';

const MOMENTS = ['morning', 'evening', 'after_prayer', 'sleep'];
const THEMES = ['matin_soir', 'apres_priere', 'sommeil', 'dans_priere', 'maison', 'voyage', 'epreuves', 'deuil', 'nature', 'relations', 'pardon'];
const PKEY = 'at-prefs';
const loadP = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch { return {}; } };
const saveP = (p) => { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* stockage indisponible */ } };

export default function Athkar() {
  const { t, locale, call, feat } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState({ kind: 'moment', id: 'morning' }); // { kind: 'all' | 'moment' | 'theme', id }
  const [disp, setDisp] = useState({ ph: true, tr: true, size: 'm' });
  useEffect(() => { setDisp((x) => ({ ...x, ...loadP() })); }, []);
  const setD2 = (patch) => setDisp((x) => { const n = { ...x, ...patch }; saveP(n); return n; });
  const [prefs, setPrefs] = useState(null);
  const pending = useRef(new Map()); // id → nombre de touchers pas encore envoyés
  const timer = useRef(null);

  const load = useCallback(() => call(`/athkar?lang=${locale}`).then((r) => {
    if (r.ok) { setD(r.data); setPrefs({ goal: r.data.goal, remindHour: r.data.remindHour }); setErr(''); } else setErr(r.data?.error || t('errGeneric'));
  }), [call, locale, t]);
  useEffect(() => { load(); }, [load]);

  // Si le moment de départ n'a aucun dhikr publié, on montre tous les dhikr.
  useEffect(() => { if (d && view.kind === 'moment' && !d.items.some((i) => i.category === view.id)) setView({ kind: 'all', id: '' }); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const has = (f) => d.items.some(f);
  const moments = MOMENTS.filter((m) => has((i) => i.category === m));
  const themes = THEMES.filter((th) => has((i) => i.theme === th));
  const matches = (i) => (view.kind === 'moment' ? i.category === view.id : view.kind === 'theme' ? i.theme === view.id : true);
  const list = d.items.filter(matches);
  const countOf = (f) => d.items.filter(f).length;
  const title = view.kind === 'moment' ? t(`atCat_${view.id}`) : view.kind === 'theme' ? t(`atTheme_${view.id}`) : t('atAll');
  const goal = Math.max(1, Number(d.goal) || 1);
  const ring = Math.round((Math.min(d.doneToday, goal) / goal) * 264);
  const left = goal - d.doneToday;
  const on = (k, id) => view.kind === k && view.id === id;
  return (
    <section className={`at at-size-${disp.size}`} aria-label={t('atTab')}>
      {err && <p className="error" role="alert">{err}</p>}
      {d.items.length === 0 ? <EmptyState title={t('atEmpty')} text={t('atEmptyTx')} actions={[feat('quran') && { href: '/coran', label: t('esReadQuran') }]} /> : (
        <div className="at-layout">
          <div className="at-main">
            {moments.length > 0 && (
              <section aria-label={t('atMoment')}>
                <h3 className="at-h">{t('atMoment')}</h3>
                <div className="at-moments">
                  {moments.map((m) => (
                    <button key={m} type="button" className={`at-moment${on('moment', m) ? ' on' : ''}`} aria-pressed={on('moment', m)} onClick={() => setView({ kind: 'moment', id: m })}>
                      <b>{t(`atCat_${m}`)}</b><span className="meta small">{t('atTotal').replace('{n}', countOf((i) => i.category === m))}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {themes.length > 0 && (
              <section aria-label={t('atThemes')}>
                <h3 className="at-h">{t('atThemes')}</h3>
                <div className="at-cats" role="group" aria-label={t('atThemes')}>
                  <button type="button" className={`chip${view.kind === 'all' ? ' on' : ''}`} aria-pressed={view.kind === 'all'} onClick={() => setView({ kind: 'all', id: '' })}>{t('atAll')} <span className="at-n">{d.items.length}</span></button>
                  {themes.map((th) => (
                    <button key={th} type="button" className={`chip${on('theme', th) ? ' on' : ''}`} aria-pressed={on('theme', th)} onClick={() => setView({ kind: 'theme', id: th })}>{t(`atTheme_${th}`)} <span className="at-n">{countOf((i) => i.theme === th)}</span></button>
                  ))}
                </div>
              </section>
            )}
            <div className="at-listhead"><h3 className="at-h">{title}</h3><span className="meta small">{t('atTotal').replace('{n}', list.length)}</span></div>
            {list.length === 0 ? <p className="meta">{t('atNoneTheme')}</p> : (
              <ol className="at-list">
                {list.map((it) => {
                  const done = it.count >= it.target;
                  return (
                    <li key={it.id} className={`at-item${done ? ' done' : ''}`}>
                      <p className="qr-ar at-ar" lang="ar" dir="rtl">{it.ar}</p>
                      {disp.ph && it.translit && <p className="at-ph" dir="ltr">{it.translit}</p>}
                      {disp.tr && it.tr && <p className="at-tr">{it.tr}</p>}
                      <div className="at-row">
                        <p className="at-ref meta small">{t('atRef')} : {it.reference}</p>
                        <span className="at-state" aria-live="polite">{done ? `✓ ${t('atDone')}` : ''}</span>
                        {it.count > 0 && <button type="button" className="btn ghost small" onClick={() => reset(it)}>{t('atReset')}</button>}
                        <button type="button" className="at-tap" onClick={() => tap(it)} aria-label={`${t('atTapLabel')} — ${it.count} / ${it.target}`}>
                          <b>{it.count}</b><span>/ {it.target}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="meta small">{t('atReviewed')}</p>
          </div>
          <aside className="at-side">
            <section className="at-card" aria-label={t('atDailyGoal')}>
              <h3 className="at-h">{t('atDailyGoal')}</h3>
              <div className="at-goal">
                <svg width="96" height="96" viewBox="0 0 104 104" role="img" aria-label={`${d.doneToday} / ${goal}`}>
                  <circle cx="52" cy="52" r="42" fill="none" stroke="var(--line-soft, #2A2116)" strokeWidth="9" />
                  <circle cx="52" cy="52" r="42" fill="none" stroke="var(--accent, #E6A739)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${ring} 264`} transform="rotate(-90 52 52)" />
                  <text x="52" y="58" textAnchor="middle" fontWeight="700" fontSize="22" fill="currentColor">{d.doneToday}/{goal}</text>
                </svg>
                <p className="meta">{left <= 0 ? t('atGoalDone') : t('atGoalLeft').replace('{n}', left)}</p>
              </div>
              <div className="at-streak"><span>{t('atStreak')}</span><b>{t('atDays').replace('{n}', d.streak)}</b></div>
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
            </section>
            <section className="at-card" aria-label={t('atDisplay')}>
              <h3 className="at-h">{t('atDisplay')}</h3>
              <label className="at-sw"><span>{t('atShowPh')}</span><input type="checkbox" role="switch" checked={disp.ph} onChange={(e) => setD2({ ph: e.target.checked })} /></label>
              <label className="at-sw"><span>{t('atShowTr')}</span><input type="checkbox" role="switch" checked={disp.tr} onChange={(e) => setD2({ tr: e.target.checked })} /></label>
              <div className="at-sizes" role="group" aria-label={t('atSize')}>
                <span>{t('atSize')}</span>
                {[['s', 'atSizeS'], ['m', 'atSizeM'], ['l', 'atSizeL']].map(([k, l]) => <button key={k} type="button" className={`at-size-btn at-sb-${k}${disp.size === k ? ' on' : ''}`} aria-pressed={disp.size === k} aria-label={t(l)} onClick={() => setD2({ size: k })} lang="ar">ا</button>)}
              </div>
            </section>
            <p className="meta small">{t('atNote')}</p>
          </aside>
        </div>
      )}
    </section>
  );
}
