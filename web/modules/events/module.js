// Module « Événements en direct » — partie web. Pages : web/app/events/ (public), web/app/studio/(module-events)/events/ (gestion).
// Supprimer ce dossier et ce groupe de routes retire la gestion du Studio : le reste du site fonctionne comme avant.
const mod = {
  id: 'events',
  name: 'Événements en direct',
  features: ['events', 'livetv'],
  paths: [/^\/studio\/events(\/|$)/, /^\/studio\/live(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/events', label: 'evnTitle', icon: 'film', roles: ['organizer', 'admin'] },
    // Chaînes TV en direct 24 h/24 (fonction « livetv ») : gérées par l'administrateur.
    { group: 'studio', href: '/studio/live', label: 'lvAdminTitle', icon: 'film', roles: ['admin'], feature: 'livetv' }],
};
export default mod;
