// Catalogue public + gestion des conférences par les organisateurs.
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet, putObject, deleteObject, deletePrefix } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { makePlaybackToken, makePreviewToken } from '../playback.js';
import { hasActiveSubscription } from '../access.js';
import { getNumber } from '../settings.js';
import { TRANSLATION_LANGS, baseLang } from '../langs.js';
import { parseArchiveUrl, resolveArchive, archiveFileUrl, ArchiveError } from '../archive.js';

// Extrait la plateforme et l'identifiant d'une URL YouTube, Vimeo ou archive.org.
export function parseVideoUrl(raw) {
  const ia = parseArchiveUrl(raw);
  if (ia) return ia;
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
  // YouTube / Vimeo : l'organisateur déclare avoir l'accord de l'auteur -> transcription, traductions, résumé, recherche.
  rightsConfirmed: z.boolean().default(false),
  // Étape 10.4 : brouillon ou publication programmée.
  publication: z.enum(['draft', 'scheduled', 'published']).default('published'),
  publishAt: z.string().datetime({ offset: true }).optional(),
});

// Modification d'une conférence existante (tous les champs sont facultatifs).
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  speaker: z.string().trim().max(200),
  categoryId: z.number().int().positive().nullable(),
  access: z.enum(['free', 'premium']),
  publication: z.enum(['draft', 'scheduled', 'published']),
  publishAt: z.string().datetime({ offset: true }).nullable(),
  // 0..2 : une des 3 images tirées de la vidéo ; -1 : miniature de la plateforme d'origine (YouTube, Vimeo, archive.org).
  posterChoice: z.number().int().min(-1).max(2),
}).partial().strict();
const POSTER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const COLS = `t.id, t.title, t.description, t.speaker, t.language, t.access, t.source,
  t.video_ref, t.category_id, c.name AS category, t.created_at,
  t.video_status AS status, t.video_progress AS progress, t.duration_seconds AS "durationSeconds", t.poster_key,
  t.transcript_status AS "transcriptStatus", t.transcript_progress AS "transcriptProgress",
  t.external_thumb, t.rights_confirmed AS "rightsConfirmed", t.external_file,
  t.publication, t.publish_at AS "publishAt", ${visibleSql('t')} AS visible`;
const FROM = 'FROM talks t LEFT JOIN categories c ON c.id = t.category_id';
const SELECT = `SELECT ${COLS} ${FROM}`;

// Remplace poster_key par un lien de miniature temporaire.
async function withPosters(rows) {
  for (const r of rows) {
    r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
    delete r.poster_key;
    delete r.external_thumb;
    delete r.external_file;
    if (r.source === 'upload') delete r.video_ref; // clé de stockage interne
  }
  return rows;
}

// Vérifie la cohérence publication / date ; renvoie { publication, publishAt } ou un message d'erreur.
function checkPublication(publication, publishAt) {
  if (publication !== 'scheduled') return { publication, publishAt: null };
  if (!publishAt) return { error: 'Choisissez la date et l\'heure de publication' };
  if (new Date(publishAt).getTime() <= Date.now() + 30 * 1000) return { error: 'La date de publication doit être dans le futur' };
  return { publication, publishAt };
}

export default async function talksRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  app.get('/categories', async () => (await pool.query('SELECT id, name FROM categories ORDER BY name')).rows);

  app.post('/categories', { preHandler: app.requireRole('admin') }, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    try {
      if ((await pool.query('SELECT 1 FROM categories WHERE lower(name) = lower($1)', [name])).rowCount) return reply.code(409).send({ error: 'Catégorie déjà existante' });
      const { rows } = await pool.query('INSERT INTO categories(name) VALUES ($1) RETURNING id, name', [name]);
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Catégorie déjà existante' });
      throw err;
    }
  });

  // Gestion des catégories (admin) : liste avec nombre de conférences, renommer, supprimer.
  const admin = { preHandler: app.requireRole('admin') };
  const catId = z.object({ id: z.coerce.number().int().positive() });
  const catName = z.object({ name: z.string().trim().min(1).max(60) });

  app.get('/categories/stats', admin, async () => (await pool.query(
    `SELECT c.id, c.name, count(t.id)::int AS count FROM categories c LEFT JOIN talks t ON t.category_id = c.id
     GROUP BY c.id ORDER BY c.name`)).rows);

  app.patch('/categories/:id', admin, async (req, reply) => {
    const { id } = catId.parse(req.params);
    const { name } = catName.parse(req.body);
    const dup = await pool.query('SELECT 1 FROM categories WHERE lower(name) = lower($1) AND id <> $2', [name, id]);
    if (dup.rowCount) return reply.code(409).send({ error: 'Une catégorie porte déjà ce nom' });
    const { rows } = await pool.query('UPDATE categories SET name = $2 WHERE id = $1 RETURNING id, name', [id, name]);
    if (!rows[0]) return reply.code(404).send({ error: 'Catégorie introuvable' });
    return rows[0]; // la recherche se met à jour seule (la signature d'indexation contient le nom)
  });

  // Les conférences de la catégorie supprimée restent en ligne, simplement sans catégorie.
  app.delete('/categories/:id', admin, async (req, reply) => {
    const { id } = catId.parse(req.params);
    const n = (await pool.query('SELECT count(*)::int AS n FROM talks WHERE category_id = $1', [id])).rows[0].n;
    const res = await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    if (!res.rowCount) return reply.code(404).send({ error: 'Catégorie introuvable' });
    return { deleted: id, talksUncategorized: n };
  });

  // Catalogue public avec recherche par mot-clé et filtre par catégorie.
  app.get('/talks', async (req) => {
    const p = listSchema.parse(req.query);
    const { rows } = await pool.query(
      `${SELECT}
       WHERE t.video_status = 'ready' AND ${visibleSql('t')}
         AND ($1::text IS NULL OR t.title ILIKE '%' || $1 || '%' OR t.speaker ILIKE '%' || $1 || '%'
              OR t.description ILIKE '%' || $1 || '%'
              OR t.transcript_text ILIKE '%' || $1 || '%')
         AND ($2::int IS NULL OR t.category_id = $2)
       ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $3 OFFSET $4`,
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
    const owner = await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [id]);
    const isOwner = viewer && (viewer.role === 'admin' || viewer.sub === owner.rows[0].organizer_id);
    // Brouillon ou publication programmée à venir : invisible pour tout le monde sauf le propriétaire et les admins.
    if (!talk.visible && !isOwner) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (viewer) {
      // Favori et position de reprise de l'utilisateur connecté (étape 6).
      talk.favorite = (await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND talk_id = $2', [viewer.sub, id])).rowCount > 0;
      const prog = (await pool.query('SELECT position_ms, completed FROM watch_progress WHERE user_id = $1 AND talk_id = $2', [viewer.sub, id])).rows[0];
      talk.resumeMs = prog && !prog.completed && prog.position_ms >= 5000 ? prog.position_ms : 0;
    }
    // Premium : réservé au propriétaire, aux admins et aux abonnés ; les autres ont l'aperçu (2 min) et le résumé.
    // Même règle pour les vidéos YouTube / Vimeo : transcription, sous-titres traduits et chapitres suivent l'accès.
    const external = talk.source !== 'upload';
    let archiveUrl = null;
    if (talk.source === 'archive') {
      if (!talk.external_file) {
        // Import de collection : le fichier est choisi au premier affichage.
        try {
          const m = await resolveArchive(talk.video_ref);
          await pool.query(
            `UPDATE talks SET external_file = $2, duration_seconds = COALESCE(duration_seconds, $3), external_thumb = COALESCE(external_thumb, $4),
                    description = CASE WHEN description = '' THEN $5 ELSE description END WHERE id = $1`,
            [id, m.file, m.duration, m.thumb, m.description]);
          talk.external_file = m.file;
        } catch (err) {
          if (!(err instanceof ArchiveError)) throw err;
          talk.playerError = err.message;
        }
      }
      if (talk.external_file) archiveUrl = archiveFileUrl(talk.video_ref, talk.external_file);
    }
    const allowed = talk.access === 'free' || isOwner || (viewer && await hasActiveSubscription(viewer.sub));
    if (!allowed) {
      talk.locked = true;
      if (external || talk.status === 'ready') {
        talk.playbackToken = makePreviewToken(id);
        talk.preview = true;
        talk.previewSeconds = await getNumber('preview_seconds');
        if (archiveUrl) talk.fileUrl = archiveUrl; // fichier public sur archive.org : l'aperçu est limité par le lecteur
        if (!external) talk.hlsPath = `/hls/${id}/master.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
      }
    } else {
      // Jeton de lecture : flux HLS (vidéo envoyée), transcription et sous-titres (toutes les sources).
      talk.playbackToken = makePlaybackToken(id);
      const langs = await pool.query('SELECT DISTINCT lang FROM transcript_segments WHERE talk_id = $1 ORDER BY lang', [id]);
      talk.tracks = langs.rows.map((r) => r.lang);
      talk.translating = (await pool.query(
        "SELECT EXISTS (SELECT 1 FROM transcript_translations WHERE talk_id = $1 AND status IN ('pending', 'processing')) AS x", [id]
      )).rows[0].x;
      talk.insightsPending = (await pool.query(
        "SELECT EXISTS (SELECT 1 FROM talk_insights WHERE talk_id = $1 AND status IN ('pending', 'processing')) AS x", [id]
      )).rows[0].x;
      if (archiveUrl) talk.fileUrl = archiveUrl;
      if (!external) {
        if (talk.status === 'ready') talk.hlsPath = `/hls/${id}/master.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
        else if (isOwner) talk.videoUrl = await presignGet(talk.video_ref); // aperçu du fichier d'origine pendant la conversion
      }
    }
    if (!external) delete talk.video_ref;
    await withPosters([talk]);
    return talk;
  });

  app.get('/me/talks', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT ${COLS}, t.transcript_language AS "transcriptLanguage", t.transcript_error AS "transcriptError", t.transcript_method AS "transcriptMethod", t.poster_candidates,
         (SELECT COALESCE(json_agg(json_build_object('lang', tr.lang, 'status', tr.status, 'progress', tr.progress) ORDER BY tr.lang), '[]'::json)
            FROM transcript_translations tr WHERE tr.talk_id = t.id) AS translations,
         (SELECT COALESCE(json_agg(json_build_object('lang', i.lang, 'status', i.status, 'error', i.error) ORDER BY i.lang), '[]'::json)
            FROM talk_insights i WHERE i.talk_id = t.id) AS insights
       ${FROM} WHERE t.organizer_id = $1 ORDER BY t.created_at DESC`,
      [req.user.sub]
    );
    // Les 3 images proposées pour la miniature (vidéos envoyées) et celle qui est choisie.
    for (const r of rows) {
      r.posterChoice = r.poster_candidates.indexOf(r.poster_key);
      r.posterChoices = await Promise.all(r.poster_candidates.map((k) => presignGet(k)));
      delete r.poster_candidates;
    }
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
      if (!video) return reply.code(400).send({ error: 'Lien YouTube, Vimeo ou archive.org non reconnu' });
      const dup = await pool.query('SELECT id FROM talks WHERE source = $1 AND video_ref = $2 LIMIT 1', [video.source, video.ref]);
      if (dup.rows[0]) return reply.code(409).send({ error: 'Cette vidéo est déjà dans le catalogue', code: 'duplicate', id: dup.rows[0].id });
      if (video.source === 'archive') {
        // archive.org : on vérifie tout de suite qu'un fichier vidéo lisible existe (titre, durée, miniature récupérés au passage).
        try {
          video.meta = await resolveArchive(video.ref, video.file);
        } catch (err) {
          if (err instanceof ArchiveError) return reply.code(400).send({ error: err.message, code: 'archive' });
          throw err;
        }
      }
    }
    const pub = checkPublication(b.publication, b.publishAt);
    if (pub.error) return reply.code(400).send({ error: pub.error });
    const transcribable = video.source === 'upload' || b.rightsConfirmed;
    try {
      const m = video.meta || {};
      const { rows } = await pool.query(
        `INSERT INTO talks(organizer_id, title, description, speaker, language, category_id, access, source, video_ref, video_status, transcript_status, rights_confirmed,
                           external_file, external_thumb, duration_seconds, publication, publish_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
        [req.user.sub, b.title, b.description || m.description || '', b.speaker, b.language, b.categoryId ?? null, b.access, video.source, video.ref,
          video.source === 'upload' ? 'pending' : 'ready', transcribable ? 'pending' : 'unavailable', video.source !== 'upload' && b.rightsConfirmed,
          m.file ?? null, m.thumb ?? null, m.duration ?? null, pub.publication, pub.publishAt]
      );
      if (transcribable && b.translateTo.length) {
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

  // Modifie une conférence : informations, accès, publication (brouillon / programmée / publiée) et choix de la miniature.
  app.patch('/talks/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body ?? {});
    const cur = (await pool.query('SELECT organizer_id, source, publication, publish_at, poster_key, poster_candidates FROM talks WHERE id = $1', [id])).rows[0];
    if (!cur || (req.user.role !== 'admin' && cur.organizer_id !== req.user.sub)) return reply.code(404).send({ error: 'Conférence introuvable' });

    const sets = [];
    const vals = [id];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.title !== undefined) set('title', b.title);
    if (b.description !== undefined) set('description', b.description);
    if (b.speaker !== undefined) set('speaker', b.speaker);
    if (b.categoryId !== undefined) set('category_id', b.categoryId);
    if (b.access !== undefined) set('access', b.access);

    if (b.publication !== undefined || b.publishAt !== undefined) {
      const pub = checkPublication(b.publication ?? cur.publication, b.publishAt !== undefined ? b.publishAt : cur.publish_at?.toISOString());
      if (pub.error) return reply.code(400).send({ error: pub.error });
      set('publication', pub.publication);
      set('publish_at', pub.publishAt);
    }

    if (b.posterChoice !== undefined) {
      if (b.posterChoice === -1) {
        if (cur.source === 'upload') return reply.code(400).send({ error: 'Choisissez une des images de la vidéo ou envoyez la vôtre' });
        set('poster_key', null);
      } else {
        const key = cur.poster_candidates[b.posterChoice];
        if (!key) return reply.code(400).send({ error: 'Cette image n\'existe pas' });
        set('poster_key', key);
      }
    }
    if (!sets.length) return reply.code(400).send({ error: 'Rien à modifier' });
    try {
      await pool.query(`UPDATE talks SET ${sets.join(', ')} WHERE id = $1`, vals);
    } catch (err) {
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue' });
      throw err;
    }
    // L'ancienne image envoyée n'est plus utilisée : on la supprime.
    if (b.posterChoice !== undefined && cur.poster_key?.startsWith(`posters/${id}/`)) await deleteObject(cur.poster_key).catch(() => {});
    return { ok: true };
  });

  // Miniature personnalisée : image JPEG / PNG / WebP envoyée en data-URL (le navigateur la réduit avant l'envoi).
  app.post('/talks/:id/poster', { preHandler: app.requireRole('organizer', 'admin'), bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { image } = z.object({ image: z.string().max(3_500_000) }).parse(req.body ?? {});
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Image JPEG, PNG ou WebP attendue' });
    const buf = Buffer.from(m[2], 'base64');
    const magic = (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
      || (m[1] === 'image/png' && buf.subarray(1, 4).toString() === 'PNG')
      || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!magic || buf.length > 2.5 * 1024 * 1024) return reply.code(400).send({ error: 'Image invalide ou trop lourde (2,5 Mo maximum)' });
    const cur = (await pool.query('SELECT organizer_id, poster_key FROM talks WHERE id = $1', [id])).rows[0];
    if (!cur || (req.user.role !== 'admin' && cur.organizer_id !== req.user.sub)) return reply.code(404).send({ error: 'Conférence introuvable' });
    const key = `posters/${id}/custom-${Date.now()}.${POSTER_TYPES[m[1]]}`;
    await putObject(key, buf, m[1]);
    await pool.query('UPDATE talks SET poster_key = $2 WHERE id = $1', [id, key]);
    if (cur.poster_key?.startsWith(`posters/${id}/`)) await deleteObject(cur.poster_key).catch(() => {});
    return reply.code(201).send({ posterUrl: await presignGet(key) });
  });

  // Ajoute une langue de sous-titres à une conférence (ou relance une traduction échouée).
  const trParams = z.object({ id: z.string().uuid(), lang: z.enum(TRANSLATION_LANGS) });
  async function ownedUpload(req, reply, id) {
    const { rows } = await pool.query('SELECT organizer_id, source, language, transcript_language, rights_confirmed FROM talks WHERE id = $1', [id]);
    const talk = rows[0];
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub)) {
      reply.code(404).send({ error: 'Conférence introuvable' });
      return null;
    }
    if (talk.source !== 'upload' && !talk.rights_confirmed) {
      reply.code(400).send({ error: "Activez d'abord la transcription de cette vidéo (accord de l'auteur)", code: 'rights_required' });
      return null;
    }
    return talk;
  }

  // Active (ou relance) la transcription d'une conférence. YouTube / Vimeo : accord de l'auteur obligatoire.
  app.post('/talks/:id/transcribe', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rightsConfirmed } = z.object({ rightsConfirmed: z.boolean().optional() }).parse(req.body ?? {});
    const { rows } = await pool.query('SELECT organizer_id, source, transcript_status FROM talks WHERE id = $1', [id]);
    const talk = rows[0];
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub)) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (talk.source !== 'upload' && rightsConfirmed !== true) {
      return reply.code(400).send({ error: "Confirmez avoir l'accord de l'auteur pour transcrire cette vidéo", code: 'rights_required' });
    }
    if (['processing', 'ready'].includes(talk.transcript_status)) return reply.code(409).send({ error: 'Transcription déjà faite ou en cours' });
    await pool.query(
      `UPDATE talks SET transcript_status = 'pending', transcript_error = NULL, transcript_attempts = 0, transcript_progress = 0,
              rights_confirmed = rights_confirmed OR $2 WHERE id = $1`,
      [id, talk.source !== 'upload']
    );
    return reply.code(202).send({ status: 'pending' });
  });

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
    await deletePrefix(`posters/${rows[0].id}/`).catch(() => {});
    if (rows[0].source === 'upload') {
      await deleteObject(rows[0].video_ref).catch(() => {});
      await deletePrefix(`hls/${rows[0].id}/`).catch(() => {});
      await pool.query('DELETE FROM uploads WHERE object_key = $1', [rows[0].video_ref]);
    }
    return reply.code(204).send();
  });
}
