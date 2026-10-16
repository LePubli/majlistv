// Module « Collections » — partie web (étape M3b). Pages : web/app/(module-collections)/ et web/app/studio/(module-collections)/ s'il y en a.
const mod = {
  id: 'collections',
  name: 'Collections',
  features: ['collections'],
  paths: [
    /^\/collections(\/|$)/,
    /^\/studio\/collections(\/|$)/,
  ],
};
export default mod;
