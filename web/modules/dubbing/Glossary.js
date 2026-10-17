'use client';
// Studio → Audio et doublage → Glossaire (étape D1b) : un seul glossaire de prononciation pour tout le site.
// Chaque terme est remplacé, uniquement pour la voix, par la façon de le prononcer (les sous-titres ne changent pas).
import { useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';
import { tf } from './shared';

const EMPTY = { term: '', say: '', wholeWord: true, caseSensitive: false, notes: '' };

// Formulaire d'ajout ou de modification d'un terme.
function EntryForm({ initial, onSubmit, onCancel, submitLabel }) {
  const { t } = useApp();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p) => { setV({ ...v, ...p }); setErr(''); };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const r = await onSubmit(v);
    setBusy(false);
    if (!r.ok) setErr(r.data?.code === 'duplicate' ? t('dbGlDuplicate') : r.data?.error || t('dbError'));
    else if (!onCancel) setV(EMPTY);
  };
  return (
    <form className="db-gl-form" onSubmit={submit}>
      <div className="db-add-grid">
        <label className="fld"><span>{t('dbGlTerm')}</span><input value={v.term} maxLength={80} required onChange={(e) => set({ term: e.target.value })} placeholder="Ibn Outhaymine" /></label>
        <label className="fld"><span>{t('dbGlSay')}</span><input value={v.say} maxLength={160} required onChange={(e) => set({ say: e.target.value })} placeholder="Ibne Outhaïmine" /></label>
        <label className="fld"><span>{t('dbGlNotes')}</span><input value={v.notes || ''} maxLength={300} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      <div className="db-gl-opts">
        <label className="db-check"><input type="checkbox" checked={v.wholeWord} onChange={(e) => set({ wholeWord: e.target.checked })} /><span>{t('dbGlWhole')}</span></label>
        <label className="db-check"><input type="checkbox" checked={v.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} /><span>{t('dbGlCase')}</span></label>
      </div>
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="db-actions">
        <button type="submit" className="btn" disabled={busy || !v.term.trim() || !v.say.trim()}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>{t('dbCancel')}</button>}
      </div>
    </form>
  );
}

export default function Glossary() {
  const { t, call } = useApp();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [editId, setEditId] = useState(null);
  const [sample, setSample] = useState('');
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => call(`/studio/dubbing/glossary?q=${encodeURIComponent(q.trim())}`).then((r) => r.ok && setRows(r.data.entries));
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  // Zone d'essai : ce que la voix va lire, avec le glossaire actif.
  useEffect(() => {
    if (!sample.trim()) { setPreview(null); return undefined; }
    const h = setTimeout(() => call(`/studio/dubbing/glossary?text=${encodeURIComponent(sample)}`).then((r) => r.ok && setPreview(r.data.preview)), 300);
    return () => clearTimeout(h);
  }, [sample, rows, call]);

  const add = async (v) => {
    const r = await call('/studio/dubbing/glossary', { method: 'POST', body: JSON.stringify(v) });
    if (r.ok) { setMsg({ ok: true, text: tf(t('dbGlAdded'), { t: r.data.term }) }); load(); }
    return r;
  };
  const patch = async (id, body) => {
    const r = await call(`/studio/dubbing/glossary/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (r.ok) { setRows((cur) => cur.map((e) => (e.id === id ? r.data : e))); setEditId(null); }
    else setMsg({ ok: false, text: r.data?.code === 'duplicate' ? t('dbGlDuplicate') : r.data?.error || t('dbError') });
    return r;
  };
  const remove = async (e) => {
    if (!window.confirm(tf(t('dbGlConfirmDelete'), { t: e.term }))) return;
    const r = await call(`/studio/dubbing/glossary/${e.id}`, { method: 'DELETE' });
    if (r.ok) { setRows((cur) => cur.filter((x) => x.id !== e.id)); setMsg({ ok: true, text: t('dbGlDeleted') }); }
    else setMsg({ ok: false, text: r.data?.error || t('dbError') });
  };

  return (
    <div className="db-glossary">
      <section className="sd-card">
        <h2>{t('dbGlTitle')}</h2>
        <p className="meta">{t('dbGlIntro')}</p>
        <EntryForm initial={EMPTY} onSubmit={add} submitLabel={t('dbGlAdd')} />
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      </section>

      <section className="sd-card">
        <h2>{t('dbGlTry')}</h2>
        <label className="fld"><span>{t('dbGlTryLabel')}</span>
          <textarea rows={2} maxLength={2000} value={sample} onChange={(e) => setSample(e.target.value)} placeholder={t('dbGlTryPh')} />
        </label>
        {preview && (
          <div className="db-gl-preview" aria-live="polite">
            <span className="meta">{t('dbGlVoiceReads')}</span>
            <p>{preview.text}</p>
            {!preview.hits.length && <small className="meta">{t('dbGlNoHit')}</small>}
          </div>
        )}
      </section>

      <div className="studio-tools">
        <label className="studio-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr-only">{t('search')}</span>
          <input type="search" placeholder={t('dbGlSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {rows && !rows.length && <p className="meta">{t(q.trim() ? 'dbGlNone' : 'dbGlEmpty')}</p>}
      {rows && rows.length > 0 && (
        <ul className="db-gl-list">
          {rows.map((e) => (
            <li key={e.id} className={`db-voice${e.active ? '' : ' inactive'}`}>
              {editId === e.id ? (
                <div className="db-voice-main"><EntryForm initial={e} onSubmit={(v) => patch(e.id, { term: v.term, say: v.say, notes: v.notes, wholeWord: v.wholeWord, caseSensitive: v.caseSensitive })} onCancel={() => setEditId(null)} submitLabel={t('dbSave')} /></div>
              ) : (
                <>
                  <div className="db-voice-main">
                    <p className="db-gl-pair"><span>{e.term}</span> <span aria-hidden="true">→</span><span className="sr-only">{t('dbGlSay')}</span> <strong>{e.say}</strong></p>
                    <small className="meta">{[e.wholeWord ? t('dbGlWholeShort') : t('dbGlPartShort'), e.caseSensitive ? t('dbGlCaseShort') : null, e.active ? null : t('dbGlInactive')].filter(Boolean).join(' · ')}</small>
                    {e.notes && <small className="meta">{e.notes}</small>}
                  </div>
                  <div className="db-voice-actions">
                    <button type="button" className="btn ghost" onClick={() => setEditId(e.id)}>{t('dbGlEdit')}</button>
                    <button type="button" className="btn ghost" onClick={() => patch(e.id, { active: !e.active })}>{t(e.active ? 'dbGlDisable' : 'dbGlEnable')}</button>
                    <button type="button" className="btn ghost" onClick={() => remove(e)}>{t('dbGlDelete')}</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
