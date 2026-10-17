// Module « Éditeur de montage » (étape E1) : projets de montage des vidéos envoyées, timeline multipiste, sauvegarde
// automatique, versions, verrou d'édition (un seul éditeur à la fois, les autres en lecture seule), aperçu 360p.
//   Événement émis : editor.media (les modules ajoutent leurs pistes liées, ex. le doublage : segments de la voix française).
//   Événement écouté : studio.production (Studio → Contenus : étape « Montée »).
import routes from './routes.js';
import { pool } from '../../db.js';
import { isEdited } from './timeline.js';

export default async function register(app, ctx) {
  ctx.on('studio.production', async (out, { ids }) => {
    if (!ids.length) return;
    const { rows } = await pool.query("SELECT talk_id, timeline, updated_at FROM editor_projects WHERE kind = 'main' AND talk_id = ANY($1::uuid[])", [ids]);
    for (const r of rows) if (out[r.talk_id]) out[r.talk_id].editor = { project: true, edited: isEdited(r.timeline), updatedAt: r.updated_at };
  });
  await app.register(async (scope) => routes(scope, ctx));
}
