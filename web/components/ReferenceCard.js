'use client';
// Studio → une référence citée : lecture (source, minute, extrait, concordance) et relecture (valider, refuser, corriger, supprimer).
// Sert à l'onglet « Références » d'une vidéo et à la file de relecture. `onChange(référence | null)` : null = supprimée.
import { useState } from 'react';
import { clock, parseClock } from '../lib/clock';

export const COLLECTION_NAMES = {
  bukhari: 'Sahih al-Boukhari', muslim: 'Sahih Muslim', nawawi: "Les 40 hadiths d'an-Nawawi", qudsi: 'Les 40 hadiths qudsi',
  abudawud: 'Sunan Abi Dawud', ibnmajah: 'Sunan Ibn Majah', malik: 'Muwatta Malik', nasai: "Sunan an-Nasa'i",
};
const blank = { kind: 'quran', sura: '', ayaFrom: '', ayaTo: '', collection: '', number: '', saidAs: '', minute: '', excerpt: '' };

/** Formulaire d'ajout ou de correction. `r` absent = ajout. */
export function ReferenceForm({ r, t, onSave, onCancel, busy, error }) {
  const [f, setF] = useState(r ? { kind: r.kind, sura: r.sura ?? '', ayaFrom: r.ayaFrom ?? '', ayaTo: r.ayaTo && r.ayaTo !== r.ayaFrom ? r.ayaTo : '', collection: r.collection || '',
    number: r.number || '', saidAs: r.saidAs || '', minute: r.startMs != null ? clock(r.startMs) : '', excerpt: r.excerpt || '' } : blank);
  const [err, setErr] = useState(null);
  const set = (o) => { setErr(null); setF((v) => ({ ...v, ...o })); };
  const num = (v) => (v === '' ? null : Number(v));
  const submit = (e) => {
    e.preventDefault();
    let ms = null;
    if (f.minute.trim()) { ms = parseClock(f.minute); if (ms == null) { setErr(t('rfBadMinute')); return; } }
    const body = f.kind === 'quran'
      ? { kind: 'quran', sura: num(f.sura), ayaFrom: num(f.ayaFrom), ayaTo: num(f.ayaTo), startMs: ms, excerpt: f.excerpt.trim() }
      : { kind: 'hadith', collection: f.collection, number: f.number.trim(), saidAs: f.saidAs.trim(), startMs: ms, excerpt: f.excerpt.trim() };
    onSave(body);
  };
  return (
    <form className="qz-form" onSubmit={submit}>
      {!r && (
        <div className="pills" role="group" aria-label={t('rfAdd')}>
          {['quran', 'hadith'].map((k) => <button key={k} type="button" aria-pressed={f.kind === k} className={f.kind === k ? 'pill on' : 'pill'} onClick={() => set({ kind: k })}>{t(k === 'quran' ? 'rfKindQuran' : 'rfKindHadith')}</button>)}
        </div>
      )}
      {f.kind === 'quran' ? (
        <div className="rf-grid">
          <label className="fld"><span>{t('rfSura')}</span><input type="number" min={1} max={114} required value={f.sura} onChange={(e) => set({ sura: e.target.value })} /></label>
          <label className="fld"><span>{t('rfAya')}</span><input type="number" min={1} max={286} required value={f.ayaFrom} onChange={(e) => set({ ayaFrom: e.target.value })} /></label>
          <label className="fld"><span>{t('rfAyaTo')}</span><input type="number" min={1} max={286} value={f.ayaTo} onChange={(e) => set({ ayaTo: e.target.value })} /></label>
        </div>
      ) : (
        <>
          <p className="meta small">{t('rfHadithRule')}</p>
          <div className="rf-grid">
            <label className="fld"><span>{t('rfCollection')}</span>
              <select value={f.collection} onChange={(e) => set({ collection: e.target.value })}>
                <option value="">{t('rfCollectionNone')}</option>
                {Object.entries(COLLECTION_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="fld"><span>{t('rfNumber')}</span><input inputMode="numeric" pattern="[0-9]*" maxLength={20} value={f.number} onChange={(e) => set({ number: e.target.value })} /></label>
          </div>
          <label className="fld"><span>{t('rfSaid')}</span><input maxLength={200} value={f.saidAs} onChange={(e) => set({ saidAs: e.target.value })} /></label>
        </>
      )}
      <label className="fld"><span>{t('rfMinute')}</span><input className="qz-minute" inputMode="numeric" placeholder="12:30" value={f.minute} onChange={(e) => set({ minute: e.target.value })} /></label>
      <label className="fld"><span>{t('rfExcerpt')}</span><textarea rows={3} maxLength={1500} value={f.excerpt} onChange={(e) => set({ excerpt: e.target.value })} /></label>
      {(err || error) && <p className="error" role="alert">{err || error}</p>}
      <div className="panel-actions">
        <button className="btn" disabled={busy}>{busy ? t('saving') : t('save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('cancelBtn')}</button>
      </div>
    </form>
  );
}

export default function ReferenceCard({ r, t, call, onChange }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const patch = async (body) => {
    setBusy(true); setErr(null);
    const res = await call(`/studio/references/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setErr(res.data?.error || t('errGeneric')); return false; }
    onChange(res.data);
    return true;
  };
  const remove = async () => {
    if (!window.confirm(t('rfDelConfirm'))) return;
    setBusy(true);
    const res = await call(`/studio/references/${r.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) onChange(null); else setErr(res.data?.error || t('errGeneric'));
  };
  const title = r.unidentified ? t('rfUnidentified') : r.label;
  const matchLine = !r.found ? t('rfNotFound') : r.match == null ? t('rfMatchNone') : `${t('rfMatch').replace('{n}', r.match)}${r.match < 60 ? ` ${t('rfMatchLow')}` : ''}`;

  if (editing) {
    return (
      <article className="qz-card editing">
        <ReferenceForm r={r} t={t} busy={busy} error={err} onCancel={() => { setEditing(false); setErr(null); }} onSave={async (b) => { if (await patch(b)) setEditing(false); }} />
      </article>
    );
  }
  return (
    <article className={`qz-card rf-card ${r.status}`}>
      <div className="rf-head">
        <b className="rf-label">{r.talkTitle ? `${title} — ` : ''}{r.talkTitle ? <span className="meta">{r.talkTitle}</span> : title}</b>
        <span className="meta small">{r.startMs != null ? clock(r.startMs) : ''} · {r.origin === 'ai' ? t('rfFromAi') : t('rfManual')}</span>
      </div>
      {r.excerpt && <blockquote className="rf-quote">{r.excerpt}</blockquote>}
      <p className={r.found && r.match != null && r.match >= 60 ? 'meta small' : 'notice small'}>{matchLine}</p>
      {r.ar && <p className="rf-ar" dir="rtl" lang="ar">{r.ar}</p>}
      {r.fr && <p className="rf-fr">{r.fr}</p>}
      {r.kind === 'hadith' && r.status === 'draft' && <p className="meta small">{t('rfHadithRule')}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="panel-actions">
        {r.status !== 'approved' && <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'approved' })}>{t('rfApprove')}</button>}
        {r.status === 'draft' && <button className="btn ghost sm" disabled={busy} onClick={() => patch({ status: 'rejected' })}>{t('rfReject')}</button>}
        {r.status !== 'draft' && <button className="btn ghost sm" disabled={busy} onClick={() => patch({ status: 'draft' })}>{t('rfReopen')}</button>}
        <button className="btn ghost sm" disabled={busy} onClick={() => setEditing(true)}>{t('rfEdit')}</button>
        <button className="btn ghost sm" disabled={busy} onClick={remove}>{t('rfDelete')}</button>
      </div>
    </article>
  );
}
