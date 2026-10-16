// Module « Parcours et attestations » — partie web (étape M3b). Pages : web/app/(module-learning)/ et web/app/studio/(module-learning)/ s'il y en a.
const mod = {
  id: 'learning',
  name: 'Parcours et attestations',
  features: ['learning'],
  paths: [
    /^\/learning(\/|$)/,
    /^\/attestation(\/|$)/,
  ],
};
export default mod;
