'use client';
// Liste de toutes les séries publiées.
import { useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';
import SeriesCard from '../../components/SeriesCard';

export default function SeriesList() {
  const { t, call } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { call('/series', {}, null).then((r) => setList(r.ok ? r.data : [])); }, [call]);
  return (
    <main>
      <section className="series-listhead"><h1>{t('seriesTitle')}</h1><p className="meta">{t('seriesIntro')}</p></section>
      {list && list.length === 0 && <p className="soon">{t('noSeries')}</p>}
      <div className="grid">{(list || []).map((s) => <SeriesCard key={s.id} series={s} t={t} />)}</div>
    </main>
  );
}
