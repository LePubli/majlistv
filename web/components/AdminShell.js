'use client';
// Administration (administrateurs seulement) : habillage et menu propres, en 4 groupes selon la maquette
//   Pilotage · Catalogue · Réglages · Sécurité
// Un organisateur ou un modérateur ne voit jamais cet espace (message d'accès refusé, aucun lien dans leurs menus).
// Les écrans sont ceux de app/admin/page.js (onglets ?tab=…), inchangés ; seul le rangement change.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApp } from './Providers';
import { featureForPath } from '../lib/features';
import { hasWebModule } from '../lib/modules';
import ManageShell, { ICONS } from './ManageShell';
import AdminPalette from './AdminPalette';

// Entrées qui mènent à l'écran d'un module : disparaissent si le module est coupé ou absent.
// Entrées liées à une fonction activable du cœur (Admin → Fonctions).
const FEATURE_OF_TAB = { watch: 'watch', ads: 'ads', experiments: 'experiments', menus: 'menus' };
const MODULE_OF_TAB = { stats: 'stats', gifts: 'gifts', revenue: 'revenue', kidrubrics: 'kids' };

export default function AdminShell({ children }) {
  const { t, user, ready, feat, call } = useApp();
  const [watchNew, setWatchNew] = useState(0); // pastille « Veille » : vidéos à traiter
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') || 'dashboard';

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const watchOn = Boolean(ready && user && user.role === 'admin' && feat('watch'));
  useEffect(() => {
    if (!watchOn) return undefined;
    let off = false;
    const load = () => call('/admin/watch/count').then((r) => { if (!off && r.ok) setWatchNew(r.data.new || 0); });
    load();
    const id = setInterval(load, 120000);
    return () => { off = true; clearInterval(id); };
  }, [watchOn, call, tab]);
  if (!ready || !user) return null;
  // Règle de la maquette : l'Administration n'est jamais visible aux modérateurs et organisateurs.
  if (user.role !== 'admin') return <main className="card"><p>{t('noAccess')}</p></main>;

  // [onglet, libellé, icône]
  // Audit 11/2026 (navigation, lot A) : les mêmes écrans, rangés par métier en six groupes. Aucune adresse ne change.
  const groups = [
    { key: 'pilot', title: t('adGrpPilot'), items: [['dashboard', t('admDashboard'), ICONS.dash], ['users', t('admUsers'), ICONS.users], ['stats', t('adStats'), ICONS.chart], ['revenue', t('adRevenue'), ICONS.tag]] },
    { key: 'cat', title: t('adGrpCat'), items: [['categories', t('adCatFmt'), ICONS.tag], ['speakers', t('adSpeakers'), ICONS.users], ['watch', t('admWatch'), ICONS.eye]] },
    { key: 'practice', title: t('adGrpPractice'), items: [['quran', t('qrAdNav'), ICONS.doc], ['athkar', t('atTab'), ICONS.doc], ['ramadan', t('rzNav'), ICONS.eye], ['seasons', t('seasonAdmin'), ICONS.eye], ['friday', t('fdAdminNav'), ICONS.eye], ['kidrubrics', t('krAdminNav'), ICONS.tag]] },
    { key: 'growth', title: t('adGrpGrowth'), items: [['ads', t('admAds'), ICONS.tag], ['experiments', 'Tests A/B', ICONS.chart], ['gifts', t('admGifts'), ICONS.heart], ['referral', t('refAdmin'), ICONS.users], ['regions', t('regAdmin'), ICONS.tag], ['lifecycle', t('admLifecycle'), ICONS.gear]] },
    { key: 'site', title: t('adGrpSite'), items: [['appearance', t('admAppearance'), ICONS.brush], ['pages', t('admPages'), ICONS.doc], ['menus', 'Menus', ICONS.layers], ['texts', t('admTexts'), ICONS.doc], ['legal', t('admLegal'), ICONS.doc], ['features', t('admFeatures'), ICONS.gear], ['modules', t('admModules'), ICONS.layers], ['settings', t('admSettings'), ICONS.gear]] },
    { key: 'tech', title: t('adGrpTech'), items: [['health', t('admHealth'), ICONS.gear], ['errors', t('admErrors'), ICONS.shield], ['ask', t('admAsk'), ICONS.shield], ['audit', t('admAudit'), ICONS.shield]] },
  ];
  const visible = (id) => {
    if (FEATURE_OF_TAB[id]) return feat(FEATURE_OF_TAB[id]);
    const mod = MODULE_OF_TAB[id];
    if (mod) return hasWebModule(mod) && feat(mod);
    return true;
  };
  const shown = groups.map((g) => ({
    ...g,
    items: g.items.filter(([id]) => visible(id)).map(([id, label, icon]) => [id === 'dashboard' ? '/admin' : `/admin?tab=${id}`, id === 'watch' && watchNew > 0 ? `${label} (${watchNew})` : label, icon]),
  })).filter((g) => g.items.length);
  const isOn = (href) => path === '/admin' && tab === (new URL(href, 'http://x').searchParams.get('tab') || 'dashboard');
  const links = [
    { href: '/studio', label: t('sdToStudio'), icon: ICONS.back },
    { href: '/', label: t('viewSite'), icon: ICONS.eye },
  ];
  // Écrans pour la recherche Ctrl + K : ceux du menu (déjà filtrés selon les fonctions et modules actifs).
  const screens = shown.flatMap((g) => g.items.map(([href, label]) => ({ href, label, group: g.title })));
  return <ManageShell space="admin" groups={shown} links={links} isOn={isOn} barExtra={<AdminPalette screens={screens} />}>{children}</ManageShell>;
}
