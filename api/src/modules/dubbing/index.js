// Module « Doublage français » : réglages, voix, estimation, langue d'écoute (S1) ; file du service dubbing/ (D1a) ;
// version française côté spectateurs et demandes des abonnés (D2) ; fichiers de travail archivables (S2).
import routes from './routes.js';
import publicRoutes, { notifyReady } from './public.js';
import { recordListening, collectWorkFiles } from './lib.js';
import { enqueueForUser } from '../../mailer.js';
import { collectTasks, pauseRunning, production, overview } from './studio.js';

export default async function register(app, ctx) {
  // Temps d'écoute par langue de l'audio, à chaque reprise de lecture (seulement quand le module est activé).
  ctx.on('watch.progress', (ev) => recordListening(ev));
  // Étape S2 (module « Stockage et archivage ») : fichiers de travail du doublage à archiver après N jours.
  // La piste servie aux spectateurs (mélange des vidéos envoyées, voix seule des vidéos externes) n'est jamais proposée.
  ctx.on('archive.collect', (out, opts) => collectWorkFiles(out, opts));
  // Étape S3 : Studio → Activité (tâches, pause d'une demande en cours), tableau de bord et Studio → Contenus.
  ctx.on('activity.collect', (out, opts) => collectTasks(out, opts));
  ctx.on('activity.pause', (task) => pauseRunning(task));
  ctx.on('studio.production', (out, opts) => production(out, opts));
  ctx.on('studio.overview', (out, opts) => overview(out, opts));
  await app.register(async (scope) => routes(scope, ctx));
  await app.register(publicRoutes); // étape D2 : version française côté spectateurs
}

// Étape D2 : e-mail « la version française est disponible » aux membres qui l'avaient demandée (module activé seulement).
export async function start(app, ctx) {
  const tick = async () => {
    try { if (await ctx.enabled()) await notifyReady(enqueueForUser, app.log); } catch (err) { app.log.warn(`Doublage : ${err.message}`); }
  };
  setInterval(tick, 120_000).unref();
  setTimeout(tick, 15_000).unref();
}
