// Audyn — étape 4 : « Histoires du soir » dans l'espace Kids.
//  Enfant (jeton enfant) : GET /kids/stories · GET /kids/stories/:id · GET /kids/stories/:id/chapters/:cid/play · POST /kids/stories/ping
//  Parent : GET|PUT /me/kids/profiles/:id/stories   (minuteur autorisé à l'enfant ? arrêt automatique ?)
// Les histoires sont ILLIMITÉES : elles ne comptent pas dans la limite quotidienne de l'enfant. Le temps d'écoute est compté à part
// (kid_story_usage) pour le rapport du parent. Accès complet = contenu ouvert à tous ou parent en formule « Apprentissage » ; sinon aperçu du 1er chapitre.
import { z } from 'zod';
import { pool } from '../../db.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { hasLearningTier } from '../../access.js';
import { storage, presignGet } from '../../storage.js';
import { TZ } from '../../revision.js';
import { parentAllowed } from '../kids/routes.js';
import { fullAccess, sumDuration } from './lib.js';

const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;
const idSchema = z.object({ id: z.guid() });
const chSchema = z.object({ id: z.guid(), cid: z.guid() });
export const MIN_STOP = 5, MAX_STOP = 120;
const kidsWhere = "i.status = 'published' AND i.audience IN ('kids', 'both') AND EXISTS (SELECT 1 FROM audyn_chapters c WHERE c.item_id = i.id)";

/** Ajoute le temps d'écoute écoulé depuis le dernier « ping » (jamais plus de 60 s d'un coup ; nouvelle séance après 2 min sans ping = 10 s). */
export async function addStoryPing(profileId, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO kid_story_usage(profile_id, day, seconds, last_ping) VALUES ($1, ${TODAY}, 10, now())
     ON CONFLICT (profile_id, day) DO UPDATE SET
       seconds = kid_story_usage.seconds + CASE WHEN now() - kid_story_usage.last_ping <= interval '120 seconds'
                                                THEN LEAST(EXTRACT(EPOCH FROM now() - kid_story_usage.last_ping), 60)::int ELSE 10 END,
       last_ping = now()
     RETURNING seconds`, [profileId]);
  return rows[0].seconds;
}

export default async function kidsStories(app, { chaptersOf, cover, chapterRow, off }) {
  const kidAuth = { preHandler: app.authenticate, config: { kidOk: true } };
  const auth = { preHandler: app.authenticate };

  // Contexte enfant valide + espace Kids ouvert + parent autorisé ; sinon la réponse est déjà envoyée.
  async function ctx(req, reply) {
    if (!isOn(await getSetting('kids_enabled'))) { reply.code(404).send({ error: 'Espace Kids indisponible' }); return null; }
    const c = await app.kidContext(req);
    if (!c) { reply.code(401).send({ error: 'Session enfant expirée', code: 'kid_expired' }); return null; }
    if (!(await parentAllowed(c.parent.sub, c.parent.role))) { reply.code(403).send({ error: 'Abonnement nécessaire', code: 'subscription_required' }); return null; }
    return c;
  }
  const opts = (p) => ({ timerAllowed: Boolean(p.stories_timer_allowed), autoStopMin: p.stories_auto_stop_min ?? null });
  const item = async (id) => (await pool.query(`SELECT i.* FROM audyn_items i WHERE i.id = $1 AND ${kidsWhere}`, [id])).rows[0];

  app.get('/kids/stories', { ...kidAuth, config: { kidOk: true, rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const learning = await hasLearningTier(c.parent.sub);
    const { rows } = await pool.query(
      `SELECT i.*, (SELECT count(*)::int FROM audyn_chapters c WHERE c.item_id = i.id) AS chapters,
              (SELECT COALESCE(sum(duration_seconds), 0)::int FROM audyn_chapters c WHERE c.item_id = i.id) AS duration
         FROM audyn_items i WHERE ${kidsWhere} ORDER BY i.created_at DESC LIMIT 200`);
    return {
      ...opts(c.profile),
      items: await Promise.all(rows.map(async (r) => ({
        id: r.id, title: r.title, narrator: r.narrator, author: r.author, category: r.category, language: r.language,
        chapters: r.chapters, durationSeconds: r.duration, coverUrl: await cover(r), full: fullAccess(r, learning),
      }))),
    };
  });

  app.get('/kids/stories/:id', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const { id } = idSchema.parse(req.params);
    const r = await item(id);
    if (!r) return reply.code(404).send({ error: 'Histoire introuvable' });
    const full = fullAccess(r, await hasLearningTier(c.parent.sub));
    const chapters = await chaptersOf(id);
    return {
      id: r.id, title: r.title, narrator: r.narrator, author: r.author, description: r.description, category: r.category, language: r.language,
      coverUrl: await cover(r), durationSeconds: sumDuration(chapters), ...opts(c.profile),
      access: { full, previewSeconds: full ? 0 : await getNumber('mod_audyn_preview_seconds'), learningRequired: r.access === 'learning' },
      chapters: chapters.map((ch, i) => ({ ...chapterRow(ch), playable: full || i === 0 })),
    };
  });

  // Lien d'écoute : lien signé (accès complet) ou aperçu coupé du premier chapitre (adresse publique de l'aperçu).
  app.get('/kids/stories/:id/chapters/:cid/play', kidAuth, async (req, reply) => {
    if (!storage) return off(reply);
    const c = await ctx(req, reply); if (!c) return;
    const { id, cid } = chSchema.parse(req.params);
    const r = await item(id);
    if (!r) return reply.code(404).send({ error: 'Histoire introuvable' });
    const chapters = await chaptersOf(id);
    const idx = chapters.findIndex((x) => x.id === cid);
    if (idx < 0) return reply.code(404).send({ error: 'Chapitre introuvable' });
    if (fullAccess(r, await hasLearningTier(c.parent.sub))) return { preview: false, url: await presignGet(chapters[idx].audio_key), expiresIn: 3600 };
    if (idx !== 0) return reply.code(403).send({ error: "Cette suite est réservée à la formule « Apprentissage » du parent", code: 'learning_required' });
    return { preview: true, url: `/audyn/${id}/chapters/${cid}/preview`, limitSeconds: await getNumber('mod_audyn_preview_seconds') };
  });

  // « Ping » du lecteur (toutes les 30 s pendant l'écoute) : temps d'écoute des histoires, compté à part.
  app.post('/kids/stories/ping', { ...kidAuth, config: { kidOk: true, rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    return { seconds: await addStoryPing(c.profile.id) };
  });

  // ------------------------------------------------------------------ Parent
  const own = async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const p = (await pool.query('SELECT * FROM kid_profiles WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!p) { reply.code(404).send({ error: 'Profil introuvable' }); return null; }
    return p;
  };
  app.get('/me/kids/profiles/:id/stories', auth, async (req, reply) => {
    const p = await own(req, reply); if (!p) return;
    const w = (await pool.query(`SELECT COALESCE(sum(seconds), 0)::int AS s FROM kid_story_usage WHERE profile_id = $1 AND day > ${TODAY} - 7`, [p.id])).rows[0].s;
    const t = (await pool.query(`SELECT COALESCE(sum(seconds), 0)::int AS s FROM kid_story_usage WHERE profile_id = $1 AND day = ${TODAY}`, [p.id])).rows[0].s;
    return { ...opts(p), minutesToday: Math.round(t / 60), minutesWeek: Math.round(w / 60), min: MIN_STOP, max: MAX_STOP };
  });
  const body = z.object({
    timerAllowed: z.boolean().optional(),
    autoStopMin: z.number().int().min(MIN_STOP).max(MAX_STOP).nullable().optional(),
  }).strict().refine((x) => Object.keys(x).length > 0);
  app.put('/me/kids/profiles/:id/stories', auth, async (req, reply) => {
    const p = await own(req, reply); if (!p) return;
    const b = body.parse(req.body ?? {});
    const { rows } = await pool.query(
      'UPDATE kid_profiles SET stories_timer_allowed = $2, stories_auto_stop_min = $3 WHERE id = $1 RETURNING *',
      [p.id, b.timerAllowed ?? p.stories_timer_allowed, b.autoStopMin === undefined ? p.stories_auto_stop_min : b.autoStopMin]);
    return opts(rows[0]);
  });
}
