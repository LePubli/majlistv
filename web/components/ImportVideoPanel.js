'use client';
// Studio → fiche d'une conférence : « Copier cette vidéo chez nous » (étape Import).
// Une conférence YouTube / Vimeo / archive.org est copiée dans notre stockage pour devenir une vidéo hébergée ; une conférence créée
// pour l'import (adresse quelconque) affiche ici l'avancement, l'annulation et la relance. Masqué si la fonction est désactivée.
import { useCallback, useEffect, useState } from 'react';

export const importLabel = (m, t) => {
  if (!m) return '';
  if (m.status === 'pending') return t('impSt_pending');
  if (m.status === 'downloading') return m.stage === 'upload' ? t('impSt_uploadingPct').replace('{n}', m.progress || 0) : m.progress ? t('impSt_downloadingPct').replace('{n}', m.progress) : t('impSt_downloading');
  if (m.status === 'converting') return m.stage ? t('impSt_converting').replace('{n}', m.progress || 0) : t('impSt_waitConv');
  return t(`impSt_${m.status}`);
};

export default function ImportVideoPanel({ talk, imp, setImp, reload, t, call, sourceName }) {
  const [rights, setRights] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const active = Boolean(imp?.active);

  // Suivi de la demande en cours ; quand elle se termine, la fiche est rechargée (la conférence est devenue hébergée).
  const refresh = useCallback(async () => {
    const r = await call(`/talks/${talk.id}/import`);
    if (r.ok) setImp(r.data.import || null);
    return r;
  }, [call, talk.id, setImp]);
  useEffect(() => {
    if (!active) return undefined;
    const h = setInterval(async () => {
      const r = await refresh();
      if (r.ok && !r.data.import?.active) reload();
    }, 4000);
    return () => clearInterval(h);
  }, [active, refresh, reload]);

  const start = async () => {
    if (!rights) { setMsg({ ok: false, text: t('impRightsNeeded') }); return; }
    setBusy(true); setMsg(null);
    const r = await call(`/talks/${talk.id}/import`, { method: 'POST', body: JSON.stringify({ rightsConfirmed: true }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    setMsg({ ok: true, text: t('impStarted') }); setRights(false);
    await refresh(); reload();
  };
  const cancel = async () => {
    setBusy(true); setMsg(null);
    const r = await call(`/talks/${talk.id}/import/cancel`, { method: 'POST' });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: t('impCanceled') } : { ok: false, text: r.data?.error || t('errGeneric') });
    await refresh(); reload();
  };

  const hosted = talk.source === 'upload';
  const canStart = !active && (!hosted || (imp?.newTalk && talk.status === 'failed'));
  if (!hosted && !canStart && !imp) return null;
  if (hosted && !imp) return null;

  return (
    <div className="imp-panel" data-testid="import-panel">
      {active && (
        <div role="status">
          <p className="meta small"><b>{t('impRunning')}</b> · {importLabel(imp, t)}</p>
          <progress max="100" value={imp.status === 'pending' ? 0 : imp.progress || 0} />
          {imp.cancelable && <div><button type="button" className="link u" disabled={busy} onClick={cancel}>{t('impCancel')}</button></div>}
        </div>
      )}
      {!active && imp?.status === 'done' && <p className="meta small">{t('impDone').replace('{u}', imp.sourceUrl)}</p>}
      {!active && imp && ['failed', 'canceled'].includes(imp.status) && (
        <p className="error small" role="alert">{t('impFailed')}{imp.error ? ` : ${imp.error}` : imp.status === 'canceled' ? ` (${t('impSt_canceled').toLowerCase()})` : ''}</p>
      )}
      {canStart && (
        <>
          {!imp?.newTalk && <p className="meta small">{t('impHelp').replaceAll('{s}', sourceName || '')}</p>}
          <label className="check rights"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> {t('impRights')}</label>
          <button type="button" className="btn ghost" disabled={busy || !rights} onClick={start}>{imp?.newTalk ? t('impRetry') : t('impStart')}</button>
        </>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'}>{msg.text}</p>}
    </div>
  );
}
