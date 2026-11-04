'use client';
// Mon planning (palier « Apprentissage ») — étape 1 : vues jour / semaine / mois.
// Données : GET /me/learning/plan?from&to (révisions automatiques, séances du membre, jours de repos, jours déjà faits).
// Actions : POST/PATCH/DELETE /me/learning/plan[/:id], PUT /me/learning/plan/rest.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

const DAY = 86400000;
const ms = (d) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d, n) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
const mondayOf = (d) => addDays(d, -((new Date(ms(d)).getUTCDay() + 6) % 7));
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const addMonths = (d, n) => { const x = new Date(ms(monthStart(d))); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

/** Fenêtre de dates à charger pour une vue. */
export function windowOf(view, cursor) {
  if (view === 'day') return { from: cursor, to: cursor };
  if (view === 'week') { const m = mondayOf(cursor); return { from: m, to: addDays(m, 6) }; }
  const m = mondayOf(monthStart(cursor)); return { from: m, to: addDays(m, 41) };
}

export default function PlanningClient() {
  const { t, locale, call } = useApp();
  const today0 = useMemo(parisToday, []);
  const [view, setView] = useState('week');
  const [cursor, setCursor] = useState(today0);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null); // { day } quand le formulaire d'ajout est ouvert
  const [moving, setMoving] = useState(null); // id de la séance dont on choisit un nouveau jour

  // Sur téléphone, la vue « jour » est plus lisible : on y démarre une seule fois.
  useEffect(() => { try { if (window.matchMedia('(max-width: 640px)').matches) setView('day'); } catch { /* ignoré */ } }, []);

  const win = useMemo(() => windowOf(view, cursor), [view, cursor]);
  const load = useCallback(() => call(`/me/learning/plan?from=${win.from}&to=${win.to}`).then((r) => { if (r.ok) { setData(r.data); setErr(''); } else setErr(r.data?.error || t('pnErr')); }), [call, win.from, win.to, t]);
  useEffect(() => { load(); }, [load]);

  const today = data?.today || today0;
  const loc = locale === 'ar' ? 'ar-u-nu-latn' : locale;
  const fmt = (d, o) => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));

  // Regroupe tout par jour.
  const byDay = useMemo(() => {
    const m = new Map();
    const at = (d) => { if (!m.has(d)) m.set(d, { auto: [], mine: [] }); return m.get(d); };
    for (const a of data?.auto || []) at(a.day).auto.push(a);
    for (const i of data?.items || []) at(i.day).mine.push(i);
    return m;
  }, [data]);
  const rest = useMemo(() => new Set(data?.rest || []), [data]);
  const active = useMemo(() => new Set(data?.active || []), [data]);
  const of = (d) => byDay.get(d) || { auto: [], mine: [] };

  const act = async (fn) => { setErr(''); const r = await fn(); if (!r.ok) setErr(r.data?.error || t('pnErr')); await load(); return r.ok; };
  const toggle = (it) => act(() => call(`/me/learning/plan/${it.id}`, { method: 'PATCH', body: JSON.stringify({ done: !it.done }) }));
  const del = (it) => act(() => call(`/me/learning/plan/${it.id}`, { method: 'DELETE' }));
  const move = async (it, day) => { setMoving(null); if (day && day !== it.day) await act(() => call(`/me/learning/plan/${it.id}`, { method: 'PATCH', body: JSON.stringify({ day }) })); };
  const setRest = (day, on) => act(() => call('/me/learning/plan/rest', { method: 'PUT', body: JSON.stringify({ day, rest: on }) }));

  const step = (n) => setCursor((c) => (view === 'day' ? addDays(c, n) : view === 'week' ? addDays(c, 7 * n) : addMonths(c, n)));
  const title = view === 'day' ? fmt(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : view === 'week' ? `${fmt(win.from, { day: 'numeric', month: 'short' })} – ${fmt(win.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : fmt(cursor, { month: 'long', year: 'numeric' });

  // Tout le cycle : chaque type renvoie vers son onglet d'Apprendre.
  const TAB = { cards: 'cards', quran: 'quran', athkar: 'athkar', action: 'commit', bilan: 'bilan' };
  const NAME = { cards: 'pnCards', quran: 'qrNav', athkar: 'atTab', action: 'tbCommit', bilan: 'msBilan', revision: 'pnAuto' };
  const label = (a) => ({
    cards: () => (a.count === 1 ? t('pnCard1') : t('pnCardsN').replace('{n}', a.count)),
    quran: () => t('pnJuz').replace('{n}', a.juz),
    athkar: () => t('pnAthkarDay').replace('{n}', a.goal),
    bilan: () => t('pnBilanDo'),
  }[a.type]?.() ?? a.title);
  const tag = (a) => t(NAME[a.type]);
  const sub = (a) => (a.type === 'revision' ? t('pnStage').replace('{n}', (a.stage ?? 0) + 1) : '');
  const href = (a) => (a.type === 'revision' ? `/talks/${a.talkId}?quiz=1` : `/learning?tab=${TAB[a.type]}`);
  const KIND_KEY = { video: 'pnVideo', quiz: 'pnQuiz', custom: 'pnNote', cards: 'pnKindCards', quran: 'pnKindQuran', athkar: 'pnKindAthkar', action: 'pnKindAction', bilan: 'pnKindBilan' };
  const mineTag = (i) => t(i.kind === 'cards' ? 'pnCards' : i.kind === 'quran' ? 'qrNav' : i.kind === 'athkar' ? 'atTab' : i.kind === 'action' ? 'tbCommit' : i.kind === 'bilan' ? 'msBilan' : KIND_KEY[i.kind]);
  const mineHref = (i) => (i.kind === 'quiz' ? `/talks/${i.talkId}?quiz=1` : i.kind === 'video' ? `/talks/${i.talkId}` : i.kind === 'custom' ? null : `/learning?tab=${TAB[i.kind]}`);
  const mineText = (i) => (i.kind === 'custom' ? i.note : i.kind === 'video' || i.kind === 'quiz' ? i.title : (i.note || t(KIND_KEY[i.kind])));
  const todoN = (d) => { const x = of(d); return x.auto.filter((a) => !a.done).length + x.mine.filter((i) => !i.done).length; };
  const canPlan = (d) => d >= today;

  // Une ligne (révision automatique ou séance du membre).
  const Auto = ({ a, k }) => (
    <li key={`a${k}`} className={`pn-it pn-auto${a.done ? ' is-done' : ''}`}>
      <span className="pn-tag">{tag(a)}{a.done ? ' ✓' : ''}</span>
      <Link href={href(a)} className="pn-ti">{label(a)}</Link>
      {sub(a) && <small>{sub(a)}</small>}
    </li>
  );
  const Mine = ({ i, bare }) => {
    const h = mineHref(i); const text = mineText(i);
    return (
      <li key={i.id} className={`pn-it pn-mine${i.done ? ' is-done' : ''}`}>
        <div className="pn-row">
          <button type="button" className={`pn-ck${i.done ? ' on' : ''}`} aria-pressed={i.done} aria-label={i.done ? t('pnUncheck') : t('pnCheck')} onClick={() => toggle(i)}>{i.done ? '✓' : ''}</button>
          <div className="pn-body"><span className="pn-tag">{bare ? mineTag(i) : `${t('pnMine')} · ${mineTag(i)}`}</span>{h ? <Link href={h} className="pn-ti">{text}</Link> : <span className="pn-ti">{text}</span>}</div>
        </div>
        <div className={`pn-acts${bare ? ' compact' : ''}`}>
          {moving === i.id ? (
            <input type="date" className="pn-date" aria-label={t('pnMove')} min={today} defaultValue={i.day} autoFocus onChange={(e) => e.target.value && move(i, e.target.value)} onBlur={() => setMoving(null)} />
          ) : (
            <button type="button" className="link u small" aria-label={t('pnMove')} title={t('pnMove')} onClick={() => setMoving(i.id)}>{bare ? '↔' : t('pnMove')}</button>
          )}
          <button type="button" className="link u small" aria-label={t('pnDelete')} title={t('pnDelete')} onClick={() => del(i)}>{bare ? '✕' : t('pnDelete')}</button>
        </div>
      </li>
    );
  };

  const DayList = ({ d, bare }) => {  // appelé comme une fonction (pas un composant) pour ne pas remonter le DOM à chaque rendu
    const x = of(d);
    const empty = !x.auto.length && !x.mine.length;
    return (
      <>
        {rest.has(d) && <p className="pn-rest">{t('pnRest')}</p>}
        {active.has(d) && !bare && <p className="pn-actv">✓ {t('pnDoneDay')}</p>}
        {(x.auto.length > 0 || x.mine.length > 0) && <ul className="pn-list">{x.auto.map((a, k) => Auto({ a, k }))}{x.mine.map((i) => Mine({ i, bare }))}</ul>}
        {empty && !rest.has(d) && !bare && <p className="meta small">{t('pnEmpty')}</p>}
      </>
    );
  };

  const addBtn = (d, small) => canPlan(d) && <button type="button" className={small ? 'pn-add' : 'btn ghost'} onClick={() => setForm({ day: d })}>{small ? `+ ${t('pnAddHere')}` : `+ ${t('pnAdd')}`}</button>;
  const restBtn = (d) => canPlan(d) && !of(d).mine.length && (
    <button type="button" className="link u small" onClick={() => setRest(d, !rest.has(d))}>{rest.has(d) ? t('pnRestUnset') : t('pnRestSet')}</button>
  );

  // ─── Vues ───
  let body;
  if (!data) body = <p className="meta">{t('pnLoading')}</p>;
  else if (view === 'day') {
    body = (
      <section className="pn-dayview" aria-live="polite">
        <div className="pn-strip" role="group" aria-label={t('pnWeek')}>
          {Array.from({ length: 7 }, (_, k) => addDays(mondayOf(cursor), k)).map((d) => (
            <button key={d} type="button" className={`pn-sd${d === cursor ? ' sel' : ''}${d === today ? ' is-today' : ''}${active.has(d) ? ' act' : ''}`} onClick={() => setCursor(d)} aria-current={d === cursor ? 'date' : undefined}>
              <small>{fmt(d, { weekday: 'narrow' })}</small><b>{fmt(d, { day: 'numeric' })}</b>
            </button>
          ))}
        </div>
        <p className="meta small">{todoN(cursor) > 0 ? t('pnTodoN').replace('{n}', todoN(cursor)) : ''}</p>
        {DayList({ d: cursor })}
        <p className="pn-actions">{addBtn(cursor)} {restBtn(cursor)}</p>
        {cursor === today && <p className="meta small">{t('pnLate')}</p>}
      </section>
    );
  } else if (view === 'week') {
    body = (
      <ol className="pn-week">
        {Array.from({ length: 7 }, (_, k) => addDays(win.from, k)).map((d) => (
          <li key={d} className={`pn-col${d === today ? ' is-today' : ''}${rest.has(d) ? ' is-rest' : ''}`}>
            <h3><button type="button" className="pn-dh" onClick={() => { setCursor(d); setView('day'); }}><span>{fmt(d, { weekday: 'short' })}</span> <b>{fmt(d, { day: 'numeric' })}</b></button>{active.has(d) && <span className="pn-ok" role="img" aria-label={t('pnDoneDay')}>✓</span>}</h3>
            {DayList({ d, bare: true })}
            <div className="pn-colact">{addBtn(d, true)} {restBtn(d)}</div>
          </li>
        ))}
      </ol>
    );
  } else {
    const first = win.from; const cur = cursor.slice(0, 7);
    body = (
      <div className="pn-month" role="grid" aria-label={title}>
        {Array.from({ length: 7 }, (_, k) => <div key={k} className="pn-mh" role="columnheader">{fmt(addDays(first, k), { weekday: 'short' })}</div>)}
        {Array.from({ length: 42 }, (_, k) => addDays(first, k)).map((d) => {
          const x = of(d); const n = x.auto.length + x.mine.length;
          return (
            <button key={d} type="button" role="gridcell" className={`pn-c${d.slice(0, 7) !== cur ? ' other' : ''}${d === today ? ' is-today' : ''}${rest.has(d) ? ' is-rest' : ''}`} onClick={() => { setCursor(d); setView('day'); }} aria-label={`${fmt(d, { dateStyle: 'full' })}${n ? ` — ${n}` : ''}`}>
              <b>{fmt(d, { day: 'numeric' })}</b>
              {active.has(d) && <span className="pn-ok" aria-hidden="true">✓</span>}
              {n > 0 && <span className="pn-dots" aria-hidden="true">{x.auto.length > 0 && <i />}{x.mine.length > 0 && <i className="m" />}{n > 1 && <em>{n}</em>}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section className="pn" aria-label={t('pnTitle')}>
      <header className="pn-head"><h2>{t('pnTitle')}</h2><p className="meta">{t('pnSub')}</p></header>
      <div className="pn-bar">
        <div className="pn-seg" role="group" aria-label={t('pnTab')}>
          {['day', 'week', 'month'].map((v) => <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{t({ day: 'pnDay', week: 'pnWeek', month: 'pnMonth' }[v])}</button>)}
        </div>
        <div className="pn-nav">
          <button type="button" className="btn ghost" aria-label={t('pnPrev')} onClick={() => step(-1)}>‹</button>
          <button type="button" className="btn ghost" onClick={() => setCursor(today)}>{t('pnToday')}</button>
          <button type="button" className="btn ghost" aria-label={t('pnNext')} onClick={() => step(1)}>›</button>
        </div>
        <b className="pn-title">{title}</b>
        <span className="pn-sp" />
        <button type="button" className="btn" onClick={() => setForm({ day: canPlan(cursor) ? cursor : today })}>+ {t('pnAdd')}</button>
      </div>
      {data && <p className="pn-goal">{t('pnGoal').replace('{a}', data.week.done).replace('{b}', data.goal)}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {body}
      <p className="pn-legend"><span><i className="a" />{t('pnLegAuto')}</span><span><i className="m" />{t('pnLegMine')}</span><span><i className="d" />{t('pnLegDone')}</span></p>
      <p className="meta small">{t('pnSoon')}</p>
      {form && <AddForm day={form.day} today={today} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </section>
  );
}

const TALK_KINDS = ['video', 'quiz']; // séances liées à une vidéo ; les autres (cartes, Coran, adhkar, action, bilan, note) n'en ont pas

// Formulaire d'ajout d'une séance (fenêtre modale simple).
function AddForm({ day, today, onClose, onSaved }) {
  const { t, call } = useApp();
  const [d, setD] = useState(day);
  const [kind, setKind] = useState('video');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [talk, setTalk] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Recherche d'une vidéo (après une courte pause de frappe).
  useEffect(() => {
    if (!TALK_KINDS.includes(kind) || q.trim().length < 2) { setRes(null); return undefined; }
    const h = setTimeout(() => call(`/talks?q=${encodeURIComponent(q.trim())}&limit=8`).then((r) => setRes(r.ok && Array.isArray(r.data) ? r.data : [])), 250);
    return () => clearTimeout(h);
  }, [q, kind, call]);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const ready = TALK_KINDS.includes(kind) ? !!talk : kind === 'custom' ? note.trim().length > 0 : true;
  const save = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const body = TALK_KINDS.includes(kind) ? { day: d, kind, talkId: talk.id } : { day: d, kind, note: note.trim() };
    const r = await call('/me/learning/plan', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onSaved(); else setErr(r.data?.error || t('pnErr'));
  };

  return (
    <div className="pn-modal" role="dialog" aria-modal="true" aria-label={t('pnFormTitle')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="pn-form" onSubmit={save}>
        <h3>{t('pnFormTitle')}</h3>
        <label>{t('pnFormDay')}<input type="date" value={d} min={today} onChange={(e) => e.target.value && setD(e.target.value)} required /></label>
        <fieldset className="pn-kinds"><legend>{t('pnFormKind')}</legend>
          {[['video', 'pnKindVideo'], ['quiz', 'pnKindQuiz'], ['cards', 'pnKindCards'], ['quran', 'pnKindQuran'], ['athkar', 'pnKindAthkar'], ['action', 'pnKindAction'], ['bilan', 'pnKindBilan'], ['custom', 'pnKindCustom']].map(([k, key]) => (
            <label key={k} className={kind === k ? 'on' : ''}><input type="radio" name="pn-kind" checked={kind === k} onChange={() => { setKind(k); setTalk(null); setNote(''); }} />{t(key)}</label>
          ))}
        </fieldset>
        {!TALK_KINDS.includes(kind) ? (
          <label>{kind === 'custom' ? t('pnNote') : t('pnNoteOpt')}<input type="text" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('pnCustomPh')} autoFocus /></label>
        ) : (
          <div>
            {talk ? (
              <p className="pn-picked"><b>{talk.title}</b> <button type="button" className="link u small" onClick={() => setTalk(null)}>{t('pnCancel')}</button></p>
            ) : (
              <>
                <label>{t('pnSearch')}<input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
                {res && res.length === 0 && <p className="meta small">{t('pnNoResult')}</p>}
                {res && res.length > 0 && <ul className="pn-res">{res.map((x) => <li key={x.id}><button type="button" onClick={() => setTalk(x)}><b>{x.title}</b>{x.speaker ? <small>{x.speaker}</small> : null}</button></li>)}</ul>}
              </>
            )}
          </div>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="pn-fa"><button type="submit" className="btn" disabled={!ready || busy}>{t('pnSave')}</button><button type="button" className="btn ghost" onClick={onClose}>{t('pnCancel')}</button></div>
      </form>
    </div>
  );
}
