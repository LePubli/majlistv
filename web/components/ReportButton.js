'use client';
// Étape 20 — « Signaler cette conférence » : petit formulaire en ligne (motif + précisions), compte facultatif.
import { useState } from 'react';

const REASONS = ['copyright', 'inappropriate', 'misleading', 'doctrinal', 'technical', 'other'];

export default function ReportButton({ talkId, t, call }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await call(`/talks/${talkId}/report`, { method: 'POST', body: JSON.stringify({ reason, details }) });
    setBusy(false);
    if (r.ok) { setDone(true); return; }
    setErr(r.status === 429 ? t('rpTooMany') : r.data?.error || t('errGeneric'));
  };
  if (done) return <p className="ok-msg rp-done" role="status">{t('rpThanks')}</p>;
  return (
    <div className="rp">
      <button type="button" className="fav" aria-expanded={open} onClick={() => setOpen((v) => !v)}><span aria-hidden="true">⚑</span> {t('rpButton')}</button>
      {open && (
        <form className="rp-form" onSubmit={send}>
          <p className="meta small">{t('rpIntro')}</p>
          <label className="fld"><span>{t('rpReason')}</span>
            <select required value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">{t('rpPick')}</option>
              {REASONS.map((r) => <option key={r} value={r}>{t(`rp_${r}`)}</option>)}
            </select>
          </label>
          <label className="fld"><span>{t('rpDetails')}</span>
            <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="panel-actions">
            <button className="btn" disabled={busy || !reason}>{busy ? t('saving') : t('rpSend')}</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('cancelBtn')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
