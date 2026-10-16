// Module « Mon bilan personnel » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « selfcheck » (Admin → Fonctions).
import routes from './routes.js';
import { startSelfcheckMailer } from '../../selfcheckMailer.js';

export default async function register(app) {
  await app.register(routes);
}

// Rappel hebdomadaire du bilan personnel.
export async function start(app) { startSelfcheckMailer(app.log); }
