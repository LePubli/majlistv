// Module « Chaînes » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « channels » (Admin → Fonctions).
import routes from './routes.js';
import { startChannelSync } from '../../channels.js';

export default async function register(app) {
  await app.register(routes);
}

// Chaînes manquantes créées à partir des conférences.
export async function start(app) { startChannelSync(app.log); }
