// Module « Doublage français » — routes du Studio (administrateurs seulement à l'étape S1).
import { z } from 'zod';
import { pool } from '../../db.js';
import { storage, presignPut, presignGet, headObject, deleteObject } from '../../storage.js';
import {
  PARAMS, PRESETS, BUILTIN, paramsSchema, listVoices, getVoice, checkVoices, getDefaults, getTalkParams, effective, estimate, coefficients,
  measuredRtf, engineState,
} from './lib.js';
import { compile as compileGlossary, apply as applyGlossary } from './glossary.js';
import * as ext from '../../ext.js';

const idSchema = z.object({ id: z.string().uuid() });
// Étape D1b : une phrase est gardée en voix d'origine si elle est marquée dans le Studio (dub_segments) ou commence par « # ».
export const KEPT = `(COALESCE(f.keep_original, false) OR left(ltrim(s.text), 1) = '#')`;
export const SEGS_FROM = `transcript_segments s LEFT JOIN dub_segments f ON f.talk_id = s.talk_id AND f.idx = s.idx`;
// Empreinte du texte relu (texte + marquages) : calculée en SQL pour pouvoir la comparer aussi dans la liste des conférences.
export const TEXT_HASH = `md5(string_agg(s.idx::text || chr(31) || s.text || chr(31) || (${KEPT})::text, chr(30) ORDER BY s.idx))`;
const AUDIO_TYPES = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac' };
const GENDERS = ['', 'male', 'female', 'child'];
const PIPER_MODEL = /^[a-z]{2,3}_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$/;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ').refine((s) => !Number.isNaN(Date.parse(s)), 'Date invalide');

// Travail tel que montré au Studio : sans les clés internes des fichiers ni de l'échantillon de voix.
const JOB_COLS = `id, talk_id AS "talkId", kind, status, cancel_requested AS "cancelRequested", params, phase, progress, attempts, error, result,
  created_at AS "createdAt", started_at AS "startedAt", finished_at AS "finishedAt"`;
function publicJob(j) {
  if (!j) return null;
  const { params = {}, result, ...rest } = j;
  const { target, ...p } = params;
  const r = result ? { ...result } : null;
  if (r) { r.hasMix = Boolean(r.mixKey); r.hasVoice = Boolean(r.voiceKey); delete r.mixKey; delete r.voiceKey; }
  return { ...rest, params: { ...p, target: target ? { id: target.id, name: target.name } : null }, result: r };
}

export default async function routes(app, ctx) {
  const admin = { preHandler: app.requireRole('admin') };
  const maxBytes = async () => Math.max(1, Number(await ctx.setting('mod_dubbing_sample_max_mb')) || 15) * 1024 * 1024;

  async function speech(talkId) {
    const r = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(sum(GREATEST(s.end_ms - s.start_ms, 0)) FILTER (WHERE NOT ${KEPT}), 0)::bigint AS ms,
              count(*) FILTER (WHERE ${KEPT})::int AS kept
       FROM ${SEGS_FROM} WHERE s.talk_id = $1 AND s.lang = 'fr'`, [talkId]);
    return { phrases: r.rows[0].n, speechSeconds: Number(r.rows[0].ms) / 1000, kept: r.rows[0].kept };
  }

  async function state() {
    const voices = await listVoices();
    const defaults = await getDefaults();
    return { engine: await engineState(), params: PARAMS, presets: PRESETS, builtin: BUILTIN, defaults: effective(defaults, null, voices), voices, coefs: await coefficients(ctx), maxSampleMb: (await maxBytes()) / 1048576 };
  }

  app.get('/studio/dubbing/state', admin, async () => state());

  // Réglages par défaut (tout le site) : remplacés par les valeurs envoyées.
  app.put('/studio/dubbing/defaults', admin, async (req, reply) => {
    const { params } = z.object({ params: paramsSchema }).strict().parse(req.body ?? {});
    const bad = await checkVoices(params);
    if (bad) return reply.code(400).send({ error: bad });
    await pool.query('UPDATE dub_defaults SET params = $1, updated_by = $2, updated_at = now() WHERE id = 1', [params, req.user.sub]);
    return state();
  });

  // --- Bibliothèque de voix ---
  app.get('/studio/dubbing/voices', admin, async (req) => {
    const { all } = z.object({ all: z.enum(['0', '1']).optional() }).parse(req.query ?? {});
    return { voices: await listVoices({ all: all === '1' }) };
  });

  // Échantillon d'une voix cible : 1) lien d'envoi direct navigateur → stockage ; 2) création de la voix (vérifie le fichier et le consentement).
  app.post('/studio/dubbing/voices/upload-url', admin, async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré', code: 'storage_off' });
    const { contentType, size } = z.object({ contentType: z.string(), size: z.number().int().positive().optional() }).parse(req.body ?? {});
    const ext = AUDIO_TYPES[contentType.toLowerCase()];
    if (!ext) return reply.code(400).send({ error: 'Format audio non accepté (wav, mp3, m4a, ogg, webm, flac)', code: 'bad_type' });
    const max = await maxBytes();
    if (size && size > max) return reply.code(400).send({ error: `Fichier trop lourd (${Math.round(max / 1048576)} Mo maximum)`, code: 'too_big' });
    const key = `dubbing/voices/${crypto.randomUUID()}.${ext}`;
    return { key, url: await presignPut(key, contentType.toLowerCase()), maxBytes: max };
  });

  const common = { name: z.string().trim().min(1).max(80), gender: z.enum(GENDERS).default(''), license: z.string().trim().max(200).default(''), notes: z.string().trim().max(1000).default('') };
  const createSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('base'), ...common, model: z.string().regex(PIPER_MODEL, 'Nom de modèle Piper attendu (ex. fr_FR-tom-medium)'), speaker: z.number().int().min(0).max(999).nullable().default(null) }).strict(),
    z.object({ kind: z.literal('target'), ...common, sampleKey: z.string().max(200), consentDate: isoDay, consentBy: z.string().trim().min(2).max(120), consentConfirmed: z.boolean() }).strict(),
  ]);

  app.post('/studio/dubbing/voices', admin, async (req, reply) => {
    const b = createSchema.parse(req.body ?? {});
    if (b.kind === 'base') {
      const r = await pool.query(
        `INSERT INTO dub_voices(kind, name, model, speaker, gender, license, notes, created_by) VALUES ('base', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [b.name, b.model, b.speaker, b.gender, b.license, b.notes, req.user.sub]);
      return reply.code(201).send(await getVoice(r.rows[0].id).then(({ sample_key: _k, ...v }) => v));
    }
    if (!b.consentConfirmed) return reply.code(400).send({ error: 'Cochez la case de consentement : la personne doit avoir accepté que sa voix soit utilisée', code: 'consent_required' });
    if (b.consentDate > new Date().toISOString().slice(0, 10)) return reply.code(400).send({ error: 'La date du consentement ne peut pas être dans le futur', code: 'consent_future' });
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré', code: 'storage_off' });
    if (!/^dubbing\/voices\/[0-9a-f-]{36}\.(wav|mp3|m4a|ogg|webm|flac)$/.test(b.sampleKey)) return reply.code(400).send({ error: 'Fichier inattendu' });
    let size;
    try { size = Number((await headObject(b.sampleKey)).ContentLength); } catch { return reply.code(400).send({ error: "L'échantillon n'a pas été reçu : recommencez l'envoi", code: 'missing' }); }
    const max = await maxBytes();
    if (size > max) { await deleteObject(b.sampleKey).catch(() => {}); return reply.code(400).send({ error: `Fichier trop lourd (${Math.round(max / 1048576)} Mo maximum)`, code: 'too_big' }); }
    const r = await pool.query(
      `INSERT INTO dub_voices(kind, name, engine, gender, license, notes, sample_key, sample_bytes, consent_date, consent_by, consent_recorded_by, consent_recorded_at, created_by)
       VALUES ('target', $1, 'chatterbox-vc', $2, $3, $4, $5, $6, $7, $8, $9, now(), $9) RETURNING id`,
      [b.name, b.gender, b.license, b.notes, b.sampleKey, size, b.consentDate, b.consentBy, req.user.sub]);
    const { sample_key: _k, ...v } = await getVoice(r.rows[0].id);
    return reply.code(201).send(v);
  });

  app.patch('/studio/dubbing/voices/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = z.object({ name: common.name.optional(), gender: z.enum(GENDERS).optional(), license: z.string().trim().max(200).optional(), notes: z.string().trim().max(1000).optional(), active: z.boolean().optional() }).strict().parse(req.body ?? {});
    const v = await getVoice(id);
    if (!v) return reply.code(404).send({ error: 'Voix introuvable' });
    if (b.active === false && v.kind === 'base' && v.active) {
      const n = (await pool.query("SELECT count(*)::int AS n FROM dub_voices WHERE kind = 'base' AND active")).rows[0].n;
      if (n <= 1) return reply.code(409).send({ error: 'Il faut garder au moins une voix de base active', code: 'last_base' });
    }
    const sets = []; const vals = [id];
    for (const [k, col] of [['name', 'name'], ['gender', 'gender'], ['license', 'license'], ['notes', 'notes'], ['active', 'active']]) {
      if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${col} = $${vals.length}`); }
    }
    if (sets.length) await pool.query(`UPDATE dub_voices SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
    const { sample_key: _k, ...out } = await getVoice(id);
    return out;
  });

  // « Supprimer » = désactiver : la voix disparaît des listes, l'échantillon et la trace du consentement sont conservés.
  app.delete('/studio/dubbing/voices/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const v = await getVoice(id);
    if (!v) return reply.code(404).send({ error: 'Voix introuvable' });
    if (v.kind === 'base' && v.active && (await pool.query("SELECT count(*)::int AS n FROM dub_voices WHERE kind = 'base' AND active")).rows[0].n <= 1) {
      return reply.code(409).send({ error: 'Il faut garder au moins une voix de base active', code: 'last_base' });
    }
    await pool.query('UPDATE dub_voices SET active = false, updated_at = now() WHERE id = $1', [id]);
    return reply.code(204).send();
  });

  app.get('/studio/dubbing/voices/:id/sample', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const v = await getVoice(id);
    if (!v || !v.sample_key) return reply.code(404).send({ error: 'Pas d’échantillon pour cette voix' });
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré', code: 'storage_off' });
    return { url: await presignGet(v.sample_key) };
  });

  // --- Conférences ---
  app.get('/studio/dubbing/talks', admin, async (req) => {
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query ?? {});
    const voices = await listVoices(); const defaults = await getDefaults(); const coefs = await coefficients(ctx); const measured = await measuredRtf();
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, COALESCE(t.transcript_language, t.language) AS lang, t.duration_seconds AS "durationSeconds",
              COALESCE(s.n, 0)::int AS phrases, COALESCE(s.ms, 0)::bigint AS ms, d.params AS override,
              (tr.talk_id IS NOT NULL) AS "hasTrack", (rv.talk_id IS NOT NULL AND rv.text_hash = s.h) AS "reviewed",
              (SELECT count(*) FROM dub_requests r WHERE r.talk_id = t.id)::int AS requests,
              (SELECT json_build_object('kind', j.kind, 'status', j.status, 'progress', j.progress) FROM dub_jobs j
                WHERE j.talk_id = t.id AND j.status IN ('queued', 'running') ORDER BY j.created_at LIMIT 1) AS "activeJob"
       FROM talks t
       LEFT JOIN dub_tracks tr ON tr.talk_id = t.id
       LEFT JOIN dub_reviews rv ON rv.talk_id = t.id
       LEFT JOIN (SELECT s.talk_id, count(*) AS n, sum(GREATEST(s.end_ms - s.start_ms, 0)) FILTER (WHERE NOT ${KEPT}) AS ms, ${TEXT_HASH} AS h
                  FROM ${SEGS_FROM} WHERE s.lang = 'fr' GROUP BY s.talk_id) s ON s.talk_id = t.id
       LEFT JOIN dub_talk_settings d ON d.talk_id = t.id
       WHERE COALESCE(t.transcript_language, t.language) NOT LIKE 'fr%'
         AND ($1 = '' OR t.title ILIKE '%' || $1 || '%' OR t.speaker ILIKE '%' || $1 || '%')
       ORDER BY (COALESCE(s.n, 0) > 0) DESC, requests DESC, t.created_at DESC LIMIT 300`, [q]);
    return {
      talks: rows.map(({ ms, override, ...r }) => {
        const eff = effective(defaults, override, voices);
        return { ...r, hasOverride: Boolean(override && Object.keys(override).length), estimate: estimate(eff, Number(ms) / 1000, coefs, measured) };
      }),
    };
  });

  // --- Étape D1b : relecture, marquage, glossaire ---
  const requireReview = async () => !['false', '0', 'off', 'no'].includes(String(await ctx.setting('mod_dubbing_require_review') ?? 'true').toLowerCase());
  async function textHash(id) {
    const { rows } = await pool.query(`SELECT ${TEXT_HASH} AS h FROM ${SEGS_FROM} WHERE s.talk_id = $1 AND s.lang = 'fr'`, [id]);
    return rows[0]?.h || '';
  }
  // Relecture : validée et toujours à jour (le texte et les marquages n'ont pas changé depuis).
  async function reviewState(id) {
    const r = (await pool.query(
      `SELECT rv.text_hash, rv.reviewed_at AS "reviewedAt", u.name AS "reviewedBy" FROM dub_reviews rv LEFT JOIN users u ON u.id = rv.reviewed_by WHERE rv.talk_id = $1`, [id])).rows[0];
    if (!r) return { validated: false, stale: false };
    const stale = r.text_hash !== await textHash(id);
    return { validated: !stale, stale, reviewedAt: r.reviewedAt, reviewedBy: r.reviewedBy };
  }
  const GL_COLS = `id, term, say, whole_word AS "wholeWord", case_sensitive AS "caseSensitive", notes, active, created_at AS "createdAt"`;
  async function glossaryRows(activeOnly = false) {
    return (await pool.query(`SELECT ${GL_COLS}, whole_word, case_sensitive FROM dub_glossary ${activeOnly ? 'WHERE active' : ''} ORDER BY lower(term)`)).rows;
  }

  async function talkDetail(id) {
    const t = (await pool.query(
      `SELECT id, title, speaker, source, language, transcript_language AS "transcriptLanguage", duration_seconds AS "durationSeconds" FROM talks WHERE id = $1`, [id])).rows[0];
    if (!t) return null;
    const voices = await listVoices(); const override = await getTalkParams(id);
    const eff = effective(await getDefaults(), override, voices);
    const sp = await speech(id);
    const gl = compileGlossary(await glossaryRows(true));
    const segs = (await pool.query(
      `SELECT s.idx, s.start_ms AS "startMs", s.end_ms AS "endMs", s.text, ${KEPT} AS keep, COALESCE(f.accepted, false) AS accepted
       FROM ${SEGS_FROM} WHERE s.talk_id = $1 AND s.lang = 'fr' ORDER BY s.idx LIMIT 3000`, [id])).rows
      .map((x) => ({ ...x, say: x.keep ? [] : applyGlossary(x.text, gl).hits }));
    const jobs = (await pool.query(`SELECT ${JOB_COLS} FROM dub_jobs WHERE talk_id = $1 ORDER BY created_at DESC LIMIT 10`, [id])).rows.map(publicJob);
    const track = (await pool.query(`SELECT job_id AS "jobId", (mix_key IS NOT NULL) AS "hasMix", duration_s::float AS "durationS", created_at AS "createdAt" FROM dub_tracks WHERE talk_id = $1`, [id])).rows[0] || null;
    // État de chaque phrase : celui du dernier doublage complet réussi, sinon de la dernière écoute de 60 s.
    const lastDone = jobs.find((j) => j.status === 'done' && j.kind === 'full') || jobs.find((j) => j.status === 'done' && j.kind === 'preview') || null;
    return {
      talk: t, override: override || {}, effective: eff, estimate: estimate(eff, sp.speechSeconds, await coefficients(ctx), await measuredRtf()),
      phrases: sp.phrases, kept: sp.kept, segments: segs, engine: await engineState(), jobs, track,
      requests: (await pool.query('SELECT count(*)::int AS n FROM dub_requests WHERE talk_id = $1', [id])).rows[0].n,
      review: await reviewState(id), glossaryCount: gl.length, requireReview: await requireReview(),
      report: lastDone ? { jobId: lastDone.id, kind: lastDone.kind, segments: lastDone.result?.segments || [] } : null,
    };
  }

  app.get('/studio/dubbing/talks/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const d = await talkDetail(id);
    if (!d) return reply.code(404).send({ error: 'Conférence introuvable' });
    return d;
  });

  // Réglages propres à une conférence : seulement les valeurs qui diffèrent des réglages par défaut ; null = revenir aux réglages par défaut.
  app.put('/studio/dubbing/talks/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { params } = z.object({ params: paramsSchema.nullable() }).strict().parse(req.body ?? {});
    if (!(await pool.query('SELECT 1 FROM talks WHERE id = $1', [id])).rowCount) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (params === null || !Object.keys(params).length) await pool.query('DELETE FROM dub_talk_settings WHERE talk_id = $1', [id]);
    else {
      const bad = await checkVoices(params);
      if (bad) return reply.code(400).send({ error: bad });
      await pool.query(
        `INSERT INTO dub_talk_settings(talk_id, params, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (talk_id) DO UPDATE SET params = EXCLUDED.params, updated_by = EXCLUDED.updated_by, updated_at = now()`, [id, params, req.user.sub]);
    }
    return talkDetail(id);
  });

  // Corriger une phrase française (corrige aussi les sous-titres français), la garder en voix d'origine, ou l'accepter au contrôle qualité.
  app.patch('/studio/dubbing/talks/:id/segments/:idx', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const idx = z.coerce.number().int().min(0).parse(req.params.idx);
    const b = z.object({ text: z.string().trim().min(1, 'Texte vide').max(2000).optional(), keepOriginal: z.boolean().optional(), accepted: z.boolean().optional() })
      .strict().parse(req.body ?? {});
    const seg = (await pool.query("SELECT text FROM transcript_segments WHERE talk_id = $1 AND lang = 'fr' AND idx = $2", [id, idx])).rows[0];
    if (!seg) return reply.code(404).send({ error: 'Phrase introuvable' });
    if (b.text !== undefined && b.text !== seg.text) {
      await pool.query("UPDATE transcript_segments SET text = $3 WHERE talk_id = $1 AND lang = 'fr' AND idx = $2", [id, idx, b.text]);
      // Le texte change : une acceptation « à revoir » ne vaut plus.
      await pool.query('UPDATE dub_segments SET accepted = false WHERE talk_id = $1 AND idx = $2', [id, idx]);
    }
    if (b.keepOriginal !== undefined || b.accepted !== undefined) {
      await pool.query(
        `INSERT INTO dub_segments(talk_id, idx, keep_original, accepted, updated_by) VALUES ($1, $2, COALESCE($3, false), COALESCE($4, false), $5)
         ON CONFLICT (talk_id, idx) DO UPDATE SET keep_original = COALESCE($3, dub_segments.keep_original), accepted = COALESCE($4, dub_segments.accepted),
           updated_by = EXCLUDED.updated_by, updated_at = now()`, [id, idx, b.keepOriginal ?? null, b.accepted ?? null, req.user.sub]);
    }
    // Ancienne convention « # » : retirer la case « voix d'origine » retire aussi le « # » du texte.
    if (b.keepOriginal === false && /^\s*#/.test(b.text ?? seg.text)) {
      await pool.query("UPDATE transcript_segments SET text = regexp_replace(text, '^\\s*#\\s*', '') WHERE talk_id = $1 AND lang = 'fr' AND idx = $2", [id, idx]);
    }
    const gl = compileGlossary(await glossaryRows(true));
    const row = (await pool.query(
      `SELECT s.idx, s.start_ms AS "startMs", s.end_ms AS "endMs", s.text, ${KEPT} AS keep, COALESCE(f.accepted, false) AS accepted
       FROM ${SEGS_FROM} WHERE s.talk_id = $1 AND s.lang = 'fr' AND s.idx = $2`, [id, idx])).rows[0];
    return { segment: { ...row, say: row.keep ? [] : applyGlossary(row.text, gl).hits }, review: await reviewState(id), ...(await speech(id)) };
  });

  // Valider (ou annuler) la relecture du texte français.
  app.post('/studio/dubbing/talks/:id/review', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { validated } = z.object({ validated: z.boolean() }).strict().parse(req.body ?? {});
    const sp = await speech(id);
    if (validated && !sp.phrases) return reply.code(400).send({ error: 'Pas de texte français à relire', code: 'no_french' });
    if (validated) {
      await pool.query(
        `INSERT INTO dub_reviews(talk_id, text_hash, reviewed_by) VALUES ($1, $2, $3)
         ON CONFLICT (talk_id) DO UPDATE SET text_hash = EXCLUDED.text_hash, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = now()`, [id, await textHash(id), req.user.sub]);
    } else await pool.query('DELETE FROM dub_reviews WHERE talk_id = $1', [id]);
    return { review: await reviewState(id) };
  });

  // Glossaire de prononciation (un seul pour tout le site).
  const glSchema = z.object({
    term: z.string().trim().min(1, 'Terme vide').max(80), say: z.string().trim().min(1, 'Prononciation vide').max(160),
    wholeWord: z.boolean().optional(), caseSensitive: z.boolean().optional(), notes: z.string().trim().max(300).optional(), active: z.boolean().optional(),
  }).strict();
  const pubGl = ({ whole_word: _w, case_sensitive: _c, ...r }) => r;
  app.get('/studio/dubbing/glossary', admin, async (req) => {
    const { q, text } = z.object({ q: z.string().trim().max(80).default(''), text: z.string().max(2000).optional() }).parse(req.query ?? {});
    const all = await glossaryRows();
    const needle = q.toLowerCase();
    const out = { entries: all.filter((e) => !needle || e.term.toLowerCase().includes(needle) || e.say.toLowerCase().includes(needle)).map(pubGl) };
    if (text !== undefined) out.preview = applyGlossary(text, compileGlossary(all)); // essai : « ce que la voix va lire »
    return out;
  });
  app.post('/studio/dubbing/glossary', admin, async (req, reply) => {
    const b = glSchema.parse(req.body ?? {});
    try {
      const r = await pool.query(
        `INSERT INTO dub_glossary(term, say, whole_word, case_sensitive, notes, active, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${GL_COLS}`,
        [b.term, b.say, b.wholeWord ?? true, b.caseSensitive ?? false, b.notes ?? '', b.active ?? true, req.user.sub]);
      return reply.code(201).send(r.rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Ce terme est déjà dans le glossaire', code: 'duplicate' });
      throw err;
    }
  });
  app.patch('/studio/dubbing/glossary/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = glSchema.partial().parse(req.body ?? {});
    const map = { term: 'term', say: 'say', wholeWord: 'whole_word', caseSensitive: 'case_sensitive', notes: 'notes', active: 'active' };
    const sets = []; const vals = [id];
    for (const [k, col] of Object.entries(map)) if (b[k] !== undefined) { vals.push(b[k]); sets.push(`${col} = $${vals.length}`); }
    try {
      const r = await pool.query(`UPDATE dub_glossary SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $1 RETURNING ${GL_COLS}`, vals);
      if (!r.rowCount) return reply.code(404).send({ error: 'Terme introuvable' });
      return r.rows[0];
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Ce terme est déjà dans le glossaire', code: 'duplicate' });
      throw err;
    }
  });
  app.delete('/studio/dubbing/glossary/:id', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const r = await pool.query('DELETE FROM dub_glossary WHERE id = $1', [id]);
    return r.rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Terme introuvable' });
  });

  // --- Demandes de doublage (file d'attente du service dubbing/) ---
  // kind = « preview » (écoute de 60 s, lancée dès que le service est libre) ou « full » (toute la conférence, la nuit par défaut).
  app.post('/studio/dubbing/talks/:id/jobs', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { kind } = z.object({ kind: z.enum(['preview', 'full']) }).strict().parse(req.body ?? {});
    const t = (await pool.query('SELECT id FROM talks WHERE id = $1', [id])).rows[0];
    if (!t) return reply.code(404).send({ error: 'Conférence introuvable' });
    const sp = await speech(id);
    if (!sp.phrases) return reply.code(400).send({ error: "Pas de texte français pour cette conférence : demandez d'abord la traduction en français", code: 'no_french' });
    if (!sp.speechSeconds) return reply.code(400).send({ error: 'Toutes les phrases sont gardées en voix d’origine : rien à doubler', code: 'nothing_to_dub' });
    if (kind === 'full' && await requireReview() && !(await reviewState(id)).validated) {
      return reply.code(409).send({ error: 'Validez d’abord la relecture du texte français (Réglages → Relecture de la traduction)', code: 'review_required' });
    }
    const voices = await listVoices();
    const eff = effective(await getDefaults(), await getTalkParams(id), voices);
    const base = eff.baseVoice ? await getVoice(eff.baseVoice) : null;
    if (!base) return reply.code(400).send({ error: 'Aucune voix de base active', code: 'no_base_voice' });
    const target = eff.targetVoice ? await getVoice(eff.targetVoice) : null;
    const previewSeconds = Math.min(180, Math.max(15, Number(await ctx.setting('mod_dubbing_preview_seconds')) || 60));
    const params = {
      ...eff, previewSeconds,
      base: { id: base.id, name: base.name, model: base.model, speaker: base.speaker },
      target: target ? { id: target.id, name: target.name, sampleKey: target.sample_key } : null,
    };
    try {
      const r = await pool.query(`INSERT INTO dub_jobs(talk_id, kind, params, created_by) VALUES ($1, $2, $3, $4) RETURNING ${JOB_COLS}`, [id, kind, params, req.user.sub]);
      return reply.code(201).send(publicJob(r.rows[0]));
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: kind === 'full' ? 'Un doublage de cette conférence est déjà en attente ou en cours' : 'Une écoute de 60 secondes est déjà en attente ou en cours', code: 'already_queued' });
      throw err;
    }
  });

  app.get('/studio/dubbing/jobs', admin, async (req) => {
    const { active } = z.object({ active: z.enum(['0', '1']).default('1') }).parse(req.query ?? {});
    const { rows } = await pool.query(
      `SELECT j.*, t.title FROM (SELECT ${JOB_COLS} FROM dub_jobs WHERE ($1 = '0' OR status IN ('queued', 'running'))) j
       JOIN talks t ON t.id = j."talkId" ORDER BY (j.status = 'running') DESC, j."createdAt" LIMIT 50`, [active]);
    return { jobs: rows.map((r) => ({ ...publicJob(r), title: r.title })), engine: await engineState() };
  });

  // Annuler : une demande en attente est annulée tout de suite ; un travail en cours s'arrête au prochain bloc.
  app.post('/studio/dubbing/jobs/:id/cancel', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const j = (await pool.query('SELECT status FROM dub_jobs WHERE id = $1', [id])).rows[0];
    if (!j) return reply.code(404).send({ error: 'Demande introuvable' });
    if (j.status === 'queued') await pool.query(`UPDATE dub_jobs SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = $1`, [id]);
    else if (j.status === 'running') await pool.query('UPDATE dub_jobs SET cancel_requested = true, updated_at = now() WHERE id = $1', [id]);
    else return reply.code(409).send({ error: 'Cette demande est déjà terminée', code: 'finished' });
    return publicJob((await pool.query(`SELECT ${JOB_COLS} FROM dub_jobs WHERE id = $1`, [id])).rows[0]);
  });

  // Écouter le résultat : lien temporaire vers la voix française seule (« voice ») ou le mélange avec la voix d'origine (« mix »).
  app.get('/studio/dubbing/jobs/:id/audio', admin, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { which } = z.object({ which: z.enum(['mix', 'voice']).default('mix') }).parse(req.query ?? {});
    const j = (await pool.query("SELECT result FROM dub_jobs WHERE id = $1 AND status = 'done'", [id])).rows[0];
    const key = j?.result?.[which === 'mix' ? 'mixKey' : 'voiceKey'] || (which === 'mix' ? j?.result?.voiceKey : null);
    if (!key) return reply.code(404).send({ error: 'Pas de fichier audio pour cette demande' });
    if (!storage) return reply.code(503).send({ error: 'Stockage non configuré', code: 'storage_off' });
    // Étape S2 : fichier envoyé aux archives (module « Stockage et archivage ») → on propose de le restaurer.
    const arch = await ext.call('archive.lookup', null, key);
    if (arch) return reply.code(409).send({ error: 'Ce fichier est dans les archives', code: 'archived', archiveId: arch.id, status: arch.status });
    return { url: await presignGet(key) };
  });

  // --- Langue d'écoute (analytique) ---
  app.get('/studio/dubbing/listening', admin, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query ?? {});
    const totals = (await pool.query(
      `SELECT audio_lang AS "audioLang", sum(seconds)::bigint AS seconds FROM dub_listen WHERE day > (now() AT TIME ZONE 'utc')::date - $1::int GROUP BY audio_lang`, [days])).rows;
    const talks = (await pool.query(
      `SELECT t.id, t.title, sum(l.seconds) FILTER (WHERE l.audio_lang = 'orig')::bigint AS orig, sum(l.seconds) FILTER (WHERE l.audio_lang = 'fr')::bigint AS fr
       FROM dub_listen l JOIN talks t ON t.id = l.talk_id WHERE l.day > (now() AT TIME ZONE 'utc')::date - $1::int
       GROUP BY t.id, t.title ORDER BY sum(l.seconds) DESC LIMIT 20`, [days])).rows;
    const n = (x) => Number(x || 0);
    return {
      days,
      totals: { orig: n(totals.find((r) => r.audioLang === 'orig')?.seconds), fr: n(totals.find((r) => r.audioLang === 'fr')?.seconds) },
      talks: talks.map((r) => ({ id: r.id, title: r.title, orig: n(r.orig), fr: n(r.fr) })),
    };
  });
}
