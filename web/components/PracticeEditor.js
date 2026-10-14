'use client';
// Studio → onglet « Mise en pratique » d'une conférence : génération par l'IA, relecture et ajout de propositions d'action.
import { useCallback, useEffect, useState } from 'react';
import PracticeSuggestion, { SuggestionForm } from './PracticeSuggestion';

export default function PracticeEditor({ id, t, call }) {
  const [d, setD] = useState(null);
  const [count, setCount] = useState(null);
  const [msg, setMsg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState(null);

  const load = useCallback(async () => {
    const r = await call(`/talks/${id}/studio/practice`);
    if (r.ok) { setD(r.data); setCount((c) => c ?? r.data.generateCount); }
  }, [call, id]);
  useEffect(() => { load(); }, [load]);
  const running = d?.job && ['pending', 'processing'].includes(d.job.status);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);
  if (!d) return <p className="meta">…</p>;

  const generate = async () => {
    setMsg(null);
    const r = await call(`/talks/${id}/studio/practice/generate`, { method: 'POST', body: JSON.stringify({ count: Number(count) }) });
    if (!r.ok) setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    load();
  };
  const add = async (b) => {
    setBusy(true); setAddErr(null);
    const r = await call(`/talks/${id}/studio/practice/suggestions`, { method: 'POST', body: JSON.stringify(b) });
    setBusy(false);
    if (!r.ok) { setAddErr(r.data?.error || t('errGeneric')); return; }
    setAdding(false); load();
  };
  const by = (s) => d.suggestions.filter((x) => x.status === s);
  const list = (s, title, open) => {
    const items = by(s);
    if (!items.length) return null;
    return (
      <details className="qz-group" open={open}>
        <summary><b>{title}</b> <span className="meta">({items.length})</span></summary>
        {items.map((x) => <PracticeSuggestion key={x.id} s={x} t={t} call={call} onChange={() => load()} />)}
      </details>
    );
  };
  const job = d.job;

  return (
    <>
      <section className="panel">
        <h2 className="panel-title">{t('pzStatusTitle')}</h2>
        <p className={d.siteEnabled && d.approved > 0 ? 'ok-msg' : 'meta'} role="status">
          {!d.siteEnabled ? t('pzSiteOff') : d.approved > 0 ? t('pzReadyYes').replace('{a}', d.approved) : t('pzReadyNo')}
          {d.drafts > 0 && ` · ${t('qzToReview').replace('{n}', d.drafts)}`}
        </p>
      </section>
      <section className="panel">
        <h2 className="panel-title">{t('qzGenTitle')}</h2>
        <p className="meta small">{t('pzGenHelp')}</p>
        {!d.transcriptReady && <p className="notice" role="status">{t('qzNeedTranscript')}</p>}
        <div className="qz-gen">
          <label className="qz-count"><span className="meta small">{t('pzGenCount')}</span>
            <input type="number" min={3} max={5} value={count ?? ''} onChange={(e) => setCount(e.target.value)} /></label>
          <button className="btn" disabled={!d.transcriptReady || running} onClick={generate}>{running ? t('qzJobRun') : d.suggestions.length ? t('qzGenRegen') : t('qzGenBtn')}</button>
        </div>
        {job?.status === 'ready' && <p className="meta small" role="status">{t('pzJobDone').replace('{p}', job.produced).replace('{d}', job.dropped)}</p>}
        {job?.status === 'failed' && <p className="error" role="alert">{t('qzJobFail').replace('{e}', job.error || '')}</p>}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="alert">{msg.text}</p>}
        <p className="meta small">{t('pzReviewRule')}</p>
      </section>
      <section className="qz-list">
        <div className="qz-list-head">
          <h2 className="panel-title">{t('pzListTitle')}</h2>
          {!adding && <button className="btn ghost" onClick={() => setAdding(true)}>+ {t('pzAdd')}</button>}
        </div>
        {adding && <article className="qz-card editing"><SuggestionForm t={t} busy={busy} error={addErr} onCancel={() => { setAdding(false); setAddErr(null); }} onSave={add} /></article>}
        {d.suggestions.length === 0 && !adding && <p className="soon">{t('pzNone')}</p>}
        {list('draft', t('qzDrafts'), true)}
        {list('approved', t('qzApproved'), true)}
        {list('rejected', t('qzRejected'), false)}
      </section>
    </>
  );
}
