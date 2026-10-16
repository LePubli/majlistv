// Module « Séries et épisodes » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « series » (Admin → Fonctions).
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
