// Étape 29 — Mise en pratique : « Et maintenant, que faire ? »
//  • Studio (organisateur, administrateur) : propositions d'action générées par l'IA (service translator) ou saisies à la main,
//    relues puis validées ; seules les propositions « validées » sont publiques.
//  • Public : l'écran « Et maintenant, que faire ? » est visible par tous (visiteurs compris).
//  • Apprentissage : « Mes engagements » (enregistrement, suivi, note privée). Les textes personnels sont chiffrés (PRACTICE_KEY).
// Le rôle « modérateur » arrivera avec l'étape 20 : il suffira de l'ajouter à `organizer` ci-dessous.
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting, getNumber, isOn } from '../settings.js';
import { visibleSql } from '../visibility.js';
import { hasLearningTier } from '../access.js';
import { sealText, openText, practiceKeyReady } from '../practiceCrypto.js';

const idSchema = z.object({ id: z.string().uuid() });
const sidSchema = z.object({ sid: z.string().uuid() });
const MAX_MS = 48 * 3600 * 1000;

const sugg = {
  text: z.string().trim().min(8).max(220),
  size: z.number().int().min(1).max(3),
  reference: z.string().trim().max(300),
  evidenceMs: z.number().int().min(0).max(MAX_MS).nullable(),
  evidenceQuote: z.string().trim().max(1500),
};
const createBody = z.object({ text: sugg.text, size: sugg.size.default(1), reference: sugg.reference.default(''),
  evidenceMs: sugg.evidenceMs.default(null), evidenceQuote: sugg.evidenceQuote.default('') });
const patchBody = z.object({
  ...Object.fromEntries(Object.entries(sugg).map(([k, v]) => [k, v.optional()])),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });

const shape = (r) => ({
  id: r.id, talkId: r.talk_id, lang: r.lang, text: r.text, size: r.size, reference: r.reference,
  evidenceMs: r.evidence_ms, evidenceQuote: r.evidence_quote, origin: r.origin, status: r.status,
  reviewedAt: r.reviewed_at, createdAt: r.created_at,
  ...(r.talk_title !== undefined ? { talkTitle: r.talk_title } : {}),
});
// Version publique : ni statut, ni origine, ni relecteur.
const publicShape = (r) => ({ id: r.id, text: r.text, size: r.size, reference: r.reference, evidenceMs: r.evidence_ms, evidenceQuote: r.evidence_quote });

export const DUE_KINDS = ['today', 'week', 'month'];
export const STATUSES = ['todo', 'doing', 'done', 'not_yet'];
// Échéance en date (jour de Paris) : aujourd'hui, dimanche de cette semaine, dernier jour du mois.
const DUE_SQL = `CASE $1::text
  WHEN 'today' THEN (now() AT TIME ZONE 'Europe/Paris')::date
  WHEN 'week'  THEN (now() AT TIME ZONE 'Europe/Paris')::date + (7 - extract(isodow FROM now() AT TIME ZONE 'Europe/Paris'))::int
  WHEN 'month' THEN (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') + interval '1 month - 1 day')::date
  ELSE NULL END`;
export const dueOn = async (kind) => (kind ? (await pool.query(`SELECT to_char(${DUE_SQL}, 'YYYY-MM-DD') AS d`, [kind])).rows[0].d : null);

// Rappel affiché au membre : « à reprendre » si l'échéance est passée et que ce n'est pas fait.
const commitShape = (r) => ({
  id: r.id, talkId: r.talk_id, talkTitle: r.talk_title ?? null, suggestionId: r.suggestion_id, size: r.size,
  text: openText(r.text_enc), niyya: openText(r.niyya_enc), note: openText(r.note_enc),
  dueKind: r.due_kind, dueOn: r.due_on, status: r.status, doneAt: r.done_at, createdAt: r.created_at, updatedAt: r.updated_at,
  overdue: Boolean(r.overdue),
});
const COMMIT_SELECT = `SELECT c.*, t.title AS talk_title, to_char(c.due_on, 'YYYY-MM-DD') AS due_on,
        (c.due_on IS NOT NULL AND c.status IN ('todo', 'doing') AND c.due_on < (now() AT TIME ZONE 'Europe/Paris')::date) AS overdue
   FROM practice_commitments c LEFT JOIN talks t ON t.id = c.talk_id`;

// Écran public disponible pour cette conférence ? (réglage du site + au moins une proposition validée + conférence visible)
export async function practiceInfo(talkId) {
  if (!isOn(await getSetting('practice_enabled'))) return { available: false, count: 0 };
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM practice_suggestions s JOIN talks t ON t.id = s.talk_id WHERE s.talk_id = $1 AND s.status = 'approved' AND ${visibleSql('t')}`, [talkId]);
  return { available: rows[0].n > 0, count: rows[0].n };
}

export default async function practiceRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const auth = { preHandler: app.authenticate };
  const sourceOf = (t) => t.transcript_language || t.language;

  async function ownedTalk(req, reply, id) {
    const { rows } = await pool.query('SELECT id, organizer_id, title, transcript_status, transcript_language, language FROM talks WHERE id = $1', [id]);
    const t = rows[0];
    if (!t || (req.user.role !== 'admin' && t.organizer_id !== req.user.sub)) { reply.code(404).send({ error: 'Conférence introuvable' }); return null; }
    return t;
  }
  async function ownedSuggestion(req, reply, sid) {
    const { rows } = await pool.query('SELECT s.*, t.organizer_id FROM practice_suggestions s JOIN talks t ON t.id = s.talk_id WHERE s.id = $1', [sid]);
    const s = rows[0];
    if (!s || (req.user.role !== 'admin' && s.organizer_id !== req.user.sub)) { reply.code(404).send({ error: 'Proposition introuvable' }); return null; }
    return s;
  }
  // Une proposition n'est validable que complète et sans citation inventée.
  const approvable = (s) => (s.text?.trim().length >= 8 ? null : "Écrivez l'action (8 caractères au moins)");

  // ------------------------------------------------------------------ Studio : propositions d'une conférence
  app.get('/talks/:id/studio/practice', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const [qs, job] = await Promise.all([
      pool.query('SELECT * FROM practice_suggestions WHERE talk_id = $1 ORDER BY size, created_at, id', [id]),
      pool.query('SELECT status, wanted, produced, dropped, error, updated_at FROM practice_jobs WHERE talk_id = $1', [id]),
    ]);
    const items = qs.rows.map(shape);
    const j = job.rows[0];
    return {
      lang: sourceOf(t), transcriptReady: t.transcript_status === 'ready', siteEnabled: isOn(await getSetting('practice_enabled')),
      generateCount: await getNumber('practice_generate_count'),
      approved: items.filter((x) => x.status === 'approved').length, drafts: items.filter((x) => x.status === 'draft').length,
      job: j ? { status: j.status, wanted: j.wanted, produced: j.produced, dropped: j.dropped, error: j.error, updatedAt: j.updated_at } : null,
      suggestions: items,
    };
  });

  // Génération (reprise par le service translator)
  app.post('/talks/:id/studio/practice/generate', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ count: z.number().int().min(3).max(5).optional() }).parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    if (t.transcript_status !== 'ready') return reply.code(409).send({ error: "La transcription n'est pas encore prête", code: 'not_ready' });
    const cur = (await pool.query('SELECT status FROM practice_jobs WHERE talk_id = $1', [id])).rows[0];
    if (cur && ['pending', 'processing'].includes(cur.status)) return reply.code(409).send({ error: 'Une génération est déjà en cours', code: 'busy' });
    await pool.query(
      `INSERT INTO practice_jobs(talk_id, lang, status, wanted) VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (talk_id) DO UPDATE SET lang = EXCLUDED.lang, status = 'pending', wanted = EXCLUDED.wanted, produced = 0, dropped = 0,
         error = NULL, attempts = 0, created_at = now(), updated_at = now()`,
      [id, sourceOf(t), b.count ?? (await getNumber('practice_generate_count'))]);
    return reply.code(202).send({ ok: true });
  });

  app.post('/talks/:id/studio/practice/suggestions', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = createBody.parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const { rows } = await pool.query(
      `INSERT INTO practice_suggestions(talk_id, lang, text, size, reference, evidence_ms, evidence_quote, origin) VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual') RETURNING *`,
      [id, sourceOf(t), b.text, b.size, b.reference, b.evidenceMs, b.evidenceQuote]);
    return reply.code(201).send(shape(rows[0]));
  });

  app.patch('/studio/practice/suggestions/:sid', organizer, async (req, reply) => {
    const { sid } = sidSchema.parse(req.params);
    const b = patchBody.parse(req.body ?? {});
    const s = await ownedSuggestion(req, reply, sid);
    if (!s) return;
    const next = {
      text: b.text ?? s.text, size: b.size ?? s.size, reference: b.reference ?? s.reference,
      evidence_ms: b.evidenceMs !== undefined ? b.evidenceMs : s.evidence_ms, evidence_quote: b.evidenceQuote ?? s.evidence_quote, status: b.status ?? s.status,
    };
    if (next.status === 'approved') { const why = approvable(next); if (why) return reply.code(400).send({ error: why }); }
    const reviewed = next.status !== s.status;
    const { rows } = await pool.query(
      `UPDATE practice_suggestions SET text = $2, size = $3, reference = $4, evidence_ms = $5, evidence_quote = $6, status = $7,
              reviewed_by = CASE WHEN $8 THEN $9::uuid ELSE reviewed_by END, reviewed_at = CASE WHEN $8 THEN now() ELSE reviewed_at END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [sid, next.text, next.size, next.reference, next.evidence_ms, next.evidence_quote, next.status, reviewed, req.user.sub]);
    return shape(rows[0]);
  });

  app.delete('/studio/practice/suggestions/:sid', organizer, async (req, reply) => {
    const { sid } = sidSchema.parse(req.params);
    const s = await ownedSuggestion(req, reply, sid);
    if (!s) return;
    await pool.query('DELETE FROM practice_suggestions WHERE id = $1', [sid]); // les engagements déjà pris gardent leur texte (suggestion_id → NULL)
    return reply.code(204).send();
  });

  // File de relecture : toutes les propositions à valider (celles de l'organisateur ; toutes pour un administrateur).
  app.get('/studio/practice/review', organizer, async (req) => {
    const { rows } = await pool.query(
      `SELECT s.*, t.title AS talk_title FROM practice_suggestions s JOIN talks t ON t.id = s.talk_id
        WHERE s.status = 'draft' AND ($1::boolean OR t.organizer_id = $2)
        ORDER BY t.title, s.talk_id, s.size, s.created_at LIMIT 300`, [req.user.role === 'admin', req.user.sub]);
    return { suggestions: rows.map(shape) };
  });

  // ------------------------------------------------------------------ Public : « Et maintenant, que faire ? »
  // Visible par tous. Pour un membre Apprentissage : ses engagements pris sur cette conférence (aucun texte personnel pour les autres).
  app.get('/talks/:id/practice', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const info = await practiceInfo(id);
    if (!info.available) return reply.code(404).send({ error: "Cette conférence n'a pas de propositions d'action" });
    const { rows } = await pool.query(
      `SELECT id, text, size, reference, evidence_ms, evidence_quote FROM practice_suggestions WHERE talk_id = $1 AND status = 'approved' ORDER BY size, created_at, id`, [id]);
    const viewer = await app.optionalUser(req);
    const tier = viewer ? await hasLearningTier(viewer.sub) : false;
    let mine = [];
    let consent = false;
    if (tier) {
      mine = (await pool.query(`${COMMIT_SELECT} WHERE c.user_id = $1 AND c.talk_id = $2 ORDER BY c.created_at DESC`, [viewer.sub, id])).rows.map(commitShape);
      consent = Boolean((await pool.query('SELECT practice_consent_at FROM users WHERE id = $1', [viewer.sub])).rows[0]?.practice_consent_at);
    }
    return { suggestions: rows.map(publicShape), signedIn: Boolean(viewer), tier, consent, mine };
  });

  // Prendre un engagement : proposition de la liste ou action écrite par le membre. Réservé à l'offre Apprentissage.
  const commitBody = z.object({
    suggestionId: z.string().uuid().optional(),
    text: z.string().trim().min(3).max(300).optional(),
    niyya: z.string().trim().max(500).default(''),
    due: z.enum(DUE_KINDS).nullable().default(null),
    consent: z.boolean().optional(),
  }).refine((b) => b.suggestionId || b.text, { message: 'Choisissez une proposition ou écrivez votre action' });

  app.post('/talks/:id/practice/commitments', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = commitBody.parse(req.body ?? {});
    if (!(await hasLearningTier(req.user.sub))) return reply.code(403).send({ error: "L'enregistrement des engagements fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });
    if (!practiceKeyReady()) return reply.code(503).send({ error: 'Chiffrement non configuré (PRACTICE_KEY)', code: 'no_key' });
    const info = await practiceInfo(id);
    if (!info.available) return reply.code(404).send({ error: "Cette conférence n'a pas de propositions d'action" });
    const u = (await pool.query('SELECT practice_consent_at FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (!u.practice_consent_at) {
      if (b.consent !== true) return reply.code(409).send({ error: 'Votre accord est nécessaire pour enregistrer des notes personnelles', code: 'consent_required' });
      await pool.query('UPDATE users SET practice_consent_at = now() WHERE id = $1', [req.user.sub]);
    }
    let text = b.text;
    let size = null;
    if (b.suggestionId) {
      const s = (await pool.query(`SELECT text, size FROM practice_suggestions WHERE id = $1 AND talk_id = $2 AND status = 'approved'`, [b.suggestionId, id])).rows[0];
      if (!s) return reply.code(404).send({ error: 'Proposition introuvable' });
      text = s.text; size = s.size;
    }
    const { rows } = await pool.query(
      `INSERT INTO practice_commitments(user_id, talk_id, suggestion_id, size, text_enc, niyya_enc, due_kind, due_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.user.sub, id, b.suggestionId ?? null, size, sealText(text), sealText(b.niyya), b.due, await dueOn(b.due)]);
    const row = (await pool.query(`${COMMIT_SELECT} WHERE c.id = $1`, [rows[0].id])).rows[0];
    return reply.code(201).send(commitShape(row));
  });

  // ------------------------------------------------------------------ Mes engagements (Apprentissage)
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });

  app.get('/me/practice', auth, async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const { rows } = await pool.query(`${COMMIT_SELECT} WHERE c.user_id = $1 ORDER BY c.created_at DESC, c.id LIMIT 500`, [req.user.sub]);
    const items = rows.map(commitShape);
    const count = (s) => items.filter((x) => x.status === s).length;
    return { items, counts: { todo: count('todo'), doing: count('doing'), done: count('done'), notYet: count('not_yet') }, keyReady: practiceKeyReady() };
  });

  const patchCommit = z.object({
    status: z.enum(STATUSES).optional(),
    due: z.enum(DUE_KINDS).nullable().optional(),
    niyya: z.string().trim().max(500).optional(),
    note: z.string().trim().max(1000).optional(),
    text: z.string().trim().min(3).max(300).optional(),
  }).refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });

  app.patch('/me/practice/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchCommit.parse(req.body ?? {});
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const cur = (await pool.query('SELECT * FROM practice_commitments WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Engagement introuvable' });
    const status = b.status ?? cur.status;
    const dueKind = b.due !== undefined ? b.due : cur.due_kind;
    const dueDate = b.due !== undefined ? await dueOn(b.due) : null;
    await pool.query(
      `UPDATE practice_commitments SET status = $3, text_enc = $4, niyya_enc = $5, note_enc = $6, due_kind = $7,
              due_on = CASE WHEN $8 THEN $9::date ELSE due_on END,
              done_at = CASE WHEN $3 = 'done' THEN COALESCE(done_at, now()) ELSE NULL END, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, req.user.sub, status, b.text !== undefined ? sealText(b.text) : cur.text_enc, b.niyya !== undefined ? sealText(b.niyya) : cur.niyya_enc,
        b.note !== undefined ? sealText(b.note) : cur.note_enc, dueKind, b.due !== undefined, dueDate]);
    const row = (await pool.query(`${COMMIT_SELECT} WHERE c.id = $1`, [id])).rows[0];
    return commitShape(row);
  });

  app.delete('/me/practice/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM practice_commitments WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    return reply.code(204).send();
  });

  // Droit à l'effacement : supprime tous les engagements, objectifs et bilans du membre et retire son consentement. Ouvert même après la fin d'un abonnement.
  app.delete('/me/practice', auth, async (req, reply) => {
    await pool.query('DELETE FROM practice_commitments WHERE user_id = $1', [req.user.sub]);
    await pool.query('DELETE FROM self_goals WHERE user_id = $1', [req.user.sub]); // objectifs et bilans (étape 30) : tout part avec l'accord
    await pool.query('UPDATE users SET practice_consent_at = NULL WHERE id = $1', [req.user.sub]);
    return reply.code(204).send();
  });

  // Droit d'accès : export de ses données (JSON). Ouvert même après la fin d'un abonnement.
  app.get('/me/practice/export', auth, async (req, reply) => {
    const { rows } = await pool.query(`${COMMIT_SELECT} WHERE c.user_id = $1 ORDER BY c.created_at`, [req.user.sub]);
    reply.header('content-disposition', 'attachment; filename="mes-engagements.json"');
    return { exportedAt: new Date().toISOString(), items: rows.map(commitShape) };
  });
}
