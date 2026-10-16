'use client';
// Liste de toutes les séries publiées + (étape C) « Continuer » : la série commencée la plus récemment, avec sa progression.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import SeriesCard from '../../../components/SeriesCard';

export default function SeriesList() {
  const { t, call, user } = useApp();
  const [list, setList] = useState(null);
  const [mine, setMine] = useState([]);
  useEffect(() => { call('/series', {}, null).then((r) => setList(r.ok ? r.data : [])); }, [call]);
  useEffect(() => { if (user) call('/me/series').then((r) => setMine(r.ok ? r.data : [])); else setMine([]); }, [user, call]);
  // Série à continuer : commencée (au moins un épisode vu) mais pas terminée.
  const cur = mine.find((s) => s.watched > 0 && s.watched < s.episodeCount);
  const pct = cur ? Math.min(100, Math.round((cur.watched / cur.episodeCount) * 100)) : 0;
  return (
    <main className="series-page">
      <section className="series-listhead"><h1>{t('seriesTitle')}</h1><p className="meta">{t('seriesIntro')}</p></section>
      {cur && (
        <section className="sr-cont" aria-labelledby="sr-cont-h">
          <h2 id="sr-cont-h">{t('srContinue')}</h2>
          <Link href={`/series/${cur.id}`} className="sr-cont-card">
            <span className="sr-cont-img" style={cur.posterUrl ? { backgroundImage: `url(${cur.posterUrl})` } : undefined} aria-hidden="true" />
            <span className="sr-cont-body">
              <small>{t('watchedOf').replace('{n}', cur.watched).replace('{total}', cur.episodeCount)}</small>
              <b>{cur.title}</b>
              <span className="qp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></span>
              <span className="btn">{t('srResume')}</span>
            </span>
          </Link>
        </section>
      )}
      {list && list.length === 0 && <p className="soon">{t('noSeries')}</p>}
      {list && list.length > 0 && cur && <h2 className="sr-all">{t('srAll')}</h2>}
      <div className="grid">{(list || []).map((s) => <SeriesCard key={s.id} series={s} t={t} />)}</div>
    </main>
  );
}
