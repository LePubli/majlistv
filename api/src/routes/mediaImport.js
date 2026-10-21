// Étape « Import » : copier chez nous une vidéo externe pour qu'elle devienne une vidéo hébergée.
//   POST /talks/:id/import          { rightsConfirmed: true }  conférence YouTube / Vimeo / archive.org du catalogue, ou relance d'un import échoué
//   GET  /talks/:id/import          dernière demande de la conférence (état, progression, erreur)
//   POST /talks/:id/import/cancel   annule la demande en cours (si la conversion n'est pas encore lancée)
//   GET  /studio/imports            journal des imports : qui, quand, quelle adresse, déclaration des droits (admin : tous)
// La création d'une conférence avec une adresse quelconque (« importVideo ») est dans routes/talks.js (POST /talks).
// Fonction désactivable : Admin → Fonctions (media_import).
import { z } from 'zod';
import { pool } from '../db.js';
import { storage, deleteObject } from '../storage.js';
import { viaChannel } from '../channelAccess.js';
import { talkSourceUrl, classifyUrl, insertImport, newObjectKey, storageProblem, cancelImport, ACTIVE } from '../mediaImport.js';

const idSchema = z.object({ id: z.string().uuid() });

export const importView = (m) => m && ({
  id: m.id, status: m.status, stage: m.stage, progress: m.progress, error: m.error, origin: m.origin, sourceUrl: m.source_url, newTalk: m.new_talk,
  active: ACTIVE.includes(m.status), cancelable: ACTIVE.includes(m.status) && !(m.status === 'converting' && m.stage),
  createdAt: m.created_at, finishedAt: m.finished_at, requestedByName: m.requested_by_name, rightsConfirmedAt: m.rights_confirmed_at,
});

export default async function mediaImportRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  // Conférence visible pour la personne : son créateur, l'administrateur, ou un éditeur de la chaîne.
  async function mine(req, reply, id) {
    const { rows } = await pool.query(
      'SELECT id, organizer_id, speaker, source, video_ref, video_status, external_file FROM talks WHERE id = $1', [id]);
    const talk = rows[0];
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub && !(await viaChannel(req.user, talk)))) {
      reply.code(404).send({ error: 'Conférence introuvable' });
      return null;
    }
    return talk;
  }
  const latest = async (talkId) => (await pool.query('SELECT * FROM media_imports WHERE talk_id = $1 ORDER BY created_at DESC LIMIT 1', [talkId])).rows[0];

  app.post('/talks/:id/import', organizer, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré' });
    const { id } = idSchema.parse(req.params);
    z.object({ rightsConfirmed: z.literal(true, { errorMap: () => ({ message: 'Confirmez détenir les droits sur cette vidéo' }) }) }).parse(req.body ?? {});
    const talk = await mine(req, reply, id);
    if (!talk) return;

    let src; let retry = null;
    if (talk.source !== 'upload') {
      src = talkSourceUrl(talk);
    } else {
      // Relance d'un import qui a échoué ou qui a été annulé (conférence créée pour l'import).
      const last = await latest(id);
      if (last?.new_talk && talk.video_status === 'failed' && ['failed', 'canceled'].includes(last.status)) {
        const c = classifyUrl(last.source_url);
        if (c.error) return reply.code(400).send({ error: c.error, code: c.code });
        src = { url: c.url, origin: last.origin, archiveFile: last.archive_file };
        retry = last;
      }
    }
    if (!src) return reply.code(400).send({ error: 'Cette vidéo est déjà hébergée chez nous', code: 'not_importable' });
    const full = await storageProblem();
    if (full) return reply.code(409).send({ error: full, code: 'storage_full' });

    const key = newObjectKey();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (retry) await client.query(`UPDATE talks SET video_status = 'importing', video_error = NULL, video_progress = 0, video_ref = $2 WHERE id = $1`, [id, key]);
      else {
        // La déclaration des droits vaut aussi accord pour la transcription (comme le bouton « Activer la transcription »).
        await client.query(
          `UPDATE talks SET transcript_status = CASE WHEN transcript_status = 'unavailable' AND NOT rights_confirmed THEN 'pending' ELSE transcript_status END,
                  transcript_error = CASE WHEN transcript_status = 'unavailable' AND NOT rights_confirmed THEN NULL ELSE transcript_error END,
                  transcript_attempts = CASE WHEN transcript_status = 'unavailable' AND NOT rights_confirmed THEN 0 ELSE transcript_attempts END,
                  rights_confirmed = true WHERE id = $1`, [id]);
      }
      const importId = await insertImport(client, {
        talkId: id, userId: req.user.sub, url: src.url, origin: src.origin, archiveFile: src.archiveFile,
        newTalk: Boolean(retry), prevSource: retry ? null : talk.source, objectKey: key,
      });
      await client.query('COMMIT');
      if (retry) await deleteObject(retry.object_key).catch(() => {}); // reste éventuel de l'essai précédent
      req.auditSummary = `Import de la vidéo (${src.origin}) : ${src.url}`;
      return reply.code(202).send({ id: importId, status: 'pending' });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505') return reply.code(409).send({ error: 'Un import est déjà en cours pour cette conférence', code: 'import_active' });
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/talks/:id/import', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await mine(req, reply, id))) return;
    return { import: importView(await latest(id)) };
  });

  app.post('/talks/:id/import/cancel', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await mine(req, reply, id))) return;
    const m = (await pool.query(`SELECT id FROM media_imports WHERE talk_id = $1 AND status IN ('pending', 'downloading', 'converting')`, [id])).rows[0];
    if (!m) return reply.code(404).send({ error: 'Aucun import en cours', code: 'not_found' });
    const r = await cancelImport(m.id);
    if (!r.done) return reply.code(409).send({ error: 'La conversion est déjà lancée : elle va jusqu\'au bout', code: 'running' });
    req.auditSummary = 'Import de la vidéo annulé';
    return { canceled: true };
  });

  // Journal : l'administrateur voit tout, un organisateur voit les imports qu'il a demandés ou qui concernent ses conférences.
  app.get('/studio/imports', organizer, async (req) => {
    const own = req.user.role === 'admin' ? '' : 'WHERE (m.requested_by = $1 OR t.organizer_id = $1)';
    const { rows } = await pool.query(
      `SELECT m.*, t.title FROM media_imports m JOIN talks t ON t.id = m.talk_id ${own} ORDER BY m.created_at DESC LIMIT 100`,
      req.user.role === 'admin' ? [] : [req.user.sub]);
    return { imports: rows.map((m) => ({ ...importView(m), talkId: m.talk_id, title: m.title, rightsText: m.rights_text })) };
  });
}
