// Module « Séries et épisodes » — partie web (étape M3b). Pages : web/app/(module-series)/ et web/app/studio/(module-series)/ s'il y en a.
const mod = {
  id: 'series',
  name: 'Séries et épisodes',
  features: ['series'],
  paths: [
    /^\/series(\/|$)/,
    /^\/studio\/series(\/|$)/,
  ],
};
export default mod;
