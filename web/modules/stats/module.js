// Module « Statistiques d'audience » — partie web (étape M3b). Pages : web/app/(module-stats)/ et web/app/studio/(module-stats)/ s'il y en a.
const mod = {
  id: 'stats',
  name: 'Statistiques d’audience',
  features: ['stats'],
  paths: [
    /^\/studio\/stats(\/|$)/,
  ],
  admin: [{ tab: 'stats', title: 'Statistiques', label: 'stNav', icon: 'chart', load: () => import('./Admin') }],
};
export default mod;
