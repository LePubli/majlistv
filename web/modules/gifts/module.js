// Module « Cartes cadeaux » — partie web (étape M3b). Pages : web/app/(module-gifts)/ et web/app/studio/(module-gifts)/ s'il y en a.
const mod = {
  id: 'gifts',
  name: 'Cartes cadeaux',
  features: ['gifts'],
  paths: [
    /^\/(gift|redeem)(\/|$)/,
  ],
  admin: [{ tab: 'gifts', title: 'Cartes cadeaux', label: 'admGifts', icon: 'tag', load: () => import('./Admin') }],
};
export default mod;
