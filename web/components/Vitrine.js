'use client';
// Vitrine visiteur (étape E1) : « Regarder. Comprendre. Retenir. Mettre en pratique. » avec une vraie conférence
// tirée au hasard parmi les plus vues et une vraie question de son quiz (jouable sans compte).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import CitationCard from './CitationCard';
import Row from './Row';
import { thumbOf } from './TalkCard';
import { clock } from '../lib/clock';

const LETTERS = ['A', 'B', 'C', 'D'];
const DAYS = [1, 3, 7, 21]; // calendrier de révision espacée (api/src/revision.js)

// Étape 3 : la vraie question ; une réponse est corrigée par le serveur (aucune bonne réponse n'est envoyée avant).
function QuizStep({ talkId, question, t, call }) {
  const [pick, setPick] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const answer = async (i) => {
    if (res || busy) return;
    setPick(i); setBusy(true);
    const r = await call(`/talks/${talkId}/quiz/submit`, { method: 'POST', body: JSON.stringify({ answers: [{ questionId: question.id, index: i }] }) }, null);
    setBusy(false);
    const mine = r.ok ? r.data.results.find((x) => x.questionId === question.id) : null;
    setRes(mine || { error: true });
  };
  return (
    <>
      <div className="vt-quiz" role="group" aria-label={t('vtS3Q')}>
        <p className="vt-q">{question.question}</p>
        {question.options.map((o, i) => {
          const state = !res || res.error ? '' : i === res.correctIndex ? 'good' : i === pick ? 'bad' : '';
          return (
            <button key={i} type="button" className={`vt-opt ${state}`} disabled={Boolean(res) || busy} onClick={() => answer(i)} aria-pressed={pick === i}>
              <b>{LETTERS[i]}.</b> {o}{state === 'good' ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      <div className="vt-expl" aria-live="polite">
        {!res && <span className="meta">{t('vtS3Pick')}</span>}
        {res && res.error && <span className="error">{t('errGeneric')}</span>}
        {res && !res.error && (
          <>
            <b>{res.correct ? t('vtRight') : t('vtWrong')}</b>
            {res.explanation && <> <b className="vt-hl">{t('vtExplain')}</b> {res.explanation}</>}
          </>
        )}
      </div>
      <Link className="btn vt-go" href={`/talks/${talkId}?quiz=1`}>{t('vtS3Go')}</Link>
    </>
  );
}

export default function Vitrine({ cit, latest, wait }) {
  const { t, locale, user, trialDays, call, feat } = useApp();
  const [d, setD] = useState(undefined);   // undefined = chargement, null = pas d'exemple disponible
  const [plans, setPlans] = useState(null);
  useEffect(() => { call(`/showcase?lang=${encodeURIComponent(locale)}`, {}, null).then((r) => setD(r.ok && r.data.available ? r.data : null)); }, [call, locale]);
  useEffect(() => { call('/billing/plans', {}, null).then((r) => setPlans(r.ok ? r.data : null)); }, [call]);

  const from = (list) => {
    const p = (list || []).filter((x) => x.amount > 0).sort((a, b) => a.amount - b.amount)[0];
    return p ? new Intl.NumberFormat(locale, { style: 'currency', currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100) : null;
  };
  const cta = trialDays > 0 ? t('heroCta') : t('register');
  const talk = d?.talk;
  const thumb = talk ? thumbOf({ posterUrl: talk.posterUrl, source: talk.source, video_ref: talk.video_ref }) : null;
  const mins = talk ? Math.max(1, Math.round(talk.durationSeconds / 60)) : 0;
  const stdFrom = from(plans?.plans); const learnFrom = from(plans?.learning?.plans);

  return (
    <main className={`vt${wait ? ' vt-wait' : ''}`}>
      <section className="vt-hero" aria-label={t('vtBadge')}>
        <span className="vt-badge">{t('vtBadge')}</span>
        <h1>{t('vtTitle1')}<br /><span>{t('vtTitle2')}</span></h1>
        <p className="vt-lead">{t('vtLead')}</p>
        <div className="vt-cta">
          {feat('registration') && <Link href="/register" className="btn btn-lg">{cta}</Link>}
          {d && <a href="#vt-example" className="btn ghost btn-lg">{t('vtSee')}</a>}
        </div>
        {trialDays > 0 && feat('registration') && <p className="hero-note">{t('heroNote').replace('{n}', trialDays)}</p>}
      </section>

      {d && (
        <section id="vt-example" className="vt-sec" aria-labelledby="vt-ex-t">
          <div className="vt-sec-head">
            <h2 id="vt-ex-t">{t('vtExTitle')}</h2>
            <span className="meta">{t('vtExNote')} · {talk.speaker} · {t('vtMin').replace('{n}', mins)}</span>
          </div>
          <div className="vt-steps">
            <article className="vt-step">
              <h3><span className="vt-n">1</span>{t('vtS1')}</h3>
              <Link href={`/talks/${talk.id}`} className="vt-poster" aria-label={talk.title}>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="vt-poster-ph" aria-hidden="true" />}
                <span className="vt-play" aria-hidden="true">▶</span>
              </Link>
              <b>{talk.title}</b>
              <p className="meta">{t('vtS1T')}</p>
              <Link className="link u vt-more" href={`/talks/${talk.id}`}>{talk.access === 'free' ? t('vtS1Free') : t('vtS1Go')}</Link>
            </article>

            <article className="vt-step">
              <h3><span className="vt-n">2</span>{t('vtS2')}</h3>
              <div className="vt-box">
                <span className="vt-lab">{t('vtS2Lab')}</span>
                {d.chapters.length > 0
                  ? <ul className="vt-chap">{d.chapters.map((c, i) => <li key={i}><b>{clock(c.ms)}</b> {c.title}</li>)}</ul>
                  : <p className="meta">{d.chapterCount > 0 ? t('vtS2Locked').replace('{n}', d.chapterCount) : t('vtS2None')}</p>}
                {talk.summary && <p className="vt-sum">{talk.summary}</p>}
              </div>
              <p className="meta vt-foot">{t('vtS2T')}</p>
            </article>

            <article className="vt-step vt-step-hot">
              <h3><span className="vt-n">3</span>{t('vtS3')}</h3>
              <QuizStep key={d.question.id} talkId={talk.id} question={d.question} t={t} call={call} />
            </article>

            <article className="vt-step">
              <h3><span className="vt-n">4</span>{t('vtS4')}</h3>
              <div className="vt-box">
                <span className="vt-lab">{t('vtS4Lab')}</span>
                <p>{t('vtS4Act')}</p>
                <ul className="vt-days" aria-label={t('vtS4Rev')}>{DAYS.map((n) => <li key={n}>{t('vtDay').replace('{n}', n)}</li>)}</ul>
              </div>
              <p className="meta vt-foot">{t('vtS4T')}</p>
            </article>
          </div>
        </section>
      )}

      <section className="vt-sec" aria-labelledby="vt-at-t">
        <h2 id="vt-at-t">{t('vtAtTitle')}</h2>
        <div className="vt-three">
          {[['vtA1T', 'vtA1', 'M4 6h16M4 12h16M4 18h10'], ['vtA2T', 'vtA2', 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'], ['vtA3T', 'vtA3', 'M4 20V10M10 20V4M16 20v-7M22 20H2']].map(([h, p, ic]) => (
            <div key={h} className="vt-card">
              <span className="vt-ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ic} /></svg></span>
              <h3>{t(h)}</h3><p>{t(p)}</p>
            </div>
          ))}
        </div>
      </section>

      {feat('kids') && (
        <section className="vt-kids" aria-label="Mejliss Kids">
          <div><span className="vt-lab">Mejliss Kids</span><h2>{t('vtKidsT')}</h2><p>{t('vtKidsText')}</p></div>
          <Link href="/kids" className="btn">{t('vtKidsCta')}</Link>
        </section>
      )}

      {latest && latest.length > 0 && <Row id="row-latest" title={t('vtLatest')} talks={latest} t={t} />}

      {(stdFrom || learnFrom) && (
        <section className="vt-sec vt-center" aria-labelledby="vt-pr-t">
          <h2 id="vt-pr-t">{t('vtPriceTitle')}</h2>
          <div className="vt-two">
            {[[t('tierStd'), t('tierStdTag'), stdFrom], [t('tierLearn'), t('tierLearnTag'), learnFrom]].filter((x) => x[2]).map(([h, tag, p], i, arr) => (
              <div key={h} className={`vt-card${i === arr.length - 1 && arr.length > 1 ? ' vt-card-hot' : ''}`}>
                <h3>{h}</h3><p>{tag}</p><p className="vt-price">{t('vtFrom').replace('{p}', p)}</p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="btn ghost">{t('vtPlans')}</Link>
          {feat('gifts') && <span className="meta">{t('vtGift')}</span>}
        </section>
      )}

      <CitationCard c={cit} t={t} framed />
    </main>
  );
}
