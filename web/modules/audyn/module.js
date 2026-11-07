// Module « Audyn » (livres audio et histoires du soir) — partie web. Pages : web/app/studio/(module-audyn)/audyn/ (gestion, administrateur).
// Supprimer ce dossier et ce groupe de routes retire la gestion : le reste du site fonctionne comme avant.
const mod = {
  id: 'audyn',
  name: 'Audyn — livres audio et histoires du soir',
  features: ['audyn'],
  paths: [/^\/studio\/audyn(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/audyn', label: 'ayNav', icon: 'mic', roles: ['admin'] }],
};
export default mod;
