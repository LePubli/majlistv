'use client';
// Mejliss Kids — page d'une série : ses épisodes (seulement ceux que l'enfant peut voir), par saison s'il y en a.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from './Providers';
import { KidCard } from './KidsHome';

export default function KidSeries() {
  const { id } = useParams();
  const { t, call, kid } = useApp();
  const [d, setD] = useState(undefined);
  useEffect(() => { if (kid) call(`/kids/series/${id}`).then((r) => setD(r.ok ? r.data : null)); }, [call, kid, id]);
  if (!kid) return null;
  if (d === undefined) return <main className="page kd-page ku-page" aria-busy="true" />;
  if (d === null) return <main className="page kd-page ku-page"><p><Link href="/kids?tab=watch" className="btn ghost">← {t('kuBack')}</Link></p><p className="soon">{t('kuGone')}</p></main>;
  const { series: s, seasons, episodes } = d;
  const groups = seasons.length
    ? seasons.map((z, i) => ({ key: z.id, title: z.title || t('kuSeason').replace('{n}', i + 1), list: episodes.filter((e) => e.seasonId === z.id) })).filter((g) => g.list.length)
    : [{ key: 'all', title: '', list: episodes }];
  const loose = seasons.length ? episodes.filter((e) => !seasons.some((z) => z.id === e.seasonId)) : [];
  if (loose.length) groups.push({ key: 'loose', title: t('kuEpisodes'), list: loose });
  return (
    <main className="page kd-page ku-page">
      <p><Link href="/kids?tab=watch" className="btn ghost">← {t('kuBack')}</Link></p>
      <header className="ku-serie-head" style={s.posterUrl ? { '--ku-poster': `url(${s.posterUrl})` } : undefined}>
        <small>{t('kuSerie')} · {t('kuEp').replace('{n}', s.episodes)}</small>
        <h1>{s.title}</h1>
        {s.description ? <p>{s.description}</p> : null}
      </header>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title || t('kuEpisodes')}>
          <h2>{g.title || t('kuEpisodes')}</h2>
          <ul className="kd-grid">{g.list.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>
        </section>
      ))}
    </main>
  );
}
