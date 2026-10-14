'use client';
// Étape 19 — Une collection : titre, présentation et conférences dans l'ordre choisi par l'équipe.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import TalkCard from '../../../components/TalkCard';

export default function CollectionPage() {
  const { id } = useParams();
  const { t, call } = useApp();
  const [c, setC] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { call(`/collections/${id}`, {}, null).then((r) => (r.ok ? setC(r.data) : setMissing(true))); }, [call, id]);
  if (missing) return <main className="page"><Link href="/collections" className="back">← {t('colTitle')}</Link><p className="soon">{t('colNotFound')}</p></main>;
  if (!c) return <main className="page"><p className="meta">…</p></main>;
  return (
    <main className="page">
      <Link href="/collections" className="back">← {t('colTitle')}</Link>
      <p className="eyebrow">{t(`colKind_${c.kind}`)}</p>
      <h1>{c.title}</h1>
      {c.description && <p className="th-lead">{c.description}</p>}
      <div className="grid">{c.talks.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
    </main>
  );
}
