// Module « Suivre et notifications » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « follow » (Admin → Fonctions).
import routes from './routes.js';
import { startNotifyMailer } from '../../notifyMailer.js';

export default async function register(app) {
  await app.register(routes);
}

// Alertes des intervenants suivis et sélection de la semaine.
export async function start(app) { startNotifyMailer(app.log); }
