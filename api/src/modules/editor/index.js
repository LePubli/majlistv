// Module « Éditeur de montage » : projets de montage des vidéos envoyées, timeline multipiste, sauvegarde automatique,
// versions, verrou d'édition, aperçu 360p (étape E1) ; audio pro : réglages du son, formes d'onde et niveaux mesurés,
// musiques de fond, écoute de la réduction du bruit (étape E2) ; habillage (E3) ; rendu de la vidéo montée par le worker (E4a) ;
// remplacement de la vidéo publiée et restauration de l'original (E4b).
//   Événements émis : editor.media (pistes liées, ex. voix française), editor.replaced / editor.restored (E4b).
//   Événements écoutés : studio.production (Studio → Contenus : étape « Montée »), activity.collect (analyses du son, rendus, remplacements), archive.collect / archive.archived / archive.restored (originaux, E4b).
import routes from './routes.js';
import { pool } from '../../db.js';
import { isEdited } from './timeline.js';
import { processQueue, recover, collectTasks } from './audio.js';
import { collectRenders, deleteProjectRenders } from './render.js';
import { collectJobs, cancelJob } from './jobs.js';
import { tick as replaceTick, collectReplacements, collectOriginals, onArchived, onRestored } from './replace.js';

export default async function register(app, ctx) {
  ctx.on('studio.production', async (out, { ids }) => {
    if (!ids.length) return;
    const { rows } = await pool.query("SELECT talk_id, timeline, updated_at FROM editor_projects WHERE kind = 'main' AND talk_id = ANY($1::uuid[])", [ids]);
    for (const r of rows) if (out[r.talk_id]) out[r.talk_id].editor = { project: true, edited: isEdited(r.timeline), updatedAt: r.updated_at };
    // Étape E4b : vidéo publiée remplacée par le montage (étape « Montée » faite).
    const rep = await pool.query(`SELECT DISTINCT ON (talk_id) talk_id, kind, switched_at FROM editor_replacements
                                   WHERE status = 'switched' AND talk_id = ANY($1::uuid[]) ORDER BY talk_id, switched_at DESC`, [ids]);
    for (const r of rep.rows) if (out[r.talk_id]?.editor) out[r.talk_id].editor.replaced = r.kind === 'replace' ? r.switched_at : null;
  });
  // Étape E2 : les analyses du son (formes d'onde) apparaissent dans Studio → Activité.
  // Étape E4a : les rendus (calculés par le worker) aussi.
  // Étape E4b : les préparations de nouvelle version (remplacement, restauration) aussi.
  // Conférence supprimée : fichiers des rendus de ses montages et extraits (registre n°48 ; la base les supprime en cascade).
  ctx.on('talk.deleting', async ({ talkId }) => {
    const { rows } = await pool.query('SELECT id FROM editor_projects WHERE talk_id = $1', [talkId]);
    for (const r of rows) await deleteProjectRenders(r.id);
  });
  ctx.on('activity.collect', async (out, opts) => { await collectTasks(out, opts); await collectRenders(out, opts); await collectReplacements(out, opts); await collectJobs(out, opts); });
  ctx.on('activity.cancel', (out, task) => cancelJob(out, task)); // registre n°28 / 31
  // Étape E4b : originaux remplacés gardés N jours, puis proposés au module « Stockage et archivage ».
  ctx.on('archive.collect', (out, opts) => collectOriginals(out, opts));
  ctx.on('archive.archived', (ev) => onArchived(ev));
  ctx.on('archive.restored', (ev) => onRestored(ev));
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
  // Étape E4b : bascules, suites (transcription, traductions) et nettoyages. Tourne même si le module vient d'être désactivé :
  // une opération commencée va au bout (la vidéo publiée doit rester cohérente).
  const rep = async () => { try { await replaceTick(app.log); } catch (err) { app.log.warn(`Éditeur (remplacement) : ${err.message}`); } };
  setInterval(rep, 10_000).unref();
  setTimeout(rep, 5_000).unref();
}
