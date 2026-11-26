// Import d'une SÉRIE complète depuis YouTube (étape B) : une liste de lecture / page « série » YouTube devient une série du catalogue,
// avec ses saisons et ses épisodes (conférences), en une seule opération.
//   POST /studio/series/import                 { url } : le transcripteur lit la liste (table import_jobs, purpose 'series')
//   GET  /studio/series/import/:id             état de la liste ; pour chaque vidéo : saison / épisode lus dans le titre, « déjà dans le catalogue » ;
//                                              `plan` = découpage en saisons proposé (YouTube ne donne pas les saisons)
//   POST /studio/series/import/:id/start       { title, …, ids (dans l'ordre voulu), seasons: [{ title, from }], copyIds, rights: true }
// Par défaut chaque épisode est LU depuis YouTube (rien n'est copié : 150 épisodes de 2 h ne tiendraient pas sur le disque).
// `copyIds` : épisodes à copier chez nous (import « Importer chez nous » de chaque conférence, avec son journal des droits).
// La transcription (Whisper) est facultative (`transcribe`) : 150 épisodes de 2 h = 300 h de calcul.
import { z } from 'zod';
import { pool } from '../../db.js';
import { storage } from '../../storage.js';
import { featureOn } from '../../features.js';
import { TRANSLATION_LANGS, baseLang } from '../../langs.js';
import { talkSourceUrl, insertImport, newObjectKey, storageProblem } from '../../mediaImport.js';
import { syncAccess } from './routes.js';
import { parseTitle, planSeasons } from './seasonDetect.js';

const idSchema = z.object({ id: z.guid() });
const MAX_EPISODES = 500;
export const SERIES_RIGHTS = 'Je certifie détenir les droits sur ces vidéos, ou disposer d\'une licence ou d\'une autorisation m\'autorisant à les présenter sur cette plateforme (lecture depuis YouTube, ou copie chez nous pour celles que je choisis de copier). Je comprends que je suis responsable de ce contenu.';

const urlSchema = z.string().trim().url().max(500).refine((u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && /^(www\.|m\.)?(youtube\.com|youtu\.be)$/i.test(x.hostname); } catch { return false; }
}, 'Collez une adresse YouTube (liste de lecture ou page « série »).');

const startSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  speaker: z.string().trim().max(200).default(''),
  categoryId: z.number().int().positive().nullable().optional(),
  access: z.enum(['free', 'premium']).default('free'),
  published: z.boolean().default(false),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('fr'),
  ids: z.array(z.string().regex(/^[\w.-]{1,100}$/)).min(1).max(MAX_EPISODES),
  seasons: z.array(z.object({ title: z.string().trim().max(120).default(''), from: z.number().int().min(1).max(MAX_EPISODES) })).max(50).default([]),
  copyIds: z.array(z.string().regex(/^[\w.-]{1,100}$/)).max(MAX_EPISODES).default([]),
  transcribe: z.boolean().default(false),
  translateTo: z.array(z.enum(TRANSLATION_LANGS)).max(TRANSLATION_LANGS.length).default([]),
  rights: z.literal(true, { error: 'Cochez la case des droits pour continuer.' }),
});

export default async function seriesImport(app) {
  const organizer = { preHandler: app.requireRole('organizer', 'admin') };
  const mine = async (req, id) => (await pool.query(
    "SELECT * FROM import_jobs WHERE id = $1 AND purpose = 'series' AND ($2::boolean OR organizer_id = $3)", [id, req.user.role === 'admin', req.user.sub])).rows[0];

  const view = async (j) => {
    let entries = Array.isArray(j.entries) ? j.entries : [];
    let plan = null;
    if (j.status === 'listed' && entries.length) {
      const { rows } = await pool.query(
        `SELECT t.source, t.video_ref, t.organizer_id, e.series_id FROM talks t LEFT JOIN series_episodes e ON e.talk_id = t.id
          WHERE (t.source, t.video_ref) IN (SELECT x->>'source', x->>'id' FROM jsonb_array_elements($1::jsonb) x)`, [JSON.stringify(entries)]);
      const have = new Map(rows.map((r) => [`${r.source}:${r.video_ref}`, r]));
      entries = entries.filter((e) => e.source === 'youtube').map((e) => {
        const h = have.get(`youtube:${e.id}`);
        return { ...e, ...parseTitle(e.title), already: Boolean(h), inSeries: Boolean(h?.series_id) };
      });
      plan = planSeasons(entries);
    }
    return { id: j.id, url: j.url, status: j.status, title: j.title, error: j.error, imported: j.imported, createdAt: j.created_at, count: entries.length, entries, plan };
  };

  app.post('/studio/series/import', { ...organizer, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { url } = z.object({ url: urlSchema }).parse(req.body ?? {});
    const running = await pool.query("SELECT count(*)::int AS n FROM import_jobs WHERE organizer_id = $1 AND status = 'listing' AND purpose = 'series'", [req.user.sub]);
    if (running.rows[0].n >= 3) return reply.code(429).send({ error: 'Trois analyses sont déjà en cours, patientez.' });
    const { rows } = await pool.query("INSERT INTO import_jobs(organizer_id, url, purpose) VALUES ($1, $2, 'series') RETURNING *", [req.user.sub, url]);
    return reply.code(202).send(await view(rows[0]));
  });

  app.get('/studio/series/import/:id', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Analyse introuvable' });
    return view(job);
  });

  // Relancer une analyse échouée (cookies YouTube ajoutés entre-temps, par exemple).
  app.post('/studio/series/import/:id/retry', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const job = await mine(req, id);
    if (!job) return reply.code(404).send({ error: 'Analyse introuvable' });
    await pool.query("UPDATE import_jobs SET status = 'listing', attempts = 0, error = NULL, updated_at = now() - interval '1 hour' WHERE id = $1", [id]);
    return reply.code(202).send({ status: 'listing' });
  });

  app.post('/studio/series/import/:id/start', organizer, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = startSchema.parse(req.body ?? {});
    const job = await mine(req, id);
    if (!job || job.status !== 'listed') return reply.code(409).send({ error: 'La liste n’est pas prête.', code: 'not_listed' });

    const ids = [...new Set(b.ids)];
    if (ids.length !== b.ids.length) return reply.code(400).send({ error: 'Une vidéo ne peut figurer qu’une fois.', code: 'duplicate' });
    const byId = new Map((job.entries || []).filter((e) => e.source === 'youtube').map((e) => [String(e.id), e]));
    const unknown = ids.filter((x) => !byId.has(x));
    if (unknown.length) return reply.code(400).send({ error: `${unknown.length} vidéo(s) ne sont pas dans la liste.`, code: 'unknown_ids' });

    // Saisons : la première commence au 1er épisode, chaque départ est unique et dans la liste.
    const seasons = [...b.seasons].sort((a, c) => a.from - c.from);
    if (seasons.length) {
      if (seasons[0].from !== 1) return reply.code(400).send({ error: 'La première saison doit commencer à l’épisode 1.', code: 'bad_seasons' });
      if (new Set(seasons.map((s) => s.from)).size !== seasons.length || seasons.some((s) => s.from > ids.length)) {
        return reply.code(400).send({ error: 'Départs de saison incorrects (un épisode ne peut commencer qu’une saison, et doit exister).', code: 'bad_seasons' });
      }
    }
    const copySet = new Set(b.copyIds);
    if (b.copyIds.some((x) => !ids.includes(x))) return reply.code(400).send({ error: 'Un épisode à copier n’est pas dans la série.', code: 'bad_copy' });
    if (copySet.size) {
      if (!(await featureOn('media_import'))) return reply.code(409).send({ error: 'La copie de vidéos externes est désactivée (Admin → Fonctions).', code: 'import_off' });
      if (!storage) return reply.code(503).send({ error: 'Stockage non configuré' });
      const full = await storageProblem();
      if (full) return reply.code(409).send({ error: full, code: 'storage_full' });
    }
    if (b.categoryId && !(await pool.query('SELECT 1 FROM categories WHERE id = $1 AND is_active', [b.categoryId])).rowCount) {
      return reply.code(400).send({ error: 'Catégorie inconnue.', code: 'bad_category' });
    }

    const langs = b.transcribe ? [...new Set(b.translateTo)].filter((l) => l !== baseLang(b.language)) : [];
    const me = (await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const client = await pool.connect();
    let seriesId; let pos = 0; const created = []; const reused = []; const skipped = []; const talkOf = new Map();
    try {
      await client.query('BEGIN');
      seriesId = (await client.query(
        `INSERT INTO series(owner_id, title, description, speaker, category_id, has_seasons, access, published, import_url, imported_by_name, rights_at, rights_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) RETURNING id`,
        [req.user.sub, b.title, b.description, b.speaker, b.categoryId ?? null, seasons.length > 0, b.access, b.published, job.url, me?.name || me?.email || '', SERIES_RIGHTS])).rows[0].id;
      const seasonIds = [];
      for (let i = 0; i < seasons.length; i++) {
        seasonIds.push((await client.query('INSERT INTO seasons(series_id, position, title) VALUES ($1,$2,$3) RETURNING id', [seriesId, i + 1, seasons[i].title])).rows[0].id);
      }
      for (let i = 0; i < ids.length; i++) {
        const e = byId.get(ids[i]);
        const ex = (await client.query(
          `SELECT t.id, t.organizer_id, e.series_id FROM talks t LEFT JOIN series_episodes e ON e.talk_id = t.id WHERE t.source = 'youtube' AND t.video_ref = $1 LIMIT 1`, [e.id])).rows[0];
        let talkId;
        if (ex) {
          if (ex.series_id || (req.user.role !== 'admin' && ex.organizer_id !== req.user.sub)) { skipped.push({ id: e.id, reason: ex.series_id ? 'déjà dans une série' : 'déjà au catalogue (autre organisateur)' }); continue; }
          talkId = ex.id; reused.push(e.id);
        } else {
          const r = await client.query(
            `INSERT INTO talks(organizer_id, title, speaker, language, category_id, access, source, video_ref, video_status,
                               transcript_status, rights_confirmed, duration_seconds, external_thumb, publication)
             VALUES ($1, $2, $3, $4, $5, $6, 'youtube', $7, 'ready', $8, $9, $10, $11, $12) RETURNING id`,
            [req.user.sub, e.title || e.id, b.speaker, b.language, b.categoryId ?? null, b.access, e.id,
              b.transcribe ? 'pending' : 'unavailable', b.transcribe, e.duration ?? null, e.thumb ?? null, b.published ? 'published' : 'draft']);
          talkId = r.rows[0].id; created.push(e.id);
          if (langs.length) await client.query('INSERT INTO transcript_translations(talk_id, lang) SELECT $1, unnest($2::text[])', [talkId, langs]);
        }
        pos += 1;
        // Saison de l'épisode = dernière saison dont le départ est ≤ son rang dans la liste choisie.
        let si = -1;
        seasons.forEach((s, k) => { if (i + 1 >= s.from) si = k; });
        await client.query('INSERT INTO series_episodes(talk_id, series_id, season_id, position) VALUES ($1,$2,$3,$4)', [talkId, seriesId, si >= 0 ? seasonIds[si] : null, pos]);
        talkOf.set(e.id, talkId);
      }
      if (!pos) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Aucune vidéo n’a pu être ajoutée (toutes déjà dans une série).', code: 'nothing', skipped }); }
      await syncAccess(client, seriesId);
      await client.query("UPDATE import_jobs SET status = 'imported', imported = imported + $2, updated_at = now() WHERE id = $1", [id, pos]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23503') return reply.code(400).send({ error: 'Catégorie inconnue.', code: 'bad_category' });
      throw err;
    } finally { client.release(); }

    // Copie chez nous des épisodes choisis (une demande par épisode, traitée l'une après l'autre par le transcripteur).
    const copyQueued = []; const copyErrors = [];
    for (const vid of b.copyIds) {
      const talkId = talkOf.get(vid);
      if (!talkId) continue;
      try {
        const src = talkSourceUrl({ source: 'youtube', video_ref: vid });
        await insertImport(pool, { talkId, userId: req.user.sub, url: src.url, origin: src.origin, newTalk: false, prevSource: 'youtube', objectKey: newObjectKey(), audioLang: 'fr' });
        copyQueued.push(vid);
      } catch (err) { copyErrors.push({ id: vid, reason: err.code === '23505' ? 'import déjà en cours' : 'demande impossible' }); }
    }
    req.auditSummary = `Série « ${b.title} » importée depuis YouTube : ${pos} épisode(s), ${seasons.length} saison(s), ${copyQueued.length} copie(s) demandée(s), droits confirmés`;
    return reply.code(201).send({ seriesId, episodes: pos, created: created.length, reused: reused.length, skipped, seasons: seasons.length, copyQueued: copyQueued.length, copyErrors });
  });
}
