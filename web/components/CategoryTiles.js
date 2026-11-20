'use client';
// Nouveau catalogue, phase 3 — « Explorer par catégorie » : une tuile par catégorie du catalogue adultes, avec son icône, sa couleur,
// son nom dans la langue du visiteur et son VRAI nombre de vidéos (GET /catalogue/categories). Chaque tuile mène à /catalogue/<slug>.
// Les catégories vides restent visibles (nombre à 0) : elles se remplissent quand les vidéos sont classées. Rien si l'API ne répond pas.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export const countLabel = (t, n) => t(n === 1 ? 'ctgOne' : 'ctgMany').replace('{n}', String(n));

export default function CategoryTiles() {
  const { t, call, locale } = useApp();
  const [cats, setCats] = useState(null);
  useEffect(() => { let dead = false; call(`/catalogue/categories?lang=${locale}`, {}, null).then((r) => { if (!dead) setCats(r.ok ? r.data.categories : []); }); return () => { dead = true; }; }, [call, locale]);
  if (!cats || cats.length === 0) return null;
  return (
    <section className="ctg-tiles" aria-labelledby="ctg-tiles-title">
      <h2 id="ctg-tiles-title">{t('ctgTitle')}</h2>
      <ul>
        {cats.map((c) => (
          <li key={c.id}>
            <Link href={`/catalogue/${c.slug}`} className="ctg-tile" style={c.color ? { '--ctg-c': c.color } : undefined}>
              {c.image && <img src={c.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              <span className="ctg-ico" aria-hidden="true">{c.icon || '•'}</span>
              <strong>{c.name}</strong>
              {c.shortDescription && <small>{c.shortDescription}</small>}
              <span className="ctg-n">{countLabel(t, c.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
