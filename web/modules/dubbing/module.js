// Module « Doublage français » — partie web (étape S1). Pages : web/app/studio/(module-dubbing)/dubbing/…
// Supprimer ce dossier et le groupe de routes (module-dubbing) retire l'entrée « Audio et doublage » du Studio.
const mod = {
  id: 'dubbing',
  name: 'Doublage français',
  features: ['dubbing'],
  paths: [/^\/studio\/dubbing(\/|$)/],
};
export default mod;
