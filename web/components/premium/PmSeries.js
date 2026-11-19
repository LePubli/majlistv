'use client';
// Page d'une série, thème Premium : reproduction de la fiche série de la maquette V20 (classes « v20-hv9-… »), vraies données.
//   - Bandeau : étiquettes (thème, nombre d'épisodes), titre, intervenant, description, thème / niveau / accès,
//     « Regarder l'épisode 1 » ou « Reprendre l'épisode N », partager.
//   - Gauche : ma progression dans la série (épisodes terminés), onglets (Épisodes, À propos, Ressources), saisons et épisodes
//     (image, numéro, titre, résumé, ✓ si terminé, position / durée et barre si commencé, cadenas pour un visiteur si réservé).
//   - Droite : « Apprendre avec cette série » (vrais chiffres de la formule Apprentissage s'il y en a ; quiz, cartes de
//     révision, engagement selon les fonctions actives), puis « Dans la même thématique » (autres séries du même thème).
// Rien n'est inventé : une partie sans données n'est pas affichée.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../Providers';
import { levelLabel } from '../../lib/levels';
import { posterArt } from '../../lib/thumb';
import BooksBlock from '../BooksBlock';
import Glyph from './Glyph';

const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;
const artOf = (url, id) => (url ? cssUrl(url) : posterArt(id));
const mn = (sec) => Math.max(1, Math.round((sec || 0) / 60));

export default function PmSeries({ id }) {
  const { t, call, ready, user, feat, allCats, hasBooks } = useApp();
  const [s, setS] = useState(undefined);
  const [learn, setLearn] = useState(null);
  const [related, setRelated] = useState([]);
  const [tab, setTab] = useState('episodes');
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!ready) return;
    call(`/series/${id}`).then((r) => setS(r.ok ? r.data : null));
  }, [id, call, ready, user]);
  useEffect(() => { if (user && feat('learning')) call('/me/learning', {}, null).then((r) => setLearn(r.ok ? r.data : null)); }, [user, call, feat]);
  const root = useMemo(() => {
    const c = (allCats || []).find((x) => String(x.id) === String(s?.categoryId));
    return c ? (c.parentId ?? c.id) : null;
  }, [allCats, s]);
  useEffect(() => {
    if (!s) return;
    call(`/series?limit=12${root ? `&category=${root}` : ''}`, {}, null).then((r) => setRelated(r.ok && Array.isArray(r.data) ? r.data.filter((x) => x.id !== s.id).slice(0, 4) : []));
  }, [s, root, call]);

  const groups = useMemo(() => {
    if (!s) return [];
    if (s.seasons?.length) return s.seasons.map((z) => ({ key: z.id, title: z.title ? `${t('seasonN').replace('{n}', z.number)} – ${z.title}` : t('seasonN').replace('{n}', z.number), episodes: z.episodes }));
    return [{ key: 'all', title: '', episodes: s.episodes || [] }];
  }, [s, t]);
  const flat = groups.flatMap((g) => g.episodes);

  if (s === undefined) return <div className="v20-app pm-page" aria-busy="true"><div className="v20-heritage-v9"><section className="v20-hv9-hero" /></div></div>;
  if (s === null) return <div className="v20-app pm-page"><div className="v20-shell pm-empty"><p>{t('noSeriesFound')}</p><Link href="/series">{t('seriesTitle')}</Link></div></div>;

  const resume = s.resume;
  const label = resume ? (resume.started ? t('resumeEp').replace('{n}', resume.number) : t('watchEp1')) : '';
  const done = flat.filter((e) => e.completed).length;
  const pct = flat.length ? Math.round((done / flat.length) * 100) : 0;
  const access = flat.length && flat.every((e) => e.access === 'free') ? t('free') : flat.length && flat.every((e) => e.access === 'premium') ? t('premium') : t('mixed');
  const ls = learn?.series?.find((x) => x.id === s.id);
  const lpct = ls && ls.total ? Math.round((ls.passed / ls.total) * 100) : null;
  const actions = [
    feat('quiz') && { icon: '▤', title: t('pmQuiz'), sub: t('pmQuizSub'), href: '/learning?tab=rev', cta: t('pmStart') },
    feat('memorycards') && { icon: '▣', title: t('pmCards'), sub: t('pmCardsSub'), href: '/learning?tab=rev&s=cards', cta: t('pmReview') },
    feat('practice') && { icon: '◎', title: t('pmCommit'), sub: t('pmCommitSub'), href: '/learning?tab=progress&s=commit', cta: t('pmDefine') },
  ].filter(Boolean);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: s.title, url }); return; }
      await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500);
    } catch { /* partage annulé */ }
  };
  const tabs = [
    ['episodes', '⊙', t('pmEpisodes')],
    ['about', 'ⓘ', t('pmAbout')],
    hasBooks && ['books', '▤', t('pmResources')],
  ].filter(Boolean);

  return (
    <div className="v20-app pm-page">
      <div className="v20-heritage-v9">
        <section className="v20-hv9-hero" aria-label={s.title}>
          <div className="v20-hv9-hero-art" aria-hidden="true" style={{ backgroundImage: artOf(s.posterUrl, s.id) }} />
          <div className="v20-hv9-hero-copy">
            <div className="v20-hv9-pills">
              <span>{(s.category || t('seriesTag')).toUpperCase()}</span>
              <span>✦ {t('episodeCount').replace('{n}', s.episodeCount).toUpperCase()}</span>
            </div>
            <h1>{s.title}</h1>
            {s.speaker && <h2>{s.speaker}</h2>}
            {s.description && <p className="pm-clamp">{s.description}</p>}
            <div className="v20-hv9-meta">
              {s.category && <span><Glyph name="cap" /> {s.category}</span>}
              {s.category && s.level && <i />}
              {s.level && <span>▣&nbsp; {levelLabel(s.level, t)}</span>}
              {(s.category || s.level) && <i />}
              <span className="v20-hv9-audience">✓&nbsp; {access}</span>
            </div>
            {!s.published && <p className="pm-note" role="status">{t('seriesDraftNote')}</p>}
            <div className="v20-hv9-hero-actions">
              {resume && <Link href={`/talks/${resume.talkId}`} className="v20-hv9-action-primary">▶ &nbsp; {label}</Link>}
              <button type="button" onClick={share} className="v20-hv9-action-icon" aria-label={shared ? t('pmLinkCopied') : t('pmShare')} title={shared ? t('pmLinkCopied') : t('pmShare')}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="5" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m7.3 11 8.5-5m-8.5 7 8.5 5" /></svg>
              </button>
            </div>
          </div>
        </section>
        <main className="v20-hv9-main">
          <div className="v20-hv9-main-left">
            {user && flat.length > 0 && (
              <div className="v20-hv9-series-progress">
                <b>{t('pmMyProgress')}</b>
                <div className="v20-hv9-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
                <strong>{pct} %</strong>
                <small>{t('pmEpOf').replace('{n}', done).replace('{total}', flat.length)}</small>
              </div>
            )}
            <nav className="v20-hv9-tabs" aria-label={s.title} role="tablist">
              {tabs.map(([k, ico, name]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'v20-active' : undefined} onClick={() => setTab(k)}><span aria-hidden="true">{ico}</span>{name}</button>
              ))}
            </nav>
            {tab === 'episodes' && groups.map((g) => (
              <section key={g.key} className="v20-hv9-episodes">
                {g.title && <h3>{g.title}</h3>}
                {g.episodes.length === 0 && <p className="pm-muted">{t('seasonEmpty')}</p>}
                <div className="v20-hv9-episode-list">
                  {g.episodes.map((e) => {
                    const cur = resume && resume.started && resume.talkId === e.id;
                    const ep = e.durationSeconds && e.positionMs ? Math.min(100, Math.round((e.positionMs / 1000 / e.durationSeconds) * 100)) : 0;
                    const locked = !user && e.access === 'premium';
                    return (
                      <div key={e.id} className={`v20-hv9-episode${cur ? ' v20-current' : ''}`}>
                        <Link href={`/talks/${e.id}`} className="v20-hv9-episode-art pm-ep-art" style={{ backgroundImage: artOf(e.posterUrl, e.id) }} aria-label={`${t('pmWatch')} — ${t('pmEpN').replace('{n}', e.number)}`}>
                          <span className="pm-ep-play" aria-hidden="true">▶</span>
                          {e.durationSeconds > 0 && <span className="pm-ep-dur">{mn(e.durationSeconds)} min</span>}
                        </Link>
                        <Link className="v20-hv9-episode-info" href={`/talks/${e.id}`}>
                          <small>{t('pmEpN').replace('{n}', e.number)}</small>
                          <strong>{e.title}</strong>
                          {e.summary && <span>{e.summary}</span>}
                          {cur && <div className="v20-hv9-episode-progress"><span style={{ width: `${ep}%` }} /></div>}
                        </Link>
                        <div className="v20-hv9-episode-end">
                          {e.completed ? <span className="v20-hv9-complete" aria-label={t('watched')}>✓</span>
                            : cur ? <small>{mn(e.positionMs / 1000)} min / {mn(e.durationSeconds)} min</small>
                            : locked ? <span className="v20-hv9-locked" aria-label={t('premium')} title={t('premium')}>🔒︎</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {tab === 'about' && (
              <section className="v20-hv9-episodes pm-about">
                <h3>{t('pmAbout')}</h3>
                {s.description && <p>{s.description}</p>}
                <dl>
                  {s.speaker && <><dt>{t('pmSpeaker')}</dt><dd>{s.speaker}</dd></>}
                  {s.category && <><dt>{t('pmTheme')}</dt><dd>{s.category}</dd></>}
                  {s.level && <><dt>{t('pmLevel')}</dt><dd>{levelLabel(s.level, t)}</dd></>}
                  <dt>{t('pmAccess')}</dt><dd>{access}</dd>
                </dl>
                {(s.prerequisites || []).length > 0 && (
                  <p>{t('srPrereqAfter')} {s.prerequisites.map((x, i) => <span key={x.id}>{i > 0 ? ', ' : ''}<Link href={`/series/${x.id}`}>{x.title}</Link></span>)}</p>
                )}
              </section>
            )}
            {tab === 'books' && <section className="v20-hv9-episodes pm-about"><BooksBlock kind="series" id={s.id} /></section>}
          </div>
          <aside className="v20-hv9-main-right" aria-label={t('pmLearnSeries')}>
            {feat('learning') && (
              <section className="v20-hv9-learning-card" id="pm-learn">
                <header>
                  <span className="v20-hv9-learn-icon" aria-hidden="true"><Glyph name="cap" /></span>
                  <div><h2>{t('pmLearnSeries')}</h2><p>{t('pmLearnSeriesSub')}</p></div>
                  <Link href="/learning?tab=progress" className="v20-hv9-course-link">{t('pmSeeCourse')} →</Link>
                </header>
                {lpct != null && (
                  <div className="v20-hv9-learning-progress">
                    <div className="v20-hv9-ring" style={{ background: `conic-gradient(#08c6a9 0% ${lpct}%, #2d5b86 ${lpct}% 100%)` }}><strong>{lpct} %</strong></div>
                    <div><b>{t('pmYourProgress')}</b><span>{t('pmQuizOf').replace('{n}', ls.passed).replace('{total}', ls.total)}</span></div>
                    <div className="v20-hv9-bars" aria-hidden="true">
                      {flat.slice(0, 12).map((e) => <i key={e.id} style={{ height: `${Math.max(8, e.completed ? 100 : Math.round(((e.positionMs || 0) / 1000 / (e.durationSeconds || 1)) * 100))}%` }} />)}
                    </div>
                  </div>
                )}
                {actions.length > 0 && (
                  <div className="v20-hv9-learning-actions">
                    {actions.map((a) => (
                      <div key={a.title}>
                        <span className="v20-hv9-round-icon" aria-hidden="true">{a.icon}</span>
                        <b>{a.title}</b>
                        <small>{a.sub}</small>
                        <Link href={a.href} className="v20-hv9-micro-cta">{a.cta} ❯</Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {related.length > 0 && (
              <section className="v20-hv9-related">
                <div className="v20-hv9-related-title">
                  <h2>{t('pmSameTheme')}</h2>
                  <Link href={root ? `/series?cat=${root}` : '/series'}>{t('rowSeeAll')} ❯</Link>
                </div>
                <div className="v20-hv9-related-grid">
                  {related.map((x) => (
                    <Link key={x.id} href={`/series/${x.id}`} className="v20-hv9-related-card">
                      <div className="v20-hv9-related-art pm-rel-art" style={{ backgroundImage: artOf(x.posterUrl, x.id) }} />
                      <div className="v20-hv9-related-copy"><b>{x.title}</b><small>{t('seriesTag')} · {t('pmEpShort').replace('{n}', x.episodeCount)}</small></div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
