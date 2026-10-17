'use client';
// Éditeur de montage (étape E1) — panneau « Versions » : copies automatiques (au début de chaque séance de travail,
// avant un retour en arrière) et versions nommées. Revenir à une version copie d'abord le montage actuel : rien n'est perdu.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtTime } from './ops';

export default function Versions({ projectId, session, canEdit, onClose, onRestored, beforeAction }) {
  const { t, call, locale } = useApp();
  const [d, setD] = useState(null);
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const load = useCallback(() => call(`/studio/editor/projects/${projectId}/versions`).then((r) => r.ok && setD(r.data)), [call, projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const when = (x) => new Date(x).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); await beforeAction();
    const r = await call(`/studio/editor/projects/${projectId}/versions`, { method: 'POST', body: JSON.stringify({ label, session }) });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t('mtVerSaved').replace('{n}', r.data.n) } : { ok: false, text: r.data?.error || t('dbError') });
    if (r.ok) { setLabel(''); load(); onRestored(null, r.data.versionNumber); }
  };
  const restore = async (n) => {
    if (!window.confirm(t('mtVerConfirm').replace('{n}', n))) return;
    setBusy(true); await beforeAction();
    const r = await call(`/studio/editor/projects/${projectId}/versions/${n}/restore`, { method: 'POST', body: JSON.stringify({ session }) });
    setBusy(false);
    if (r.ok) { onRestored(r.data, r.data.versionNumber); setMsg({ ok: true, text: t('mtVerRestored').replace('{n}', n) }); load(); }
    else setMsg({ ok: false, text: r.data?.error || t('dbError') });
  };

  return (
    <div className="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mt-ver-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-modal-box" ref={box} tabIndex={-1}>
        <div className="sd-card-head">
          <h2 id="mt-ver-title">{t('mtVersions')}</h2>
          <button type="button" className="btn ghost sd-pill" onClick={onClose}>{t('mtClose')}</button>
        </div>
        <p className="meta small">{t('mtVerHelp')}</p>
        {canEdit && (
          <form className="mt-ver-form" onSubmit={save}>
            <label className="sr-only" htmlFor="mt-ver-label">{t('mtVerName')}</label>
            <input id="mt-ver-label" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('mtVerName')} />
            <button type="submit" className="btn sd-pill" disabled={busy || !label.trim()}>{t('mtVerSave')}</button>
          </form>
        )}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
        {!d && <p className="meta">{t('dbLoading')}</p>}
        {d && (
          <ul className="mt-ver-list">
            <li className="mt-ver cur">
              <span><b>{t('mtVersionN').replace('{n}', d.current.versionNumber)}</b> <em className="mt-tag">{t('mtVerCurrent')}</em>
                <small className="meta">{when(d.current.updatedAt)}{d.current.updatedBy ? ` · ${d.current.updatedBy}` : ''} · {fmtTime(d.current.editedDuration)} · {t('mtClips').replace('{n}', d.current.clips)}</small></span>
            </li>
            {d.versions.map((v) => (
              <li key={v.n} className="mt-ver">
                <span><b>{t('mtVersionN').replace('{n}', v.n)}</b> {v.label ? <span dir="auto">« {v.label} »</span> : <em className="mt-tag muted">{t('mtVerAuto')}</em>}
                  <small className="meta">{when(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ''} · {fmtTime(v.editedDuration)} · {t('mtClips').replace('{n}', v.clips)}</small></span>
                {canEdit && <button type="button" className="btn ghost sd-pill" disabled={busy} onClick={() => restore(v.n)}>{t('mtVerRestore')}</button>}
              </li>
            ))}
            {d.versions.length === 0 && <li className="meta">{t('mtVerNone')}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
