'use client';
// Thème Premium — « Mon espace Apprendre » : reproduction du tableau de bord Apprendre de la maquette V20 (classes « v20-lv10-… »
// de /premium/v20.css). Seules de vraies données sont affichées (GET /me/learning, /me/continue, /me/revision, /me/cards,
// /me/quiz/todo, /me/practice, /series) : ni objectifs inventés, ni parcours inventés, ni cartes fictives, ni photo de profil.
// Ce qui n'a pas de donnée réelle n'est pas affiché (courbe des 7 jours : seulement s'il existe au moins 2 résultats de quiz).
// Les onglets « Réviser » et « Mes progrès » gardent leurs fonctions : `PmLearnFlow` leur donne l'en-tête V20 (`lv10-flow-head`).
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../Providers';
import { thumbOf, posterArt } from '../../lib/thumb';
import Glyph from './Glyph';

// Flèche « → » qui se retourne en arabe (le navigateur ne retourne que les signes ‹ ›).
const Arr = () => <span className="pm-arr" aria-hidden="true">→</span>;

/** Fond d'une carte : image de la vidéo / série, sinon décor illustré du thème (jamais de personnage). */
const artOf = (x) => {
  const u = thumbOf(x);
  return u ? `url("${u}")` : posterArt(x.id);
};

export default function PmLearning({ d, cont, todo, quizN, rv, cardsN, pz, nextExtra, hasRev, toReview }) {
  const { t, call, user, feat, hasSeries, appName } = useApp();
  const [covers, setCovers] = useState({});
  useEffect(() => {
    if (!hasSeries || !d?.series?.length) return;
    call('/series?limit=100', {}, null).then((r) => {
      if (r.ok && Array.isArray(r.data)) setCovers(Object.fromEntries(r.data.map((s) => [s.id, s])));
    });
  }, [hasSeries, d, call]);

  const first = cont[0] || null;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const firstName = (user?.name || '').trim().split(/\s+/)[0];
  const series = d.series;
  const total = series.reduce((a, s) => a + s.total, 0);
  const passed = series.reduce((a, s) => a + s.passed, 0);
  const pct = total > 0 ? Math.round((passed / total) * 100) : Math.round(d.score);
  const ringWord = total > 0 ? t('pmLnAccomplished') : t('pmLnScoreWord');
  const lastScores = (d.curve || []).slice(-7);

  // Parcours en cours : la série la plus avancée non terminée ; les terminées ensuite.
  const started = series.filter((x) => x.passed > 0);
  const cur = started.filter((x) => !x.complete).sort((a, b) => b.passed / b.total - a.passed / a.total)[0] || started[0] || null;
  const paths = useMemo(() => {
    const rank = (s) => (s.complete ? 1 : s.passed > 0 ? 0 : 2);
    return [...series].sort((a, b) => rank(a) - rank(b) || b.passed / b.total - a.passed / a.total).slice(0, 3);
  }, [series]);

  // « À faire maintenant » : uniquement ce qui existe vraiment aujourd'hui.
  const commitNow = feat('practice') && pz ? (pz.items.find((x) => x.status === 'doing') || pz.items.find((x) => x.status === 'todo') || null) : null;
  const revN = rv ? rv.items.length + (rv.remaining || 0) : 0;
  const goals = [
    quizN > 0 && { k: 'quiz', text: todo[0].title + (quizN > 1 ? ` (+${quizN - 1})` : ''), href: '/learning?tab=rev&s=quiz' },
    revN > 0 && feat('revision') && { k: 'rev', text: t('pmLnGoalRev').replace('{n}', revN), href: '/learning?tab=rev&s=revision' },
    feat('memorycards') && cardsN > 0 && { k: 'cards', text: t('pmLnGoalCards').replace('{n}', cardsN), href: '/learning?tab=rev&s=cards' },
    commitNow && { k: 'commit', text: commitNow.text, href: '/learning?tab=progress&s=commit' },
  ].filter(Boolean).slice(0, 4);

  const resumeHref = first ? `/talks/${first.id}` : cur ? `/series/${cur.id}` : '/catalogue';
  const mastered = rv?.upcoming?.mastered || 0;
  const stats = [
    revN > 0 && { n: revN, l: t('pmLnStatVideos') },
    feat('memorycards') && cardsN > 0 && { n: cardsN, l: t('pmLnStatCards') },
    quizN > 0 && { n: quizN, l: t('pmLnStatQuiz') },
    mastered > 0 && { n: mastered, l: t('pmLnStatMastered') },
  ].filter(Boolean).slice(0, 3);
  const tools = [
    { g: 'clapper', k: t('pmLnToolLessons'), s: t('pmLnToolLessonsSub'), href: resumeHref, on: true },
    { g: 'book', k: t('pmLnToolRev'), s: toReview > 0 ? t('pmLnToolRevN').replace('{n}', toReview) : t('pmLnToolRevSub'), href: '/learning?tab=rev', on: hasRev },
    { g: 'star', k: t('pmLnToolQuiz'), s: t('pmLnToolQuizSub'), href: '/learning?tab=rev&s=quiz', on: feat('quiz') },
    { g: 'compass', k: t('pmLnToolBilan'), s: t('pmLnToolBilanSub'), href: '/learning?tab=progress&s=bilan', on: feat('selfcheck') },
  ].filter((x) => x.on);
  const bilanOn = feat('selfcheck');
  const eyebrow = `${(appName || 'Mejliss TV').toUpperCase()} · ${t('pmLnYourJourney').toUpperCase()}`;

  return (
    <div className="v20-app pm-page pm-learn">
      <div className="v20-faithful-learn v20-learnv10">
        <section className="v20-lv10-hero" aria-label={`${t('pmLnMySpace')} ${t('pmLnTitleEm')}`}>
          <div className="v20-lv10-hero-art" aria-hidden="true" />
          <div className="v20-lv10-hero-inner">
            <div className="v20-lv10-hero-copy">
              <span className="v20-lv10-eyebrow">{eyebrow}</span>
              <h1>{t('pmLnMySpace')} <em>{t('pmLnTitleEm')}</em></h1>
              <p>{t('pmLnIntro')}</p>
              <div className="v20-lv10-greeting">
                <span className="pm-ln-avatar" aria-hidden="true">{initial}</span>
                <div><b>{t('pmLnHello').replace('{n}', firstName ? ` ${firstName}` : '')}</b><small>{t('pmLnReady')}</small></div>
              </div>
              <div className="v20-lv10-hero-actions">
                <Link href={resumeHref} className="v20-lv10-primary">▶ &nbsp; {t('pmLnResumePath')}</Link>
                {hasRev && <Link href="/learning?tab=rev" className="v20-lv10-ghost"><Glyph name="book" /> {t('pmLnMyReviews')}</Link>}
              </div>
            </div>
            <div className="v20-lv10-hero-label"><span>✦</span> {t('pmLnTagline')}</div>
          </div>
        </section>

        <main className="v20-lv10-main">
          <div className={`v20-lv10-overview-grid${goals.length === 0 && !hasRev ? ' pm-solo' : ''}`}>
            <section className="v20-lv10-progress-card v20-lv10-white">
              <div className="v20-lv10-card-head">
                <div><span className="v20-lv10-kicker">{t('pmLnYourJourney').toUpperCase()}</span><h2>{t('pmLnProgress')}</h2></div>
                {pct > 0 && <span className="v20-lv10-status">{pct >= 100 ? t('pmLnDoneBadge') : `↗ ${t('pmLnKeepGoing')}`}</span>}
              </div>
              <div className="v20-lv10-progress-content">
                <div className="v20-lv10-ring" style={{ '--lv10-pct': `${pct}%` }} role="img" aria-label={`${pct} % ${ringWord}`}>
                  <div><strong>{pct}%</strong><small>{ringWord}</small></div>
                </div>
                <div className="v20-lv10-progress-copy">
                  {total > 0 ? (
                    <>
                      <h3>{passed >= total ? t('pmLnAllDone') : t('pmLnGoing')}</h3>
                      <p>{t('lrQuizOf').replace('{a}', passed).replace('{b}', total)}</p>
                      <div className="v20-lv10-progress-line"><span style={{ width: `${pct}%` }} /></div>
                    </>
                  ) : (
                    <>
                      <h3>{t('pmLnNoSeries')}</h3>
                      <p>{d.quizzesPassed} {t('lrPassed')}</p>
                    </>
                  )}
                </div>
                {lastScores.length >= 2 && (
                  <div className="v20-lv10-sparkline" role="img" aria-label={t('pmLnLastScores')}>
                    {lastScores.map((p, i) => <i key={i} style={{ height: `${Math.max(8, p.score)}%` }} className={i === lastScores.length - 1 ? 'last' : ''} />)}
                    <span>{t('pmLnLastScores')}</span>
                  </div>
                )}
              </div>
              <Link href="/learning?tab=progress" className="v20-lv10-inline-link">{t('pmLnSeeProgress')} <Arr /></Link>
            </section>

            <section className="v20-lv10-goals-card v20-lv10-white">
              <div className="v20-lv10-card-head">
                <div><span className="v20-lv10-kicker">{t('pmLnOneStep').toUpperCase()}</span><h2>{t('pmLnGoals')}</h2></div>
                {goals.length > 0 && <span className="v20-lv10-status">{t('pmLnTodoN').replace('{n}', goals.length)}</span>}
              </div>
              {goals.length === 0 ? (
                <p className="v20-lv10-goal-hint pm-ln-nothing">{t('pmLnNothing')}</p>
              ) : (
                <div className="v20-lv10-goals-list">
                  {goals.map((g) => (
                    <div className="v20-lv10-goal" key={g.k}>
                      <label><input type="checkbox" disabled tabIndex={-1} aria-hidden="true" /><span>{g.text}</span></label>
                      <Link href={g.href} className="v20-lv10-goal-link">{t('pmLnOpen')} <Arr /></Link>
                    </div>
                  ))}
                </div>
              )}
              <p className="v20-lv10-goal-hint">{t('pmLnGoalHint')}</p>
            </section>
          </div>

          {paths.length > 0 && (
            <section className="v20-lv10-journey">
              <div className="v20-lv10-section-head">
                <div><span className="v20-lv10-kicker">{t('pmLnRhythm').toUpperCase()}</span><h2>{t('pmLnPaths')}</h2></div>
                {hasSeries && <Link href="/series" className="v20-lv10-all-link">{t('pmLnAllPaths')} <Arr /></Link>}
              </div>
              <div className="v20-lv10-path-grid">
                {paths.map((s, i) => {
                  const p = Math.round((s.passed / s.total) * 100);
                  const tag = s.complete ? t('pmLnTagDone') : s.passed > 0 ? t('pmLnTagDoing') : t('pmLnTagNew');
                  const cta = s.complete ? t('pmLnSeeSeries') : s.passed > 0 ? t('pmLnContinue') : t('pmLnDiscover');
                  const bg = artOf({ id: s.id, posterUrl: covers[s.id]?.posterUrl });
                  return (
                    <Link className="v20-lv10-path" href={`/series/${s.id}`} key={s.id}>
                      <div className="v20-lv10-path-art" style={{ backgroundImage: `linear-gradient(0deg,#03142ddb 0%,#03142d00 72%),${bg}` }}>
                        <span className="v20-lv10-path-index">{String(i + 1).padStart(2, '0')}</span>
                        <span className="v20-lv10-path-tag">{tag.toUpperCase()}</span>
                      </div>
                      <div className="v20-lv10-path-body">
                        <h3>{s.title}</h3>
                        {s.speaker && <p>{s.speaker}</p>}
                        <div className="v20-lv10-path-line"><span style={{ width: `${p}%` }} /></div>
                        <div><small>{t('lrQuizOf').replace('{a}', s.passed).replace('{b}', s.total)}</small><strong>{cta} ↗</strong></div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <div className={`v20-lv10-mid-grid${hasRev ? '' : ' pm-solo'}`}>
            {hasRev && (
              <section className="v20-lv10-review-card">
                <div className="v20-lv10-review-icon"><Glyph name="book" /></div>
                <span className="v20-lv10-kicker">{t('pmLnMemo').toUpperCase()}</span>
                <h2>{toReview > 0 ? t('pmLnRevWait') : t('pmLnRevUpToDate')}</h2>
                <p>{t('pmLnRevTx')}</p>
                {stats.length > 0 && (
                  <div className="v20-lv10-review-stats">
                    {stats.map((x) => <div key={x.l}><strong>{x.n}</strong><small>{x.l}</small></div>)}
                  </div>
                )}
                <Link href="/learning?tab=rev" className="v20-lv10-primary">{t('pmLnReviewNow')} <Arr /></Link>
              </section>
            )}
            <section className="v20-lv10-tools-card">
              <span className="v20-lv10-kicker">{t('pmLnTools').toUpperCase()}</span>
              <h2>{t('pmLnToolsTitle')}</h2>
              <div className="v20-lv10-tools-grid">
                {tools.map((x) => (
                  <Link href={x.href} className="v20-lv10-tool" key={x.k}>
                    <Glyph name={x.g} /><strong>{x.k}</strong><small>{x.s}</small><span>↗</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section className={`v20-lv10-bottom-grid${bilanOn ? '' : ' pm-solo'}`}>
            <div className="v20-lv10-focus">
              <span className="v20-lv10-kicker">{t('pmLnNow').toUpperCase()}</span>
              <h2>{t('pmLnDiscovery')}</h2>
              {first ? (
                <div className="v20-lv10-focus-item">
                  <span className="pm-ln-focus-art" style={{ backgroundImage: artOf(first) }} role="img" aria-label="" />
                  <div>
                    <span>{(first.category || t('lgTalk')).toUpperCase()}</span>
                    <h3>{first.title}</h3>
                    {first.speaker && <p>{first.speaker}</p>}
                    <Link href={`/talks/${first.id}`} className="v20-lv10-inline-link">{t('lgResume')} <Arr /></Link>
                  </div>
                </div>
              ) : (
                <div className="v20-lv10-focus-item pm-ln-focus-empty">
                  <div>
                    <h3>{t('lgStartTitle')}</h3>
                    <p>{t('lgStartSub')}</p>
                    <Link href="/catalogue" className="v20-lv10-inline-link">{t('lgStart')} <Arr /></Link>
                  </div>
                </div>
              )}
            </div>
            {bilanOn && (
              <Link className="v20-lv10-bilan-tile" href="/learning?tab=progress&s=bilan">
                <span className="v20-lv10-kicker">{t('pmLnAct').toUpperCase()}</span>
                <h2>{t('pmLnBilan')}</h2>
                <p>{t('pmLnBilanTx')}</p>
                <span className="v20-lv10-bilan-cta">{t('pmLnBilanCta')} ↗</span>
              </Link>
            )}
          </section>

          {nextExtra && <div className="pm-ln-extra">{nextExtra}</div>}
        </main>
      </div>
    </div>
  );
}

/** Onglets « Réviser » et « Mes progrès » : en-tête de la maquette (bandeau de parcours) puis le contenu habituel de la page. */
export function PmLearnFlow({ title, intro, tabs, children }) {
  const { t, appName } = useApp();
  return (
    <div className="v20-app pm-page pm-learn pm-ln-flow">
      <div className="v20-learning-flow-v10">
        <section className="v20-lv10-flow-head">
          <div className="v20-lv10-flow-art" aria-hidden="true" />
          <div className="v20-lv10-flow-wrap">
            <span className="v20-lv10-eyebrow">{(appName || 'Mejliss TV').toUpperCase()} · {t('navLearn').toUpperCase()}</span>
            <h1>{title}</h1>
            {intro && <p>{intro}</p>}
            <Link href="/learning" className="v20-lv10-all-link pm-ln-back">‹ {t('pmLnBack')}</Link>
          </div>
        </section>
        <main className="page learning pm-ln-body">
          {tabs}
          {children}
        </main>
      </div>
    </div>
  );
}
