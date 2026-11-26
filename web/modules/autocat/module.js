// Module « Catégories automatiques » — partie web. Page : web/app/studio/(module-autocat)/suggestions-categories/ (file de relecture + rattrapage administrateur).
// L'onglet « Catégories » d'une vidéo (Studio → vidéo → contenu) ne s'affiche que si la fonction « autocat » est active.
// Supprimer ce dossier et ce groupe de routes retire la fonction : le Studio et les catégories manuelles fonctionnent comme avant.
const mod = {
  id: 'autocat',
  name: 'Catégories automatiques',
  features: ['autocat'],
  paths: [/^\/studio\/suggestions-categories(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/suggestions-categories', label: 'acNav', icon: 'list', roles: ['organizer', 'moderator', 'admin'] }],
};
export default mod;
