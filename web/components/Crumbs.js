'use client';
// Étape B — Fil d'Ariane : « Mon espace › Apprentissage › Révisions ». Le dernier élément est la page courante.
import Link from 'next/link';
import { useApp } from './Providers';

export default function Crumbs({ items }) {
  const { t } = useApp();
  return (
    <nav className="crumbs" aria-label={t('bcLabel')}>
      <ol>
        {items.map(([href, label], i) => {
          const last = i === items.length - 1;
          return <li key={label + i}>{last || !href ? <span aria-current={last ? 'page' : undefined}>{label}</span> : <Link href={href}>{label}</Link>}</li>;
        })}
      </ol>
    </nav>
  );
}
