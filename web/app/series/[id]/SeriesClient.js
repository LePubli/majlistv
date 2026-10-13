'use client';
// Page d'une série : bannière, bouton « Regarder / Reprendre », saisons et épisodes (avancement, accès).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { levelLabel } from '../../../lib/levels';

const mins = (s, t) => (s > 0 ? `${Math.max(1, Math.round(s / 60))} ${t('minutes')}` : '');

export default function SeriesPage({ initial = null }) {
  const { id } = useParams();
  const { t, call, ready, user } = useApp();
  const [s, setS] = useState(undefined);
  const [season, setSeason] = useState(0); // index de la saison affichée

  useEffect(() => {
    if (!ready) return;
    call(`/series/${id}`).then((r) => {
      setS(r.ok ? r.data : null);
      if (r.ok && r.data.seasons) {
        // Ouvre la saison de l'épisode à reprendre.
        const at = r.data.seasons.findIndex((z) => z.episodes.some((e) => e.id === r.data.resume?.talkId));
        setSeason(at >= 0 ? at : 0);
      }
    });
  }, [id, call, ready, user]);

  const flat = useMemo(() => (s ? (s.seasons ? s.seasons.flatMap((z) => z.episodes) : s.episodes) : []), [s]);
  if (s === undefined) {
    if (!initial) return null;
    return (
      <main className="series-page">
        <section className="series-hero"><div className="series-hero-in">
          <h1>{initial.title}</h1>
          {initial.speaker && <p className="meta">{initial.speaker}</p>}
          {initial.description && <p className="series-desc">{initial.description}</p>}
        </div></section>
        <section className="series-body">
          <ol className="series-eps">{initial.episodes.map((e) => <li key={e.id}><a href={`/talks/${e.id}`}>{e.title}</a></li>)}</ol>
        </section>
      </main>
    );
  }
  if (s === null) return <main className="page"><p>{t('noSeriesFound')}</p><Link href="/series">{t('seriesTitle')}</Link></main>;

  const group = s.seasons ? s.seasons[season] : null;
  const list = group ? group.episodes : s.episodes;
  const resume = s.resume;
  const label = resume ? (resume.started ? t('resumeEp').replace('{n}', resume.number) : t('watchEp1')) : '';
  const access = flat.length && flat.every((e) => e.access === 'free') ? t('free') : flat.length && flat.every((e) => e.access === 'premium') ? t('premium') : t('mixed');
  const meta = [s.speaker, s.category, levelLabel(s.level, t), s.seasons && s.seasons.length > 1 ? t('seasonCount').replace('{n}', s.seasons.length) : '', t('episodeCount').replace('{n}', s.episodeCount), access].filter(Boolean).join(' · ');

  const prereq = s.prerequisites || [];
  return (
    <main className="series-page">
      <section className="series-hero" style={s.posterUrl ? { backgroundImage: `url(${s.posterUrl})` } : undefined}>
        <div className="series-hero-in">
          <p className="eyebrow">{t('seriesTag')}</p>
          <h1>{s.title}</h1>
          <p className="meta">{meta}</p>
          {s.description && <p className="series-desc">{s.description}</p>}
          {!s.published && <p className="notice" role="status">{t('seriesDraftNote')}</p>}
          {prereq.length > 0 && (
            <p className="series-prereq">
              {t('srPrereqAfter')} {prereq.map((x, i) => (
                <span key={x.id}>{i > 0 ? ', ' : ''}<Link href={`/series/${x.id}`}>{x.title}</Link></span>
              ))}
            </p>
          )}
          {resume && <div className="series-cta"><Link className="btn btn-lg" href={`/talks/${resume.talkId}`}>▶ {label}</Link></div>}
        </div>
      </section>

      <div className="series-body">
        {s.seasons && s.seasons.length > 1 && (
          <div className="pills series-seasons" role="tablist" aria-label={t('seasonPick')}>
            {s.seasons.map((z, i) => (
              <button key={z.id} type="button" role="tab" aria-selected={i === season} className={i === season ? 'pill on' : 'pill'} onClick={() => setSeason(i)}>
                {t('seasonN').replace('{n}', z.number)}
              </button>
            ))}
          </div>
        )}
        {group && group.title && <h2 className="series-season-title">{group.title}</h2>}
        {list.length === 0 && <p className="soon">{t('seasonEmpty')}</p>}
        <ol className="series-eps">
          {list.map((e) => {
            const pct = e.durationSeconds && e.positionMs ? Math.min(100, Math.round((e.positionMs / 1000 / e.durationSeconds) * 100)) : 0;
            return (
              <li key={e.id}>
                <Link href={`/talks/${e.id}`} className="series-ep">
                  <span className="series-num">{e.number}</span>
                  <span className="series-thumb" style={e.posterUrl ? { backgroundImage: `url(${e.posterUrl})` } : undefined}>
                    {(pct > 0 || e.completed) && <span className="progress"><span style={{ width: `${e.completed ? 100 : pct}%` }} /></span>}
                  </span>
                  <span className="series-ep-text">
                    <b>{e.title}</b>
                    {e.summary && <span className="meta">{e.summary}</span>}
                  </span>
                  <span className="series-ep-side">
                    <span className="meta">{mins(e.durationSeconds, t)}</span>
                    <span className={`badge-inline ${e.access}`}>{t(e.access)}</span>
                    {e.completed && <span className="meta small">✓ {t('watched')}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}
