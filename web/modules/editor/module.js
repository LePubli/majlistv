// Module « Éditeur de montage » — partie web (étape E1). Pages : web/app/studio/(module-editor)/editor/…
//   /studio/editor          liste des montages et conférences à monter (?talk=<id> ouvre ou crée le montage de la conférence)
//   /studio/editor/<projet> éditeur multipiste plein écran (maquette « Studio v2 », écran 4)
// Supprimer ce dossier et le groupe de routes (module-editor) retire l'entrée « Éditeur » du Studio ; le reste fonctionne.
const mod = {
  id: 'editor',
  name: 'Éditeur de montage',
  features: ['editor'],
  paths: [/^\/studio\/editor(\/|$)/],
};
export default mod;
