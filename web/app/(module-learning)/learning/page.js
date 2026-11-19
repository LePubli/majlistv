'use client';
// Apprendre (palier « Apprentissage »). Étape N2 (15/11) : trois onglets sans sous-onglets.
//   Aujourd'hui  : bloc « Aujourd'hui », reprise de la dernière vidéo, quiz / engagement / série du moment, planning (« Voir ma semaine »).
//   Réviser      : quiz à passer, révisions du jour, cartes mémoire.
//   Mes progrès  : séries et attestations, engagements, bilan, statistiques (série de jours, score, courbe, résultats récents).
// Les anciennes adresses (?tab=dash|plan|path|att|commit|bilan|cards) mènent au nouvel onglet et à la bonne section (?s=).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import PracticeList from '../../../components/PracticeList';
import SelfCheck from '../../../components/SelfCheck';
import Evolution from '../../../components/Evolution';
import Crumbs from '../../../components/Crumbs';
import { thumbOf } from '../../../components/TalkCard';
import { TabBar, TabPanel, useTab } from '../../../components/Tabs';
import Row from '../../../components/Row';
import MemoryCards from '../../../components/MemoryCards';
import TodayBlock from '../../../components/TodayBlock';
import EmptyState from '../../../components/EmptyState';
import InviteCard from '../../../components/InviteCard';
import StreakCard from '../../../components/StreakCard';
import PlanningClient from '../../../components/PlanningClient';
import PmLearning, { PmLearnFlow } from '../../../components/premium/PmLearning';

// Anciens onglets (avant N2) → [nouvel onglet, section].
export const LEGACY_TABS = {
  dash: ['today'], plan: ['today', 'week'], path: ['progress', 'series'], att: ['progress', 'series'],
  commit: ['progress', 'commit'], bilan: ['progress', 'bilan'], cards: ['rev', 'cards'],
};

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

// Étape B6 — phrase d'explication en haut de chaque onglet, jusqu'à ce que le membre clique « Compris » (mémorisé sur cet appareil).
function GroupIntro({ id, text, t }) {
  const key = `lg-intro-${id}`;
  const [seen, setSeen] = useState(true);
  useEffect(() => { try { setSeen(localStorage.getItem(key) === '1'); } catch { setSeen(false); } }, [key]);
  if (seen) return null;
  const close = () => { setSeen(true); try { localStorage.setItem(key, '1'); } catch { /* stockage indisponible */ } };
  return (
    <div className="lg-intro" role="note">
      <p>{text}</p>
      <button type="button" className="link u small" onClick={close}>{t('lgGotIt')}</button>
    </div>
  );
}

export default function Learning() {
  const { user, ready, t, call, locale, feat, skin } = useApp();
  const router = useRouter();
  const [d, setD] = useState(undefined); // undefined = chargement, null = palier requis
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [rv, setRv] = useState(null); // révisions du jour, rappel, e-mail
  const [cont, setCont] = useState([]); // vidéos à reprendre
  const [todo, setTodo] = useState([]); // quiz à passer
  const [cardsN, setCardsN] = useState(0); // cartes mémoire à faire aujourd'hui (à échéance + nouvelles)
  const [pz, setPz] = useState(null); // mes engagements : { items, counts } (synthèse du tableau de bord)
  const [next, setNext] = useState([]); // « Pour continuer à apprendre » (ou ce qu'on peut faire dès maintenant)

  // Étape B4 : un visiteur voit une invitation à créer un compte (au lieu d'être renvoyé vers la connexion).
  const load = useCallback(() => call('/me/learning').then((r) => setD(r.ok ? r.data : null)), [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  const loadRv = useCallback(() => call('/me/revision').then((r) => setRv(r.ok ? r.data : null)), [call]);
  useEffect(() => { if (user) loadRv(); }, [user, loadRv]);
  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); }, [user, call]);
  useEffect(() => { if (user && feat('quiz')) call('/me/quiz/todo').then((r) => setTodo(r.ok && Array.isArray(r.data) ? r.data : (r.data?.items || []))); }, [user, call, feat]);
  useEffect(() => { if (user && d && feat('practice')) call('/me/practice').then((r) => setPz(r.ok ? r.data : null)); }, [user, d, call, feat]);
  useEffect(() => { if (user) call('/talks?limit=12', {}, null).then((r) => setNext(r.ok ? r.data : [])); }, [user, call]);
  useEffect(() => { if (user && feat('memorycards')) call('/me/cards').then((r) => { if (r.ok) setCardsN(r.data.counts.due + r.data.counts.newAvailable); }); }, [user, call, feat]);
  const revN = rv ? rv.items.length + (rv.remaining || 0) : 0;
  const quizN = feat('quiz') ? todo.length : 0;
  const toReview = revN + (feat('memorycards') ? cardsN : 0) + quizN;
  const hasRev = feat('revision') || feat('memorycards') || feat('quiz');
  // Étape N2 (15/11) : trois onglets, sans sous-onglets — Aujourd'hui (faire), Réviser (retenir), Mes progrès (où j'en suis).
  const tabs = [
    { id: 'today', label: t('lgGToday'), intro: 'lgTTodayTx' },
    ...(hasRev ? [{ id: 'rev', label: <>{t('lgTRev')}{toReview > 0 && <span className="lg-badge" aria-label={String(toReview)}>{toReview}</span>}</>, plain: t('lgTRev'), intro: 'lgTRevTx' }] : []),
    { id: 'progress', label: t('lgGProgress'), intro: 'lgTProgTx' },
  ];
  const [tab, go] = useTab(tabs);
  const params = useSearchParams();
  const sec = params.get('s');
  const [week, setWeek] = useState(false);
  // Anciennes adresses (liens enregistrés, e-mails, notifications, menus déjà affectés) : elles mènent au nouvel onglet et à la
  // bonne section. Le Coran et les adhkar sont dans « Pratique » depuis la navigation de novembre 2026.
  const oldTab = params.get('tab');
  useEffect(() => {
    const to = LEGACY_TABS[oldTab];
    if (oldTab === 'quran') router.replace('/coran');
    else if (oldTab === 'athkar') router.replace('/adhkar');
    else if (to) router.replace(`/learning?tab=${to[0]}${to[1] ? `&s=${to[1]}` : ''}`, { scroll: false });
  }, [oldTab, router]);
  useEffect(() => { if (sec === 'week') setWeek(true); }, [sec]);
  // Section demandée (?s=) : on y descend une fois la page chargée.
  useEffect(() => {
    if (!sec || d == null) return undefined;
    const h = setTimeout(() => document.getElementById(`lg-${sec}`)?.scrollIntoView({ block: 'start' }), 300);
    return () => clearTimeout(h);
  }, [sec, tab, d]);
  const goSec = (id, s) => router.replace(`/learning?tab=${id}${s ? `&s=${s}` : ''}`, { scroll: false });
  const setEmail = async (on) => { setRv((v) => ({ ...v, dailyEmail: on })); await call('/me/learning/prefs', { method: 'PUT', body: JSON.stringify({ dailyEmail: on }) }); };
  if (ready && !user) {
    return (
      <main className="page learning">
        <header className="lg-head"><h1>{t('lrTitle')}</h1><p>{t('lgSub')}</p></header>
        <InviteCard context="learn" next="/learning" />
      </main>
    );
  }
  if (!user || d === undefined) return null;

  // Palier requis : écran « verrouillé » (maquette) : bannière, les temps avec cadenas, invitation, puis ce qu'on peut faire dès maintenant.
  if (d === null) {
    const tiles = [['lrStepQ', 'lzH1'], ['lrStepR', 'lzH2s'], ['lrStepP', 'lzH3'], ['msBilan', 'lzH4']];
    return (
      <main className="page learning lk-page">
        <section className="lk-banner" aria-label={t('tierLearn')}>
          <p className="eyebrow">{t('lzKicker')}</p>
          <h1>{t('lzTitle')}</h1>
          <p>{t('lzText')}</p>
        </section>
        <section className="lk-tiles" aria-label={t('tierLearn')}>
          {tiles.map(([n, h], i) => (
            <div key={n} className="lk-tile">
              <span className="lk-ico" role="img" aria-label={t('lzLocked')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
              <small>{i + 2}</small>
              <b>{t(n)}</b>
              <span className="meta">{t(h)}</span>
            </div>
          ))}
        </section>
        <section className="lk-cta" aria-label={t('lzH2')}>
          <div><h2>{t('lzH2')}</h2><p>{t('lzP')}</p></div>
          <div className="lk-btns"><Link className="btn" href="/pricing">{t('lzCta')}</Link></div>
        </section>
        {feat('quran') && <p className="lg-quran"><Link className="btn ghost" href="/coran">{t('lgQuran')}</Link></p>}
        {next.length > 0 && <Row id="row-lk-now" title={t('lzNow')} talks={next.slice(0, 8)} t={t} />}
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
  const first = cont[0];
  const pct = first && first.durationMs > 0 ? Math.min(100, Math.round((first.positionMs / first.durationMs) * 100)) : null;
  const leftMin = first && first.durationMs > 0 ? Math.max(1, Math.round((first.durationMs - first.positionMs) / 60000)) : null;
  // Parcours en cours : la série commencée la plus avancée qui n'est pas terminée (sinon la dernière terminée).
  const started = d.series.filter((x) => x.passed > 0);
  const cur = started.filter((x) => !x.complete).sort((a, b) => b.passed / b.total - a.passed / a.total)[0] || started[0] || null;
  // Séries suivies et attestations (une seule liste depuis N2 : progression, puis attestation une fois la série terminée).
  const seriesBlock = () => (
    <section className="lr-block">
      <h2>{t('lgSeriesAtt')}</h2>
      {msg && <p className="error" role="alert">{msg}</p>}
      {d.series.length === 0 && <EmptyState compact text={t('lrNoSeries')} actions={[feat('series') && { href: '/series', label: t('esSeeSeries') }]} />}
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
  );

  const tabNow = tabs.find((x) => x.id === tab) || tabs[0];
  // Engagement à mettre en avant : celui en cours, sinon le prochain à faire.
  const commitNow = feat('practice') && pz ? (pz.items.find((x) => x.status === 'doing') || pz.items.find((x) => x.status === 'todo') || null) : null;
  // Série du moment : à continuer, ou terminée (attestation à demander, série suivante) tant que l'attestation n'est pas prise.
  const pathNow = cur && (!cur.complete || !cur.attestation) ? cur : null;
  const sideN = (quizN > 0 ? 1 : 0) + (commitNow ? 1 : 0) + (pathNow ? 1 : 0);
  const nextList = next.filter((x) => !cont.some((c) => c.id === x.id)).slice(0, 8);
  const pm = skin === 'premium'; // thème Premium : tableau de bord V20 (onglet « Aujourd'hui ») et en-tête V20 (autres onglets)

  // Planning de la semaine et rangée « Pour continuer à apprendre » : même contenu dans le thème d'origine et dans le thème Premium.
  const weekBlock = (
    <section className="lg-week lg-anchor" id="lg-week" aria-label={t('pnTab')}>
      <div className="lg-week-head">
        <b>{t('pnTab')}</b>
        <button type="button" className="lg-ghost" aria-expanded={week} aria-controls="lg-week-body" onClick={() => setWeek((w) => !w)}>{week ? t('lgWeekHide') : t('lgWeek')}</button>
      </div>
      {week && <div id="lg-week-body"><PlanningClient /></div>}
    </section>
  );
  const nextRow = nextList.length > 0 ? <Row id="row-lg-next" title={t('lrNext')} talks={nextList} t={t} /> : null;

  if (pm && tab === 'today') {
    return (
      <PmLearning d={d} cont={cont} todo={todo} quizN={quizN} rv={rv} cardsN={cardsN} pz={pz} hasRev={hasRev} toReview={toReview}
        nextExtra={<>{weekBlock}{nextRow}</>} />
    );
  }

  const groupEl = (
      <div className="lg-group">
      {!pm && <GroupIntro id={`n2-${tab}`} text={t(tabNow.intro)} t={t} />}

      <TabPanel id="today" current={tab}>
      <TodayBlock compact />
      <div className={`lg-top${sideN ? '' : ' solo'}`}>
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
        {sideN > 0 && (
          <div className="lg-side">
            {quizN > 0 && (
              <section className="lg-card" aria-label={t('lgQuizTodo')}>
                <h2>{t('lgQuizTodo')}</h2>
                <p className="lg-txt"><b>{todo[0].title}</b>{quizN > 1 && <> · {t('lgQuizMore').replace('{n}', quizN - 1)}</>}</p>
                <button type="button" className="lg-ghost" onClick={() => go('rev')}>{t('lgTRev')}</button>
              </section>
            )}
            {commitNow && (
              <section className="lg-card" aria-label={t('lgCommitNow')}>
                <h2>{t('lgCommitNow')}</h2>
                <p className="lg-txt">{commitNow.text}</p>
                <button type="button" className="lg-ghost" onClick={() => goSec('progress', 'commit')}>{t('lrAllCommits')}</button>
              </section>
            )}
            {pathNow && (
              <section className="lg-card" aria-label={t('lgYourPath')}>
                <h2>{t('lgYourPath')}</h2>
                {pathNow.complete ? (
                  <>
                    <p className="lg-txt"><b>{pathNow.title}</b> · {t('lgPathDone')}</p>
                    <button type="button" className="lg-ghost" onClick={() => goSec('progress', 'series')}>{t('esAttest')}</button>
                    {feat('series') && <Link className="link u small" href="/series">{t('esNextPath')}</Link>}
                  </>
                ) : (
                  <>
                    <p className="lg-txt"><b>{pathNow.title}</b> · {t('lgPathLeft').replace('{n}', pathNow.total - pathNow.passed)}</p>
                    <Link className="lg-ghost" href={`/series/${pathNow.id}`}>{t('lgContinuePath')}</Link>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {weekBlock}

      {nextRow}
      </TabPanel>

      <TabPanel id="rev" current={tab}>
      {quizN > 0 && (
        <section className="lr-block lg-anchor" id="lg-quiz" aria-labelledby="lg-quiz-h">
          <h2 id="lg-quiz-h">{t('lgQuizTodo')}</h2>
          <ul className="rv-list">
            {todo.slice(0, 10).map((x) => (
              <li key={x.id}>
                <div><b>{x.title}</b>{x.speaker && <span className="meta small">{x.speaker}</span>}</div>
                <Link className="btn" href={`/talks/${x.id}?quiz=1`}>{t('lgQuizGo')}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {feat('revision') && rv && (
        <section className="lr-block rv-block lg-anchor" id="lg-revision" aria-labelledby="rv-title">
          <h2 id="rv-title">{t('revTitle')}</h2>
          {rv.items.length === 0 ? (
            rv.upcoming.week > 0 ? <p className="meta">✓ {t('revNone').replace('{n}', rv.upcoming.week)}</p> : <EmptyState compact text={t('revNoneYet')} actions={[{ href: '/catalogue', label: t('esFindTalk') }]} />
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
      {feat('memorycards') && <div className="lg-anchor" id="lg-cards"><MemoryCards onCount={setCardsN} /></div>}
      </TabPanel>

      <TabPanel id="progress" current={tab}>
      <nav className="lg-jump" aria-label={t('lgJump')}>
        <a href="#lg-series">{t('lgSeriesAtt')}</a>
        {feat('practice') && <a href="#lg-commit">{t('tbCommit')}</a>}
        {feat('selfcheck') && <a href="#lg-bilan">{t('msBilan')}</a>}
        <a href="#lg-stats">{t('lgStats')}</a>
      </nav>
      <div className="lg-anchor" id="lg-series">{seriesBlock()}</div>
      {feat('practice') && <div className="lg-anchor" id="lg-commit"><PracticeList t={t} call={call} locale={locale} /></div>}
      {feat('selfcheck') && (
        <div className="lg-anchor" id="lg-bilan">
          <SelfCheck t={t} call={call} locale={locale} />
          <Evolution t={t} call={call} locale={locale} />
        </div>
      )}
      <section className="lg-anchor" id="lg-stats" aria-labelledby="lg-stats-h">
        <h2 id="lg-stats-h" className="lg-h2">{t('lgStats')}</h2>
        <StreakCard />
        <div className="lr-top">
          <div className="lr-score" aria-label={t('lrScore')}>
            <b>{d.score}</b><span>/100</span>
            <p className="meta">{t('lrScore')}</p>
          </div>
          <div className="lr-facts">
            <p><b>{d.quizzesPassed}</b> {t('lrPassed')}</p>
            <p className="meta small">{t('lrDecay').replace('{p}', Math.round((1 - d.decay.floor) * 100)).replace('{d}', d.decay.days)}</p>
          </div>
        </div>
        <div className="lr-block">
          <h3>{t('lrCurve')}</h3>
          <Curve points={d.curve} locale={locale} t={t} />
        </div>
        {d.recent.length > 0 && (
          <div className="lr-block">
            <h3>{t('lrRecent')}</h3>
            <ul className="lr-recent">
              {d.recent.map((r, i) => (
                <li key={i}><Link href={`/talks/${r.talkId}`}>{r.title}</Link><span className={r.passed ? 'ok-msg' : 'meta'}>{r.percent} %</span><span className="meta small">{date(r.at)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </section>
      </TabPanel>
      </div>
  );

  if (pm) {
    return (
      <PmLearnFlow title={tabNow.plain || tabNow.label} intro={t(tabNow.intro)} tabs={<TabBar tabs={tabs} current={tab} onChange={go} label={t('tbLabel')} />}>
        {groupEl}
      </PmLearnFlow>
    );
  }
  return (
    <main className="page learning">
      <Crumbs items={[[null, t('navLearn')], ['/learning', t('lrTitle')], ...(tab !== 'today' ? [[null, tabNow.plain || tabNow.label]] : [])]} />
      <header className="lg-head">
        <h1>{t('lgHello').replace('{n}', (user.name || '').trim().split(/\s+/)[0] ? ` ${(user.name || '').trim().split(/\s+/)[0]}` : '')}</h1>
        <p>{t('lgSub')}</p>
      </header>
      <TabBar tabs={tabs} current={tab} onChange={go} label={t('tbLabel')} />
      {groupEl}
    </main>
  );
}
