'use client';
// Fenêtre « Partager en image » (étape 32) : aperçu de la carte, 3 formats (carré, story, paysage), téléchargement, partage et copie du lien.
import { useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { FORMATS, cardBlob, cardFileName, renderCard } from '../lib/shareCard';

export default function ShareCardModal({ card, url, title, onClose }) {
  const { t } = useApp();
  const canvas = useRef(null);
  const closeRef = useRef(null);
  const [format, setFormat] = useState('square');
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let off = false;
    setBusy(true);
    renderCard(canvas.current, format, card).then(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [format, card]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const note = (text) => { setMsg(text); setTimeout(() => setMsg(''), 2600); };
  const file = async () => new File([await cardBlob(canvas.current)], cardFileName(title, format), { type: 'image/png' });

  const download = async () => {
    const f = await file();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const share = async () => {
    try {
      const f = await file();
      const data = { files: [f], title, url, text: title };
      if (navigator.canShare?.({ files: [f] })) { await navigator.share(data); return; }
      if (navigator.share) { await navigator.share({ title, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    await download();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); note(t('shCopied')); } catch { note(url); } };

  return (
    <div className="shc-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shc" role="dialog" aria-modal="true" aria-label={t('shTitle')}>
        <div className="shc-head">
          <h2>{t('shTitle')}</h2>
          <button type="button" className="btn ghost sm" ref={closeRef} onClick={onClose} aria-label={t('shClose')}>✕</button>
        </div>
        <div className="shc-formats" role="group" aria-label={t('shFormat')}>
          {Object.entries(FORMATS).map(([k, f]) => (
            <button key={k} type="button" className={`shc-fmt${format === k ? ' on' : ''}`} aria-pressed={format === k} onClick={() => setFormat(k)}>{t(f.label)} <small>{f.w}×{f.h}</small></button>
          ))}
        </div>
        <div className="shc-preview" aria-busy={busy}><canvas ref={canvas} aria-label={t('shPreview')} /></div>
        <div className="shc-actions">
          <button type="button" className="btn" onClick={share} disabled={busy}>{t('shShare')}</button>
          <button type="button" className="btn ghost" onClick={download} disabled={busy}>{t('shDownload')}</button>
          <button type="button" className="btn ghost" onClick={copy}>{t('shCopyLink')}</button>
        </div>
        <p className="meta small" role="status">{msg}</p>
      </div>
    </div>
  );
}
