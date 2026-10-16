// Module « Séries et épisodes » (étape M2) : code d'origine déplacé dans ce dossier, lié à la fonction « series » (Admin → Fonctions).
import routes from './routes.js';
import { listSeries, episodeLabels, seriesNextUp } from './routes.js';

export default async function register(app, ctx) {
  // Étape M3a : le socle (menu, recherche, SEO, bibliothèque, accueil, intervenants) et les chaînes lisent les séries par ici.
  ctx.provide('series.list', listSeries);
  ctx.provide('series.episodeLabels', episodeLabels);
  ctx.provide('series.nextUp', seriesNextUp);
  await app.register(routes);
}
