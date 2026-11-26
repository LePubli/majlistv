'use client';
// Catégories automatiques : une proposition de l'IA (catégorie, confiance, justification) à valider ou refuser en un clic,
// et l'éditeur d'une vidéo (onglet « Catégories » du Studio).
import { useCallback, useEffect, useState } from 'react';

// Une proposition : « Valider » ajoute la catégorie à la vidéo, « Refuser » ne la reproposera plus.
export function SuggestionRow({ s, t, call, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const act = async (what) => {
    setBusy(true); setErr('');
    const r = await call(`/studio/categories-suggest/${s.id}/${what}`, { method: 'POST' });
    setBusy(false);
    if (r.ok) onDone(s, what, r.data); else setErr(r.data?.error || t('acError'));
  };
  const tone = s.confidence >= 80 ? 'ok-msg' : 'meta';
  return (
    <article className="qz-card" aria-label={s.category}>
      <div className="qz-card-head">
        <b>{s.category}</b>{' '}
        <span className={tone} title={t('acConfidence')}>{s.confidence} %</span>
      </div>
      {s.reason && <p className="meta small">{s.reason}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {s.status === 'draft' ? (
        <div className="qz-gen">
          <button type="button" className="btn" disabled={busy} onClick={() => act('accept')}>{t('acAccept')}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => act('reject')}>{t('acReject')}</button>
        </div>
      ) : <p className="meta small">{s.status === 'approved' ? t('acApproved') : t('acRejected')}</p>}
    </article>
  );
}

// Onglet « Catégories » d'une vidéo.
export default function AutoCatSuggest({ id, t, call }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { const r = await call(`/talks/${id}/studio/categories-suggest`); if (r.ok) setD(r.data); }, [call, id]);
  useEffect(() => { load(); }, [load]);
  const running = d?.job && ['pending', 'processing'].includes(d.job.status);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);
  if (!d) return <p className="meta">…</p>;
  const run = async () => {
    setMsg(null);
    const r = await call(`/talks/${id}/studio/categories-suggest/run`, { method: 'POST' });
    if (r.ok) load(); else setMsg(r.data?.error || t('acError'));
  };
  const done = async () => { await load(); };
  const job = d.job;
  const drafts = d.suggestions.filter((x) => x.status === 'draft');
  const past = d.suggestions.filter((x) => x.status !== 'draft');
  return (
    <>
      <section className="panel">
        <h2 className="panel-title">{t('acTabTitle')}</h2>
        <p className="meta small">{t('acHelp')}</p>
        <p className="meta" role="status">{t('acCurrent')} {d.current.length ? d.current.join(' · ') : t('acNoneYet')}</p>
        {!d.adult && <p className="notice" role="status">{t('acKids')}</p>}
        {d.adult && !d.transcriptReady && <p className="notice" role="status">{t('acNoTranscript')}</p>}
        <div className="qz-gen">
          <button className="btn" disabled={!d.adult || running} onClick={run}>{running ? t('acRunning') : job ? t('acRunAgain') : t('acRun')}</button>
        </div>
        {job?.status === 'ready' && <p className="meta small" role="status">{t(job.produced ? 'acDone' : 'acDoneNone').replace('{p}', job.produced).replace('{b}', t(`acBasis_${job.basis || 'metadata'}`))}</p>}
        {job?.status === 'failed' && <p className="error" role="alert">{t('acFail').replace('{e}', job.error || '')}</p>}
        {msg && <p className="error" role="alert">{msg}</p>}
        <p className="meta small">{t('acKeep')}</p>
      </section>
      {drafts.length > 0 && (
        <section className="qz-list">
          <div className="qz-list-head"><h2 className="panel-title">{t('acProposed')} <span className="meta">({drafts.length})</span></h2></div>
          {drafts.map((s) => <SuggestionRow key={s.id} s={s} t={t} call={call} onDone={done} />)}
        </section>
      )}
      {past.length > 0 && (
        <details className="qz-group">
          <summary><b>{t('acPast')}</b> <span className="meta">({past.length})</span></summary>
          {past.map((s) => <SuggestionRow key={s.id} s={s} t={t} call={call} onDone={done} />)}
        </details>
      )}
    </>
  );
}
