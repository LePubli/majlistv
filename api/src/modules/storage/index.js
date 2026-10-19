// Module « Stockage et archivage » (étape S2) : espace Garage, fournisseur d'archivage (rclone), test de connexion,
// archivage et restauration, archivage automatique des fichiers de travail annoncés par les autres modules.
//   Points d'extension fournis : archive.lookup (archive d'un fichier de Garage), archive.restore (E4b), storage.space (espace utilisé / libre).
//   Événements : archive.collect (les modules ajoutent leurs fichiers de travail), archive.archived, archive.restored.
import routes from './routes.js';
import { lookup, restoreKey, recover, processQueue, autoArchive, readSettings, space, collectTasks, overviewPart } from './lib.js';

export default async function register(app, ctx) {
  ctx.provide('archive.lookup', (key) => lookup(key));
  // Étape E4b : « Restaurer l'original » de l'éditeur fait revenir l'original archivé.
  ctx.provide('archive.restore', (key) => restoreKey(key));
  ctx.provide('storage.space', async () => space(await readSettings(ctx)));
  // Étape S3 : archivages dans Studio → Activité, espace de stockage sur le tableau de bord.
  ctx.on('activity.collect', (out, opts) => collectTasks(out, opts));
  ctx.on('studio.overview', (out, opts) => overviewPart(ctx, out, opts));
  await app.register(async (scope) => routes(scope, ctx));
}

export async function start(app, ctx) {
  await recover();
  // File d'archivage : vérifiée toutes les 30 s (les routes la lancent aussi tout de suite).
  const tick = async () => {
    try { if (await ctx.enabled()) await processQueue(ctx, app.log); } catch (err) { app.log.warn(`Archivage : ${err.message}`); }
  };
  setInterval(tick, 30_000).unref();
  setTimeout(tick, 10_000).unref();
  // Règles automatiques : vérifiées toutes les heures, appliquées une fois par jour.
  const daily = async () => {
    try { if (await ctx.enabled()) { const r = await autoArchive(ctx, app.log); if (r.queued) await tick(); } } catch (err) { app.log.warn(`Archivage automatique : ${err.message}`); }
  };
  setInterval(daily, 3600_000).unref();
  setTimeout(daily, 60_000).unref();
}
