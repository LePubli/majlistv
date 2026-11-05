// Module « Statistiques d'audience » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « stats » (Admin → Fonctions).
import routes from './routes.js';
import collectRoutes from './collect.js';
import { startStatsMaintenance } from '../../stats.js';
import { overview, production } from './studio.js';
import growthRoutes, { recordActivity, startActivityMaintenance } from './growth.js';

export default async function register(app, ctx) {
  // Étape S3 : chiffres du tableau de bord et vues de chaque vidéo dans Studio → Contenus.
  ctx.on('studio.overview', (out, opts) => overview(out, opts));
  ctx.on('studio.production', (out, opts) => production(out, opts));
  ctx.on('user.active', (userId) => recordActivity(userId)); // mois d'activité d'un compte (amélioration 7.1)
  await app.register(routes);
  await app.register(growthRoutes); // entonnoir et cohortes (admin)
  await app.register(collectRoutes); // mesure des vues (/stats/collect…)
}

// Purge des empreintes du jour (2 jours) et des compteurs anciens.
export async function start(app) { startStatsMaintenance(app.log); startActivityMaintenance(app.log); }
