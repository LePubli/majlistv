'use client';
// Quiz de fin de conférence : une question à la fois, correction par le serveur, puis relecture des réponses avec
// l'explication, le lien « Revoir à mm:ss » et le signalement d'une question. Gratuit, sans compte nécessaire.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clock } from '../lib/clock';
import { useApp } from './Providers';

function Report({ talkId, qid, t, call }) {
  const [state, setState] = useState('idle'); // idle | open | sent
  const [reason, setReason] = useState('');
  const send = async () => {
    await call(`/talks/${talkId}/quiz/questions/${qid}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
    setState('sent');
  };
  if (state === 'sent') return <p className="meta small" role="status">{t('qpReportDone')}</p>;
  if (state === 'open') {
    return (
      <div className="qp-report">
        <input maxLength={300} value={reason} placeholder={t('qpReportAsk')} aria-label={t('qpReportAsk')} onChange={(e) => setReason(e.target.value)} />
        <button type="button" className="btn ghost" onClick={send}>{t('qpReportSend')}</button>
      </div>
    );
  }
  return <button type="button" className="link u small" onClick={() => setState('open')}>⚑ {t('qpReport')}</button>;
}

// props : talkId, onResult(result), onSeek(secondes), nextHref (épisode suivant, facultatif), onNext(), onClose()
export default function Quiz({ talkId, t, call, user, onResult, onSeek, onPractice, nextHref, onNext, onClose }) {
  const { locale } = useApp();
  const [data, setData] = useState(undefined); // undefined = chargement, null = indisponible
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [res, setRes] = useState(null);
  const box = useRef(null);

  const load = async () => {
    setData(undefined); setStep(0); setPicks([]); setRes(null); setErr(null);
    const r = await call(`/talks/${talkId}/quiz`);
    setData(r.ok ? r.data : null);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [talkId]);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, [step, res]);

  if (data === undefined) return <section className="quiz" aria-busy="true"><p className="meta">…</p></section>;
  if (data === null) return <section className="quiz"><p className="meta">{t('qpLoadErr')}</p><button type="button" className="btn ghost" onClick={onClose}>{t('qpClose')}</button></section>;

  const qs = data.questions;
  const n = qs.length;
  const submit = async () => {
    setBusy(true); setErr(null);
    const answers = qs.flatMap((q, i) => (picks[i] == null ? [] : [{ questionId: q.id, index: picks[i] }]));
    const r = await call(`/talks/${talkId}/quiz/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setRes(r.data);
    onResult && onResult(r.data);
  };

  // ------------------------------------------------------------ Résultat
  if (res) {
    const byId = new Map(qs.map((q) => [q.id, q]));
    return (
      <section className="quiz result" aria-labelledby="qp-res">
        <h2 id="qp-res" tabIndex={-1} ref={box}>{t('qpTitle')}</h2>
        <div className={`qp-score ${res.passed ? 'pass' : 'fail'}`} role="status">
          <b>{res.percent} %</b><span>{t('qpScore').replace('{s}', res.score).replace('{n}', res.total)}</span>
        </div>
        <p className="qp-msg">{res.passed ? t('qpWin') : t('qpLose')}</p>
        {!res.passed && <p className="meta small">{t('qpPassNeeded').replace('{p}', res.passPercent)}</p>}
        {res.learning && (
          <div className="qp-learn" role="status">
            <b>{t('qpLearnScore').replace('{s}', res.learning.score)}</b>
            {res.learning.score !== res.learning.previousScore && <span className="meta"> ({res.learning.score > res.learning.previousScore ? '+' : ''}{res.learning.score - res.learning.previousScore})</span>}
            {res.learning.newBadges.length > 0 && <p className="qp-newbadges">🏅 {t('qpNewBadges')} : {res.learning.newBadges.map((id) => t(`bdg_${id}`)).join(' · ')}</p>}
            {res.learning.review && <p className="meta small qp-review-next">{res.learning.review.mastered ? t('revMastered') : t('revNext').replace('{d}', new Date(res.learning.review.nextReviewOn + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>}
            <Link className="link u small" href="/learning">{t('qpSeeProgress')}</Link>
          </div>
        )}
        {user && !res.learning && <p className="meta small">{t('qpUpsell')} <Link className="link u" href="/pricing">{t('qpUpsellLink')}</Link></p>}
        {user
          ? <p className="meta small">{t('qpSaved')}</p>
          : <p className="meta small">{t('qpGuest')} <Link className="link u" href="/register">{t('qpGuestLink')}</Link></p>}
        <ol className="qp-review">
          {res.results.map((r, i) => {
            const q = byId.get(r.questionId);
            if (!q) return null;
            return (
              <li key={r.questionId} className={r.correct ? 'ok' : 'ko'}>
                <p className="qp-rq"><span aria-hidden="true">{r.correct ? '✓' : '✗'}</span> <span className="sr-only">{r.correct ? t('qpRight') : t('qpWrong')}</span> {i + 1}. {q.question}</p>
                {!r.correct && <p className="qp-line"><span className="meta">{t('qpYourAnswer')} :</span> {r.chosen == null ? t('qpNoAnswer') : q.options[r.chosen]}</p>}
                <p className="qp-line"><span className="meta">{t('qpGoodAnswer')} :</span> <b>{q.options[r.correctIndex]}</b></p>
                {r.explanation && <p className="qp-expl">{r.explanation}</p>}
                <div className="qp-tools">
                  {r.evidenceMs != null && onSeek && <button type="button" className="link u small" onClick={() => onSeek(Math.floor(r.evidenceMs / 1000))}>▶ {t('qpReplay').replace('{m}', clock(r.evidenceMs))}{r.chapterTitle ? ` · ${r.chapterTitle}` : ''}</button>}
                  <Report talkId={talkId} qid={q.id} t={t} call={call} />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="qp-actions">
          {onPractice && <button type="button" className={res.passed ? 'btn' : 'btn ghost'} onClick={onPractice}>{t('pzFromQuiz')}</button>}
          {!res.passed && <button type="button" className="btn" onClick={load}>{t('qpRetry')}</button>}
          {nextHref && <Link className={res.passed ? 'btn' : 'btn ghost'} href={nextHref} onClick={() => onNext && onNext(res)}>{t('qpNextEp')}</Link>}
          <button type="button" className="btn ghost" onClick={onClose}>{t('qpClose')}</button>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------ Questions
  const q = qs[step];
  const last = step === n - 1;
  return (
    <section className="quiz" aria-labelledby="qp-q">
      <div className="qp-head">
        <h2 id="qp-title" className="qp-title">{t('qpTitle')}</h2>
        <span className="meta">{t('qpQ').replace('{i}', step + 1).replace('{n}', n)}</span>
      </div>
      <div className="qp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={step + 1}><span style={{ width: `${((step + 1) / n) * 100}%` }} /></div>
      <fieldset className="qp-fs">
        <legend id="qp-q" tabIndex={-1} ref={box}>{q.question}</legend>
        {q.options.map((o, i) => (
          <label key={i} className={`qp-opt${picks[step] === i ? ' on' : ''}`}>
            <input type="radio" name={`qp-${q.id}`} checked={picks[step] === i} onChange={() => setPicks((p) => { const c = [...p]; c[step] = i; return c; })} />
            <span>{o}</span>
          </label>
        ))}
      </fieldset>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="qp-actions">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>{t('qpPrev')}</button>}
        {!last && <button type="button" className="btn" disabled={picks[step] == null} onClick={() => setStep(step + 1)}>{t('qpNext')}</button>}
        {last && <button type="button" className="btn" disabled={picks[step] == null || busy} onClick={submit}>{busy ? t('qpSending') : t('qpFinish')}</button>}
        <button type="button" className="link u" onClick={onClose}>{t('qpClose')}</button>
      </div>
    </section>
  );
}
