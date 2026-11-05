// Amélioration 3.5 — Références citées dans une conférence (versets du Coran, hadiths).
//  • Détection : service translator (IA) — l'IA indique OÙ et LAQUELLE ; le texte vient de la source, jamais de l'IA.
//  • Studio (organisateur, modérateur, administrateur) : lancer la détection, relire, corriger, ajouter, valider, refuser.
//  • Public : seules les références VALIDÉES s'affichent (« Références citées »), avec la minute et le texte de la source.
// Les hadiths sont toujours relus par un humain ; un verset n'est publié seul que si le service a vérifié l'extrait et le texte (réglage).
import { z } from 'zod';
import { pool } from '../../db.js';
import { visibleSql } from '../../visibility.js';
import { viaChannel } from '../../channelAccess.js';
import { COLLECTIONS, MAX_VERSES, fromRow, publicShape, refKey, resolveTexts, studioShape } from './lib.js';

const idSchema = z.object({ id: z.string().uuid() });
const ridSchema = z.object({ rid: z.string().uuid() });
const MAX_MS = 48 * 3600 * 1000;
const STAFF = new Set(['admin', 'moderator']);

const refBody = z.object({
  kind: z.enum(['quran', 'hadith']),
  sura: z.number().int().min(1).max(114).nullable().default(null),
  ayaFrom: z.number().int().min(1).max(286).nullable().default(null),
  ayaTo: z.number().int().min(1).max(286).nullable().default(null),
  collection: z.string().trim().max(30).default(''),
  number: z.string().trim().max(20).regex(/^[0-9]*$/, 'Numéro : chiffres seulement').default(''),
  saidAs: z.string().trim().max(200).default(''),
  startMs: z.number().int().min(0).max(MAX_MS).nullable().default(null),
  excerpt: z.string().trim().max(1500).default(''),
});

/** Contrôle une référence saisie (Coran : sourate, versets ; hadith : recueil connu ou source dite) ; renvoie un message d'erreur ou null. */
export function refProblem(b) {
  if (b.kind === 'quran') {
    if (!b.sura || !b.ayaFrom) return 'Indiquez la sourate et le verset';
    const to = b.ayaTo ?? b.ayaFrom;
    if (to < b.ayaFrom) return 'Le dernier verset doit suivre le premier';
    if (to - b.ayaFrom >= MAX_VERSES) return `Au plus ${MAX_VERSES} versets`;
    return null;
  }
  if (b.collection && !COLLECTIONS.includes(b.collection) && !b.saidAs) return 'Recueil inconnu : indiquez la source telle que dite par l\'intervenant';
  if (b.number && !b.collection) return 'Indiquez le recueil du hadith';
  if (!b.collection && !b.saidAs && !b.excerpt) return 'Indiquez au moins la source dite ou le passage';
  return null;
}

// Référence validée disponible pour cette vidéo ? (fiche vidéo : { available, count })
export async function referencesInfo(talkId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM talk_references r JOIN talks t ON t.id = r.talk_id WHERE r.talk_id = $1 AND r.status = 'approved' AND ${visibleSql('t')}`, [talkId]);
  return { available: rows[0].n > 0, count: rows[0].n };
}

export default async function referenceRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const sourceOf = (t) => t.transcript_language || t.language;

  async function ownedTalk(req, reply, id) {
    const { rows } = await pool.query('SELECT id, organizer_id, title, transcript_status, transcript_language, language FROM talks WHERE id = $1', [id]);
    const t = rows[0];
    if (!t || (!STAFF.has(req.user.role) && t.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) { reply.code(404).send({ error: 'Vidéo introuvable' }); return null; }
    return t;
  }
  async function ownedRef(req, reply, rid) {
    const { rows } = await pool.query('SELECT r.*, t.organizer_id FROM talk_references r JOIN talks t ON t.id = r.talk_id WHERE r.id = $1', [rid]);
    const r = rows[0];
    if (!r || (!STAFF.has(req.user.role) && r.organizer_id !== req.user.sub && !(await viaChannel(req.user, r.talk_id)))) { reply.code(404).send({ error: 'Référence introuvable' }); return null; }
    return r;
  }
  const shapeAll = async (rows) => {
    const refs = rows.map(fromRow);
    const texts = await resolveTexts(refs);
    return refs.map((r) => studioShape(r, texts.get(r.id)));
  };

  // ------------------------------------------------------------------ Public
  app.get('/talks/:id/references', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const info = await referencesInfo(id);
    if (!info.available) return reply.code(404).send({ error: "Cette vidéo n'a pas de références validées" });
    const { rows } = await pool.query(
      `SELECT * FROM talk_references WHERE talk_id = $1 AND status = 'approved' ORDER BY start_ms NULLS LAST, created_at, id`, [id]);
    const refs = rows.map(fromRow);
    const texts = await resolveTexts(refs);
    reply.header('cache-control', 'public, max-age=60');
    return { references: refs.map((r) => publicShape(r, texts.get(r.id))) };
  });

  // ------------------------------------------------------------------ Studio : références d'une vidéo
  app.get('/talks/:id/studio/references', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const [rs, job] = await Promise.all([
      pool.query(`SELECT * FROM talk_references WHERE talk_id = $1 ORDER BY status, start_ms NULLS LAST, created_at, id`, [id]),
      pool.query('SELECT status, produced, dropped, error, updated_at FROM reference_jobs WHERE talk_id = $1', [id]),
    ]);
    const items = await shapeAll(rs.rows);
    const j = job.rows[0];
    return {
      lang: sourceOf(t), transcriptReady: t.transcript_status === 'ready', collections: COLLECTIONS,
      approved: items.filter((x) => x.status === 'approved').length, drafts: items.filter((x) => x.status === 'draft').length,
      job: j ? { status: j.status, produced: j.produced, dropped: j.dropped, error: j.error, updatedAt: j.updated_at } : null,
      references: items,
    };
  });

  // Détection (reprise par le service translator). Les brouillons de l'IA seront remplacés ; les références validées ou saisies à la main restent.
  app.post('/talks/:id/studio/references/detect', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    if (t.transcript_status !== 'ready') return reply.code(409).send({ error: "La transcription n'est pas encore prête", code: 'not_ready' });
    const cur = (await pool.query('SELECT status FROM reference_jobs WHERE talk_id = $1', [id])).rows[0];
    if (cur && ['pending', 'processing'].includes(cur.status)) return reply.code(409).send({ error: 'Une détection est déjà en cours', code: 'busy' });
    await pool.query(
      `INSERT INTO reference_jobs(talk_id, lang, status) VALUES ($1, $2, 'pending')
       ON CONFLICT (talk_id) DO UPDATE SET lang = EXCLUDED.lang, status = 'pending', produced = 0, dropped = 0, error = NULL, attempts = 0, created_at = now(), updated_at = now()`,
      [id, sourceOf(t)]);
    return reply.code(202).send({ ok: true });
  });

  // Ajout à la main (référence connue du relecteur) : arrive en brouillon, à valider.
  app.post('/talks/:id/studio/references', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = refBody.parse(req.body ?? {});
    const t = await ownedTalk(req, reply, id);
    if (!t) return;
    const ayaTo = b.kind === 'quran' ? (b.ayaTo ?? b.ayaFrom) : null;
    const problem = refProblem({ ...b, ayaTo });
    if (problem) return reply.code(400).send({ error: problem });
    const key = refKey({ ...b, ayaTo });
    const [dup] = (await pool.query('SELECT 1 FROM talk_references WHERE talk_id = $1 AND ref_key = $2', [id, key])).rows;
    if (dup) return reply.code(409).send({ error: 'Cette référence existe déjà pour cette vidéo', code: 'exists' });
    const { rows } = await pool.query(
      `INSERT INTO talk_references(talk_id, kind, sura, aya_from, aya_to, collection, number, said_as, ref_key, start_ms, excerpt, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual') RETURNING *`,
      [id, b.kind, b.kind === 'quran' ? b.sura : null, b.kind === 'quran' ? b.ayaFrom : null, ayaTo, b.kind === 'hadith' ? b.collection : '', b.kind === 'hadith' ? b.number : '',
        b.saidAs, key, b.startMs, b.excerpt]);
    // « found » : le texte de la source existe-t-il ? (vérifié à l'ajout)
    const [shaped] = await shapeAll(rows);
    if (shaped.hasText) { await pool.query('UPDATE talk_references SET found = true WHERE id = $1', [shaped.id]); shaped.found = true; }
    return reply.code(201).send(shaped);
  });

  const patchBody = refBody.partial().extend({ status: z.enum(['draft', 'approved', 'rejected']).optional() })
    .refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });
  app.patch('/studio/references/:rid', organizer, async (req, reply) => {
    const { rid } = ridSchema.parse(req.params);
    const b = patchBody.parse(req.body ?? {});
    const cur = await ownedRef(req, reply, rid);
    if (!cur) return;
    const kind = cur.kind; // le type ne change pas : on supprime et on recrée
    const next = {
      kind, sura: b.sura !== undefined ? b.sura : cur.sura, ayaFrom: b.ayaFrom !== undefined ? b.ayaFrom : cur.aya_from,
      ayaTo: b.ayaTo !== undefined ? b.ayaTo : cur.aya_to, collection: b.collection ?? cur.collection, number: b.number ?? cur.number,
      saidAs: b.saidAs ?? cur.said_as, startMs: b.startMs !== undefined ? b.startMs : cur.start_ms, excerpt: b.excerpt ?? cur.excerpt, status: b.status ?? cur.status,
    };
    if (kind === 'quran' && next.ayaTo == null) next.ayaTo = next.ayaFrom;
    const problem = refProblem(next);
    if (problem) return reply.code(400).send({ error: problem });
    const key = refKey(next);
    if (key !== cur.ref_key) {
      const dup = (await pool.query('SELECT 1 FROM talk_references WHERE talk_id = $1 AND ref_key = $2 AND id <> $3', [cur.talk_id, key, rid])).rows.length;
      if (dup) return reply.code(409).send({ error: 'Cette référence existe déjà pour cette vidéo', code: 'exists' });
    }
    const reviewed = next.status !== cur.status;
    const changedRef = key !== cur.ref_key; // la référence a changé : concordance et « trouvé » ne valent plus
    const { rows } = await pool.query(
      `UPDATE talk_references SET sura = $2, aya_from = $3, aya_to = $4, collection = $5, number = $6, said_as = $7, ref_key = $8, start_ms = $9, excerpt = $10, status = $11,
              match = CASE WHEN $12 THEN NULL ELSE match END, found = CASE WHEN $12 THEN false ELSE found END,
              reviewed_by = CASE WHEN $13 THEN $14::uuid ELSE reviewed_by END, reviewed_at = CASE WHEN $13 THEN now() ELSE reviewed_at END, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [rid, kind === 'quran' ? next.sura : null, kind === 'quran' ? next.ayaFrom : null, kind === 'quran' ? next.ayaTo : null, kind === 'hadith' ? next.collection : '',
        kind === 'hadith' ? next.number : '', next.saidAs, key, next.startMs, next.excerpt, next.status, changedRef, reviewed, req.user.sub]);
    const [shaped] = await shapeAll(rows);
    if (changedRef && shaped.hasText) { await pool.query('UPDATE talk_references SET found = true WHERE id = $1', [rid]); shaped.found = true; }
    return shaped;
  });

  app.delete('/studio/references/:rid', organizer, async (req, reply) => {
    const { rid } = ridSchema.parse(req.params);
    if (!(await ownedRef(req, reply, rid))) return;
    await pool.query('DELETE FROM talk_references WHERE id = $1', [rid]);
    return reply.code(204).send();
  });

  // File de relecture : toutes les références à valider (celles de l'organisateur ; toutes pour un modérateur ou un administrateur).
  app.get('/studio/references/review', organizer, async (req) => {
    const { rows } = await pool.query(
      `SELECT r.*, t.title AS talk_title FROM talk_references r JOIN talks t ON t.id = r.talk_id
        WHERE r.status = 'draft' AND ($1::boolean OR t.organizer_id = $2)
        ORDER BY t.title, r.talk_id, r.start_ms NULLS LAST, r.created_at LIMIT 300`, [STAFF.has(req.user.role), req.user.sub]);
    const items = await shapeAll(rows);
    return { references: items.map((x, i) => ({ ...x, talkTitle: rows[i].talk_title })) };
  });
}
