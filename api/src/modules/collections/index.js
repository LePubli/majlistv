// Module (étape M2) : les routes sont celles des étapes d'origine, déplacées dans ce dossier. Lié à la fonction du même nom (Admin → Fonctions).
import routes from './routes.js';

export default async function register(app) {
  await app.register(routes);
}
