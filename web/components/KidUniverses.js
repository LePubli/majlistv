'use client';
// Mejliss Kids — les « univers » de l'enfant (catégories Kids) en grosses tuiles, avec le vrai nombre de vidéos pour son âge.
// Un univers sans vidéo pour cet enfant n'est pas proposé (la liste vient du serveur, qui contrôle la tranche d'âge).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export const uniName = (u, locale) => u?.names?.[locale] || u?.names?.fr || u?.slug || '';
export const countLabel = (n, t) => (n === 1 ? t('kuOne') : t('kuMany').replace('{n}', n));

export default function KidUniverses() {
  const { t, call, locale } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { let on = true; call('/kids/universes').then((r) => on && setList(r.ok ? r.data.universes : [])); return () => { on = false; }; }, [call]);
  if (!list || list.length === 0) return null;
  return (
    <section className="ku-tiles" aria-labelledby="ku-h">
      <h2 id="ku-h">{t('kuTitle')}</h2>
      <ul>
        {list.map((u) => (
          <li key={u.id}>
            <Link href={`/kids/univers/${u.slug}`} className="ku-tile" data-universe={u.slug} aria-label={`${uniName(u, locale)} — ${countLabel(u.talks, t)}`} style={u.color ? { '--ku': u.color } : undefined}>
              <span className="ku-ico" aria-hidden="true">{u.emoji}</span>
              <b>{uniName(u, locale)}</b>
              <small>{countLabel(u.talks, t)}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
