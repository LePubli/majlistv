'use client';
// Éditeur de montage (étape E3) — bibliothèque de logos : png, jpeg ou webp (3 Mo au plus). Les organisateurs et les administrateurs
// importent ; un organisateur voit ses logos et ceux de l'administrateur. « Utiliser » choisit le logo du montage.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';

export default function LogoLibrary({ canEdit, current, onClose, onPick, onChanged }) {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const box = useRef(null);
  const load = () => call('/studio/editor/logos').then((r) => { if (r.ok) { setD(r.data); onChanged?.(r.data.logos); } else setMsg({ ok: false, text: r.data?.error || t('dbError') }); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    const type = file.type || (/\.png$/i.test(file.name) ? 'image/png' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.webp$/i.test(file.name) ? 'image/webp' : '');
    const u = await call('/studio/editor/logos/upload-url', { method: 'POST', body: JSON.stringify({ contentType: type, size: file.size }) });
    if (!u.ok) { setBusy(false); setMsg({ ok: false, text: u.data?.error || t('dbError') }); return; }
    const put = await fetch(u.data.url, { method: 'PUT', body: file, headers: { 'Content-Type': type } }).catch(() => null);
    if (!put || !put.ok) { setBusy(false); setMsg({ ok: false, text: t('mtUploadFailed') }); return; }
    const r = await call('/studio/editor/logos', { method: 'POST', body: JSON.stringify({ key: u.data.key, title: title.trim() || file.name.replace(/\.[^.]+$/, ''), contentType: type }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    setMsg({ ok: true, text: t('mtdLogoImported') }); setTitle(''); setFile(null);
    e.target.reset?.();
    load();
  };
  const remove = async (l) => {
    if (!window.confirm(t('mtdLogoDelConfirm').replace('{t}', l.title))) return;
    const r = await call(`/studio/editor/logos/${l.id}`, { method: 'DELETE' });
    setMsg(r.ok ? { ok: true, text: t('mtdLogoDeleted') } : { ok: false, text: r.data?.error || t('dbError') });
    load();
  };

  return (
    <div className="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mt-logo-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-modal-box" ref={box} tabIndex={-1}>
        <div className="sd-card-head">
          <h2 id="mt-logo-title">{t('mtdLogoLib')}</h2>
          <button type="button" className="btn ghost sd-pill" onClick={onClose}>{t('mtClose')}</button>
        </div>
        <p className="meta small">{t('mtdLogoLibHelp')}</p>
        <form className="mt-upload" onSubmit={upload}>
          <label className="mt-field"><span>{t('mtdLogoFileLabel')}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
          <label className="mt-field"><span>{t('mtdLogoName')}</span><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
          <button type="submit" className="btn sd-pill" disabled={busy || !file}>{busy ? t('mtUploading') : t('mtImport')}</button>
          <small className="meta">{t('mtdLogoMax').replace('{n}', d?.maxMb || 3)}</small>
        </form>
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
        {!d && <p className="meta">{t('dbLoading')}</p>}
        {d && d.logos.length === 0 && <p className="meta">{t('mtdLogoNone2')}</p>}
        {d && d.logos.length > 0 && (
          <div className="mt-logo-grid">
            {d.logos.map((l) => (
              <div key={l.id} className="mt-logo-card" data-logo-id={l.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.url} alt="" />
                <b dir="auto" className="small">{l.title}</b>
                <small className="meta">{l.w}×{l.h}{current === l.id ? ` · ${t('mtdInUse')}` : ''}</small>
                <span className="mt-actions">
                  {canEdit && <button type="button" className="btn sd-pill" onClick={() => onPick(l)} data-use={l.id}>{t('mtdUse')}</button>}
                  {l.canDelete && <button type="button" className="btn ghost sd-pill" onClick={() => remove(l)}>{t('mtDel')}</button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
