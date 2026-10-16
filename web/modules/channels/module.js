// Module « Chaînes » — partie web (étape M3b). Pages : web/app/(module-channels)/ et web/app/studio/(module-channels)/ s'il y en a.
const mod = {
  id: 'channels',
  name: 'Chaînes',
  features: ['channels'],
  paths: [
    /^\/chaines(\/|$)/,
    /^\/studio\/channel(\/|$)/,
  ],
};
export default mod;
