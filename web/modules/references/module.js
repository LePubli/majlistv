// Module « Références citées » — partie web (amélioration 3.5). Pages : web/app/studio/(module-references)/references/ (file de relecture).
// Supprimer ce dossier et ce groupe de routes retire les références du site : la fiche vidéo et le Studio fonctionnent comme avant.
const mod = {
  id: 'references',
  name: 'Références citées',
  features: ['references'],
  paths: [/^\/studio\/references(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/references', label: 'rfNav', icon: 'list', roles: ['organizer', 'moderator', 'admin'] }],
  // Panneau « Références citées » sous la vidéo (chargé à la demande).
  talkPanel: () => import('./TalkReferences'),
};
export default mod;
