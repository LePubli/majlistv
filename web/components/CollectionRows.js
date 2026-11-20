'use client';
// Phase 6 (cahier du 20/11, § 11) — rangées de « collections dynamiques » sur l'accueil : une rangée par collection publiée
// avec « Afficher sur l'accueil » (automatiques, saisonnières, personnelles). Elles varient selon le membre : relues à la connexion.
// Une collection vide, hors saison ou personnelle sans membre n'est jamais renvoyée par l'API (pas de rangée vide).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import Row from './Row';

export default function CollectionRows() {
  const { t, call, user } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let dead = false;
    call('/collections/home', {}, null).then((r) => { if (!dead) setRows(r.ok && Array.isArray(r.data?.collections) ? r.data.collections : []); });
    return () => { dead = true; };
  }, [call, user?.id]);
  return rows.map((c) => (
    <Row key={c.id} id={`row-col-${c.slug || c.id}`} talks={c.talks} t={t} title={c.title}
      onSeeAll={c.mode === 'personal' ? undefined : () => router.push(`/collections/${c.id}`)} />
  ));
}
