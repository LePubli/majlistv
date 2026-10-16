// Module « Rémunération des chaînes » — partie web (étape M3b). Pages : web/app/(module-revenue)/ et web/app/studio/(module-revenue)/ s'il y en a.
const mod = {
  id: 'revenue',
  name: 'Rémunération des chaînes',
  features: ['revenue'],
  paths: [
    /^\/studio\/revenue(\/|$)/,
  ],
  admin: [{ tab: 'revenue', title: 'Rémunération des chaînes', label: 'rvAdminNav', icon: 'tag', load: () => import('./Admin') }],
};
export default mod;
