'use client';
// Page d'un intervenant : nom, présentation, ses séries et ses conférences. `initial` (lu côté serveur) est dans le HTML dès le premier octet
// et affiché pendant le chargement des vignettes.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import TalkCard from './TalkCard';
import SeriesCard from './SeriesCard';
import FollowButton from './FollowButton';

export default function SpeakerClient({ slug, initial }) {
  const { t, call, ready, user } = useApp();
  const [talks, setTalks] = useState(null);
  const [series, setSeries] = useState(null);
  useEffect(() => {
    if (!ready) return;
    call(`/talks?speaker=${slug}&limit=100`).then((r) => setTalks(r.ok ? r.data : []));
    call(`/speakers/${slug}`, {}, null).then((r) => setSeries(r.ok ? r.data.series : []));
  }, [slug, call, ready, user]);
  return (
    <main className="spk-page">
      <p className="meta"><Link href="/intervenants">{t('spTitle')}</Link></p>
      <h1>{initial.name}</h1>
      <p className="spk-follow"><FollowButton slug={slug} t={t} call={call} user={user} /></p>
      {initial.bio && <p className="spk-bio">{initial.bio}</p>}
      {(series ?? []).length > 0 && (
        <section><h2>{t('spSeries')}</h2><div className="grid">{series.map((x) => <SeriesCard key={x.id} series={x} t={t} />)}</div></section>
      )}
      <section>
        <h2>{t('spTalks')}</h2>
        {talks === null ? (
          <ul className="spk-plain">{initial.talks.map((x) => <li key={x.id}><a href={`/conferences/${x.slug}`}>{x.title}</a></li>)}</ul>
        ) : (
          <div className="grid">{talks.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
        )}
      </section>
    </main>
  );
}
