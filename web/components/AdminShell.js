'use client';
// Administration (administrateurs seulement) : habillage et menu propres, en 4 groupes selon la maquette
//   Pilotage · Catalogue · Réglages · Sécurité
// Un organisateur ou un modérateur ne voit jamais cet espace (message d'accès refusé, aucun lien dans leurs menus).
// Les écrans sont ceux de app/admin/page.js (onglets ?tab=…), inchangés ; seul le rangement change.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useApp } from './Providers';
import { featureForPath } from '../lib/features';
import { hasWebModule } from '../lib/modules';
import ManageShell, { ICONS } from './ManageShell';

// Entrées qui mènent à l'écran d'un module : disparaissent si le module est coupé ou absent.
const MODULE_OF_TAB = { stats: 'stats', gifts: 'gifts', revenue: 'revenue', kidrubrics: 'kids' };

export default function AdminShell({ children }) {
  const { t, user, ready, feat } = useApp();
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') || 'dashboard';

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  if (!ready || !user) return null;
  // Règle de la maquette : l'Administration n'est jamais visible aux modérateurs et organisateurs.
  if (user.role !== 'admin') return <main className="card"><p>{t('noAccess')}</p></main>;

  // [onglet, libellé, icône]
  const groups = [
    { key: 'pilot', title: t('adGrpPilot'), items: [['dashboard', t('admDashboard'), ICONS.dash], ['users', t('admUsers'), ICONS.users], ['stats', t('adStats'), ICONS.chart], ['revenue', t('adRevenue'), ICONS.tag]] },
    { key: 'cat', title: t('adGrpCat'), items: [['categories', t('adCatFmt'), ICONS.tag], ['speakers', t('adSpeakers'), ICONS.users], ['gifts', t('admGifts'), ICONS.heart], ['kidrubrics', t('krAdminNav'), ICONS.tag]] },
    { key: 'set', title: t('adGrpSet'), items: [['features', t('admFeatures'), ICONS.gear], ['modules', t('admModules'), ICONS.layers], ['settings', t('admSettings'), ICONS.gear], ['appearance', t('admAppearance'), ICONS.brush], ['pages', t('admPages'), ICONS.doc], ['texts', t('admTexts'), ICONS.doc], ['legal', t('admLegal'), ICONS.doc]] },
    { key: 'sec', title: t('adGrpSec'), items: [['audit', t('admAudit'), ICONS.shield]] },
  ];
  const visible = (id) => {
    const mod = MODULE_OF_TAB[id];
    if (mod) return hasWebModule(mod) && feat(mod);
    return true;
  };
  const shown = groups.map((g) => ({
    ...g,
    items: g.items.filter(([id]) => visible(id)).map(([id, label, icon]) => [id === 'dashboard' ? '/admin' : `/admin?tab=${id}`, label, icon]),
  })).filter((g) => g.items.length);
  const isOn = (href) => path === '/admin' && tab === (new URL(href, 'http://x').searchParams.get('tab') || 'dashboard');
  const links = [
    { href: '/studio', label: t('sdToStudio'), icon: ICONS.back },
    { href: '/', label: t('viewSite'), icon: ICONS.eye },
  ];
  return <ManageShell space="admin" groups={shown} links={links} isOn={isOn}>{children}</ManageShell>;
}
