'use client';
// Studio → onglet « Références » d'une vidéo : détection par l'IA, relecture, correction et ajout de références (versets, hadiths).
import { useCallback, useEffect, useState } from 'react';
import ReferenceCard, { ReferenceForm } from './ReferenceCard';

export default function ReferencesEditor({ id, t, call }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState(null);
  const load = useCallback(async () => { const r = await call(`/talks/${id}/studio/references`); if (r.ok) setD(r.data); }, [call, id]);
  useEffect(() => { load(); }, [load]);
  const running = d?.job && ['pending', 'processing'].includes(d.job.status);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);
  if (!d) return <p className="meta">…</p>;

  const detect = async () => {
    setMsg(null);
    const r = await call(`/talks/${id}/studio/references/detect`, { method: 'POST', body: '{}' });
    if (!r.ok) setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    load();
  };
  const add = async (b) => {
    setBusy(true); setAddErr(null);
    const r = await call(`/talks/${id}/studio/references`, { method: 'POST', body: JSON.stringify(b) });
    setBusy(false);
    if (!r.ok) { setAddErr(r.data?.error || t('errGeneric')); return; }
    setAdding(false); load();
  };
  const group = (s, title, open) => {
    const items = d.references.filter((x) => x.status === s);
    if (!items.length) return null;
    return (
      <details className="qz-group" open={open}>
        <summary><b>{title}</b> <span className="meta">({items.length})</span></summary>
        {items.map((x) => <ReferenceCard key={x.id} r={x} t={t} call={call} onChange={() => load()} />)}
      </details>
    );
  };
  const job = d.job;
  return (
    <>
      <section className="panel">
        <h2 className="panel-title">{t('rfStatusTitle')}</h2>
        <p className={d.approved > 0 ? 'ok-msg' : 'meta'} role="status">
          {d.approved > 0 ? t('rfReadyYes').replace('{a}', d.approved) : t('rfReadyNo')}
          {d.drafts > 0 && ` · ${t('qzToReview').replace('{n}', d.drafts)}`}
        </p>
      </section>
      <section className="panel">
        <h2 className="panel-title">{t('rfDetectTitle')}</h2>
        <p className="meta small">{t('rfDetectHelp')}</p>
        {!d.transcriptReady && <p className="notice" role="status">{t('rfNeedTranscript')}</p>}
        <div className="qz-gen">
          <button className="btn" disabled={!d.transcriptReady || running} onClick={detect}>{running ? t('rfDetectRun') : d.references.length ? t('rfDetectRedo') : t('rfDetectBtn')}</button>
        </div>
        {job?.status === 'ready' && <p className="meta small" role="status">{t('rfJobDone').replace('{p}', job.produced).replace('{d}', job.dropped)}</p>}
        {job?.status === 'failed' && <p className="error" role="alert">{t('rfJobFail').replace('{e}', job.error || '')}</p>}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="alert">{msg.text}</p>}
        <p className="meta small">{t('rfDetectKeep')}</p>
      </section>
      <section className="qz-list">
        <div className="qz-list-head">
          <h2 className="panel-title">{t('rfListTitle')}</h2>
          {!adding && <button className="btn ghost" onClick={() => setAdding(true)}>+ {t('rfAdd')}</button>}
        </div>
        {adding && <article className="qz-card editing"><ReferenceForm t={t} busy={busy} error={addErr} onCancel={() => { setAdding(false); setAddErr(null); }} onSave={add} /></article>}
        {d.references.length === 0 && !adding && <p className="soon">{t('rfNone')}</p>}
        {group('draft', t('qzDrafts'), true)}
        {group('approved', t('qzApproved'), true)}
        {group('rejected', t('qzRejected'), false)}
      </section>
    </>
  );
}
