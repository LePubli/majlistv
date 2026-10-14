'use client';
// Étape 19 — Liste partagée par un membre (lecture seule, sans compte, non indexée). L'identité du membre n'est jamais affichée.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import TalkCard from '../../../components/TalkCard';

export default function SharedList() {
  const { token } = useParams();
  const { t, call } = useApp();
  const [l, setL] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { call(`/lists/shared/${token}`, {}, null).then((r) => (r.ok ? setL(r.data) : setMissing(true))); }, [call, token]);
  if (missing) return <main className="page"><p className="soon">{t('lsSharedGone')}</p><Link href="/" className="link u">{t('home')}</Link></main>;
  if (!l) return <main className="page"><p className="meta">…</p></main>;
  return (
    <main className="page">
      <meta name="robots" content="noindex" />
      <p className="eyebrow">{t('lsSharedBy')}</p>
      <h1>{l.title}</h1>
      {l.description && <p className="th-lead">{l.description}</p>}
      {l.talks.length === 0 && <p className="meta">{t('lsEmpty')}</p>}
      <div className="grid">{l.talks.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
    </main>
  );
}
