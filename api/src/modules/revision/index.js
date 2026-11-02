// Module « Révision espacée » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « revision » (Admin → Fonctions).
import routes from './routes.js';
import { revisionToday } from './today.js';
import { startRevisionMailer } from '../../revisionMailer.js';

export default async function register(app, ctx) {
  await app.register(routes);
  ctx.on('today.collect', revisionToday); // bloc « Aujourd'hui » (étape B1)
}

// E-mail quotidien des révisions (Apprentissage).
export async function start(app) { startRevisionMailer(app.log); }
