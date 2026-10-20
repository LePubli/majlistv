// Module « Mejliss Kids » — partie web (étape M3b). Pages : web/app/(module-kids)/ et web/app/studio/(module-kids)/ s'il y en a.
const mod = {
  id: 'kids',
  name: 'Mejliss Kids',
  features: ['kids'],
  paths: [
    /^\/kids(\/|$)/,
  ],
  admin: [{ tab: 'kidrubrics', title: 'Rubriques Kids', label: 'krAdminNav', icon: 'tag', load: () => import('./RubricsAdmin') }],
};
export default mod;
