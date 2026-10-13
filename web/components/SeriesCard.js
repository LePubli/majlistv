'use client';
// Vignette d'une série (accueil, liste des séries) : même gabarit que les conférences, avec un effet « pile » et le nombre d'épisodes.
import Link from 'next/link';

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
        </div>
        <h3>{series.title}</h3>
        <p>{[t('seriesTag'), series.speaker].filter(Boolean).join(' · ')}</p>
      </Link>
    </div>
  );
}
