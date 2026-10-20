// Module « Shorts publics » — partie web. Pages : /shorts (fil vertical), /shorts/<id>, Studio → Shorts.
// Composants partagés : components/ShortsFeed.js (fil), components/ShortsRail.js (vignettes, rangée de l'accueil et onglet de la chaîne).
const mod = {
  id: 'shorts',
  name: 'Shorts publics',
  features: ['shorts'],
  paths: [/^\/shorts(\/|$)/, /^\/studio\/shorts(\/|$)/],
  studio: [{ group: 'studio', href: '/studio/shorts', label: 'shrSdNav', icon: 'film', roles: ['organizer', 'admin'] }],
};
export default mod;
