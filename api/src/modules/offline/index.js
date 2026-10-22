// Module « Hors connexion » (étape 22b-6) : voir routes.js.
import routes from './routes.js';
import { resetStale, removeFiles, sweep } from './prepare.js';

export default async function register(app, ctx) {
  // Conférence supprimée : on efface aussi ses fichiers préparés (la base efface les lignes en cascade).
  ctx.on('talk.deleting', async ({ talkId }) => { await removeFiles(talkId); });
  await app.register(routes);
}

export async function start(app) {
  await resetStale().catch((e) => app.log.warn(`Hors connexion : reprise impossible (${e.message})`));
  await sweep(app.log, { force: true });
  setInterval(() => { void sweep(app.log, { force: true }); }, 30 * 60 * 1000).unref(); // ménage des fichiers temporaires
}
