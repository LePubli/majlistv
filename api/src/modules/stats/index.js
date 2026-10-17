// Module « Statistiques d'audience » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « stats » (Admin → Fonctions).
import routes from './routes.js';
import collectRoutes from './collect.js';
import { startStatsMaintenance } from '../../stats.js';
import { overview, production } from './studio.js';

export default async function register(app, ctx) {
  // Étape S3 : chiffres du tableau de bord et vues de chaque conférence dans Studio → Contenus.
  ctx.on('studio.overview', (out, opts) => overview(out, opts));
  ctx.on('studio.production', (out, opts) => production(out, opts));
  await app.register(routes);
  await app.register(collectRoutes); // mesure des vues (/stats/collect…)
}

// Purge des empreintes du jour (2 jours) et des compteurs anciens.
export async function start(app) { startStatsMaintenance(app.log); }
