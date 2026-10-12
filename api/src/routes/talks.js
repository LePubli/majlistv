// Catalogue public + gestion des conférences par les organisateurs.
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet, deleteObject, deletePrefix } from '../storage.js';
import { makePlaybackToken, makePreviewToken } from '../playback.js';
import { hasActiveSubscription } from '../access.js';
import { getNumber } from '../settings.js';
import { TRANSLATION_LANGS, baseLang } from '../langs.js';

// Extrait la plateforme et l'identifiant d'une URL YouTube ou Vimeo.
export function parseVideoUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  const yt = /^[\w-]{11}$/;
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return yt.test(id) ? { source: 'youtube', ref: id } : null;
  }
  if (host === 'youtube.com') {
    const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/);
    const id = m ? m[1] : u.searchParams.get('v');
    return id && yt.test(id) ? { source: 'youtube', ref: id } : null;
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/^\/(\d+)/);
    return m ? { source: 'vimeo', ref: m[1] } : null;
  }
  return null;
}

const listSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
const idSchema = z.object({ id: z.string().uuid() });
const talkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  speaker: z.string().trim().max(200).default(''),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('fr'),
  categoryId: z.number().int().positive().optional(),
  access: z.enum(['free', 'premium']).default('free'),
  videoUrl: z.string().url().max(500).optional(),
  uploadId: z.string().uuid().optional(),
  // Langues des sous-titres à générer automatiquement (vidéos envoyées uniquement).
  translateTo: z.array(z.enum(TRANSLATION_LANGS)).max(TRANSLATION_LANGS.length).default([]),
});

const COLS = `t.id, t.title, t.description, t.speaker, t.language, t.access, t.source,
  t.video_ref, t.category_id, c.name AS category, t.created_at,
  t.video_status AS status, t.video_progress AS progress, t.duration_seconds AS "durationSeconds", t.poster_key,
  t.transcript_status AS "transcriptStatus", t.transcript_progress AS "transcriptProgress"`;
const FROM = 'FROM talks t LEFT JOIN categories c ON c.id = t.category_id';
const SELECT = `SELECT ${COLS} ${FROM}`;

// Remplace poster_key par un lien de miniature temporaire.
async function withPosters(rows) {
  for (const r of rows) {
    r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : null;
    delete r.poster_key;
    if (r.source === 'upload') delete r.video_ref; // clé de stockage interne
  }
  return rows;
}

export default async function talksRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  app.get('/categories', async () => (await pool.query('SELECT id, name FROM categories ORDER BY name')).rows);

  app.post('/categories', { preHandler: app.requireRole('admin') }, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    try {
      const { rows } = await pool.query('INSERT INTO categories(name) VALUES ($1) RETURNING id, name', [name]);
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Catégorie déjà existante' });
      throw err;
    }
  });

  // Catalogue public avec recherche par mot-clé et filtre par catégorie.
  app.get('/talks', async (req) => {
    const p = listSchema.parse(req.query);
    const { rows } = await pool.query(
      `${SELECT}
       WHERE t.video_status = 'ready'
         AND ($1::text IS NULL OR t.title ILIKE '%' || $1 || '%' OR t.speaker ILIKE '%' || $1 || '%'
              OR t.description ILIKE '%' || $1 || '%'
              OR t.transcript_text ILIKE '%' || $1 || '%')
         AND ($2::int IS NULL OR t.category_id = $2)
       ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
      [p.q ?? null, p.category ?? null, p.limit, p.offset]
    );
    return withPosters(rows);
  });

  app.get('/talks/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(`${SELECT} WHERE t.id = $1`, [id]);
    const talk = rows[0];
    if (!talk) return reply.code(404).send({ error: 'Conférence introuvable' });
    const viewer = await app.optionalUser(req); // visiteur anonyme : null
    if (viewer) {
      // Favori et position de reprise de l'utilisateur connecté (étape 6).
      talk.favorite = (await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND talk_id = $2', [viewer.sub, id])).rowCount > 0;
      const prog = (await pool.query('SELECT position_ms, completed FROM watch_progress WHERE user_id = $1 AND talk_id = $2', [viewer.sub, id])).rows[0];
      talk.resumeMs = prog && !prog.completed && prog.position_ms >= 5000 ? prog.position_ms : 0;
    }
    if (talk.source === 'upload') {
      // Premium : réservé au propriétaire, aux admins et aux abonnés ; les autres ont l'aperçu.
      const owner = await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [id]);
      const isOwner = viewer && (viewer.role === 'admin' || viewer.sub === owner.rows[0].organizer_id);
      const allowed = talk.access === 'free' || isOwner || (viewer && await hasActiveSubscription(viewer.sub));
      if (!allowed) {
        // Premium sans abonnement : aperçu gratuit du début de la vidéo, jamais le fichier complet.
        talk.locked = true;
        if (talk.status === 'ready') {
          talk.playbackToken = makePreviewToken(id);
          talk.preview = true;
          talk.previewSeconds = await getNumber('preview_seconds');
          talk.hlsPath = `/hls/${id}/master.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
        }
      } else {
        // Jeton de lecture : flux HLS, transcription et sous-titres.
        talk.playbackToken = makePlaybackToken(id);
        const langs = await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [id]);
        talk.tracks = langs.rows.map((r) => r.lang);
        talk.translating = (await pool.query(
          "SELECT EXISTS (SELECT 1 FROM transcript_translations WHERE talk_id = $1 AND status IN ('pending', 'processing')) AS x", [id]
        )).rows[0].x;
        talk.insightsPending = (await pool.query(
          "SELECT EXISTS (SELECT 1 FROM talk_insights WHERE talk_id = $1 AND status IN ('pending', 'processing')) AS x", [id]
        )).rows[0].x;
        if (talk.status === 'ready') talk.hlsPath = `/hls/${id}/master.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
        else if (isOwner) talk.videoUrl = await presignGet(talk.video_ref); // aperçu du fichier d'origine pendant la conversion
      }
      delete talk.video_ref;
    }
    await withPosters([talk]);
    return talk;
  });

  app.get('/me/talks', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT ${COLS}, t.transcript_language AS "transcriptLanguage",
         (SELECT COALESCE(json_agg(json_build_object('lang', tr.lang, 'status', tr.status, 'progress', tr.progress) ORDER BY tr.lang), '[]'::json)
            FROM transcript_translations tr WHERE tr.talk_id = t.id) AS translations,
         (SELECT COALESCE(json_agg(json_build_object('lang', i.lang, 'status', i.status, 'error', i.error) ORDER BY i.lang), '[]'::json)
            FROM talk_insights i WHERE i.talk_id = t.id) AS insights
       ${FROM} WHERE t.organizer_id = $1 ORDER BY t.created_at DESC`,
      [req.user.sub]
    );
    return withPosters(rows);
  });

  app.post('/talks', organizer, async (req, reply) => {
    const b = talkSchema.parse(req.body);
    let video;
    if (b.uploadId) {
      // Vidéo envoyée : doit appartenir à l'organisateur, être terminée et pas déjà utilisée.
      const up = await pool.query(
        `SELECT object_key FROM uploads u WHERE u.id = $1 AND u.organizer_id = $2 AND u.status = 'completed'
         AND NOT EXISTS (SELECT 1 FROM talks t WHERE t.video_ref = u.object_key)`,
        [b.uploadId, req.user.sub]
      );
      if (!up.rows[0]) return reply.code(400).send({ error: 'Upload introuvable ou déjà utilisé' });
      video = { source: 'upload', ref: up.rows[0].object_key };
    } else {
      video = b.videoUrl ? parseVideoUrl(b.videoUrl) : null;
      if (!video) return reply.code(400).send({ error: 'Lien YouTube ou Vimeo non reconnu' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO talks(organizer_id, title, description, speaker, language, category_id, access, source, video_ref, video_status, transcript_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [req.user.sub, b.title, b.description, b.speaker, b.language, b.categoryId ?? null, b.access, video.source, video.ref,
          video.source === 'upload' ? 'pending' : 'ready', video.source === 'upload' ? 'pending' : 'unavailable']
      );
      if (video.source === 'upload' && b.translateTo.length) {
        const langs = [...new Set(b.translateTo)].filter((l) => l !== baseLang(b.language));
        if (langs.length) {
          await pool.query('INSERT INTO transcript_translations(talk_id, lang) SELECT $1, unnest($2::text[])', [rows[0].id, langs]);
        }
      }
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue' });
      throw err;
    }
  });

  // Ajoute une langue de sous-titres à une conférence (ou relance une traduction échouée).
  const trParams = z.object({ id: z.string().uuid(), lang: z.enum(TRANSLATION_LANGS) });
  async function ownedUpload(req, reply, id) {
    const { rows } = await pool.query('SELECT organizer_id, source, language, transcript_language FROM talks WHERE id = $1', [id]);
    const talk = rows[0];
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub)) {
      reply.code(404).send({ error: 'Conférence introuvable' });
      return null;
    }
    if (talk.source !== 'upload') {
      reply.code(400).send({ error: 'Les traductions concernent seulement les vidéos envoyées' });
      return null;
    }
    return talk;
  }

  app.post('/talks/:id/translations', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { lang } = z.object({ lang: z.enum(TRANSLATION_LANGS) }).parse(req.body);
    const talk = await ownedUpload(req, reply, id);
    if (!talk) return;
    if (lang === baseLang(talk.transcript_language || talk.language)) {
      return reply.code(400).send({ error: 'Cette langue est celle de la conférence' });
    }
    await pool.query(
      `INSERT INTO transcript_translations(talk_id, lang) VALUES ($1, $2)
       ON CONFLICT (talk_id, lang) DO UPDATE
         SET status = 'pending', progress = 0, error = NULL, attempts = 0, updated_at = now()
         WHERE transcript_translations.status = 'failed'`,
      [id, lang]
    );
    return reply.code(202).send({ lang, status: 'pending' });
  });

  // Supprime une traduction (jamais la langue d'origine).
  app.delete('/talks/:id/translations/:lang', organizer, async (req, reply) => {
    const { id, lang } = trParams.parse(req.params);
    const talk = await ownedUpload(req, reply, id);
    if (!talk) return;
    if (lang === baseLang(talk.transcript_language || talk.language)) {
      return reply.code(400).send({ error: "La langue d'origine ne peut pas être supprimée" });
    }
    await pool.query('DELETE FROM transcript_translations WHERE talk_id = $1 AND lang = $2', [id, lang]);
    await pool.query('DELETE FROM transcript_segments WHERE talk_id = $1 AND lang = $2', [id, lang]);
    return reply.code(204).send();
  });

  // Relance la génération du résumé et des chapitres (langue d'origine puis traductions).
  app.post('/talks/:id/insights/regenerate', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const talk = await ownedUpload(req, reply, id);
    if (!talk) return;
    await pool.query(
      "UPDATE talk_insights SET status = 'pending', error = NULL, attempts = 0, updated_at = now() WHERE talk_id = $1 AND status IN ('ready', 'failed')",
      [id]
    );
    return reply.code(202).send({ status: 'pending' });
  });

  // Un organisateur supprime ses conférences ; un admin peut supprimer toutes les conférences.
  app.delete('/talks/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const admin = req.user.role === 'admin';
    const { rows } = await pool.query(
      'DELETE FROM talks WHERE id = $1 AND ($3 OR organizer_id = $2) RETURNING id, source, video_ref',
      [id, req.user.sub, admin]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (rows[0].source === 'upload') {
      await deleteObject(rows[0].video_ref).catch(() => {});
      await deletePrefix(`hls/${rows[0].id}/`).catch(() => {});
      await pool.query('DELETE FROM uploads WHERE object_key = $1', [rows[0].video_ref]);
    }
    return reply.code(204).send();
  });
}
