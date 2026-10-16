// Module « Ouvrages » — partie web (étape M3b). Pages : web/app/(module-books)/ et web/app/studio/(module-books)/ s'il y en a.
const mod = {
  id: 'books',
  name: 'Ouvrages',
  features: ['books'],
  paths: [
    /^\/books(\/|$)/,
    /^\/studio\/books(\/|$)/,
  ],
};
export default mod;
