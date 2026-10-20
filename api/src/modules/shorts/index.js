// Module « Shorts publics » : les chaînes publient des extraits verticaux 9:16 (fil vertical, accueil, page de la chaîne, espace Kids).
import routes from './routes.js';
import { pool } from '../../db.js';
import { deleteObject } from '../../storage.js';

export default async function register(app, ctx) {
  // Conférence supprimée : on efface aussi les fichiers de ses shorts (la base les supprime en cascade).
  ctx.on('talk.deleting', async ({ talkId }) => {
    const { rows } = await pool.query('SELECT video_key, poster_key FROM public_shorts WHERE talk_id = $1', [talkId]);
    for (const r of rows) {
      await deleteObject(r.video_key).catch((e) => app.log.warn(`Shorts : fichier non effacé (${e.message})`));
      if (r.poster_key) await deleteObject(r.poster_key).catch(() => {});
    }
  });
  await app.register(routes);
}
