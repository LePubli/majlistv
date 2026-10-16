// Bibliothèque de rappels (étape 24.5) : courts passages affichés en « rappel du jour » aux membres Apprentissage.
// Aucune génération par IA. Trois origines possibles :
//   - « transcript » : extrait MOT POUR MOT de la transcription de la plateforme (le serveur copie le texte, personne ne le tape) ;
//   - « quiz »       : citation déjà vérifiée d'une question de quiz validée ;
//   - « manual »     : saisi à la main, avec sa source (obligatoire) : hadith, verset, citation d'un savant relue par l'organisateur.
// Tout arrive en « brouillon » ; seuls les rappels validés par un humain sont diffusés.
import { z } from 'zod';
import { pool } from '../../db.js';

const idSchema = z.object({ id: z.string().uuid() });
const ridSchema = z.object({ rid: z.string().uuid() });
const MAX_MS = 48 * 3600 * 1000;
const textSchema = z.string().trim().min(5).max(800);

export const shape = (r) => ({
  id: r.id, talkId: r.talk_id, talkTitle: r.talk_title ?? null, textAr: r.text_ar || '', lang: r.lang, text: r.text, startMs: r.start_ms, origin: r.origin, attribution: r.attribution,
  status: r.status, createdAt: r.created_at, approvedAt: r.approved_at,
});

export default async function reminderRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  async function ownedTalk(req, reply, id) {
    const { rows } = await pool.query('SELECT id, organizer_id, transcript_status, transcript_language, language FROM talks WHERE id = $1', [id]);
    const t = rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub)) {
      reply.code(404).send({ error: 'Conférence introuvable' });
      return null;
    }
    return t;
  }
  async function ownedReminder(req, reply, rid) {
    const { rows } = await pool.query('SELECT m.*, t.organizer_id FROM reminders m LEFT JOIN talks t ON t.id = m.talk_id WHERE m.id = $1', [rid]);
    const m = rows[0];
    // Rappel d'une conférence : son organisateur. Rappel libre : celui qui l'a créé. Citation du corpus : administrateur seulement.
    const mine = m && (m.origin === 'corpus' ? false : m.talk_id ? m.organizer_id === req.user.sub : m.created_by === req.user.sub);
    if (!m || (req.user.role !== 'admin' && !mine)) {
      reply.code(404).send({ error: 'Rappel introuvable' });
      return null;
    }
    return m;
  }

  app.get('/talks/:id/studio/reminders', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const [list, langs] = await Promise.all([
      pool.query('SELECT * FROM reminders WHERE talk_id = $1 ORDER BY status, start_ms NULLS LAST, created_at', [id]),
      pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [id]),
    ]);
    return { transcriptReady: t.transcript_status === 'ready', langs: langs.rows.map((r) => r.lang), sourceLang: t.transcript_language || t.language, reminders: list.rows.map(shape) };
  });

  // Saisie manuelle : la source est obligatoire.
  const manualBody = z.object({ text: textSchema, textAr: z.string().trim().max(1600).default(''), attribution: z.string().trim().min(3).max(300), startMs: z.number().int().min(0).max(MAX_MS).nullable().default(null), lang: z.string().trim().min(2).max(10).default('fr') });
  app.post('/talks/:id/studio/reminders', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = manualBody.parse(req.body ?? {});
    if (!(await ownedTalk(req, reply, id))) return;
    const { rows } = await pool.query(
      `INSERT INTO reminders(talk_id, lang, text, text_ar, start_ms, origin, attribution, created_by) VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7) RETURNING *`,
      [id, b.lang, b.text, b.textAr, b.startMs, b.attribution, req.user.sub]);
    return reply.code(201).send(shape(rows[0]));
  });

  // Extrait mot pour mot de la transcription, entre deux minutes (40 s par défaut), dans la langue demandée.
  const trBody = z.object({ fromMs: z.number().int().min(0).max(MAX_MS), toMs: z.number().int().min(0).max(MAX_MS).optional(), lang: z.string().trim().min(2).max(10).optional() });
  app.post('/talks/:id/studio/reminders/from-transcript', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = trBody.parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const to = Math.min(b.toMs ?? b.fromMs + 40000, b.fromMs + 120000);
    if (to <= b.fromMs) return reply.code(400).send({ error: 'La fin doit être après le début' });
    const lang = b.lang || t.transcript_language || t.language;
    const { rows } = await pool.query(
      'SELECT start_ms, text FROM transcript_segments WHERE talk_id = $1 AND lang = $2 AND start_ms >= $3 AND start_ms < $4 ORDER BY idx', [id, lang, b.fromMs, to]);
    if (!rows.length) return reply.code(404).send({ error: 'Aucun passage de la transcription dans cet intervalle', code: 'empty' });
    const text = rows.map((r) => r.text.trim()).join(' ').replace(/\s+/g, ' ');
    if (text.length < 5 || text.length > 800) return reply.code(400).send({ error: 'Passage trop court ou trop long (800 caractères au plus) : réduisez l\'intervalle', code: 'length' });
    const ins = await pool.query(
      `INSERT INTO reminders(talk_id, lang, text, start_ms, origin, created_by) VALUES ($1, $2, $3, $4, 'transcript', $5) RETURNING *`,
      [id, lang, text, rows[0].start_ms, req.user.sub]);
    return reply.code(201).send(shape(ins.rows[0]));
  });

  // Reprend les citations des questions de quiz validées (déjà retrouvées mot pour mot dans la transcription).
  app.post('/talks/:id/studio/reminders/from-quiz', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await ownedTalk(req, reply, id))) return;
    const { rows } = await pool.query(
      `INSERT INTO reminders(talk_id, lang, text, start_ms, origin, created_by)
       SELECT q.talk_id, q.lang, q.evidence_quote, q.evidence_ms, 'quiz', $2
         FROM quiz_questions q
        WHERE q.talk_id = $1 AND q.status = 'approved' AND q.origin = 'ai' AND length(trim(q.evidence_quote)) BETWEEN 5 AND 800
          AND NOT EXISTS (SELECT 1 FROM reminders m WHERE m.talk_id = q.talk_id AND m.text = trim(q.evidence_quote))
        RETURNING *`, [id, req.user.sub]);
    return reply.code(201).send({ added: rows.length, reminders: rows.map(shape) });
  });

  const patchBody = z.object({ text: textSchema.optional(), textAr: z.string().trim().max(1600).optional(), attribution: z.string().trim().max(300).optional(), status: z.enum(['draft', 'approved']).optional() })
    .refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });
  app.patch('/studio/reminders/:rid', organizer, async (req, reply) => {
    const { rid } = ridSchema.parse(req.params);
    const b = patchBody.parse(req.body ?? {});
    const m = await ownedReminder(req, reply, rid);
    if (!m) return;
    if (m.origin === 'corpus' && (b.text !== undefined || b.attribution !== undefined)) {
      return reply.code(400).send({ error: 'Le texte d\'une citation du corpus ne se modifie pas : il est celui de la source', code: 'corpus_locked' });
    }
    const next = { text: b.text ?? m.text, attribution: b.attribution ?? m.attribution, status: b.status ?? m.status, origin: m.origin };
    // Un texte modifié à la main n'est plus l'extrait d'origine : il redevient une saisie manuelle (source obligatoire) et repasse en brouillon.
    if (b.text !== undefined && b.text !== m.text && m.origin !== 'manual') { next.origin = 'manual'; if (b.status === undefined) next.status = 'draft'; }
    if (next.origin === 'manual' && next.attribution.length < 3 && next.status === 'approved') {
      return reply.code(400).send({ error: 'Indiquez la source du passage avant de le valider', code: 'source_required' });
    }
    const { rows } = await pool.query(
      `UPDATE reminders SET text = $2, attribution = $3, origin = $4, status = $5, text_ar = $6,
              approved_at = CASE WHEN $5 = 'approved' THEN COALESCE(approved_at, now()) ELSE NULL END WHERE id = $1 RETURNING *`,
      [rid, next.text, next.attribution, next.origin, next.status, b.textAr ?? m.text_ar]);
    return shape(rows[0]);
  });

  app.delete('/studio/reminders/:rid', organizer, async (req, reply) => {
    const { rid } = ridSchema.parse(req.params);
    if (!(await ownedReminder(req, reply, rid))) return;
    await pool.query('DELETE FROM reminders WHERE id = $1', [rid]);
    return reply.code(204).send();
  });
}
