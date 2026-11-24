'use client';
// Barre du bas du téléphone, thème Premium : celle de la maquette V20 (Accueil, Catalogue, Apprendre, Kids, Profil).
// Apprendre et Kids n'apparaissent que si la rubrique est active ; un visiteur trouve « Connexion » à la place de « Profil ».
import { MenuLink } from '../MenuDropdown';
import { usePathname } from 'next/navigation';
import { useApp } from '../Providers';
import Glyph from './Glyph';
import { isPmActive } from './PmHeader';
import { resolveMenu } from '../../lib/menus';
import { pmBarDefaults, PM_BAR_ORIGIN, PM_BAR_GLYPH } from '../../lib/navDefaults';

export default function PmMobileNav() {
  const { t, feat, user, kid, hasSeries, hasBooks, layout, locale } = useApp();
  const path = usePathname() || '/';
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null;
  // Barre d'origine de la maquette ; un menu affecté à « Site — barre du bas » (Admin → Menus) la remplace (5 liens au plus, sans sous-menu).
  const D = pmBarDefaults({ t, feat, hasSeries, hasBooks, user });
  const custom = layout?.menus?.web_bar;
  const items = (custom
    ? resolveMenu(custom, Object.values(D), { user, lang: locale }).slice(0, 5)
    : PM_BAR_ORIGIN.map((k) => ({ ...D[k], cls: '' })).filter((x) => x.on)
  ).map((it) => ({ ...it, icon: PM_BAR_GLYPH[it.key] || 'grid' }));
  return (
    <div className="v20-app v20-part">
      <nav className="v20-mobile-nav" aria-label={t('msBar')}>
        {items.map((it) => {
          const on = isPmActive(path, it.href) || (it.icon === 'profile' && path.startsWith('/account'));
          return <MenuLink key={it.key} it={it} current={on} className={[on && 'v20-active', it.cls].filter(Boolean).join(' ') || undefined}><b><Glyph name={it.icon} /></b>{it.label}</MenuLink>;
        })}
      </nav>
    </div>
  );
}
