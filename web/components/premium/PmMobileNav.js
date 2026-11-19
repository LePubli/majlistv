'use client';
// Barre du bas du téléphone, thème Premium : celle de la maquette V20 (Accueil, Catalogue, Apprendre, Kids, Profil).
// Apprendre et Kids n'apparaissent que si la rubrique est active ; un visiteur trouve « Connexion » à la place de « Profil ».
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../Providers';
import Glyph from './Glyph';
import { isPmActive } from './PmHeader';

export default function PmMobileNav() {
  const { t, feat, user, kid } = useApp();
  const path = usePathname() || '/';
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null;
  const items = [
    { href: '/', label: t('home'), icon: 'home', on: true },
    { href: '/catalogue', label: t('navCatalogue'), icon: 'grid', on: true },
    { href: '/learning', label: t('msLearnShort'), icon: 'cap', on: feat('learning') },
    { href: '/kids', label: t('kdNav'), icon: 'game', on: feat('kids') },
    { href: user ? '/account' : '/login', label: user ? t('pmProfile') : t('login'), icon: 'profile', on: true },
  ].filter((x) => x.on);
  return (
    <div className="v20-app v20-part">
      <nav className="v20-mobile-nav" aria-label={t('msBar')}>
        {items.map((it) => {
          const on = isPmActive(path, it.href) || (it.icon === 'profile' && path.startsWith('/account'));
          return <Link key={it.href} href={it.href} className={on ? 'v20-active' : undefined} aria-current={on ? 'page' : undefined}><b><Glyph name={it.icon} /></b>{it.label}</Link>;
        })}
      </nav>
    </div>
  );
}
