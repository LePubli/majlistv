// Module « Doublage français », étape D3c — plusieurs intervenants par conférence.
// Le service de transcription écoute la voix de chaque phrase française et les regroupe par intervenant (dub_speakers, dub_phrase_speakers).
// Ici : demande de détection, réglage d'un intervenant (nom, voix, hauteur), correction d'une phrase, propositions de voix, gel des voix dans
// la demande de doublage, tâches de Studio → Activité.
import { z } from 'zod';
import { pool } from '../../db.js';
import { checkVoices, getVoice, listVoices } from './lib.js';

const idSchema = z.object({ id: z.string().uuid() });
const SPK_COLS = `n, label, seconds::float AS seconds, phrases, f0::float AS f0, guess, base_voice AS "baseVoice", target_voice AS "targetVoice", pitch::float AS pitch`;
export const MAX_SPEAKERS = 10;

export async function loadSpeakers(talkId) {
  return (await pool.query(`SELECT ${SPK_COLS} FROM dub_speakers WHERE talk_id = $1 ORDER BY n`, [talkId])).rows;
}

export async function speakerJob(talkId) {
  return (await pool.query(
    `SELECT status, progress, error, found, max_speakers AS "maxSpeakers", cancel_requested AS "cancelRequested", updated_at AS "updatedAt"
       FROM dub_speaker_jobs WHERE talk_id = $1`, [talkId])).rows[0] || null;
}

// Voix effective d'un intervenant. Aucune voix choisie (ni de base ni cible) : il garde les voix de la conférence.
// Dès qu'une voix de base OU cible est choisie, il a SA voix : la voix de base manquante est celle de la conférence,
// la voix cible manquante est « aucune » (sinon tous les intervenants seraient convertis vers la même personne).
export function resolveSpeaker(eff, s) {
  const own = Boolean(s && (s.baseVoice || s.targetVoice));
  return {
    baseVoice: (own && s.baseVoice) || eff.baseVoice,
    targetVoice: own ? (s.targetVoice || null) : eff.targetVoice,
    pitch: s && s.pitch != null ? Number(s.pitch) : Number(eff.pitch ?? 0),
    own,
  };
}

// Réglages figés dans la demande de doublage : une entrée par intervenant. Renvoie { speakers } ou { error, code }.
export async function freezeSpeakers(talkId, eff) {
  const list = await loadSpeakers(talkId);
  const out = [];
  for (const s of list) {
    const r = resolveSpeaker(eff, s);
    const base = r.baseVoice ? await getVoice(r.baseVoice) : null;
    const target = r.targetVoice ? await getVoice(r.targetVoice) : null;
    const name = s.label || `Intervenant ${s.n}`;
    if (!base || !base.active || base.kind !== 'base') return { error: `${name} : voix de base inconnue ou désactivée`, code: 'speaker_voice' };
    if (r.targetVoice && (!target || !target.active || target.kind !== 'target')) return { error: `${name} : voix cible inconnue ou désactivée`, code: 'speaker_voice' };
    out.push({ n: s.n, label: name, base: { id: base.id, name: base.name, model: base.model, speaker: base.speaker },
      target: target ? { id: target.id, name: target.name, sampleKey: target.sample_key } : null, pitch: r.pitch });
  }
  return { speakers: out };
}

// Temps de parole à doubler (phrases non gardées) de chaque intervenant ; les phrases sans intervenant comptent pour l'intervenant 1.
export async function speechBySpeaker(talkId, keptSql, segsFrom) {
  const { rows } = await pool.query(
    `SELECT COALESCE(ps.speaker, 1) AS n, COALESCE(sum(GREATEST(s.end_ms - s.start_ms, 0)), 0)::bigint AS ms
       FROM ${segsFrom} LEFT JOIN dub_phrase_speakers ps ON ps.talk_id = s.talk_id AND ps.idx = s.idx
      WHERE s.talk_id = $1 AND s.lang = 'fr' AND NOT ${keptSql} GROUP BY 1`, [talkId]);
  return new Map(rows.map((r) => [r.n, Number(r.ms) / 1000]));
}

// Annulation : en attente → tout de suite ; en cours → le service s'arrête au prochain point de contrôle.
async function cancelIn(talkId) {
  const now = await pool.query(`UPDATE dub_speaker_jobs SET status = 'canceled', progress = 0, updated_at = now() WHERE talk_id = $1 AND status = 'pending' RETURNING 1`, [talkId]);
  if (now.rowCount) return true;
  const run = await pool.query(`UPDATE dub_speaker_jobs SET cancel_requested = true, updated_at = now() WHERE talk_id = $1 AND status = 'processing' RETURNING 1`, [talkId]);
  return run.rowCount > 0;
}
export async function cancelTask(out, { queue, ref }) {
  if (queue === 'speakers') out.done = await cancelIn(ref);
}

// Studio → Activité : demandes de détection en attente, en cours, ou en échec depuis moins de 30 jours.
export async function collectTasks(out, { organizerId }) {
  const { rows } = await pool.query(
    `SELECT j.talk_id, j.status, j.progress, j.error, j.created_at, j.cancel_requested, t.title
       FROM dub_speaker_jobs j JOIN talks t ON t.id = j.talk_id
      WHERE (j.status IN ('pending', 'processing') OR (j.status = 'failed' AND j.updated_at > now() - interval '30 days'))
        AND ($1::uuid IS NULL OR t.organizer_id = $1)`, [organizerId]);
  for (const r of rows) {
    out.push({ queue: 'speakers', ref: r.talk_id, talkId: r.talk_id, title: r.title || '',
      status: r.status === 'processing' ? 'running' : r.status === 'failed' ? 'failed' : 'waiting',
      progress: r.status === 'processing' ? r.progress : null, error: r.error, createdAt: r.created_at, light: false,
      canCancel: !r.cancel_requested, canceling: r.cancel_requested, link: `/studio/dubbing/${r.talk_id}` });
  }
}

// Totaux (temps de parole, nombre de phrases) de chaque intervenant, recalculés après une correction manuelle.
export async function refreshTotals(id) {
  await pool.query(
    `UPDATE dub_speakers d SET seconds = COALESCE(x.s, 0), phrases = COALESCE(x.c, 0)
       FROM (SELECT d2.n, sum(GREATEST(s.end_ms - s.start_ms, 0)) / 1000.0 AS s, count(s.idx) AS c
               FROM dub_speakers d2 LEFT JOIN dub_phrase_speakers ps ON ps.talk_id = d2.talk_id AND ps.speaker = d2.n
               LEFT JOIN transcript_segments s ON s.talk_id = ps.talk_id AND s.idx = ps.idx AND s.lang = 'fr'
              WHERE d2.talk_id = $1 GROUP BY d2.n) x
      WHERE d.talk_id = $1 AND d.n = x.n`, [id]);
}

export default function speakerRoutes(app, { admin }) {
  const n = z.coerce.number().int().min(1).max(MAX_SPEAKERS);

  // Lancer la détection (remplace les intervenants et les corrections manuelles de cette conférence).
  app.post('/studio/dubbing/talks/:id/speakers/detect', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { maxSpeakers } = z.object({ maxSpeakers: z.number().int().min(2).max(MAX_SPEAKERS).default(6) }).strict().parse(req.body ?? {});
    const t = (await pool.query('SELECT source FROM talks WHERE id = $1', [id])).rows[0];
    if (!t) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (t.source !== 'upload') return reply.code(400).send({ error: 'Seules les vidéos envoyées sur le site peuvent être écoutées pour détecter les intervenants (les vidéos YouTube, Vimeo et archive.org ne sont pas chez nous).', code: 'external' });
    if (!(await pool.query("SELECT 1 FROM transcript_segments WHERE talk_id = $1 AND lang = 'fr' LIMIT 1", [id])).rowCount) {
      return reply.code(400).send({ error: 'Pas de texte français : demandez d’abord la traduction en français', code: 'no_french' });
    }
    const r = await pool.query(
      `INSERT INTO dub_speaker_jobs(talk_id, status, progress, max_speakers, error, attempts, cancel_requested, found, created_by, created_at, updated_at)
       VALUES ($1, 'pending', 0, $2, NULL, 0, false, NULL, $3, now(), now())
       ON CONFLICT (talk_id) DO UPDATE SET status = 'pending', progress = 0, max_speakers = EXCLUDED.max_speakers, error = NULL, attempts = 0,
         cancel_requested = false, found = NULL, created_by = EXCLUDED.created_by, created_at = now(), updated_at = now()
       WHERE dub_speaker_jobs.status <> 'processing' RETURNING 1`, [id, maxSpeakers, req.user.sub]);
    if (!r.rowCount) return reply.code(409).send({ error: 'Une détection est déjà en cours pour cette conférence', code: 'already_running' });
    req.auditSummary = `Doublage : détection des intervenants demandée (${id})`;
    return reply.code(201).send({ job: await speakerJob(id) });
  });

  app.post('/studio/dubbing/talks/:id/speakers/cancel', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if (!(await cancelIn(id))) return reply.code(409).send({ error: 'Aucune détection à annuler', code: 'not_cancelable' });
    return { job: await speakerJob(id) };
  });

  // Revenir à une seule voix : efface les intervenants, les attributions de phrases et la demande.
  app.delete('/studio/dubbing/talks/:id/speakers', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    if ((await speakerJob(id))?.status === 'processing') return reply.code(409).send({ error: 'Une détection est en cours : annulez-la d’abord', code: 'running' });
    await pool.query('DELETE FROM dub_phrase_speakers WHERE talk_id = $1', [id]);
    await pool.query('DELETE FROM dub_speakers WHERE talk_id = $1', [id]);
    await pool.query('DELETE FROM dub_speaker_jobs WHERE talk_id = $1', [id]);
    req.auditSummary = `Doublage : intervenants effacés (${id})`;
    return { speakers: [], job: null };
  });

  // Nom, voix et hauteur d'un intervenant. null = revenir aux réglages de la conférence.
  app.put('/studio/dubbing/talks/:id/speakers/:n', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const num = n.parse(req.params.n);
    const b = z.object({
      label: z.string().trim().min(1, 'Nom vide').max(40).optional(),
      baseVoice: z.string().uuid().nullable().optional(), targetVoice: z.string().uuid().nullable().optional(),
      pitch: z.number().min(-4, 'Hauteur : -4 demi-tons minimum').max(4, 'Hauteur : 4 demi-tons maximum').multipleOf(0.5, 'Hauteur : par pas de 0,5 demi-ton').nullable().optional(),
    }).strict().parse(req.body ?? {});
    if (!(await pool.query('SELECT 1 FROM dub_speakers WHERE talk_id = $1 AND n = $2', [id, num])).rowCount) return reply.code(404).send({ error: 'Intervenant introuvable' });
    const bad = await checkVoices({ baseVoice: b.baseVoice, targetVoice: b.targetVoice });
    if (bad) return reply.code(400).send({ error: bad });
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    await pool.query(
      `UPDATE dub_speakers SET label = CASE WHEN $3 THEN $4 ELSE label END, base_voice = CASE WHEN $5 THEN $6 ELSE base_voice END,
              target_voice = CASE WHEN $7 THEN $8 ELSE target_voice END, pitch = CASE WHEN $9 THEN $10 ELSE pitch END
        WHERE talk_id = $1 AND n = $2`,
      [id, num, has('label'), b.label ?? null, has('baseVoice'), b.baseVoice ?? null, has('targetVoice'), b.targetVoice ?? null, has('pitch'), b.pitch ?? null]);
    return { speakers: await loadSpeakers(id) };
  });

  // Corriger une plage de phrases (de idx « from » à idx « to » compris) : elles passent à l'intervenant choisi.
  app.post('/studio/dubbing/talks/:id/speakers/assign', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ from: z.number().int().min(0), to: z.number().int().min(0), speaker: z.number().int().min(1).max(MAX_SPEAKERS) }).strict().parse(req.body ?? {});
    if (b.to < b.from) return reply.code(400).send({ error: 'La plage est à l’envers' });
    if (!(await pool.query('SELECT 1 FROM dub_speakers WHERE talk_id = $1 AND n = $2', [id, b.speaker])).rowCount) return reply.code(404).send({ error: 'Intervenant introuvable' });
    const r = await pool.query(
      `INSERT INTO dub_phrase_speakers(talk_id, idx, speaker, manual)
       SELECT talk_id, idx, $4, true FROM transcript_segments WHERE talk_id = $1 AND lang = 'fr' AND idx BETWEEN $2 AND $3
       ON CONFLICT (talk_id, idx) DO UPDATE SET speaker = EXCLUDED.speaker, manual = true`, [id, b.from, b.to, b.speaker]);
    await refreshTotals(id);
    return { changed: r.rowCount, speakers: await loadSpeakers(id) };
  });

  // Proposer une voix de la catégorie suggérée à chaque intervenant qui n'a pas encore choisi sa voix.
  // On ne touche à aucune voix déjà choisie. Un intervenant dont la catégorie est « homme » garde les voix de la conférence.
  app.post('/studio/dubbing/talks/:id/speakers/suggest', admin, async (req) => {
    const { id } = idSchema.parse(req.params);
    const list = await loadSpeakers(id);
    const voices = (await listVoices()).filter((v) => v.kind === 'target' && v.active && v.hasSample);
    const used = new Set(list.map((s) => s.targetVoice).filter(Boolean));
    const done = []; const missing = [];
    for (const s of list) {
      if (s.baseVoice || s.targetVoice || !s.guess || s.guess === 'male') continue;
      const pick = voices.find((v) => v.gender === s.guess && !used.has(v.id)) || voices.find((v) => v.gender === s.guess);
      if (!pick) { missing.push({ n: s.n, category: s.guess }); continue; }
      used.add(pick.id);
      await pool.query('UPDATE dub_speakers SET target_voice = $3 WHERE talk_id = $1 AND n = $2', [id, s.n, pick.id]);
      done.push({ n: s.n, voice: pick.name });
    }
    return { done, missing, speakers: await loadSpeakers(id) };
  });
}
