'use client';
// Quiz de l'espace enfant : une question à la fois, grands boutons, aucun chronomètre. Résultat en étoiles (1 à 3), jamais « raté ».
import { useEffect, useRef, useState } from 'react';
import { useApp } from './Providers';
import { BADGE_ICON, Stars } from '../lib/kids';
import { KidActions } from './KidsActions';

export default function KidsQuiz({ talkId, onClose, onDone }) {
  const { t, call, locale } = useApp();
  const [qs, setQs] = useState(undefined); // undefined : chargement, null : indisponible
  const [step, setStep] = useState(0);
  const [picks, setPicks] = useState([]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const load = async () => {
    setQs(undefined); setStep(0); setPicks([]); setRes(null);
    const r = await call(`/kids/talks/${talkId}/quiz`);
    setQs(r.ok ? r.data.questions : null);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [talkId]);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, [step, res]);

  if (qs === undefined) return <section className="kd-quiz" aria-busy="true"><p className="meta">…</p></section>;
  if (qs === null) return <section className="kd-quiz"><p>{t('kdQuizNone')}</p><button type="button" className="btn ghost" onClick={onClose}>{t('kdBack')}</button></section>;

  const q = qs[step];
  const last = step === qs.length - 1;
  const submit = async (finalPicks) => {
    setBusy(true);
    const answers = qs.map((x, i) => ({ questionId: x.id, index: finalPicks[i] }));
    const r = await call(`/kids/talks/${talkId}/quiz/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
    setBusy(false);
    if (r.ok) { setRes(r.data); onDone && onDone(r.data); }
  };
  const choose = (i) => { const next = [...picks]; next[step] = i; setPicks(next); };
  const go = () => { if (last) submit(picks); else setStep(step + 1); };

  if (res) {
    const msg = res.stars === 3 ? t('kdStars3') : res.stars === 2 ? t('kdStars2') : t('kdStars1');
    return (
      <section className="kd-quiz" aria-labelledby="kd-res" ref={box} tabIndex={-1}>
        <h2 id="kd-res">{msg}</h2>
        <p className="kd-stars" role="img" aria-label={`${res.stars} / 3`}><Stars n={res.stars} /></p>
        <p>{t('kdScore').replace('{n}', res.score).replace('{t}', res.total)}</p>
        {res.newBadges.length > 0 && (
          <div className="kd-newbadge" role="status"><b>{t('kdNewBadge')}</b>
            <ul>{res.newBadges.map((b) => <li key={b}><span aria-hidden="true">{BADGE_ICON[b]}</span> {t(`kdB_${b}`)}</li>)}</ul></div>
        )}
        <div className="ka-after"><KidActions limit={3} onlyOpen hideEmpty title={t('kaAfterQuiz')} /></div>
        {res.nextReview && <p className="meta">{t('kdNextReview').replace('{date}', new Date(res.nextReview + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>}
        <ol className="kd-review">
          {res.results.map((r, i) => (
            <li key={r.questionId}>
              <b>{qs[i].question}</b>
              <p className={r.correct ? 'kd-ok' : 'kd-almost'}>{r.correct ? `✓ ${t('kdRight')}` : `${t('kdWrongWas')} ${qs[i].options[r.correctIndex]}`}</p>
              {r.explanation && <p className="meta">{r.explanation}</p>}
            </li>
          ))}
        </ol>
        <div className="panel-actions"><button type="button" className="btn" onClick={load}>{t('kdReplay')}</button><button type="button" className="btn ghost" onClick={onClose}>{t('kdBack')}</button></div>
      </section>
    );
  }
  return (
    <section className="kd-quiz" aria-labelledby="kd-q" ref={box} tabIndex={-1}>
      <p className="meta">{t('kdQuestionOf').replace('{i}', step + 1).replace('{n}', qs.length)}</p>
      <h2 id="kd-q">{q.question}</h2>
      <div className="kd-options" role="radiogroup" aria-labelledby="kd-q">
        {q.options.map((o, i) => (
          <button key={i} type="button" role="radio" aria-checked={picks[step] === i} className={picks[step] === i ? 'kd-option on' : 'kd-option'} onClick={() => choose(i)}>{o}</button>
        ))}
      </div>
      <div className="panel-actions">
        <button type="button" className="btn" disabled={picks[step] == null || busy} onClick={go}>{last ? t('kdSee') : t('kdQNext')}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t('kdBack')}</button>
      </div>
    </section>
  );
}
