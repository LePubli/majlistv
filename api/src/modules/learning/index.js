// Module « Parcours et attestations » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « learning » (Admin → Fonctions).
import routes from './routes.js';
import { startPlanReminders } from '../../planReminders.js';

export default async function register(app) {
  await app.register(routes);
}

// Rappels du planning (notification et e-mail, au choix du membre).
export async function start(app) { startPlanReminders(app.log); }
