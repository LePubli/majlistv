// Pages du site rattachées à une fonction activable (étape A). Quand la fonction est coupée dans
// Admin → Fonctions, la page affiche « Cette fonction n'est pas disponible » au lieu de son contenu.
// L'API ferme de son côté les routes correspondantes (api/src/featuresList.js).
const RULES = [
  [/^\/series(\/|$)/, 'series'],
  [/^\/collections(\/|$)/, 'collections'],
  [/^\/books(\/|$)/, 'books'],
  [/^\/learning(\/|$)/, 'learning'],
  [/^\/attestation(\/|$)/, 'learning'],
  [/^\/lists(\/|$)/, 'lists'],
  [/^\/chaines(\/|$)/, 'channels'],
  [/^\/studio\/channel(\/|$)/, 'channels'],
  [/^\/studio\/revenue(\/|$)/, 'revenue'],
  [/^\/kids(\/|$)/, 'kids'],
  [/^\/(gift|redeem)(\/|$)/, 'gifts'],
  [/^\/register(\/|$)/, 'registration'],
  [/^\/studio\/series(\/|$)/, 'series'],
  [/^\/studio\/collections(\/|$)/, 'collections'],
  [/^\/studio\/books(\/|$)/, 'books'],
  [/^\/studio\/quiz(\/|$)/, 'quiz'],
  [/^\/studio\/practice(\/|$)/, 'practice'],
  [/^\/studio\/reminders(\/|$)/, 'revision'],
];

// Fonction dont dépend ce chemin (ou null).
export function featureForPath(path) {
  for (const [re, id] of RULES) if (re.test(path)) return id;
  return null;
}

// Chemins qui restent ouverts pendant la maintenance : connexion, mot de passe oublié.
export const MAINTENANCE_OPEN = /^\/(login|forgot|reset)(\/|$)/;
