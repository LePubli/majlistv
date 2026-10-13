'use client';
// Vignette d'une série (accueil, liste des séries) : même gabarit que les conférences, avec un effet « pile » et le nombre d'épisodes.
import Link from 'next/link';
import { levelLabel } from '../lib/levels';

export default function SeriesCard({ series, t }) {
  const access = series.access === 'mixed' ? t('mixed') : t(series.access);
  const count = series.hasSeasons && series.seasonCount > 1
    ? `${t('seasonCount').replace('{n}', series.seasonCount)} · ${t('episodeCount').replace('{n}', series.episodeCount)}`
    : t('episodeCount').replace('{n}', series.episodeCount);
  return (
    <div className="talk-wrap">
      <Link href={`/series/${series.id}`} className="talk series-card">
        <div className="thumb" style={series.posterUrl ? { backgroundImage: `url(${series.posterUrl})` } : undefined}>
          <span className={`badge ${series.access === 'premium' ? 'premium' : ''}`}>{access}</span>
          <span className="dur">{count}</span>
          {series.watched > 0 && <span className="progress"><span style={{ width: `${Math.min(100, Math.round((series.watched / series.episodeCount) * 100))}%` }} /></span>}
        </div>
        <h3>{series.title}</h3>
        <p>{series.level && <span className={`lvl ${series.level}`}>{levelLabel(series.level, t)}</span>}{series.watched !== undefined ? t('watchedOf').replace('{n}', series.watched).replace('{total}', series.episodeCount) : [t('seriesTag'), series.speaker].filter(Boolean).join(' · ')}</p>
      </Link>
    </div>
  );
}
