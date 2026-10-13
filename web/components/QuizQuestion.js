'use client';
// Studio → une question du quiz : lecture (réponse, explication, passage cité avec lien vers la minute) et édition.
// Sert à la fois à la page « Quiz » d'une conférence et à la file de relecture.
import { useState } from 'react';
import { clock, parseClock } from '../lib/clock';

const blank = { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', evidenceMs: null, evidenceQuote: '' };

// Formulaire de création / modification. `q` = question existante ou null.
export function QuestionForm({ q, t, onSave, onCancel, busy, error }) {
  const src = q || blank;
  const [f, setF] = useState({ ...src, options: [...src.options], minute: src.evidenceMs != null ? clock(src.evidenceMs) : '' });
  const [err, setErr] = useState(null);
  const set = (o) => { setErr(null); setF((v) => ({ ...v, ...o })); };
  const setOpt = (i, v) => set({ options: f.options.map((x, k) => (k === i ? v : x)) });
  const removeOpt = (i) => set({ options: f.options.filter((_, k) => k !== i), correctIndex: f.correctIndex === i ? 0 : f.correctIndex > i ? f.correctIndex - 1 : f.correctIndex });

  const submit = (e) => {
    e.preventDefault();
    const opts = f.options.map((o) => o.trim()).filter(Boolean);
    let ms = null;
    if (f.minute.trim()) { ms = parseClock(f.minute); if (ms == null) { setErr(t('qzBadMinute')); return; } }
    // La bonne réponse suit son texte même si des champs vides sont retirés.
    const right = f.options[f.correctIndex]?.trim();
    const correctIndex = Math.max(0, opts.findIndex((o) => o === right));
    onSave({ question: f.question.trim(), options: opts, correctIndex, explanation: f.explanation.trim(), evidenceMs: ms, evidenceQuote: f.evidenceQuote.trim() });
  };

  return (
    <form className="qz-form" onSubmit={submit}>
      <label className="fld"><span>{t('qzQuestion')}</span>
        <textarea rows={2} required minLength={5} maxLength={500} value={f.question} onChange={(e) => set({ question: e.target.value })} /></label>
      <fieldset className="fld">
        <span>{t('qzOptions')}</span>
        {f.options.map((o, i) => (
          <div key={i} className="qz-opt-edit">
            <input type="radio" name="qz-correct" checked={f.correctIndex === i} onChange={() => set({ correctIndex: i })} aria-label={t('qzCorrect')} title={t('qzCorrect')} />
            <input value={o} maxLength={300} required={i < 3} placeholder={t('qzOptPh').replace('{n}', i + 1)} onChange={(e) => setOpt(i, e.target.value)} />
            {f.options.length > 3 && <button type="button" className="link" onClick={() => removeOpt(i)} aria-label={t('qzRemoveOpt')}>✕</button>}
          </div>
        ))}
        {f.options.length < 4 && <button type="button" className="link u" onClick={() => set({ options: [...f.options, ''] })}>+ {t('qzAddOpt')}</button>}
        <span className="meta small">{t('qzCorrectHelp')}</span>
      </fieldset>
      <label className="fld"><span>{t('qzExplanation')}</span>
        <textarea rows={2} maxLength={1000} value={f.explanation} onChange={(e) => set({ explanation: e.target.value })} /></label>
      <label className="fld"><span>{t('qzMinute')}</span>
        <input className="qz-minute" inputMode="numeric" placeholder="12:30" value={f.minute} onChange={(e) => set({ minute: e.target.value })} /></label>
      <label className="fld"><span>{t('qzQuote')}</span>
        <textarea rows={3} maxLength={1500} value={f.evidenceQuote} onChange={(e) => set({ evidenceQuote: e.target.value })} /></label>
      {(err || error) && <p className="error" role="alert">{err || error}</p>}
      <div className="panel-actions">
        <button className="btn" disabled={busy}>{busy ? t('saving') : t('save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('cancelBtn')}</button>
      </div>
    </form>
  );
}

// Carte d'une question. `onChange(question | null)` : null = supprimée.
export default function QuizQuestion({ q, t, call, onChange, showTalk = false }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const patch = async (body) => {
    setBusy(true); setErr(null);
    const r = await call(`/studio/quiz/questions/${q.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return false; }
    onChange(r.data);
    return true;
  };
  const remove = async () => {
    if (!window.confirm(t('qzConfirmDel'))) return;
    const r = await call(`/studio/quiz/questions/${q.id}`, { method: 'DELETE' });
    if (r.ok) onChange(null); else setErr(r.data?.error || t('errGeneric'));
  };

  if (editing) {
    return (
      <article className="qz-card editing">
        <QuestionForm q={q} t={t} busy={busy} error={err} onCancel={() => { setEditing(false); setErr(null); }}
          onSave={async (b) => { if (await patch(b)) setEditing(false); }} />
      </article>
    );
  }
  const sec = q.evidenceMs != null ? Math.floor(q.evidenceMs / 1000) : null;
  return (
    <article className={`qz-card ${q.status}`}>
      {showTalk && <p className="qz-talk meta small">{q.talkTitle}</p>}
      <div className="qz-head">
        <b className="qz-q">{q.question}</b>
        <span className={`qz-origin ${q.origin}`}>{q.origin === 'ai' ? t('qzFromAi') : t('qzManual')}</span>
      </div>
      <ol className="qz-opts" type="A">
        {q.options.map((o, i) => <li key={i} className={i === q.correctIndex ? 'right' : ''}>{o}{i === q.correctIndex && <span className="qz-tick" aria-label={t('qzCorrect')}> ✓</span>}</li>)}
      </ol>
      {q.explanation && <p className="qz-expl">{q.explanation}</p>}
      <div className="qz-proof">
        {sec != null ? (
          <a className="qz-at" href={`/talks/${q.talkId}?t=${sec}`} target="_blank" rel="noreferrer">▶ {t('qzAt').replace('{m}', clock(q.evidenceMs))}</a>
        ) : <span className="qz-missing">{t('qzNoMinute')}</span>}
        {q.chapterTitle && <span className="meta small"> · {t('qzChapter')} : {q.chapterTitle}</span>}
        {q.evidenceQuote && <blockquote>{q.evidenceQuote}</blockquote>}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="qz-actions">
        {q.status !== 'approved' && <button className="btn" disabled={busy} onClick={() => patch({ status: 'approved' })}>{t('qzApprove')}</button>}
        {q.status === 'draft' && <button className="btn ghost" disabled={busy} onClick={() => patch({ status: 'rejected' })}>{t('qzReject')}</button>}
        {q.status !== 'draft' && <button className="btn ghost" disabled={busy} onClick={() => patch({ status: 'draft' })}>{t('qzUndo')}</button>}
        <button className="btn ghost" onClick={() => setEditing(true)}>{t('qzEdit')}</button>
        <button className="link u" onClick={remove}>{t('qzDelete')}</button>
      </div>
    </article>
  );
}
