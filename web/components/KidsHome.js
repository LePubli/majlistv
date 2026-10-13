'use client';
// Mejliss Kids, côté enfant : les vidéos de son âge, en grand, avec des mots simples et encourageants. Pas de classement, pas de comparaison.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { AVATAR_EMOJI } from '../lib/kids';

const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');

function KidCard({ x, t }) {
  return (
    <li>
      <Link href={`/kids/watch/${x.id}`} className="kd-card">
        <span className="kd-thumb" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined}>
          {x.completed && <span className="kd-seen">{t('kdSeen')}</span>}
          {x.durationSeconds ? <span className="dur">{mins(x.durationSeconds)}</span> : null}
        </span>
        <b className="kd-card-title">{x.title}</b>
      </Link>
    </li>
  );
}

export default function KidsHome() {
  const { t, call, kid } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { call('/kids/talks').then((r) => setD(r.ok ? r.data : { talks: [], resume: [] })); }, [call]);
  if (!kid) return null;
  return (
    <main className="page kd-page kd-home">
      <h1 className="kd-hello"><span aria-hidden="true">{AVATAR_EMOJI[kid.avatar] || '🦁'}</span> {t('kdHello').replace('{name}', kid.name)}</h1>
      {d && d.resume.length > 0 && (
        <section aria-labelledby="kd-cont"><h2 id="kd-cont">{t('kdContinue')}</h2><ul className="kd-grid">{d.resume.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul></section>
      )}
      <section aria-labelledby="kd-all"><h2 id="kd-all">{t('kdForYou')}</h2>
        {d && d.talks.length === 0 ? <p className="soon">{t('kdEmpty')}</p> : <ul className="kd-grid">{(d?.talks || []).map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>}
      </section>
    </main>
  );
}
