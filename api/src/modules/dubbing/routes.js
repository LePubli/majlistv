// Module « Doublage français » — routes du Studio (administrateurs seulement à l'étape S1).
import { z } from 'zod';
import { pool } from '../../db.js';
import { storage, presignPut, presignGet, headObject, deleteObject } from '../../storage.js';
import {
  PARAMS, PRESETS, BUILTIN, paramsSchema, listVoices, getVoice, checkVoices, getDefaults, getTalkParams, effective, estimate, coefficients,
} from './lib.js';

const idSchema = z.object({ id: z.string().uuid() });
const AUDIO_TYPES = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac' };
const GENDERS = ['', 'male', 'female', 'child'];
const PIPER_MODEL = /^[a-z]{2,3}_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$/;
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ').refine((s) => !Number.isNaN(Date.parse(s)), 'Date invalide');

// Le moteur de doublage (service dubbing/) n'existe pas encore : il arrive à l'étape D1a. Aucun bouton ne fait semblant.
const ENGINE = { ready: false, step: 'D1a' };

export default async function routes(app, ctx) {
  const admin = { preHandler: app.requireRole('admin') };
  const maxBytes = async () => Math.max(1, Number(await ctx.setting('sample_max_mb')) || 15) * 1024 * 1024;

  async function speech(talkId) {
    const r = await pool.query(
      `SELECT count(*)::int AS n, COALESCE(sum(GREATEST(end_ms - start_ms, 0)) FILTER (WHERE left(ltrim(text), 1) <> '#'), 0)::bigint AS ms,
              count(*) FILTER (WHERE left(ltrim(text), 1) = '#')::int AS kept
       FROM transcript_segments WHERE talk_id = $1 AND lang = 'fr'`, [talkId]);
    return { phrases: r.rows[0].n, speechSeconds: Number(r.rows[0].ms) / 1000, kept: r.rows[0].kept };
  }

  async function state() {
    const voices = await listVoices();
    const defaults = await getDefaults();
    return { engine: ENGINE, params: PARAMS, presets: PRESETS, builtin: BUILTIN, defaults: effective(defaults, null, voices), voices, coefs: await coefficients(ctx), maxSampleMb: (await maxBytes()) / 1048576 };
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
    const voices = await listVoices(); const defaults = await getDefaults(); const coefs = await coefficients(ctx);
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, COALESCE(t.transcript_language, t.language) AS lang, t.duration_seconds AS "durationSeconds",
              COALESCE(s.n, 0)::int AS phrases, COALESCE(s.ms, 0)::bigint AS ms, d.params AS override
       FROM talks t
       LEFT JOIN (SELECT talk_id, count(*) AS n, sum(GREATEST(end_ms - start_ms, 0)) FILTER (WHERE left(ltrim(text), 1) <> '#') AS ms
                  FROM transcript_segments WHERE lang = 'fr' GROUP BY talk_id) s ON s.talk_id = t.id
       LEFT JOIN dub_talk_settings d ON d.talk_id = t.id
       WHERE COALESCE(t.transcript_language, t.language) NOT LIKE 'fr%'
         AND ($1 = '' OR t.title ILIKE '%' || $1 || '%' OR t.speaker ILIKE '%' || $1 || '%')
       ORDER BY (COALESCE(s.n, 0) > 0) DESC, t.created_at DESC LIMIT 300`, [q]);
    return {
      talks: rows.map(({ ms, override, ...r }) => {
        const eff = effective(defaults, override, voices);
        return { ...r, hasOverride: Boolean(override && Object.keys(override).length), estimate: estimate(eff, Number(ms) / 1000, coefs) };
      }),
    };
  });

  async function talkDetail(id) {
    const t = (await pool.query(
      `SELECT id, title, speaker, language, transcript_language AS "transcriptLanguage", duration_seconds AS "durationSeconds" FROM talks WHERE id = $1`, [id])).rows[0];
    if (!t) return null;
    const voices = await listVoices(); const override = await getTalkParams(id);
    const eff = effective(await getDefaults(), override, voices);
    const sp = await speech(id);
    const segs = (await pool.query(
      `SELECT idx, start_ms AS "startMs", end_ms AS "endMs", text FROM transcript_segments WHERE talk_id = $1 AND lang = 'fr' ORDER BY idx LIMIT 3000`, [id])).rows;
    return { talk: t, override: override || {}, effective: eff, estimate: estimate(eff, sp.speechSeconds, await coefficients(ctx)), phrases: sp.phrases, kept: sp.kept, segments: segs, engine: ENGINE };
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
