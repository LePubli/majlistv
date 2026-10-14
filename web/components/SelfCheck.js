'use client';
// Espace Apprentissage → « Mon bilan » (Tazkiyat an-nafs) : qualités à cultiver, défauts à corriger, bilan de la semaine.
// Aucun total, score, pourcentage ni série de jours : seulement l'état de chaque objectif, semaine après semaine, avec douceur.
import { useCallback, useEffect, useState } from 'react';

const STATES = ['achieved', 'progress', 'not_yet'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// Les dates arrivent au format AAAA-MM-JJ (lundi de la semaine, jour de Paris).
const fmt = (iso, locale, o = { day: 'numeric', month: 'long' }) => new Date(iso + 'T12:00:00').toLocaleDateString(locale, o);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = (n, locale) => new Date(Date.UTC(2024, 0, n)).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' }); // 2024-01-01 = lundi

// Petite frise des 8 dernières semaines : une case par semaine, couleurs douces, texte pour les lecteurs d'écran.
function Frise({ weeks, marks, locale, t }) {
  return (
    <ol className="sc-frise" aria-label={t('scFrise')}>
      {weeks.map((w) => {
        const s = marks[w];
        const label = `${t('scWeekOf').replace('{d}', fmt(w, locale))} : ${s ? t(`scSt_${s}`) : t('scNoCheck')}`;
        return <li key={w} className={s ? `sc-cell ${s}` : 'sc-cell'} title={label}><span className="sr-only">{label}</span></li>;
      })}
    </ol>
  );
}

function Goal({ g, weeks, week, commitments, t, call, locale, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(g.current?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (fn) => { setBusy(true); setErr(null); const r = await fn(); setBusy(false); if (!r.ok) setErr(r.data?.error || t('errGeneric')); return r; };

  const check = async (status, withNote) => {
    const r = await run(() => call(`/me/selfcheck/goals/${g.id}/checkin`, { method: 'PUT', body: JSON.stringify({ status, ...(withNote !== undefined ? { note: withNote } : {}) }) }));
    if (r.ok) onChange({ ...g, current: { status: r.data.status, note: r.data.note }, marks: { ...g.marks, [week]: r.data.status } });
    return r.ok;
  };
  const patch = async (body) => {
    const r = await run(() => call(`/me/selfcheck/goals/${g.id}`, { method: 'PATCH', body: JSON.stringify(body) }));
    if (r.ok) onChange(r.data);
  };
  const remove = async () => {
    if (!window.confirm(t('scRemoveConfirm'))) return;
    const r = await run(() => call(`/me/selfcheck/goals/${g.id}`, { method: 'DELETE' }));
    if (r.ok) onRemove(g.id);
  };
  const linked = commitments.find((c) => c.id === g.commitmentId);

  return (
    <li className={`sc-goal${g.archived ? ' archived' : ''}`}>
      <p className="sc-title">{g.title}</p>
      {!g.archived && (
        <div className="pills" role="group" aria-label={t('scThisWeek')}>
          {STATES.map((s) => (
            <button key={s} type="button" disabled={busy} aria-pressed={g.current?.status === s} className={g.current?.status === s ? `pill on sc-st-${s}` : 'pill'}
              onClick={() => g.current?.status !== s && check(s)}>{t(`scSt_${s}`)}</button>
          ))}
        </div>
      )}
      <Frise weeks={weeks} marks={g.marks} locale={locale} t={t} />
      {linked && <p className="meta small">{t('scLinked')} : {linked.text}</p>}
      {open && (
        <div className="pz-note">
          <textarea rows={3} maxLength={1000} value={note} placeholder={t('scNotePh')} aria-label={t('pzNote')} onChange={(e) => setNote(e.target.value)} />
          <div className="panel-actions">
            <button type="button" className="btn" disabled={busy || !g.current} onClick={async () => { if (await check(g.current.status, note)) setOpen(false); }}>{t('save')}</button>
            <button type="button" className="btn ghost" onClick={() => { setNote(g.current?.note || ''); setOpen(false); }}>{t('cancelBtn')}</button>
          </div>
          {!g.current && <p className="meta small">{t('scNoteFirst')}</p>}
        </div>
      )}
      {!open && g.current?.note && <p className="pz-notetext">{g.current.note}</p>}
      <div className="pz-tools">
        {!g.archived && <button type="button" className="link u small" onClick={() => { setNote(g.current?.note || ''); setOpen(true); }}>{g.current?.note ? t('pzNoteEdit') : t('pzNoteAdd')}</button>}
        {!g.archived && commitments.length > 0 && (
          <select className="sc-link" value={g.commitmentId || ''} aria-label={t('scLink')} onChange={(e) => patch({ commitmentId: e.target.value || null })}>
            <option value="">{t('scLink')}</option>
            {commitments.map((c) => <option key={c.id} value={c.id}>{c.text.slice(0, 60)}</option>)}
          </select>
        )}
        <button type="button" className="link u small" onClick={() => patch({ archived: !g.archived })}>{g.archived ? t('scUnarchive') : t('scArchive')}</button>
        <button type="button" className="link u small" onClick={remove}>{t('pzRemove')}</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
    </li>
  );
}

function AddForm({ nature, d, themes, t, call, onAdded, onCancel }) {
  const [theme, setTheme] = useState('');
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const list = themes.filter((x) => x.kind === nature);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { nature, ...(title.trim() ? { title: title.trim() } : {}), ...(theme ? { themeId: theme } : {}), ...(d.consent ? {} : { consent }) };
    const r = await call('/me/selfcheck/goals', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.code === 'consent_required' ? t('pzNeedConsent') : r.data?.error || t('errGeneric')); return; }
    onAdded(r.data);
  };
  return (
    <form className="sc-add" onSubmit={submit}>
      {list.length > 0 && (
        <label className="fld"><span>{t('scPickTheme')}</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">{t('scOwnWords')}</option>
            {list.map((x) => <option key={x.id} value={x.id}>{x.title}{x.ar ? ` — ${x.ar}` : ''}</option>)}
          </select>
          {theme && <span className="meta small">{list.find((x) => x.id === theme)?.desc}</span>}
        </label>
      )}
      {!theme && (
        <label className="fld"><span>{t('scGoalText')}</span>
          <input required minLength={3} maxLength={200} value={title} placeholder={t(nature === 'quality' ? 'scPhQuality' : 'scPhDefect')} onChange={(e) => setTitle(e.target.value)} /></label>
      )}
      {!d.consent && <label className="pz-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>{t('pzConsent')}</span></label>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="panel-actions">
        <button className="btn" disabled={busy || (!theme && title.trim().length < 3) || (!d.consent && !consent)}>{busy ? t('saving') : t('scAdd')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('cancelBtn')}</button>
      </div>
    </form>
  );
}

export default function SelfCheck({ t, call, locale }) {
  const [d, setD] = useState(null);
  const [themes, setThemes] = useState([]);
  const [adding, setAdding] = useState(null); // 'quality' | 'defect'
  const [showArchived, setShowArchived] = useState(false);
  const load = useCallback(async () => {
    const r = await call(`/me/selfcheck${showArchived ? '?archived=1' : ''}`);
    if (!r.ok) return;
    setD(r.data);
    if (r.data.themesEnabled) { const th = await call('/me/selfcheck/themes'); if (th.ok) setThemes(th.data.themes); } else setThemes([]);
  }, [call, showArchived]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { // lien « Faire mon point » du rappel par e-mail (/learning#bilan)
    if (d && typeof window !== 'undefined' && window.location.hash === '#bilan') document.getElementById('bilan')?.scrollIntoView({ block: 'start' });
  }, [d === null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;

  // Un objectif archivé quitte la liste active (sauf si l'on affiche les archivés) ; un désarchivé y revient.
  const replace = (n) => setD((v) => ({ ...v, goals: v.goals.flatMap((g) => (g.id !== n.id ? [g] : n.archived && !showArchived ? [] : [n])) }));
  const drop = (id) => setD((v) => ({ ...v, goals: v.goals.filter((g) => g.id !== id) }));
  const prefs = async (body) => { setD((v) => ({ ...v, prefs: { ...v.prefs, ...body } })); await call('/me/selfcheck/prefs', { method: 'PUT', body: JSON.stringify(body) }); };
  const download = async (format) => {
    const res = await fetch(`/api/me/selfcheck/export?format=${format}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `mon-bilan.${format}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const erase = async () => {
    if (!window.confirm(t('scEraseConfirm'))) return;
    const r = await call('/me/selfcheck', { method: 'DELETE' });
    if (r.ok) load();
  };
  const sections = [['quality', 'scQualities', 'scAddQuality'], ['defect', 'scDefects', 'scAddDefect']];
  const full = d.goals.filter((g) => !g.archived).length >= d.limit;

  return (
    <section className="lr-block sc-block" id="bilan" aria-labelledby="sc-title">
      <h2 id="sc-title">{t('scTitle')}</h2>
      <p className="meta">{t('scIntro')}</p>
      <p className="meta small">{t('scWeekHead').replace('{a}', fmt(d.week, locale)).replace('{b}', fmt(addDays(d.week, 6), locale))}</p>
      {sections.map(([nature, titleKey, addKey]) => {
        const goals = d.goals.filter((g) => g.nature === nature);
        return (
          <div key={nature} className="sc-list">
            <h3>{t(titleKey)}</h3>
            {goals.length === 0 && adding !== nature && <p className="soon">{t(nature === 'quality' ? 'scEmptyQuality' : 'scEmptyDefect')}</p>}
            <ul className="pz-clist">
              {goals.map((g) => <Goal key={g.id} g={g} weeks={d.weeks} week={d.week} commitments={d.commitments} t={t} call={call} locale={locale} onChange={replace} onRemove={drop} />)}
            </ul>
            {adding === nature
              ? <AddForm nature={nature} d={d} themes={themes} t={t} call={call} onCancel={() => setAdding(null)} onAdded={() => { setAdding(null); load(); }} />
              : <button type="button" className="btn ghost" disabled={full} onClick={() => setAdding(nature)}>+ {t(addKey)}</button>}
          </div>
        );
      })}
      {full && <p className="meta small">{t('scFull').replace('{n}', d.limit)}</p>}
      <label className="rv-email sc-archived"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t('scShowArchived')}</label>

      {d.emailEnabled && (
        <div className="sc-remind">
          <label className="rv-email"><input type="checkbox" checked={d.prefs.email} onChange={(e) => prefs({ email: e.target.checked })} /> {t('scRemind')}</label>
          {d.prefs.email && (
            <label className="sc-day">{t('scRemindDay')}{' '}
              <select value={d.prefs.weekday} onChange={(e) => prefs({ weekday: Number(e.target.value) })} aria-label={t('scRemindDay')}>
                {WEEKDAYS.map((n) => <option key={n} value={n}>{dayName(n, locale)}</option>)}
              </select>{' '}<span className="meta small">{t('scRemindHour').replace('{h}', d.emailHour)}</span>
            </label>
          )}
        </div>
      )}
      <p className="meta small">{t('scPrivacy')}</p>
      <div className="pz-tools">
        <button type="button" className="link u small" onClick={() => download('json')}>{t('scExportJson')}</button>
        <button type="button" className="link u small" onClick={() => download('csv')}>{t('scExportCsv')}</button>
        <button type="button" className="link u small" onClick={erase}>{t('scErase')}</button>
      </div>
    </section>
  );
}
