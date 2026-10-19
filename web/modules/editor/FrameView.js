'use client';
// Éditeur de montage (étape E3) — « Voir l'image finale » : l'API fait composer par FFmpeg la vraie image d'un instant du montage
// (vidéo, fondu, titres, bandeau, sous-titres incrustés, logo ; ou l'écran d'intro / de fin) avec les réglages actuels, même
// non enregistrés. C'est la même fabrication que le rendu final de l'étape E4 : on y voit les vraies polices et l'arabe.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtTime } from './ops';

export default function FrameView({ projectId, getTimeline, at, onClose }) {
  const { t } = useApp();
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const box = useRef(null);
  useEffect(() => {
    let alive = true; let made = null;
    (async () => {
      let tok = null;
      try { tok = localStorage.getItem('token'); } catch { tok = null; }
      try {
        const r = await fetch(`/api/studio/editor/projects/${projectId}/frame`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
          body: JSON.stringify({ timeline: getTimeline(), at }),
        });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || t('dbError')); }
        made = URL.createObjectURL(await r.blob());
        if (alive) setUrl(made);
      } catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
    // l'image est demandée une seule fois à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const label = at === 'intro' ? t('mtdIntro') : at === 'outro' ? t('mtdOutro') : fmtTime(at, { tenths: true });
  return (
    <div className="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mt-frame-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-modal-box mt-frame-box" ref={box} tabIndex={-1}>
        <div className="sd-card-head">
          <h2 id="mt-frame-title">{t('mtdFrameTitle').replace('{a}', label)}</h2>
          <button type="button" className="btn ghost sd-pill" onClick={onClose}>{t('mtClose')}</button>
        </div>
        {!url && !err && <p className="meta" role="status">{t('mtdFrameMaking')}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt={t('mtdFrameAlt')} data-frame="1" />}
        <p className="meta small">{t('mtdFrameNote')}</p>
      </div>
    </div>
  );
}
