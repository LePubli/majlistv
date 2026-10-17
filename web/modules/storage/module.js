// Module « Stockage et archivage » — partie web (étape S2). Page : web/app/studio/(module-storage)/settings/storage/
// Studio → Paramètres → Stockage et archivage (maquette « Studio v2 », écran 6). Supprimer ce dossier et le groupe de routes
// (module-storage) retire l'écran ; le reste du Studio fonctionne.
const mod = {
  id: 'storage',
  name: 'Stockage et archivage',
  features: ['storage'],
  paths: [/^\/studio\/settings\/storage(\/|$)/],
  // Entrée dans Studio → Paramètres (outils), pas dans le menu principal.
  studio: [{ group: 'settings', href: '/studio/settings/storage', label: 'sgNav', icon: 'layers', roles: ['admin'] }],
};
export default mod;
