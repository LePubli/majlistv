'use client';
// Mon apprentissage (palier « Apprentissage ») : score, courbe, badges, progression par série et attestations de suivi.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import PracticeList from '../../components/PracticeList';
import SelfCheck from '../../components/SelfCheck';
import Evolution from '../../components/Evolution';
import Crumbs from '../../components/Crumbs';
import { thumbOf } from '../../components/TalkCard';
import { TabBar, TabPanel, useTab } from '../../components/Tabs';

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
  const { user, ready, t, call, locale, feat } = useApp();
  const router = useRouter();
  const [d, setD] = useState(undefined); // undefined = chargement, null = palier requis
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [rv, setRv] = useState(null); // révisions du jour, rappel, e-mail
  const [cont, setCont] = useState([]); // conférences à reprendre
  const [todo, setTodo] = useState([]); // quiz à passer
  const [goals, setGoals] = useState(null); // objectifs du bilan (privés)

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const load = useCallback(() => call('/me/learning').then((r) => setD(r.ok ? r.data : null)), [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  const loadRv = useCallback(() => call('/me/revision').then((r) => setRv(r.ok ? r.data : null)), [call]);
  useEffect(() => { if (user) loadRv(); }, [user, loadRv]);
  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); }, [user, call]);
  useEffect(() => { if (user && feat('quiz')) call('/me/quiz/todo').then((r) => setTodo(r.ok && Array.isArray(r.data) ? r.data : (r.data?.items || []))); }, [user, call, feat]);
  useEffect(() => { if (user && feat('selfcheck')) call('/me/selfcheck').then((r) => setGoals(r.ok ? r.data.goals || [] : null)); }, [user, call, feat]);
  const revN = rv ? rv.items.length + (rv.remaining || 0) : 0;
  const tabs = [
    { id: 'dash', label: t('tbDash') },
    { id: 'path', label: t('tbPath') },
    ...(feat('revision') ? [{ id: 'rev', label: <>{t('tbRev')}{revN > 0 && <span className="lg-badge" aria-label={String(revN)}>{revN}</span>}</>, plain: t('tbRev') }] : []),
    ...(feat('selfcheck') ? [{ id: 'bilan', label: t('msBilan') }] : []),
    { id: 'att', label: t('tbAtt') },
  ];
  const [tab, go] = useTab(tabs);
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
  const first = cont[0];
  const pct = first && first.durationMs > 0 ? Math.min(100, Math.round((first.positionMs / first.durationMs) * 100)) : null;
  const leftMin = first && first.durationMs > 0 ? Math.max(1, Math.round((first.durationMs - first.positionMs) / 60000)) : null;
  // Parcours en cours : la série commencée la plus avancée qui n'est pas terminée (sinon la dernière terminée).
  const started = d.series.filter((x) => x.passed > 0);
  const cur = started.filter((x) => !x.complete).sort((a, b) => b.passed / b.total - a.passed / a.total)[0] || started[0] || null;
  const since = (iso) => {
    const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
    return days <= 0 ? t('lgToday') : new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
  };
  const seriesBlock = (mode) => (
    <section className="lr-block">
      <h2>{mode === 'att' ? t('tbAtt') : t('lrSeries')}</h2>
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
            {mode === 'att' && (
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
            )}
          </li>
        ))}
      </ul>
      {mode === 'att' && <p className="meta small">{t('lrAttNote')}</p>}
    </section>
  );

  return (
    <main className="page learning">
      <Crumbs items={[[null, t('msSpace')], ['/learning', t('lrTitle')], ...(tab !== 'dash' ? [[null, tabs.find((x) => x.id === tab).plain || tabs.find((x) => x.id === tab).label]] : [])]} />
      <header className="lg-head">
        <h1>{t('lgHello').replace('{n}', (user.name || '').trim().split(/\s+/)[0] ? ` ${(user.name || '').trim().split(/\s+/)[0]}` : '')}</h1>
        <p>{t('lgSub')}</p>
      </header>
      <TabBar tabs={tabs} current={tab} onChange={go} label={t('tbLabel')} />

      <TabPanel id="dash" current={tab}>
      <div className="lg-top">
        {first ? (
          <section className="lg-resume" aria-label={t('lgResumeAria')}>
            <div className="lg-poster" style={thumbOf(first) ? { backgroundImage: `url(${thumbOf(first)})` } : undefined}>
              {first.category && <span>{first.category}</span>}
            </div>
            <div className="lg-resume-body">
              <span className="lg-kicker">{t('lgTalk')}</span>
              <h2>{first.title}</h2>
              {first.durationSeconds > 0 && <span className="lg-dim">{Math.max(1, Math.round(first.durationSeconds / 60))} {t('minutes')}</span>}
              {pct != null && (
                <div className="lg-bar"><div className="qp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div><b>{pct} %</b></div>
              )}
              {leftMin != null && <span className="lg-dim">{t('lgLeft').replace('{m}', leftMin)}</span>}
              <Link className="lg-cta" href={`/talks/${first.id}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>{t('lgResume')}
              </Link>
            </div>
          </section>
        ) : (
          <section className="lg-resume lg-empty" aria-label={t('lgStartTitle')}>
            <div className="lg-resume-body">
              <span className="lg-kicker">✦ {t('lgTalk')}</span>
              <h2>{t('lgStartTitle')}</h2>
              <p className="lg-dim">{t('lgStartSub')}</p>
              <Link className="lg-cta" href="/">{t('lgStart')}</Link>
            </div>
          </section>
        )}
        <div className="lg-side">
          <section className="lg-card" aria-label={t('lgYourPath')}>
            <h2>{t('lgYourPath')}</h2>
            {cur ? (
              <>
                <div className="lg-ring-row">
                  <div className="lg-ring" style={{ '--p': `${Math.round((cur.passed / cur.total) * 100)}%` }}><div>{cur.passed} / {cur.total}</div></div>
                  <div className="lg-ring-label">{t('lgDone')}</div>
                </div>
                <p className="lg-dim">
                  {d.recent[0] && <>{t('lgLastAct').replace('{d}', since(d.recent[0].at))}<br /></>}
                  {cur.complete ? t('lgPathDone') : t('lgQuizLeft').replace('{n}', cur.total - cur.passed)}
                </p>
              </>
            ) : <p className="lg-dim">{t('lgNoPath')}</p>}
          </section>
          {feat('revision') && (
            <section className="lg-card" aria-label={t('lgTodayRev')}>
              <h2>{t('lgTodayRev')}</h2>
              {revN > 0 ? (
                <>
                  <p className="lg-txt"><b>{t('lgRevN').replace('{n}', revN)}</b> {t('lgRevText')}</p>
                  <button type="button" className="lg-ghost" onClick={() => go('rev')}>{t('lgRevStart')}</button>
                </>
              ) : <p className="lg-txt">{t('lgRevNone')}</p>}
            </section>
          )}
        </div>
      </div>

      <section className="lg-block" aria-labelledby="lg-yl">
        <h2 id="lg-yl">{t('lgYourLearning')}</h2>
        <div className="lg-three">
          {cur && !cur.complete && (
            <Link className="lg-mini" href={`/series/${cur.id}`}>
              <span className="lg-thumb tone1" aria-hidden="true" />
              <span><small>{t('lgTagPath')}</small><b>{t('lgContinuePath')}</b><em>{cur.title} · {t('lgPathLeft').replace('{n}', cur.total - cur.passed)}</em></span>
            </Link>
          )}
          {todo[0] ? (
            <Link className="lg-mini" href={`/talks/${todo[0].id}?quiz=1`}>
              <span className="lg-thumb tone2" aria-hidden="true" style={thumbOf(todo[0]) ? { backgroundImage: `url(${thumbOf(todo[0])})` } : undefined} />
              <span><small>{t('lgTagCatch')}</small><b>{todo[0].title}</b><em>{todo[0].speaker || ''}</em></span>
            </Link>
          ) : (
            <Link className="lg-mini" href="/">
              <span className="lg-thumb tone2" aria-hidden="true" />
              <span><small>{t('lgTagDiscover')}</small><b>{t('lgExplore')}</b><em>{t('lgExploreSub')}</em></span>
            </Link>
          )}
          <Link className="lg-mini" href="/library">
            <span className="lg-thumb tone3" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
            <span><b>{t('lgHistory')}</b><em>{t('lgHistorySub')}</em></span>
          </Link>
        </div>
      </section>

      {feat('selfcheck') && goals && (
        <section className="lg-bilan" aria-label={t('msBilan')}>
          <div className="lg-bilan-t">
            <span className="lg-lock" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
            <div><h2>{t('msBilan')}</h2><p>{t('lgBilanSub')}</p></div>
          </div>
          <div className="lg-bilan-g">
            <small>{t('lgGoalNow')}</small>
            <span>{goals.length ? goals[0].title : t('lgNoGoal')}</span>
          </div>
          <button type="button" className="lg-ghost" onClick={() => go('bilan')}>{t('lgOpenBilan')}</button>
        </section>
      )}

      <h2 className="lg-h2">{t('lgProgress')}</h2>
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
      </TabPanel>

      <TabPanel id="rev" current={tab}>
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

      </TabPanel>

      <TabPanel id="path" current={tab}>
      <PracticeList t={t} call={call} locale={locale} />
      {seriesBlock('path')}
      </TabPanel>

      <TabPanel id="att" current={tab}>
      {seriesBlock('att')}
      </TabPanel>
      <TabPanel id="bilan" current={tab}>
      <SelfCheck t={t} call={call} locale={locale} />
      <Evolution t={t} call={call} locale={locale} />
      </TabPanel>
    </main>
  );
}
