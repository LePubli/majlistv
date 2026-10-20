// Catalogue public + gestion des conférences par les organisateurs.
import { talkThemes } from '../themes.js';
import * as ext from '../ext.js'; // étape M3a : quiz, mise en pratique et Kids sont fournis par leurs modules s'ils sont présents
import { speakerNames, speakerSlug } from '../speakers.js';
import { inCategorySql, adultSql, BANDS, MAX_EXTRA_CATEGORIES } from '../taxonomy.js';
import { timeState } from '../kidsControl.js';
import { z } from 'zod';
import { pool } from '../db.js';
import { presignGet, putObject, deleteObject, deletePrefix } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { makePlaybackToken, makePreviewToken } from '../playback.js';
import { hasActiveSubscription } from '../access.js';
import { getNumber } from '../settings.js';
import { TRANSLATION_LANGS, baseLang } from '../langs.js';
import { parseArchiveUrl, resolveArchive, archiveFileUrl, ArchiveError } from '../archive.js';
import { viaChannel, managedSpeakers } from '../channelAccess.js';

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
  format: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(), // étape B : slug d'un format (page /catalogue?format=…)
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  speaker: z.string().max(120).regex(/^[a-z0-9-]+$/).optional(), // slug d'un intervenant (page /intervenants/…)
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
  formatId: z.number().int().positive().optional(), // étape B : format (conférence, cours…) ; par défaut « conférence »
  extraCategoryIds: z.array(z.number().int().positive()).max(MAX_EXTRA_CATEGORIES).default([]), // catégories supplémentaires (2 au plus)
  kidsBands: z.array(z.enum(BANDS)).max(9).default([]), // Mejliss Kids : tranches d'âge (vide = pas pour les enfants)
  showAdults: z.boolean().optional(), // visible dans le catalogue adultes (par défaut : oui, sauf conférence Kids)
  access: z.enum(['free', 'premium']).default('free'),
  // Niveau de difficulté (étape 24.1) : vide = tous niveaux.
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
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
  formatId: z.number().int().positive().nullable(),
  access: z.enum(['free', 'premium']),
  level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
  extraCategoryIds: z.array(z.number().int().positive()).max(MAX_EXTRA_CATEGORIES),
  kidsBands: z.array(z.enum(BANDS)).max(9), // Mejliss Kids : tranches d'âge (liste vide = pas pour les enfants)
  showAdults: z.boolean(), // visible dans le catalogue adultes
  publication: z.enum(['draft', 'scheduled', 'published']),
  publishAt: z.string().datetime({ offset: true }).nullable(),
  // 0..2 : une des 3 images tirées de la vidéo ; -1 : miniature de la plateforme d'origine (YouTube, Vimeo, archive.org).
  posterChoice: z.number().int().min(-1).max(2),
  featured: z.boolean(), // mise en avant sur l'accueil : réservé aux administrateurs
}).partial().strict();
const POSTER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const COLS = `t.id, t.title, t.description, t.speaker, t.language, t.access, t.source,
  t.video_ref, t.category_id, c.name AS category, t.format_id AS "formatId", (SELECT slug FROM formats WHERE id = t.format_id) AS format, t.created_at, t.level, t.kids_bands AS "kidsBands", t.show_adults AS "showAdults",
  COALESCE((SELECT array_agg(tc.category_id ORDER BY tc.category_id) FROM talk_categories tc WHERE tc.talk_id = t.id), '{}') AS "extraCategoryIds",
  t.audio_status, t.video_status AS status, t.video_progress AS progress, t.duration_seconds AS "durationSeconds", t.poster_key,
  t.transcript_status AS "transcriptStatus", t.transcript_progress AS "transcriptProgress",
  t.external_thumb, t.rights_confirmed AS "rightsConfirmed", t.external_file,
  t.publication, t.publish_at AS "publishAt", t.featured, t.review_status AS "reviewStatus", t.review_note AS "reviewNote", ${visibleSql('t')} AS visible`;
const FROM = 'FROM talks t LEFT JOIN category_names c ON c.id = t.category_id';
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

// Tranches d'âge dans l'ordre 3-6, 7-10, 11-14, sans doublon.
const cleanBands = (l) => BANDS.filter((b) => (l || []).includes(b));
// Catégories supplémentaires : sans doublon, sans la catégorie principale.
const cleanExtras = (extras, principal) => [...new Set(extras || [])].filter((x) => x !== principal).slice(0, MAX_EXTRA_CATEGORIES);
async function saveExtras(db, talkId, ids) {
  await db.query('DELETE FROM talk_categories WHERE talk_id = $1', [talkId]);
  if (ids.length) await db.query('INSERT INTO talk_categories(talk_id, category_id) SELECT $1, unnest($2::int[])', [talkId, ids]);
}

// Vérifie la cohérence publication / date ; renvoie { publication, publishAt } ou un message d'erreur.
function checkPublication(publication, publishAt) {
  if (publication !== 'scheduled') return { publication, publishAt: null };
  if (!publishAt) return { error: 'Choisissez la date et l\'heure de publication' };
  if (new Date(publishAt).getTime() <= Date.now() + 30 * 1000) return { error: 'La date de publication doit être dans le futur' };
  return { publication, publishAt };
}

// Modification en lot (étape 27.1) : mêmes règles que PATCH /talks/:id, appliquées à plusieurs conférences d'un coup.
const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  bandsMode: z.enum(['replace', 'add', 'remove']).default('replace'), // façon de modifier les tranches Kids
  changes: z.object({
    categoryId: z.number().int().positive().nullable(),
    formatId: z.number().int().positive().nullable(),
    extraCategoryIds: z.array(z.number().int().positive()).max(MAX_EXTRA_CATEGORIES),
    access: z.enum(['free', 'premium']),
    level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
    kidsBands: z.array(z.enum(BANDS)).max(9),
    showAdults: z.boolean(),
    publication: z.enum(['draft', 'published']),
    speaker: z.string().trim().max(200),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  }).partial().strict(),
});

export default async function talksRoutes(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };

  // Liste des catégories dans l'ordre de l'arbre : chaque catégorie principale suivie de ses sous-catégories.
  const TREE = `SELECT c.id, c.name, c.parent_id AS "parentId", n.name AS "fullName", (c.parent_id IS NOT NULL)::int AS depth
                  FROM categories c JOIN category_names n ON n.id = c.id LEFT JOIN categories p ON p.id = c.parent_id`;
  const TREE_ORDER = 'ORDER BY lower(COALESCE(p.name, c.name)), (c.parent_id IS NOT NULL), lower(c.name)';
  app.get('/categories', async () => (await pool.query(`${TREE} ${TREE_ORDER}`)).rows);

  // Sous-catégories sur deux niveaux : le parent doit exister et être lui-même une catégorie principale.
  async function checkParent(parentId, selfId = null) {
    if (parentId == null) return null;
    if (selfId != null && parentId === selfId) return 'Une catégorie ne peut pas être sa propre catégorie parente';
    const p = (await pool.query('SELECT parent_id FROM categories WHERE id = $1', [parentId])).rows[0];
    if (!p) return 'Catégorie parente introuvable';
    if (p.parent_id != null) return 'Une sous-catégorie ne peut pas avoir de sous-catégorie (deux niveaux au maximum)';
    return null;
  }
  const dupName = async (name, parentId, selfId = null) => (await pool.query(
    `SELECT 1 FROM categories WHERE lower(name) = lower($1) AND parent_id IS NOT DISTINCT FROM $2::int AND ($3::int IS NULL OR id <> $3)`, [name, parentId, selfId])).rowCount > 0;

  app.post('/categories', { preHandler: app.requireRole('admin') }, async (req, reply) => {
    const { name, parentId } = z.object({ name: z.string().trim().min(1).max(60), parentId: z.number().int().positive().nullable().optional() }).parse(req.body);
    const bad = await checkParent(parentId ?? null);
    if (bad) return reply.code(400).send({ error: bad });
    try {
      if (await dupName(name, parentId ?? null)) return reply.code(409).send({ error: parentId ? 'Cette catégorie a déjà une sous-catégorie de ce nom' : 'Catégorie déjà existante' });
      const { rows } = await pool.query('INSERT INTO categories(name, parent_id) VALUES ($1, $2) RETURNING id, name, parent_id AS "parentId"', [name, parentId ?? null]);
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Catégorie déjà existante' });
      throw err;
    }
  });

  // Gestion des catégories (admin) : liste avec nombre de conférences, renommer / déplacer, supprimer.
  const admin = { preHandler: app.requireRole('admin') };
  const catId = z.object({ id: z.coerce.number().int().positive() });
  const catPatch = z.object({ name: z.string().trim().min(1).max(60), parentId: z.number().int().positive().nullable() }).partial().refine((x) => Object.keys(x).length > 0);

  // « count » : conférences dont c'est la catégorie principale ; « total » : principale ou supplémentaire, sous-catégories comprises.
  app.get('/categories/stats', admin, async () => (await pool.query(
    `SELECT c.id, c.name, c.parent_id AS "parentId", n.name AS "fullName", (c.parent_id IS NOT NULL)::int AS depth,
            (SELECT count(*)::int FROM talks t WHERE t.category_id = c.id) AS count,
            (SELECT count(*)::int FROM talks t WHERE ${inCategorySql('t', 'c.id')}) AS total,
            (SELECT count(*)::int FROM categories k WHERE k.parent_id = c.id) AS children
       FROM categories c JOIN category_names n ON n.id = c.id LEFT JOIN categories p ON p.id = c.parent_id ${TREE_ORDER}`)).rows);

  app.patch('/categories/:id', admin, async (req, reply) => {
    const { id } = catId.parse(req.params);
    const b = catPatch.parse(req.body);
    const cur = (await pool.query('SELECT name, parent_id FROM categories WHERE id = $1', [id])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Catégorie introuvable' });
    const name = b.name ?? cur.name;
    const parentId = b.parentId !== undefined ? b.parentId : cur.parent_id;
    if (b.parentId !== undefined && parentId != null) {
      if ((await pool.query('SELECT 1 FROM categories WHERE parent_id = $1', [id])).rowCount) return reply.code(400).send({ error: 'Cette catégorie a des sous-catégories : elle ne peut pas devenir une sous-catégorie' });
      const bad = await checkParent(parentId, id);
      if (bad) return reply.code(400).send({ error: bad });
    }
    if (await dupName(name, parentId, id)) return reply.code(409).send({ error: 'Une catégorie porte déjà ce nom à cet endroit' });
    const { rows } = await pool.query('UPDATE categories SET name = $2, parent_id = $3 WHERE id = $1 RETURNING id, name, parent_id AS "parentId"', [id, name, parentId]);
    return rows[0]; // la recherche se met à jour seule (la signature d'indexation contient le nom et les parents)
  });

  // Les conférences de la catégorie supprimée restent en ligne, simplement sans cette catégorie. Une catégorie qui a des sous-catégories ne se supprime pas.
  app.delete('/categories/:id', admin, async (req, reply) => {
    const { id } = catId.parse(req.params);
    if ((await pool.query('SELECT 1 FROM categories WHERE parent_id = $1', [id])).rowCount) return reply.code(409).send({ error: "Supprimez ou déplacez d'abord ses sous-catégories", code: 'has_children' });
    const n = (await pool.query('SELECT count(*)::int AS n FROM talks WHERE category_id = $1', [id])).rows[0].n;
    const res = await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    if (!res.rowCount) return reply.code(404).send({ error: 'Catégorie introuvable' });
    return { deleted: id, talksUncategorized: n };
  });

  // Catalogue public avec recherche par mot-clé et filtre par catégorie.
  app.get('/talks', async (req) => {
    const p = listSchema.parse(req.query);
    const names = p.speaker ? await speakerNames(p.speaker) : null;
    if (names && !names.length) return [];
    const { rows } = await pool.query(
      `${SELECT}
       WHERE t.video_status = 'ready' AND ${visibleSql('t')}
         AND ($6::text[] IS NULL OR lower(trim(t.speaker)) = ANY($6::text[]))
         AND ($1::text IS NULL OR t.title ILIKE '%' || $1 || '%' OR t.speaker ILIKE '%' || $1 || '%'
              OR t.description ILIKE '%' || $1 || '%'
              OR t.transcript_text ILIKE '%' || $1 || '%')
         AND ($2::int IS NULL OR ${inCategorySql('t', 2)})
         AND ($5::text IS NULL OR t.level = $5)
         AND ($7::text IS NULL OR t.format_id = (SELECT id FROM formats WHERE slug = $7))
         AND ${adultSql('t')}
       ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT $3 OFFSET $4`,
      [p.q ?? null, p.category ?? null, p.limit, p.offset, p.level ?? null, names, p.format ?? null]
    );
    for (const r of rows) r.summary = String(r.description || '').replace(/\s+/g, ' ').trim().slice(0, 170);
    return withPosters(rows);
  });

  app.get('/talks/:id', async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query(`${SELECT} WHERE t.id = $1`, [id]);
    const talk = rows[0];
    if (!talk) return reply.code(404).send({ error: 'Conférence introuvable' });
    // Espace enfant : le jeton enfant ne donne accès qu'aux conférences Kids de sa tranche d'âge ; les droits sont ceux du parent.
    const kv = await app.kidContext(req);
    if (kv && !(await ext.call('kids.canSee', false, kv.profile, id))) return reply.code(404).send({ error: 'Conférence introuvable', code: 'kid_locked' });
    if (kv && (await timeState(kv.profile)).timeUp) return reply.code(403).send({ error: "C'est fini pour aujourd'hui", code: 'kid_time_up' });
    const viewer = kv ? kv.parent : await app.optionalUser(req); // visiteur anonyme : null
    const owner = await pool.query('SELECT organizer_id FROM talks WHERE id = $1', [id]);
    const isOwner = viewer && (viewer.role === 'admin' || viewer.role === 'moderator' || viewer.sub === owner.rows[0].organizer_id || await viaChannel(viewer, id)); // le modérateur relit les conférences en attente
    // Brouillon ou publication programmée à venir : invisible pour tout le monde sauf le propriétaire et les admins.
    if (!talk.visible && !isOwner) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (kv) {
      const kp = (await pool.query('SELECT position_ms, completed FROM kid_progress WHERE profile_id = $1 AND talk_id = $2', [kv.profile.id, id])).rows[0];
      talk.resumeMs = kp && !kp.completed && kp.position_ms >= 5000 ? kp.position_ms : 0;
    } else if (viewer) {
      // Favori et position de reprise de l'utilisateur connecté (étape 6).
      talk.favorite = (await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND talk_id = $2', [viewer.sub, id])).rowCount > 0;
      const prog = (await pool.query('SELECT position_ms, completed FROM watch_progress WHERE user_id = $1 AND talk_id = $2', [viewer.sub, id])).rows[0];
      talk.resumeMs = prog && !prog.completed && prog.position_ms >= 5000 ? prog.position_ms : 0;
    }
    talk.speakerSlug = speakerSlug(talk.speaker); // lien vers la page de l'intervenant
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
        if (!external) {
          talk.hlsPath = `/hls/${id}/master.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
          if (talk.audio_status === 'ready') talk.audioPath = `/hls/${id}/audio/index.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
        }
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
        if (talk.status === 'ready') {
          talk.hlsPath = `/hls/${id}/master.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
          if (talk.audio_status === 'ready') talk.audioPath = `/hls/${id}/audio/index.m3u8?t=${encodeURIComponent(talk.playbackToken)}`;
        }
        else if (isOwner) talk.videoUrl = await presignGet(talk.video_ref); // aperçu du fichier d'origine pendant la conversion
      }
    }
    if (!external) delete talk.video_ref;
    delete talk.audio_status;
    talk.quiz = await ext.call('talk.quiz', { available: false, count: 0 }, id);
    talk.practice = await ext.call('talk.practice', { available: false, count: 0 }, id);
    talk.themes = await talkThemes(id);
    await withPosters([talk]);
    return talk;
  });

  app.get('/me/talks', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      `SELECT ${COLS}, t.transcript_language AS "transcriptLanguage", t.transcript_error AS "transcriptError", t.transcript_method AS "transcriptMethod", t.poster_candidates, t.video_error AS "videoError",
         (SELECT COALESCE(json_agg(json_build_object('lang', tr.lang, 'status', tr.status, 'progress', tr.progress, 'error', tr.error) ORDER BY tr.lang), '[]'::json)
            FROM transcript_translations tr WHERE tr.talk_id = t.id) AS translations,
         (SELECT COALESCE(json_agg(json_build_object('lang', i.lang, 'status', i.status, 'error', i.error) ORDER BY i.lang), '[]'::json)
            FROM talk_insights i WHERE i.talk_id = t.id) AS insights
       ${FROM} WHERE (t.organizer_id = $1 OR lower(trim(t.speaker)) = ANY($2::text[])) ORDER BY t.created_at DESC`,
      [req.user.sub, await managedSpeakers(req.user.sub)]
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
                           external_file, external_thumb, duration_seconds, publication, publish_at, level, kids_bands, show_adults, format_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, COALESCE($21::int, (SELECT id FROM formats WHERE slug = 'conference'))) RETURNING id`,
        [req.user.sub, b.title, b.description || m.description || '', b.speaker, b.language, b.categoryId ?? null, b.access, video.source, video.ref,
          video.source === 'upload' ? 'pending' : 'ready', transcribable ? 'pending' : 'unavailable', video.source !== 'upload' && b.rightsConfirmed,
          m.file ?? null, m.thumb ?? null, m.duration ?? null, pub.publication, pub.publishAt, b.level ?? null,
          cleanBands(b.kidsBands), b.showAdults ?? cleanBands(b.kidsBands).length === 0, b.formatId ?? null]
      );
      const extras = cleanExtras(b.extraCategoryIds, b.categoryId ?? null);
      if (extras.length) await saveExtras(pool, rows[0].id, extras);
      if (transcribable && b.translateTo.length) {
        const langs = [...new Set(b.translateTo)].filter((l) => l !== baseLang(b.language));
        if (langs.length) {
          await pool.query('INSERT INTO transcript_translations(talk_id, lang) SELECT $1, unnest($2::text[])', [rows[0].id, langs]);
        }
      }
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie ou format inconnu' });
      throw err;
    }
  });

  // Modification en lot : { ids, changes, bandsMode }. Un organisateur ne touche qu'à ses conférences ; l'administrateur à toutes.
  app.post('/talks/bulk', organizer, async (req, reply) => {
    const { ids, changes: b, bandsMode } = bulkSchema.parse(req.body ?? {});
    if (!Object.keys(b).length) return reply.code(400).send({ error: 'Choisissez au moins une modification' });
    const own = (await pool.query(
      'SELECT id, kids_bands, category_id FROM talks WHERE id = ANY($1::uuid[]) AND ($2::boolean OR organizer_id = $3 OR lower(trim(speaker)) = ANY($4::text[]))',
      [ids, req.user.role === 'admin', req.user.sub, await managedSpeakers(req.user.sub)])).rows;
    if (own.length !== new Set(ids).size) return reply.code(404).send({ error: 'Certaines conférences sont introuvables' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const cur of own) {
        const sets = [];
        const vals = [cur.id];
        const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
        if (b.speaker !== undefined) set('speaker', b.speaker);
        if (b.language !== undefined) set('language', b.language);
        if (b.categoryId !== undefined) set('category_id', b.categoryId);
        if (b.formatId !== undefined) set('format_id', b.formatId);
        if (b.access !== undefined) set('access', b.access);
        if (b.level !== undefined) set('level', b.level);
        if (b.showAdults !== undefined) set('show_adults', b.showAdults);
        if (b.publication !== undefined) { set('publication', b.publication); set('publish_at', null); }
        if (b.kidsBands !== undefined) {
          const have = cur.kids_bands || [];
          const next = bandsMode === 'add' ? [...have, ...b.kidsBands] : bandsMode === 'remove' ? have.filter((x) => !b.kidsBands.includes(x)) : b.kidsBands;
          set('kids_bands', cleanBands(next));
        }
        if (sets.length) await client.query(`UPDATE talks SET ${sets.join(', ')} WHERE id = $1`, vals);
        if (b.extraCategoryIds !== undefined || b.categoryId !== undefined) {
          const principal = b.categoryId !== undefined ? b.categoryId : cur.category_id;
          const current = b.extraCategoryIds ?? (await client.query('SELECT category_id FROM talk_categories WHERE talk_id = $1', [cur.id])).rows.map((r) => r.category_id);
          await saveExtras(client, cur.id, cleanExtras(current, principal));
        }
        if (b.access !== undefined) {
          await client.query(`UPDATE series_episodes e SET access_override = CASE WHEN s.access = $2 THEN NULL ELSE $2 END FROM series s WHERE e.talk_id = $1 AND s.id = e.series_id`, [cur.id, b.access]);
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie ou format inconnu' });
      throw err;
    } finally {
      client.release();
    }
    return { ok: true, updated: own.length };
  });

  // Modifie une conférence : informations, accès, publication (brouillon / programmée / publiée) et choix de la miniature.
  app.patch('/talks/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchSchema.parse(req.body ?? {});
    const cur = (await pool.query('SELECT organizer_id, source, publication, publish_at, poster_key, poster_candidates, category_id FROM talks WHERE id = $1', [id])).rows[0];
    if (!cur || (req.user.role !== 'admin' && cur.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) return reply.code(404).send({ error: 'Conférence introuvable' });

    const sets = [];
    const vals = [id];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.title !== undefined) set('title', b.title);
    if (b.description !== undefined) set('description', b.description);
    if (b.speaker !== undefined) set('speaker', b.speaker);
    if (b.categoryId !== undefined) set('category_id', b.categoryId);
    if (b.formatId !== undefined) set('format_id', b.formatId);
    if (b.access !== undefined) set('access', b.access);
    if (b.level !== undefined) set('level', b.level);
    if (b.kidsBands !== undefined) set('kids_bands', cleanBands(b.kidsBands));
    if (b.showAdults !== undefined) set('show_adults', b.showAdults);
    if (b.featured !== undefined) {
      if (req.user.role !== 'admin') return reply.code(403).send({ error: "Seul un administrateur peut mettre une conférence en avant sur l'accueil" });
      set('featured', b.featured);
      sets.push(b.featured ? 'featured_at = now()' : 'featured_at = NULL');
    }

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
    const extrasTouched = b.extraCategoryIds !== undefined || b.categoryId !== undefined;
    if (!sets.length && !extrasTouched) return reply.code(400).send({ error: 'Rien à modifier' });
    try {
      if (sets.length) await pool.query(`UPDATE talks SET ${sets.join(', ')} WHERE id = $1`, vals);
      if (extrasTouched) {
        // La catégorie principale ne peut pas aussi figurer parmi les supplémentaires.
        const principal = b.categoryId !== undefined ? b.categoryId : cur.category_id;
        const current = b.extraCategoryIds ?? (await pool.query('SELECT category_id FROM talk_categories WHERE talk_id = $1', [id])).rows.map((r) => r.category_id);
        await saveExtras(pool, id, cleanExtras(current, principal));
      }
      // Épisode d'une série : choisir un accès ici fixe le réglage de l'épisode (identique à la série = il hérite de nouveau).
      if (b.access !== undefined) {
        await pool.query(`UPDATE series_episodes e SET access_override = CASE WHEN s.access = $2 THEN NULL ELSE $2 END FROM series s WHERE e.talk_id = $1 AND s.id = e.series_id`, [id, b.access]);
      }
    } catch (err) {
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie ou format inconnu' });
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
    if (!cur || (req.user.role !== 'admin' && cur.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) return reply.code(404).send({ error: 'Conférence introuvable' });
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
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) {
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
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) return reply.code(404).send({ error: 'Conférence introuvable' });
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
    const { lang, force } = z.object({ lang: z.enum(TRANSLATION_LANGS), force: z.boolean().default(false) }).parse(req.body);
    const talk = await ownedUpload(req, reply, id);
    if (!talk) return;
    if (lang === baseLang(talk.transcript_language || talk.language)) {
      return reply.code(400).send({ error: 'Cette langue est celle de la conférence' });
    }
    await pool.query(
      `INSERT INTO transcript_translations(talk_id, lang) VALUES ($1, $2)
       ON CONFLICT (talk_id, lang) DO UPDATE
         SET status = 'pending', progress = 0, error = NULL, attempts = 0, updated_at = now()
         WHERE transcript_translations.status = 'failed' OR ($3 AND transcript_translations.status = 'ready')`,
      [id, lang, force]
    );
    return reply.code(202).send({ lang, status: 'pending' });
  });

  // Relance la conversion d'une vidéo envoyée dont la conversion a échoué.
  app.post('/talks/:id/reconvert', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rows } = await pool.query('SELECT organizer_id, source, video_status FROM talks WHERE id = $1', [id]);
    const talk = rows[0];
    if (!talk || (req.user.role !== 'admin' && talk.organizer_id !== req.user.sub && !(await viaChannel(req.user, id)))) return reply.code(404).send({ error: 'Conférence introuvable' });
    if (talk.source !== 'upload') return reply.code(400).send({ error: 'Cette vidéo est lue depuis sa plateforme : rien à convertir' });
    if (talk.video_status !== 'failed') return reply.code(409).send({ error: 'La conversion n\'a pas échoué' });
    await pool.query("UPDATE talks SET video_status = 'pending', video_progress = 0, video_error = NULL, transcode_attempts = 0 WHERE id = $1", [id]);
    return reply.code(202).send({ status: 'pending' });
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
