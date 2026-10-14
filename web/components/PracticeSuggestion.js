'use client';
// Studio → une proposition d'action : lecture (taille, passage cité, référence) et édition.
// Sert à l'onglet « Mise en pratique » d'une conférence et à la file de relecture.
import { useState } from 'react';
import { clock, parseClock } from '../lib/clock';

export const SIZES = [1, 2, 3];
export const dots = (n) => '●'.repeat(n);
const blank = { text: '', size: 1, reference: '', evidenceMs: null, evidenceQuote: '' };

export function SuggestionForm({ s, t, onSave, onCancel, busy, error }) {
  const src = s || blank;
  const [f, setF] = useState({ ...src, minute: src.evidenceMs != null ? clock(src.evidenceMs) : '' });
  const [err, setErr] = useState(null);
  const set = (o) => { setErr(null); setF((v) => ({ ...v, ...o })); };
  const submit = (e) => {
    e.preventDefault();
    let ms = null;
    if (f.minute.trim()) { ms = parseClock(f.minute); if (ms == null) { setErr(t('qzBadMinute')); return; } }
    onSave({ text: f.text.trim(), size: f.size, reference: f.reference.trim(), evidenceMs: ms, evidenceQuote: f.evidenceQuote.trim() });
  };
  return (
    <form className="qz-form" onSubmit={submit}>
      <label className="fld"><span>{t('pzText')}</span>
        <textarea rows={2} required minLength={8} maxLength={220} value={f.text} onChange={(e) => set({ text: e.target.value })} />
        <span className="meta small">{t('pzTextHelp')}</span></label>
      <fieldset className="fld">
        <span>{t('pzSize')}</span>
        <div className="pills">
          {SIZES.map((n) => <button key={n} type="button" aria-pressed={f.size === n} className={f.size === n ? 'pill on' : 'pill'} onClick={() => set({ size: n })}>{dots(n)} {t(`pzSize${n}`)}</button>)}
        </div>
      </fieldset>
      <label className="fld"><span>{t('pzRef')}</span>
        <input maxLength={300} value={f.reference} onChange={(e) => set({ reference: e.target.value })} />
        <span className="meta small">{t('pzRefHelp')}</span></label>
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

// Carte d'une proposition. `onChange(proposition | null)` : null = supprimée.
export default function PracticeSuggestion({ s, t, call, onChange, showTalk = false }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const patch = async (body) => {
    setBusy(true); setErr(null);
    const r = await call(`/studio/practice/suggestions/${s.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return false; }
    onChange(r.data);
    return true;
  };
  const remove = async () => {
    if (!window.confirm(t('pzConfirmDel'))) return;
    const r = await call(`/studio/practice/suggestions/${s.id}`, { method: 'DELETE' });
    if (r.ok) onChange(null); else setErr(r.data?.error || t('errGeneric'));
  };

  if (editing) {
    return (
      <article className="qz-card editing">
        <SuggestionForm s={s} t={t} busy={busy} error={err} onCancel={() => { setEditing(false); setErr(null); }}
          onSave={async (b) => { if (await patch(b)) setEditing(false); }} />
      </article>
    );
  }
  const sec = s.evidenceMs != null ? Math.floor(s.evidenceMs / 1000) : null;
  return (
    <article className={`qz-card ${s.status}`}>
      {showTalk && <p className="qz-talk meta small">{s.talkTitle}</p>}
      <div className="qz-head">
        <b className="qz-q"><span className="pz-size" title={t(`pzSize${s.size}`)} aria-label={t(`pzSize${s.size}`)}>{dots(s.size)}</span> {s.text}</b>
        <span className={`qz-origin ${s.origin}`}>{s.origin === 'ai' ? t('qzFromAi') : t('qzManual')}</span>
      </div>
      {s.reference && <p className="meta small">{t('pzRef')} : {s.reference}</p>}
      <div className="qz-proof">
        {sec != null && <a className="qz-at" href={`/talks/${s.talkId}?t=${sec}`} target="_blank" rel="noreferrer">▶ {t('qzAt').replace('{m}', clock(s.evidenceMs))}</a>}
        {s.evidenceQuote && <blockquote>{s.evidenceQuote}</blockquote>}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="qz-actions">
        {s.status !== 'approved' && <button className="btn" disabled={busy} onClick={() => patch({ status: 'approved' })}>{t('qzApprove')}</button>}
        {s.status === 'draft' && <button className="btn ghost" disabled={busy} onClick={() => patch({ status: 'rejected' })}>{t('qzReject')}</button>}
        {s.status !== 'draft' && <button className="btn ghost" disabled={busy} onClick={() => patch({ status: 'draft' })}>{t('qzUndo')}</button>}
        <button className="btn ghost" onClick={() => setEditing(true)}>{t('qzEdit')}</button>
        <button className="link u" onClick={remove}>{t('qzDelete')}</button>
      </div>
    </article>
  );
}
