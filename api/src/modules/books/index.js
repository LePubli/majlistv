// Module « Ouvrages » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « books » (Admin → Fonctions).
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
