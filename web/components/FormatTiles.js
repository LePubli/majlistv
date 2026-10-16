'use client';
// Étape C — « Explorer par format » (accueil connecté) : une tuile par format qui contient des contenus ; elle ouvre la grille du format.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export default function FormatTiles() {
  const { t, locale, call } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { call('/formats?used=1', {}, null).then((r) => setList(r.ok && Array.isArray(r.data) ? r.data : [])); }, [call]);
  if (list.length < 2) return null; // un seul format = rien à explorer
  const name = (f) => f['name' + locale[0].toUpperCase() + locale.slice(1)] || f.nameFr;
  return (
    <section className="row fmt-tiles" aria-labelledby="row-formats">
      <div className="row-head"><h2 id="row-formats">{t('fmExplore')}</h2><Link href="/catalogue" className="link">{t('rowSeeAll')} ›</Link></div>
      <ul className="fmt-grid">
        {list.map((f) => (
          <li key={f.id}><Link href={`/catalogue?format=${f.slug}`} className="fmt-tile"><b>{name(f)}</b><span>{t('fmCount').replace('{n}', f.count)}</span></Link></li>
        ))}
      </ul>
    </section>
  );
}
