// Module « Événements en direct » — partie web. Pages : web/app/events/ (public), web/app/studio/(module-events)/events/ (gestion).
// Supprimer ce dossier et ce groupe de routes retire la gestion du Studio : le reste du site fonctionne comme avant.
const mod = {
  id: 'events',
  name: 'Événements en direct',
  features: ['events'],
  paths: [/^\/studio\/events(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/events', label: 'evnTitle', icon: 'film', roles: ['organizer', 'admin'] }],
  // La TV en direct (fonction « livetv ») ne dépend plus de ce module : Studio → TV en direct (components/StudioShell.js).
};
export default mod;
