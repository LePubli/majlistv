'use client';
// Studio → onglet « Quiz » d'une conférence : activation, génération par l'IA, relecture et ajout de questions.
import { useCallback, useEffect, useState } from 'react';
import QuizQuestion, { QuestionForm } from './QuizQuestion';

export default function QuizEditor({ id, t, call }) {
  const [d, setD] = useState(null);
  const [count, setCount] = useState(null);
  const [msg, setMsg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState(null);

  const load = useCallback(async () => {
    const r = await call(`/talks/${id}/studio/quiz`);
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

  const setEnabled = async (enabled) => {
    setMsg(null);
    const r = await call(`/talks/${id}/studio/quiz/settings`, { method: 'PUT', body: JSON.stringify({ enabled }) });
    if (!r.ok) setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    load();
  };
  const generate = async () => {
    setMsg(null);
    const r = await call(`/talks/${id}/studio/quiz/generate`, { method: 'POST', body: JSON.stringify({ count: Number(count) }) });
    if (!r.ok) setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    load();
  };
  const add = async (b) => {
    setBusy(true); setAddErr(null);
    const r = await call(`/talks/${id}/studio/quiz/questions`, { method: 'POST', body: JSON.stringify(b) });
    setBusy(false);
    if (!r.ok) { setAddErr(r.data?.error || t('errGeneric')); return; }
    setAdding(false); load();
  };
  // Une question modifiée / supprimée : on recharge pour que les compteurs restent justes.
  const changed = () => load();

  const by = (s) => d.questions.filter((q) => q.status === s);
  const job = d.job;
  const site = t(d.defaultEnabled ? 'qzOnWord' : 'qzOffWord');
  const pill = (on, label, onClick) => <button type="button" aria-pressed={on} className={on ? 'pill on' : 'pill'} onClick={onClick}>{label}</button>;
  const list = (s, title, open) => {
    const qs = by(s);
    if (!qs.length) return null;
    return (
      <details className="qz-group" open={open}>
        <summary><b>{title}</b> <span className="meta">({qs.length})</span></summary>
        {qs.map((q) => <QuizQuestion key={q.id} q={q} t={t} call={call} onChange={changed} />)}
      </details>
    );
  };

  return (
    <>
      <section className="panel">
        <h2 className="panel-title">{t('qzSettingsTitle')}</h2>
        <div className="fld" role="group" aria-label={t('qzSettingsTitle')}>
          <div className="pills">
            {pill(d.override === null, t('qzFollowSite').replace('{s}', site), () => setEnabled(null))}
            {pill(d.override === true, t('qzOn'), () => setEnabled(true))}
            {pill(d.override === false, t('qzOff'), () => setEnabled(false))}
          </div>
          <span className="meta small">{t('qzSettingsHelp').replace('{n}', d.min)}</span>
        </div>
        <p className={d.enabled ? (d.ready ? 'ok-msg' : 'qz-warn') : 'meta'} role="status">
          {!d.enabled ? t('qzIsOff') : d.ready ? t('qzReadyYes').replace('{a}', d.approved) : t('qzReadyNo').replace('{a}', d.approved).replace('{n}', d.min)}
          {d.drafts > 0 && ` · ${t('qzToReview').replace('{n}', d.drafts)}`}
        </p>
      </section>

      <section className="panel">
        <h2 className="panel-title">{t('qzGenTitle')}</h2>
        <p className="meta small">{t('qzGenHelp')}</p>
        {!d.transcriptReady && <p className="notice" role="status">{t('qzNeedTranscript')}</p>}
        <div className="qz-gen">
          <label className="qz-count"><span className="meta small">{t('qzGenCount')}</span>
            <input type="number" min={3} max={15} value={count ?? ''} onChange={(e) => setCount(e.target.value)} /></label>
          <button className="btn" disabled={!d.transcriptReady || running} onClick={generate}>{running ? t('qzJobRun') : d.questions.length ? t('qzGenRegen') : t('qzGenBtn')}</button>
        </div>
        {job?.status === 'ready' && <p className="meta small" role="status">{t('qzJobDone').replace('{p}', job.produced).replace('{d}', job.dropped)}</p>}
        {job?.status === 'failed' && <p className="error" role="alert">{t('qzJobFail').replace('{e}', job.error || '')}</p>}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="alert">{msg.text}</p>}
        <p className="meta small">{t('qzReviewRule')}</p>
      </section>

      <section className="qz-list">
        <div className="qz-list-head">
          <h2 className="panel-title">{t('qzQuestions')}</h2>
          {!adding && <button className="btn ghost" onClick={() => setAdding(true)}>+ {t('qzAdd')}</button>}
        </div>
        {adding && <article className="qz-card editing"><QuestionForm t={t} busy={busy} error={addErr} onCancel={() => { setAdding(false); setAddErr(null); }} onSave={add} /></article>}
        {d.questions.length === 0 && !adding && <p className="soon">{t('qzNoQ')}</p>}
        {list('draft', t('qzDrafts'), true)}
        {list('approved', t('qzApproved'), true)}
        {list('rejected', t('qzRejected'), false)}
      </section>
    </>
  );
}
