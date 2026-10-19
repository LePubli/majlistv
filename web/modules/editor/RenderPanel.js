'use client';
// Éditeur de montage (étape E4a) — « Rendre la vidéo » : le worker fabrique le fichier MP4 du montage ENREGISTRÉ (coupes, son,
// voix française, musiques, titres, logo, transitions, sous-titres incrustés, écrans d'ouverture et de fin).
// Deux choix : aperçu rapide (640 × 360) ou rendu final (qualité de la source, jusqu'à 1080p, niveau sonore homogène en deux passes).
// Le calcul continue si on ferme l'éditeur ; la liste se met à jour toute seule. Les 3 derniers rendus sont gardés.
// Un rendu final prêt peut remplacer la vidéo publiée : « Remplacer la vidéo publiée » (étape E4b, ReplacePage.js).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { fmtTime } from './ops';

const minutes = (s, t) => (s < 90 ? t('mtrSec').replace('{n}', Math.max(5, Math.round(s / 5) * 5)) : t('mtrMin').replace('{n}', Math.round(s / 60)));
const mb = (b, locale) => (b / 1048576).toLocaleString(locale, { maximumFractionDigits: b > 104857600 ? 0 : 1 });

export default function RenderPanel({ projectId, getRev, beforeAction, durationFinal, readOnly, onClose, onChange, readOnlyReplace = false, vertical = false }) {
  const { t, call, locale } = useApp();
  const [d, setD] = useState(null);
  const [kind, setKind] = useState('preview');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [watch, setWatch] = useState(null);
  const box = useRef(null);

  const load = useCallback(async () => {
    const r = await call(`/studio/editor/projects/${projectId}/renders`);
    if (r.ok) { setD(r.data); onChange?.(r.data.renders); } else setMsg({ ok: false, text: r.data?.error || t('dbError') });
  }, [call, projectId, t, onChange]);
  useEffect(() => { load(); }, [load]);
  // Rendus en attente ou en cours : on rafraîchit toutes les 3 s.
  useEffect(() => {
    if (!d?.renders?.some((r) => ['queued', 'running'].includes(r.status))) return undefined;
    const h = setTimeout(load, 3000);
    return () => clearTimeout(h);
  }, [d, load]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const start = async () => {
    setBusy(true); setMsg(null);
    await beforeAction?.();
    const send = (rev) => call(`/studio/editor/projects/${projectId}/render`, { method: 'POST', body: JSON.stringify({ kind, rev }) });
    let r = await send(getRev());
    // Lecture seule : le montage a pu être enregistré par la personne qui le modifie ; on rend la dernière version enregistrée.
    if (!r.ok && r.data?.code === 'not_saved' && readOnly && r.data.rev) r = await send(r.data.rev);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    setMsg({ ok: true, text: r.data.render.kind === 'preview' ? t('mtrAskedPreview') : t('mtrAskedFinal') });
    load();
  };
  const cancel = async (r) => {
    const res = await call(`/studio/editor/renders/${r.id}/cancel`, { method: 'POST', body: '{}' });
    setMsg(res.ok ? { ok: true, text: t('mtrCanceledMsg') } : { ok: false, text: res.data?.error || t('dbError') });
    load();
  };
  const remove = async (r) => {
    if (!window.confirm(t('mtrDelConfirm'))) return;
    const res = await call(`/studio/editor/renders/${r.id}`, { method: 'DELETE' });
    setMsg(res.ok ? { ok: true, text: t('mtrDeleted') } : { ok: false, text: res.data?.error || t('dbError') });
    if (watch === r.id) setWatch(null);
    load();
  };

  const active = d?.renders?.find((r) => ['queued', 'running'].includes(r.status));
  const status = (r) => {
    if (r.status === 'queued') return d?.position && r.id === active?.id ? t('mtrQueuedPos').replace('{n}', d.position) : t('mtrQueued');
    if (r.status === 'running') return r.cancelRequested ? t('mtrCanceling') : `${t(`mtrStage_${r.stage || 'download'}`)} · ${r.progress} %`;
    return t({ ready: 'mtrReady', failed: 'mtrFailed', canceled: 'mtrCanceled' }[r.status] || 'mtrQueued');
  };
  const when = (iso) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mt-render-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-modal-box mt-render-box" ref={box} tabIndex={-1}>
        <div className="sd-card-head">
          <h2 id="mt-render-title">{t(vertical ? 'mtsRenderTitle' : 'mtrTitle')}</h2>
          <button type="button" className="btn ghost sd-pill" onClick={onClose}>{t('mtClose')}</button>
        </div>
        <p className="meta small">{t(vertical ? 'mtsRenderIntro' : 'mtrIntro')}</p>

        <fieldset className="mt-render-kinds" disabled={Boolean(active) || busy}>
          <legend className="sr-only">{t('mtrKind')}</legend>
          {[['preview', 'mtrPreview', vertical ? 'mtsPreviewHelp' : 'mtrPreviewHelp', 0.3], ['final', 'mtrFinal', vertical ? 'mtsFinalHelp' : 'mtrFinalHelp', 1]].map(([k, title, help, f]) => (
            <label key={k} className={`mt-render-kind${kind === k ? ' on' : ''}`} data-kind={k}>
              <input type="radio" name="mt-render-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span><b>{t(title)}</b><small className="meta">{t(help).replace('{m}', minutes(durationFinal * f, t)).replace('{d}', fmtTime(durationFinal))}</small></span>
            </label>
          ))}
        </fieldset>
        {d && d.heavyAllowed === false && <p className="mt-notice warn" role="status">{t('mtrHeavyOff')}</p>}
        <div className="mt-render-go">
          <button type="button" className="btn sd-pill" onClick={start} disabled={busy || Boolean(active) || !d} data-act="render-start">{busy ? t('mtrStarting') : t('mtrStart')}</button>
          {active && <small className="meta">{t('mtrOneAtATime')}</small>}
        </div>
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}

        <h3 className="mt-cap">{t('mtrList')}</h3>
        {!d && <p className="meta">{t('dbLoading')}</p>}
        {d && !d.renders.length && <p className="meta">{t('mtrNone')}</p>}
        {d && d.renders.length > 0 && (
          <ul className="mt-render-list">
            {d.renders.map((r) => (
              <li key={r.id} className={`mt-render-row st-${r.status}`} data-render={r.id} data-status={r.status}>
                <div className="mt-render-line">
                  <span className="mt-render-what">
                    <b>{t(r.kind === 'preview' ? 'mtrPreview' : 'mtrFinal')}</b>
                    <small className="meta">
                      {when(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ''}{r.duration ? ` · ${fmtTime(r.duration)}` : ''}
                      {r.status === 'ready' && r.bytes ? ` · ${t('mtrSize').replace('{n}', mb(r.bytes, locale))}` : ''}
                      {r.status === 'ready' && r.report ? ` · ${r.report.width}×${r.report.height} · ${t('mtrCalc').replace('{m}', minutes(r.report.renderS, t))}` : ''}
                    </small>
                  </span>
                  <span className={`mt-render-st st-${r.status}`} role="status">{status(r)}</span>
                </div>
                {r.status === 'running' && (
                  <span className="ac-bar mt-render-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.progress} aria-label={t('mtrRunning')}>
                    <i style={{ width: `${r.progress}%` }} />
                  </span>
                )}
                {r.status === 'queued' && <small className="meta">{t('mtrEstimate').replace('{m}', minutes(r.estimateS, t))}</small>}
                {r.status === 'failed' && r.error && <p className="error small" dir="auto">{r.error}</p>}
                {r.warnings?.length > 0 && <ul className="mt-render-warn meta small">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                {r.rev !== d.rev && ['ready', 'queued', 'running'].includes(r.status) && <small className="meta mt-render-old">{t('mtrOutdated')}</small>}
                <div className="mt-actions">
                  {['queued', 'running'].includes(r.status) && !r.cancelRequested && <button type="button" className="btn ghost sd-pill" onClick={() => cancel(r)} data-act="render-cancel">{t('mtrCancel')}</button>}
                  {r.status === 'ready' && r.url && <button type="button" className="btn ghost sd-pill" aria-expanded={watch === r.id} onClick={() => setWatch(watch === r.id ? null : r.id)} data-act="render-watch">{watch === r.id ? t('mtrHide') : t('mtrWatch')}</button>}
                  {r.status === 'ready' && r.downloadUrl && <a className="btn sd-pill" href={r.downloadUrl} download data-act="render-download">{t('mtrDownload')}</a>}
                  {r.status === 'ready' && r.kind === 'final' && !readOnlyReplace && <Link className="btn sd-pill" href={`/studio/editor/${projectId}/replace?render=${r.id}`} data-act="render-replace">{t('mtrReplace')}</Link>}
                  {!['queued', 'running'].includes(r.status) && <button type="button" className="btn ghost sd-pill" onClick={() => remove(r)} data-act="render-delete">{t('mtrDelete')}</button>}
                </div>
                {watch === r.id && r.url && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video className={`mt-render-video${vertical ? ' vertical' : ''}`} src={r.url} controls playsInline preload="metadata" aria-label={t('mtrVideo')} />
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="meta small">{t('mtrKeep')}</p>
      </div>
    </div>
  );
}
