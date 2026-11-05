// Module « Corrections des sous-titres » — partie web (amélioration 4.1). Page : web/app/studio/(module-corrections)/corrections/ (file de relecture).
// Le bouton « proposer une correction » de la transcription (web/components/Transcript.js) ne s'affiche que si la fonction « corrections » est active.
// Supprimer ce dossier et ce groupe de routes retire les corrections : la transcription et le Studio fonctionnent comme avant.
const mod = {
  id: 'corrections',
  name: 'Corrections des sous-titres',
  features: ['corrections'],
  paths: [/^\/studio\/corrections(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/corrections', label: 'corNav', icon: 'list', roles: ['organizer', 'moderator', 'admin'] }],
};
export default mod;
