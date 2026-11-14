// TV en direct (fonction « livetv », indépendante du module « Événements en direct ») :
//   GET /live                                chaînes affichées (direct en cours retrouvé par le transcripteur)
//   GET|POST /studio/live · PATCH|DELETE /studio/live/:cid · POST /studio/live/:cid/check   (administrateur)
import { z } from 'zod';
import { pool } from '../db.js';
import { patchOf } from '../zpatch.js';
import { parseChannelUrl, liveChannelShape } from '../liveTv.js';

const chanBody = z.object({
  name: z.string().trim().min(1, 'Nom obligatoire').max(80), url: z.string().trim().min(10).max(300),
  enabled: z.boolean().default(true), position: z.number().int().min(0).max(1000).default(0),
}).strict();
const chanPatch = patchOf(chanBody).strict();
const cidSchema = z.object({ cid: z.coerce.number().int().positive() });

export default async function liveTvRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  app.get('/live', async () => {
    const { rows } = await pool.query('SELECT * FROM live_channels WHERE enabled ORDER BY position, id');
    return { channels: rows.filter((r) => r.video_id).map(liveChannelShape) };
  });
  const adminChan = (r) => ({ ...liveChannelShape(r), url: r.source_url, enabled: r.enabled, position: r.position, checkedAt: r.checked_at, error: r.error || null });
  app.get('/studio/live', adminOnly, async () => {
    const { rows } = await pool.query('SELECT * FROM live_channels ORDER BY position, id');
    return { channels: rows.map(adminChan) };
  });
  app.post('/studio/live', adminOnly, async (req, reply) => {
    const b = chanBody.parse(req.body ?? {});
    const url = parseChannelUrl(b.url);
    if (!url) return reply.code(400).send({ error: 'Lien YouTube non reconnu : collez le lien de la chaîne (youtube.com/@nom) ou du direct (youtube.com/watch?v=…)', code: 'bad_url' });
    const { rows } = await pool.query('INSERT INTO live_channels(name, source_url, enabled, position) VALUES ($1,$2,$3,$4) RETURNING *', [b.name, url, b.enabled, b.position]);
    req.auditSummary = `Direct : chaîne « ${b.name} » ajoutée`;
    return reply.code(201).send(adminChan(rows[0]));
  });
  app.patch('/studio/live/:cid', adminOnly, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const b = chanPatch.parse(req.body ?? {});
    const set = []; const args = [cid];
    const put = (col, v) => { args.push(v); set.push(`${col} = $${args.length}`); };
    if (b.name !== undefined) put('name', b.name);
    if (b.enabled !== undefined) put('enabled', b.enabled);
    if (b.position !== undefined) put('position', b.position);
    if (b.url !== undefined) {
      const url = parseChannelUrl(b.url);
      if (!url) return reply.code(400).send({ error: 'Lien YouTube non reconnu', code: 'bad_url' });
      put('source_url', url); set.push('video_id = NULL', 'live = false', "title = ''", 'checked_at = NULL', 'error = NULL');
    }
    if (!set.length) return reply.code(400).send({ error: 'Rien à modifier' });
    const { rows } = await pool.query(`UPDATE live_channels SET ${set.join(', ')} WHERE id = $1 RETURNING *`, args);
    if (!rows[0]) return reply.code(404).send({ error: 'Chaîne introuvable' });
    req.auditSummary = `Direct : chaîne « ${rows[0].name} » modifiée`;
    return adminChan(rows[0]);
  });
  app.delete('/studio/live/:cid', adminOnly, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const { rows } = await pool.query('DELETE FROM live_channels WHERE id = $1 RETURNING name', [cid]);
    if (!rows[0]) return reply.code(404).send({ error: 'Chaîne introuvable' });
    req.auditSummary = `Direct : chaîne « ${rows[0].name} » supprimée`;
    return { deleted: true };
  });
  // « Vérifier maintenant » : le transcripteur relit la chaîne au prochain passage (quelques secondes).
  app.post('/studio/live/:cid/check', adminOnly, async (req, reply) => {
    const { cid } = cidSchema.parse(req.params);
    const r = await pool.query('UPDATE live_channels SET checked_at = NULL WHERE id = $1', [cid]);
    if (!r.rowCount) return reply.code(404).send({ error: 'Chaîne introuvable' });
    return reply.code(202).send({ queued: true });
  });
}
