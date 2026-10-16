// Module « Listes de lecture » — partie web (étape M3b). Pages : web/app/(module-lists)/ et web/app/studio/(module-lists)/ s'il y en a.
const mod = {
  id: 'lists',
  name: 'Listes de lecture',
  features: ['lists'],
  paths: [
    /^\/lists(\/|$)/,
    /^\/l(\/|$)/,
  ],
};
export default mod;
