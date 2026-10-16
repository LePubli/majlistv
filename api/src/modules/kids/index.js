// Module « Mejliss Kids » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « kids » (Admin → Fonctions).
import routes from './routes.js';
import { startKidsReportMailer } from '../../kidsReportMailer.js';
import { kidCanSee } from './routes.js';

export default async function register(app, ctx) {
  ctx.provide('kids.canSee', kidCanSee); // fiche conférence et statistiques Kids (étape M3a)
  await app.register(routes);
}

// Rapport hebdomadaire envoyé aux parents.
export async function start(app) { startKidsReportMailer(app.log); }
