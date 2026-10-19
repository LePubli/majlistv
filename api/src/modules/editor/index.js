// Module « Éditeur de montage » : projets de montage des vidéos envoyées, timeline multipiste, sauvegarde automatique,
// versions, verrou d'édition, aperçu 360p (étape E1) ; audio pro : réglages du son, formes d'onde et niveaux mesurés,
// musiques de fond, écoute de la réduction du bruit (étape E2) ; habillage (E3) ; rendu de la vidéo montée par le worker (E4a).
//   Événement émis : editor.media (les modules ajoutent leurs pistes liées, ex. le doublage : voix française).
//   Événements écoutés : studio.production (Studio → Contenus : étape « Montée »), activity.collect (analyses du son, rendus).
import routes from './routes.js';
import { pool } from '../../db.js';
import { isEdited } from './timeline.js';
import { processQueue, recover, collectTasks } from './audio.js';
import { collectRenders } from './render.js';

export default async function register(app, ctx) {
  ctx.on('studio.production', async (out, { ids }) => {
    if (!ids.length) return;
    const { rows } = await pool.query("SELECT talk_id, timeline, updated_at FROM editor_projects WHERE kind = 'main' AND talk_id = ANY($1::uuid[])", [ids]);
    for (const r of rows) if (out[r.talk_id]) out[r.talk_id].editor = { project: true, edited: isEdited(r.timeline), updatedAt: r.updated_at };
  });
  // Étape E2 : les analyses du son (formes d'onde) apparaissent dans Studio → Activité.
  // Étape E4a : les rendus (calculés par le worker) aussi.
  ctx.on('activity.collect', async (out, opts) => { await collectTasks(out, opts); await collectRenders(out, opts); });
  await app.register(async (scope) => routes(scope, ctx));
}

// File des analyses du son : vérifiée toutes les 10 s (les routes la lancent aussi tout de suite).
export async function start(app, ctx) {
  await recover();
  const tick = async () => {
    try { if (await ctx.enabled()) await processQueue(app.log); } catch (err) { app.log.warn(`Éditeur : ${err.message}`); }
  };
  setInterval(tick, 10_000).unref();
  setTimeout(tick, 8_000).unref();
}
