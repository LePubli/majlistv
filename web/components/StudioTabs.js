'use client';
// Onglets du Studio sous le titre d'une page (maquette « Contenus » et « Données analytiques »).
// Ce sont de simples liens vers les écrans existants : adresses inchangées. Un onglet n'apparaît que si sa fonction est active
// et si la personne y a droit (collections : équipe seulement ; revenus : organisateurs et administrateurs).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { hasWebModule } from '../lib/modules';

export default function StudioTabs({ group }) {
  const { t, user, feat } = useApp();
  const path = usePathname();
  if (!user) return null;
  const staff = user.role === 'moderator' || user.role === 'admin';
  const on = (id) => hasWebModule(id) && feat(id);
  const tabs = group === 'analytics'
    ? [['/studio/stats', t('stTabAudience'), on('stats')], ['/studio/revenue', t('stTabRevenue'), on('revenue')]]
    : [['/studio/contents', t('stTabTalks'), true], ['/studio/series', t('srNav'), on('series')], ['/studio/collections', t('colNav'), on('collections') && staff], ['/studio/books', t('bkNav'), on('books')]];
  const list = tabs.filter(([, , ok]) => ok);
  if (list.length < 2) return null;
  return (
    <nav className="st-tabs" aria-label={group === 'analytics' ? t('sdAnalytics') : t('sdContents')}>
      {list.map(([href, label]) => {
        const here = path === href || path.startsWith(href + '/');
        return <Link key={href} href={href} className={here ? 'on' : ''} aria-current={here ? 'page' : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
