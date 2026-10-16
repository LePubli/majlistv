// Module « Révision espacée » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « revision » (Admin → Fonctions).
import routes from './routes.js';
import { startRevisionMailer } from '../../revisionMailer.js';

export default async function register(app) {
  await app.register(routes);
}

// E-mail quotidien des révisions (Apprentissage).
export async function start(app) { startRevisionMailer(app.log); }
