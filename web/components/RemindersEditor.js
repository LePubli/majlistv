'use client';
// Rappels d'une conférence (onglet « Rappels » du Studio, indépendant du quiz) et composant d'un rappel, réutilisé par Studio → Rappels.
// Aucune IA pour ces trois origines : extrait mot pour mot de la transcription, citation d'un quiz validé, ou saisie à la main avec sa source.
import { useCallback, useEffect, useState } from 'react';
import { clock, parseClock } from '../lib/clock';

export function Item({ r, t, call, onChange }) {
  const locked = r.origin === 'corpus'; // citation du corpus : le texte est celui de la source, il ne se modifie pas
  const [text, setText] = useState(r.text);
  const [ar, setAr] = useState(r.textAr || '');
  const [src, setSrc] = useState(r.attribution);
  const [err, setErr] = useState(null);
  const dirty = !locked && (text !== r.text || src !== r.attribution || ar !== (r.textAr || ''));
  const send = async (body) => {
    setErr(null);
    const x = await call(`/studio/reminders/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!x.ok) { setErr(x.data?.code === 'source_required' ? t('rmNeedSource') : (x.data?.error || t('errGeneric'))); return; }
    onChange();
  };
  const del = async () => { if (window.confirm(t('rmDelConfirm'))) { await call(`/studio/reminders/${r.id}`, { method: 'DELETE' }); onChange(); } };
  return (
    <li className={`rm-item ${r.status}`}>
      <div className="rm-head">
        <span className={`rm-tag ${r.status}`}>{t(r.status === 'approved' ? 'rmApproved' : 'rmDraft')}</span>
        <span className="meta small">{t(`rmOrigin_${r.origin}`)}{r.startMs != null ? ` · ${clock(r.startMs)}` : ''}{r.talkTitle ? ` · ${r.talkTitle}` : ''}</span>
      </div>
      {locked ? (
        <>
          {r.textAr && <p className="rm-ar" dir="rtl" lang="ar">{r.textAr}</p>}
          <p className="rm-fr">{r.text}</p>
          <p className="meta small">{r.attribution}</p>
        </>
      ) : (
        <>
          <textarea rows={3} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('rmText')} dir="auto" />
          {r.origin === 'manual' && <textarea rows={2} maxLength={1600} value={ar} onChange={(e) => setAr(e.target.value)} placeholder={t('rmArPh')} aria-label={t('rmArLabel')} dir="rtl" lang="ar" />}
          <input value={src} maxLength={300} onChange={(e) => setSrc(e.target.value)} placeholder={t('rmSourcePh')} aria-label={t('rmSource')} />
        </>
      )}
      {text !== r.text && r.origin !== 'manual' && <p className="meta small">{t('rmEditWarn')}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="rm-actions">
        {dirty && <button type="button" className="btn ghost" onClick={() => send({ text, attribution: src, ...(r.origin === 'manual' ? { textAr: ar } : {}) })}>{t('save')}</button>}
        {r.status === 'draft'
          ? <button type="button" className="btn" disabled={dirty} onClick={() => send({ status: 'approved' })}>{t('rmApprove')}</button>
          : <button type="button" className="btn ghost" onClick={() => send({ status: 'draft' })}>{t('rmUnapprove')}</button>}
        <button type="button" className="link u small" onClick={del}>{t('delete')}</button>
      </div>
    </li>
  );
}

export default function RemindersEditor({ id, t, call }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [man, setMan] = useState({ text: '', attribution: '', at: '' });
  const [ext, setExt] = useState({ from: '', to: '' });

  const load = useCallback(async () => { const r = await call(`/talks/${id}/studio/reminders`); if (r.ok) setD(r.data); }, [call, id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;

  const fail = (r) => setMsg({ ok: false, text: r.data?.code === 'empty' ? t('rmEmpty') : r.data?.code === 'length' ? t('rmLength') : (r.data?.error || t('errGeneric')) });
  const addManual = async (e) => {
    e.preventDefault(); setMsg(null);
    const at = man.at.trim() ? parseClock(man.at) : null;
    if (man.at.trim() && at === null) { setMsg({ ok: false, text: t('qzBadMinute') }); return; }
    const r = await call(`/talks/${id}/studio/reminders`, { method: 'POST', body: JSON.stringify({ text: man.text, attribution: man.attribution, startMs: at, lang: d.sourceLang?.slice(0, 2) || 'fr' }) });
    if (!r.ok) return fail(r);
    setMan({ text: '', attribution: '', at: '' }); load();
  };
  const addExtract = async (e) => {
    e.preventDefault(); setMsg(null);
    const from = parseClock(ext.from);
    const to = ext.to.trim() ? parseClock(ext.to) : undefined;
    if (from === null || to === null) { setMsg({ ok: false, text: t('qzBadMinute') }); return; }
    const r = await call(`/talks/${id}/studio/reminders/from-transcript`, { method: 'POST', body: JSON.stringify({ fromMs: from, ...(to !== undefined ? { toMs: to } : {}) }) });
    if (!r.ok) return fail(r);
    setExt({ from: '', to: '' }); load();
  };
  const fromQuiz = async () => {
    setMsg(null);
    const r = await call(`/talks/${id}/studio/reminders/from-quiz`, { method: 'POST' });
    if (!r.ok) return fail(r);
    setMsg({ ok: true, text: t('rmAdded').replace('{n}', r.data.added) }); load();
  };
  const list = d.reminders;
  return (
    <section className="panel rm-panel">
      <h2 className="panel-title">{t('rmTitle')}</h2>
      <p className="meta small">{t('rmIntro')}</p>
      <div className="rm-tools">
        <form onSubmit={addExtract} className="rm-form">
          <b>{t('rmFromTranscript')}</b>
          <div className="rm-row">
            <input value={ext.from} onChange={(e) => setExt({ ...ext, from: e.target.value })} placeholder="12:30" aria-label={t('rmFrom')} inputMode="numeric" required disabled={!d.transcriptReady} />
            <input value={ext.to} onChange={(e) => setExt({ ...ext, to: e.target.value })} placeholder={t('rmToPh')} aria-label={t('rmTo')} inputMode="numeric" disabled={!d.transcriptReady} />
            <button className="btn ghost" disabled={!d.transcriptReady}>{t('rmExtract')}</button>
          </div>
          <span className="meta small">{t('rmExtractHelp')}</span>
        </form>
        <div className="rm-form">
          <b>{t('rmFromQuiz')}</b>
          <button type="button" className="btn ghost" onClick={fromQuiz}>{t('rmFromQuizBtn')}</button>
        </div>
        <form onSubmit={addManual} className="rm-form">
          <b>{t('rmManual')}</b>
          <textarea rows={3} maxLength={800} required value={man.text} onChange={(e) => setMan({ ...man, text: e.target.value })} placeholder={t('rmTextPh')} dir="auto" />
          <input required minLength={3} maxLength={300} value={man.attribution} onChange={(e) => setMan({ ...man, attribution: e.target.value })} placeholder={t('rmSourcePh')} />
          <div className="rm-row">
            <input value={man.at} onChange={(e) => setMan({ ...man, at: e.target.value })} placeholder={t('rmAtPh')} aria-label={t('rmAt')} inputMode="numeric" />
            <button className="btn ghost">{t('rmAdd')}</button>
          </div>
        </form>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      {list.length === 0 ? <p className="meta">{t('rmNone')}</p> : <ul className="rm-list">{list.map((r) => <Item key={r.id + r.status + r.text + r.attribution} r={r} t={t} call={call} onChange={load} />)}</ul>}
    </section>
  );
}
