'use client';
// Mon apprentissage (palier « Apprentissage ») : score, courbe, badges, progression par série et attestations de suivi.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import PracticeList from '../../components/PracticeList';
import SelfCheck from '../../components/SelfCheck';

const BADGE_ICON = { first_quiz: '🌱', passed_5: '📘', passed_10: '📚', perfect: '🎯', comeback: '💪', streak_3: '🔥', explorer: '🧭', series_done: '🏆' };

// Courbe d'apprentissage : tracé simple en SVG (aucune bibliothèque).
function Curve({ points, locale, t }) {
  if (points.length < 2) return <p className="meta">{t('lrCurveSoon')}</p>;
  const W = 600; const H = 180; const P = 28;
  const t0 = new Date(points[0].at).getTime(); const t1 = new Date(points.at(-1).at).getTime();
  const x = (p) => P + ((new Date(p.at).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - (v / 100) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const fmt = (iso) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return (
    <svg className="lr-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('lrCurve')}>
      {[0, 50, 100].map((v) => <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="grid" /><text x={P - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
      <path d={path} className="line" />
      {points.map((p, i) => <circle key={i} cx={x(p)} cy={y(p.score)} r="3.5" className="dot"><title>{`${fmt(p.at)} : ${p.score}`}</title></circle>)}
      <text x={P} y={H - 6} textAnchor="start">{fmt(points[0].at)}</text>
      <text x={W - P} y={H - 6} textAnchor="end">{fmt(points.at(-1).at)}</text>
    </svg>
  );
}

export default function Learning() {
  const { user, ready, t, call, locale } = useApp();
  const router = useRouter();
  const [d, setD] = useState(undefined); // undefined = chargement, null = palier requis
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [rv, setRv] = useState(null); // révisions du jour, rappel, e-mail

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const load = useCallback(() => call('/me/learning').then((r) => setD(r.ok ? r.data : null)), [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  const loadRv = useCallback(() => call('/me/revision').then((r) => setRv(r.ok ? r.data : null)), [call]);
  useEffect(() => { if (user) loadRv(); }, [user, loadRv]);
  const setEmail = async (on) => { setRv((v) => ({ ...v, dailyEmail: on })); await call('/me/learning/prefs', { method: 'PUT', body: JSON.stringify({ dailyEmail: on }) }); };
  if (!user || d === undefined) return null;

  // Palier requis : on présente ce que l'offre apporte.
  if (d === null) {
    return (
      <main className="page learning">
        <h1>{t('lrTitle')}</h1>
        <section className="lr-teaser">
          <h2>{t('tierLearn')}</h2>
          <p>{t('lrTeaser')}</p>
          <ul className="plan-list">{['planL1', 'planL2', 'planL3', 'planL4'].map((k) => <li key={k}>{t(k)}</li>)}</ul>
          <p className="meta small">{t('lrTeaserKeep')}</p>
          <Link className="btn" href="/pricing">{t('lrDiscover')}</Link>
        </section>
      </main>
    );
  }

  const date = (iso) => new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
  const attest = async (s) => {
    setBusy(s.id); setMsg(null);
    const r = await call('/me/learning/attestations', { method: 'POST', body: JSON.stringify({ seriesId: s.id }) });
    setBusy('');
    if (!r.ok) { setMsg(r.data?.error || t('errGeneric')); return; }
    router.push(`/attestation/${r.data.code}`);
  };
  const retire = async (s) => {
    if (!window.confirm(t('lrAttDelConfirm'))) return;
    await call(`/me/learning/attestations/${s.attestation.code}`, { method: 'DELETE' });
    load();
  };
  const earned = d.badges.filter((b) => b.earned).length;

  return (
    <main className="page learning">
      <h1>{t('lrTitle')}</h1>

      <section className="lr-top">
        <div className="lr-score" aria-label={t('lrScore')}>
          <b>{d.score}</b><span>/100</span>
          <p className="meta">{t('lrScore')}</p>
        </div>
        <div className="lr-facts">
          <p><b>{d.quizzesPassed}</b> {t('lrPassed')}</p>
          <p><b>{earned}</b> / {d.badges.length} {t('lrBadgesWon')}</p>
          <p className="meta small">{t('lrDecay').replace('{p}', Math.round((1 - d.decay.floor) * 100)).replace('{d}', d.decay.days)}</p>
        </div>
      </section>

      {rv && (
        <section className="lr-block rv-block" aria-labelledby="rv-title">
          <h2 id="rv-title">{t('revTitle')}</h2>
          {rv.items.length === 0 ? (
            <p className="meta">{rv.upcoming.week > 0 ? t('revNone').replace('{n}', rv.upcoming.week) : t('revNoneYet')}</p>
          ) : (
            <ul className="rv-list">
              {rv.items.map((x) => (
                <li key={x.id}>
                  <div>
                    <b>{x.title}</b>
                    <span className="meta small">{t('revStep').replace('{j}', [1, 3, 7, 21][x.revision.stage])}{x.revision.lateDays > 0 ? ` · ${t('revLate').replace('{n}', x.revision.lateDays)}` : ''}{x.revision.lastPercent != null ? ` · ${t('revLast').replace('{p}', x.revision.lastPercent)}` : ''}</span>
                  </div>
                  <Link className="btn" href={`/talks/${x.id}?quiz=1`}>{t('revGo')}</Link>
                </li>
              ))}
            </ul>
          )}
          {rv.remaining > 0 && <p className="meta small">{t('revMore').replace('{n}', rv.remaining)}</p>}
          {rv.upcoming.mastered > 0 && <p className="meta small">{t('revMasteredN').replace('{n}', rv.upcoming.mastered)}</p>}
          {rv.reminder && (
            <figure className="rv-reminder">
              <figcaption className="eyebrow">{t('revReminder')}</figcaption>
              {rv.reminder.textAr && <blockquote className="cit-ar" dir="rtl" lang="ar">{rv.reminder.textAr}</blockquote>}
              <blockquote dir="auto">{rv.reminder.text}</blockquote>
              <p className="meta small">{[rv.reminder.attribution, rv.reminder.speaker].filter(Boolean).join(' · ')}{rv.reminder.talkId && <> — <Link className="link u" href={`/talks/${rv.reminder.talkId}${rv.reminder.startMs != null ? `?t=${Math.floor(rv.reminder.startMs / 1000)}` : ''}`}>{rv.reminder.talkTitle}</Link></>}</p>
            </figure>
          )}
          {rv.emailEnabled && (
            <label className="rv-email"><input type="checkbox" checked={rv.dailyEmail} onChange={(e) => setEmail(e.target.checked)} /> {t('revEmail')}</label>
          )}
        </section>
      )}

      <PracticeList t={t} call={call} locale={locale} />

      <SelfCheck t={t} call={call} locale={locale} />

      <section className="lr-block">
        <h2>{t('lrCurve')}</h2>
        <Curve points={d.curve} locale={locale} t={t} />
      </section>

      <section className="lr-block">
        <h2>{t('lrBadges')}</h2>
        <ul className="lr-badges">
          {d.badges.map((b) => (
            <li key={b.id} className={b.earned ? 'on' : ''}>
              <span className="lr-ico" aria-hidden="true">{BADGE_ICON[b.id]}</span>
              <b>{t(`bdg_${b.id}`)}</b>
              <span className="meta small">{t(`bdgD_${b.id}`)}</span>
              {b.earned ? <span className="lr-when">{date(b.earnedAt)}</span> : <span className="lr-when locked">{t('lrLocked')}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="lr-block">
        <h2>{t('lrSeries')}</h2>
        {msg && <p className="error" role="alert">{msg}</p>}
        {d.series.length === 0 && <p className="meta">{t('lrNoSeries')}</p>}
        <ul className="lr-series">
          {d.series.map((s) => (
            <li key={s.id}>
              <div className="lr-series-head">
                <Link href={`/series/${s.id}`}><b>{s.title}</b></Link>
                <span className="meta small">{t('lrQuizOf').replace('{a}', s.passed).replace('{b}', s.total)}</span>
              </div>
              <div className="qp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.passed}><span style={{ width: `${(s.passed / s.total) * 100}%` }} /></div>
              <div className="lr-series-act">
                {s.attestation ? (
                  <>
                    <Link className="btn ghost" href={`/attestation/${s.attestation.code}`}>{t('lrAttView')}</Link>
                    <button type="button" className="link u small" onClick={() => retire(s)}>{t('lrAttDel')}</button>
                  </>
                ) : s.complete ? (
                  <button type="button" className="btn" disabled={busy === s.id} onClick={() => attest(s)}>{t('lrAttGet')}</button>
                ) : <span className="meta small">{t('lrAttLeft').replace('{n}', s.total - s.passed)}</span>}
              </div>
            </li>
          ))}
        </ul>
        <p className="meta small">{t('lrAttNote')}</p>
      </section>

      {d.recent.length > 0 && (
        <section className="lr-block">
          <h2>{t('lrRecent')}</h2>
          <ul className="lr-recent">
            {d.recent.map((r, i) => (
              <li key={i}><Link href={`/talks/${r.talkId}`}>{r.title}</Link><span className={r.passed ? 'ok-msg' : 'meta'}>{r.percent} %</span><span className="meta small">{date(r.at)}</span></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
