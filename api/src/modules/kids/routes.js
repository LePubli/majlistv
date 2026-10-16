// Mejliss Kids (étape 26.1) : profils enfants sous le compte du parent, code parental, espace enfant verrouillé.
//
// Parent (jeton normal)
//   GET    /me/kids                       état : profils, code défini ?, nombre de profils autorisés
//   PUT    /me/kids/pin                   définit ou change le code parental (4 à 6 chiffres)
//   POST   /me/kids/profiles              crée un profil (prénom, avatar, tranche d'âge)
//   PATCH  /me/kids/profiles/:id          modifie  ·  DELETE /me/kids/profiles/:id supprime
//   POST   /me/kids/profiles/:id/enter    entre dans l'espace enfant : renvoie un JETON ENFANT (12 h)
// Enfant (jeton enfant, routes marquées kidOk — le jeton est refusé partout ailleurs, et traité en visiteur sur les routes publiques)
//   GET  /kids/me · GET /kids/talks · PUT /kids/progress/:id · POST /kids/exit (code parental → jeton du parent)
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { pool } from '../../db.js';
import { presignGet } from '../../storage.js';
import { visibleSql } from '../../visibility.js';
import { hasActiveSubscription, hasLearningTier } from '../../access.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { bandOkSql } from '../../taxonomy.js';
import { catalogSql, timeState, addPing, kidReport, MIN_LIMIT, MAX_LIMIT } from '../../kidsControl.js';
import { sendReportNow } from '../../kidsReportMailer.js';
import { starsOf, starTotal, awardBadges, recordKidAttempt, KID_BADGES, KID_QUESTIONS } from '../../kidsLearning.js';

export const BANDS = ['3-6', '7-10', '11-14'];
export const AVATARS = ['lion', 'owl', 'fox', 'turtle', 'rabbit', 'bear', 'camel', 'star'];
const MAX_FAILS = 5, LOCK_MINUTES = 10;
const idSchema = z.object({ id: z.string().uuid() });
const profileBody = z.object({
  name: z.string().trim().min(1).max(30),
  avatar: z.enum(AVATARS).default('lion'),
  band: z.enum(BANDS),
});
const pinSchema = z.string().regex(/^\d{4,6}$/, '4 à 6 chiffres');


// Une conférence est-elle visible par ce profil ? (prête, publiée, marquée Kids, tranche d'âge compatible)
export async function kidCanSee(profile, talkId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 3, 4)}`,
    [talkId, profile.band, profile.id, profile.catalog_mode || 'all']);
  return rowCount > 0;
}

// Le parent peut-il utiliser Kids ? Abonnement en cours (Mejliss ou Apprentissage) ou compte administrateur.
export async function parentAllowed(userId, role) {
  return role === 'admin' || (await hasActiveSubscription(userId)) || (await hasLearningTier(userId));
}
async function profileLimit(userId) {
  return (await hasLearningTier(userId)) ? getNumber('kids_max_learning') : getNumber('kids_max_standard');
}

const shape = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, band: p.band });

// Vérifie le code parental avec blocage temporaire après 5 erreurs. Renvoie { ok, locked, minutes }.
async function checkPin(userId, code) {
  const u = (await pool.query('SELECT kids_pin_hash, kids_pin_fails, kids_pin_locked_until FROM users WHERE id = $1', [userId])).rows[0];
  if (!u?.kids_pin_hash) return { ok: false, noPin: true };
  if (u.kids_pin_locked_until && new Date(u.kids_pin_locked_until) > new Date()) {
    return { ok: false, locked: true, minutes: Math.max(1, Math.ceil((new Date(u.kids_pin_locked_until) - Date.now()) / 60000)) };
  }
  if (typeof code === 'string' && await bcrypt.compare(code, u.kids_pin_hash)) {
    await pool.query('UPDATE users SET kids_pin_fails = 0, kids_pin_locked_until = NULL WHERE id = $1', [userId]);
    return { ok: true };
  }
  const fails = u.kids_pin_fails + 1;
  if (fails >= MAX_FAILS) {
    await pool.query(`UPDATE users SET kids_pin_fails = 0, kids_pin_locked_until = now() + interval '${LOCK_MINUTES} minutes' WHERE id = $1`, [userId]);
    return { ok: false, locked: true, minutes: LOCK_MINUTES };
  }
  await pool.query('UPDATE users SET kids_pin_fails = $2 WHERE id = $1', [userId, fails]);
  return { ok: false, left: MAX_FAILS - fails };
}

export default async function kidsRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const kidAuth = { preHandler: app.authenticate, config: { kidOk: true } };
  const off = async (reply) => (isOn(await getSetting('kids_enabled')) ? null : reply.code(404).send({ error: 'Espace Kids indisponible' }));

  // ------------------------------------------------------------------ Parent
  app.get('/me/kids', auth, async (req, reply) => {
    if (await off(reply)) return;
    const [profiles, u, allowed, max] = await Promise.all([
      pool.query('SELECT * FROM kid_profiles WHERE user_id = $1 ORDER BY created_at', [req.user.sub]),
      pool.query('SELECT kids_pin_hash IS NOT NULL AS has_pin, kids_pin_locked_until, kids_report_email FROM users WHERE id = $1', [req.user.sub]),
      parentAllowed(req.user.sub, req.user.role),
      profileLimit(req.user.sub),
    ]);
    return { allowed, hasPin: u.rows[0].has_pin, max, learning: await hasLearningTier(req.user.sub), reportEmail: u.rows[0].kids_report_email, profiles: profiles.rows.map((x) => ({ ...shape(x), dailyLimitMin: x.daily_limit_min, catalogMode: x.catalog_mode })), bands: BANDS, avatars: AVATARS };
  });

  // Définir le code (première fois) ou le changer (l'ancien code est exigé).
  app.put('/me/kids/pin', auth, async (req, reply) => {
    if (await off(reply)) return;
    const b = z.object({ code: pinSchema, current: z.string().max(10).optional() }).parse(req.body ?? {});
    const has = (await pool.query('SELECT kids_pin_hash IS NOT NULL AS x FROM users WHERE id = $1', [req.user.sub])).rows[0].x;
    if (has) {
      const c = await checkPin(req.user.sub, b.current);
      if (!c.ok) return reply.code(403).send({ error: c.locked ? `Trop d'essais : réessayez dans ${c.minutes} min` : 'Code parental actuel incorrect', code: c.locked ? 'locked' : 'bad_pin' });
    }
    await pool.query('UPDATE users SET kids_pin_hash = $2, kids_pin_fails = 0, kids_pin_locked_until = NULL WHERE id = $1', [req.user.sub, await bcrypt.hash(b.code, 10)]);
    return { ok: true };
  });

  app.post('/me/kids/profiles', auth, async (req, reply) => {
    if (await off(reply)) return;
    const b = profileBody.parse(req.body ?? {});
    if (!(await parentAllowed(req.user.sub, req.user.role))) return reply.code(403).send({ error: 'Un abonnement est nécessaire pour créer un profil enfant', code: 'subscription_required' });
    const [count, max] = [(await pool.query('SELECT count(*)::int AS n FROM kid_profiles WHERE user_id = $1', [req.user.sub])).rows[0].n, await profileLimit(req.user.sub)];
    if (count >= max) return reply.code(409).send({ error: `Votre abonnement permet ${max} profil${max > 1 ? 's' : ''} enfant${max > 1 ? 's' : ''}`, code: 'limit', max });
    try {
      const { rows } = await pool.query('INSERT INTO kid_profiles(user_id, name, avatar, band) VALUES ($1, $2, $3, $4) RETURNING *', [req.user.sub, b.name, b.avatar, b.band]);
      return reply.code(201).send(shape(rows[0]));
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Un profil porte déjà ce prénom', code: 'duplicate' });
      throw err;
    }
  });

  app.patch('/me/kids/profiles/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = profileBody.partial().refine((x) => Object.keys(x).length > 0).parse(req.body ?? {});
    const cur = (await pool.query('SELECT * FROM kid_profiles WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!cur) return reply.code(404).send({ error: 'Profil introuvable' });
    try {
      const { rows } = await pool.query('UPDATE kid_profiles SET name = $2, avatar = $3, band = $4 WHERE id = $1 RETURNING *',
        [id, b.name ?? cur.name, b.avatar ?? cur.avatar, b.band ?? cur.band]);
      return shape(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Un profil porte déjà ce prénom', code: 'duplicate' });
      throw err;
    }
  });

  app.delete('/me/kids/profiles/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { rowCount } = await pool.query('DELETE FROM kid_profiles WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    return rowCount ? reply.code(204).send() : reply.code(404).send({ error: 'Profil introuvable' });
  });

  // Entrer dans l'espace enfant : le code parental doit exister (c'est lui qui permet d'en sortir).
  app.post('/me/kids/profiles/:id/enter', auth, async (req, reply) => {
    if (await off(reply)) return;
    const { id } = idSchema.parse(req.params);
    const p = (await pool.query('SELECT * FROM kid_profiles WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!p) return reply.code(404).send({ error: 'Profil introuvable' });
    if (!(await parentAllowed(req.user.sub, req.user.role))) return reply.code(403).send({ error: 'Abonnement nécessaire', code: 'subscription_required' });
    const has = (await pool.query('SELECT kids_pin_hash IS NOT NULL AS x FROM users WHERE id = $1', [req.user.sub])).rows[0].x;
    if (!has) return reply.code(409).send({ error: "Définissez d'abord un code parental", code: 'pin_required' });
    const token = app.jwt.sign({ sub: req.user.sub, kid: p.id }, { expiresIn: '12h' });
    return { token, profile: shape(p) };
  });

  // ------------------------------------------------------------------ Enfant (jeton enfant)
  const ctx = async (req, reply) => {
    const c = await app.kidContext(req);
    if (!c) { reply.code(401).send({ error: 'Session enfant expirée', code: 'kid_expired' }); return null; }
    return c;
  };

  app.get('/kids/me', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    return shape(c.profile);
  });

  // Catalogue de l'enfant : conférences Kids de sa tranche d'âge ou plus jeunes ; seules les gratuites si le parent n'a plus d'abonnement.
  app.get('/kids/talks', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const time = await timeState(c.profile);
    if (time.timeUp) return { profile: shape(c.profile), talks: [], resume: [], time };
    const open = await parentAllowed(c.parent.sub, c.parent.role);
    const minQ = await getNumber('quiz_min_questions');
    const quizDefault = isOn(await getSetting('quiz_default_enabled'));
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.language, t.access, t.source, t.kids_bands AS "kidsBands", t.duration_seconds AS "durationSeconds",
              t.poster_key, t.external_thumb, left(regexp_replace(t.description, '\\s+', ' ', 'g'), 140) AS summary,
              COALESCE(k.completed, false) AS completed, COALESCE(k.position_ms, 0) AS "positionMs",
              (COALESCE(t.quiz_enabled, $5::boolean) AND (SELECT count(*) FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved') >= $6) AS "hasQuiz",
              (SELECT max(stars) FROM kid_quiz_attempts a WHERE a.profile_id = $1 AND a.talk_id = t.id) AS stars
         FROM talks t LEFT JOIN kid_progress k ON k.talk_id = t.id AND k.profile_id = $1
        WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 7)} AND ($3::boolean OR t.access = 'free')
        ORDER BY (t.kids_bands[1] = $4) DESC, COALESCE(t.publish_at, t.created_at) DESC LIMIT 60`,
      [c.profile.id, c.profile.band, open, c.profile.band, quizDefault, minQ, c.profile.catalog_mode]);
    for (const r of rows) {
      r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
      delete r.poster_key; delete r.external_thumb;
    }
    const resume = rows.filter((r) => r.positionMs >= 5000 && !r.completed).slice(0, 6);
    return { profile: shape(c.profile), talks: rows, resume, time };
  });

  const progressBody = z.object({ positionMs: z.number().int().min(0).max(86_400_000), durationMs: z.number().int().min(0).max(86_400_000).default(0) });
  app.put('/kids/progress/:id', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const { id } = idSchema.parse(req.params);
    const b = progressBody.parse(req.body ?? {});
    if ((await timeState(c.profile)).timeUp) return reply.code(403).send({ error: "C'est fini pour aujourd'hui", code: 'kid_time_up' });
    if (!(await kidCanSee(c.profile, id))) return reply.code(404).send({ error: 'Conférence introuvable', code: 'kid_locked' });
    const done = b.durationMs > 0 && b.positionMs >= Math.min(b.durationMs * 0.95, b.durationMs - 30_000);
    await pool.query(
      `INSERT INTO kid_progress(profile_id, talk_id, position_ms, completed) VALUES ($1, $2, $3, $4)
       ON CONFLICT (profile_id, talk_id) DO UPDATE SET position_ms = EXCLUDED.position_ms, completed = kid_progress.completed OR EXCLUDED.completed, updated_at = now()`,
      [c.profile.id, id, b.positionMs, done]);
    return { ok: true, completed: done };
  });

  // ------------------------------------------------------------------ Quiz, étoiles, badges, révision (26.2)
  const learningOf = (c) => hasLearningTier(c.parent.sub);

  // Questions d'un quiz pour l'enfant : 5 au plus, jamais les réponses. Le tirage change à chaque essai.
  async function kidQuestions(profile, talkId) {
    if (!(await kidCanSee(profile, talkId))) return null;
    const minQ = await getNumber('quiz_min_questions');
    const meta = (await pool.query(
      `SELECT COALESCE(t.quiz_enabled, $2::boolean) AS on, (SELECT count(*) FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved')::int AS n,
              (SELECT count(*) FROM kid_quiz_attempts a WHERE a.profile_id = $3 AND a.talk_id = t.id)::int AS tries
         FROM talks t WHERE t.id = $1`, [talkId, isOn(await getSetting('quiz_default_enabled')), profile.id])).rows[0];
    if (!meta || !meta.on || meta.n < minQ) return null;
    const { rows } = await pool.query(
      `SELECT id, question, options, correct_index, explanation, evidence_ms FROM quiz_questions WHERE talk_id = $1 AND status = 'approved'
        ORDER BY md5(id::text || $2::text) LIMIT ${KID_QUESTIONS}`, [talkId, String(meta.tries)]);
    return rows.sort((a, b) => (a.evidence_ms ?? 1e9) - (b.evidence_ms ?? 1e9));
  }

  app.get('/kids/talks/:id/quiz', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const { id } = idSchema.parse(req.params);
    if ((await timeState(c.profile)).timeUp) return reply.code(403).send({ error: "C'est fini pour aujourd'hui", code: 'kid_time_up' });
    const qs = await kidQuestions(c.profile, id);
    if (!qs) return reply.code(404).send({ error: "Pas de quiz pour cette vidéo", code: 'no_quiz' });
    return { questions: qs.map((q) => ({ id: q.id, question: q.question, options: q.options })) };
  });

  const submitBody = z.object({ answers: z.array(z.object({ questionId: z.string().uuid(), index: z.number().int().min(0).max(3) })).min(1).max(KID_QUESTIONS) });
  app.post('/kids/talks/:id/quiz/submit', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const { id } = idSchema.parse(req.params);
    const b = submitBody.parse(req.body ?? {});
    if ((await timeState(c.profile)).timeUp) return reply.code(403).send({ error: "C'est fini pour aujourd'hui", code: 'kid_time_up' });
    if (!(await kidCanSee(c.profile, id))) return reply.code(404).send({ error: 'Conférence introuvable', code: 'kid_locked' });
    const ids = [...new Set(b.answers.map((a) => a.questionId))];
    if (ids.length !== b.answers.length) return reply.code(400).send({ error: 'Réponses en double' });
    const { rows } = await pool.query(
      `SELECT id, correct_index, explanation, evidence_ms FROM quiz_questions WHERE talk_id = $1 AND status = 'approved' AND id = ANY($2::uuid[])`, [id, ids]);
    if (rows.length !== ids.length) return reply.code(400).send({ error: 'Question inconnue' });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const results = b.answers.map((a) => {
      const q = byId.get(a.questionId);
      return { questionId: q.id, chosen: a.index, correct: a.index === q.correct_index, correctIndex: q.correct_index, explanation: q.explanation, evidenceMs: q.evidence_ms };
    });
    const score = results.filter((r) => r.correct).length;
    const percent = Math.round((100 * score) / results.length);
    const stars = starsOf(percent);
    const before = await starTotal(c.profile.id);
    await pool.query('INSERT INTO kid_quiz_attempts(profile_id, talk_id, score, total, percent, stars) VALUES ($1, $2, $3, $4, $5, $6)', [c.profile.id, id, score, results.length, percent, stars]);
    const learning = await learningOf(c);
    let newBadges = [];
    let nextReview = null;
    if (learning) {
      await recordKidAttempt(c.profile.id, id, percent);
      newBadges = await awardBadges(c.profile.id);
      nextReview = (await pool.query('SELECT due_on::text AS "dueOn" FROM kid_revision WHERE profile_id = $1 AND talk_id = $2', [c.profile.id, id])).rows[0]?.dueOn ?? null;
    }
    return { score, total: results.length, percent, stars, totalStars: await starTotal(c.profile.id), previousStars: before, newBadges, nextReview, results };
  });

  // Résumé : étoiles (tous les paliers) ; badges et « à rejouer aujourd'hui » (Apprentissage).
  app.get('/kids/summary', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const learning = await learningOf(c);
    const out = { time: await timeState(c.profile), learning, stars: await starTotal(c.profile.id), quizzes: (await pool.query('SELECT count(*)::int AS n FROM kid_quiz_attempts WHERE profile_id = $1', [c.profile.id])).rows[0].n,
      watched: (await pool.query('SELECT count(*)::int AS n FROM kid_progress WHERE profile_id = $1 AND completed', [c.profile.id])).rows[0].n, badges: [], allBadges: KID_BADGES, due: [] };
    if (learning) {
      out.badges = (await pool.query('SELECT code, earned_at AS "earnedAt" FROM kid_badges WHERE profile_id = $1 ORDER BY earned_at', [c.profile.id])).rows;
      const open = await parentAllowed(c.parent.sub, c.parent.role);
      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.speaker, t.source, t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb
           FROM kid_revision r JOIN talks t ON t.id = r.talk_id
          WHERE r.profile_id = $1 AND r.due_on IS NOT NULL AND r.due_on <= (now() AT TIME ZONE 'Europe/Paris')::date
            AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ${catalogSql('t', 1, 4)} AND ($3::boolean OR t.access = 'free')
          ORDER BY r.due_on LIMIT 6`, [c.profile.id, c.profile.band, open, c.profile.catalog_mode]);
      for (const r of rows) { r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null); delete r.poster_key; delete r.external_thumb; }
      out.due = rows;
    }
    return out;
  });


  // Temps passé : la page enfant « pingue » toutes les 30 s pendant qu'elle est ouverte. Le serveur mesure lui-même le temps écoulé.
  app.post('/kids/ping', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    return addPing(c.profile);
  });

  // ------------------------------------------------------------------ Contrôle parental (26.3) — parent connecté, pas de jeton enfant
  const ownProfile = async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const p = (await pool.query('SELECT * FROM kid_profiles WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!p) { reply.code(404).send({ error: 'Profil introuvable' }); return null; }
    return p;
  };

  app.get('/me/kids/profiles/:id/controls', auth, async (req, reply) => {
    const p = await ownProfile(req, reply); if (!p) return;
    const time = await timeState(p);
    return { dailyLimitMin: p.daily_limit_min, catalogMode: p.catalog_mode, usedSec: time.usedSec, leftSec: time.leftSec, min: MIN_LIMIT, max: MAX_LIMIT };
  });

  const controlsBody = z.object({
    dailyLimitMin: z.number().int().min(MIN_LIMIT).max(MAX_LIMIT).nullable().optional(),
    catalogMode: z.enum(['all', 'selected']).optional(),
  }).refine((x) => Object.keys(x).length > 0);
  app.put('/me/kids/profiles/:id/controls', auth, async (req, reply) => {
    const p = await ownProfile(req, reply); if (!p) return;
    const b = controlsBody.parse(req.body ?? {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (b.dailyLimitMin !== undefined) await client.query('UPDATE kid_profiles SET daily_limit_min = $2 WHERE id = $1', [p.id, b.dailyLimitMin]);
      // Changement de mode : on garde ce que l'enfant voit aujourd'hui (rien n'apparaît ni ne disparaît sans que le parent le décide).
      if (b.catalogMode && b.catalogMode !== p.catalog_mode) {
        const eligible = (await client.query(`SELECT t.id FROM talks t WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 1)}`, [p.band])).rows.map((r) => r.id);
        const seen = (await client.query(`SELECT t.id FROM talks t WHERE t.id = ANY($3::uuid[]) AND ${catalogSql('t', 1, 2)}`, [p.id, p.catalog_mode, eligible])).rows.map((r) => r.id);
        const seenSet = new Set(seen);
        await client.query('DELETE FROM kid_catalog WHERE profile_id = $1', [p.id]);
        if (b.catalogMode === 'selected') {
          if (seen.length) await client.query('INSERT INTO kid_catalog(profile_id, talk_id, allowed) SELECT $1, x, true FROM unnest($2::uuid[]) x', [p.id, seen]);
        } else {
          const hidden = eligible.filter((x) => !seenSet.has(x));
          if (hidden.length) await client.query('INSERT INTO kid_catalog(profile_id, talk_id, allowed) SELECT $1, x, false FROM unnest($2::uuid[]) x', [p.id, hidden]);
        }
        await client.query('UPDATE kid_profiles SET catalog_mode = $2 WHERE id = $1', [p.id, b.catalogMode]);
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    const q = (await pool.query('SELECT daily_limit_min, catalog_mode FROM kid_profiles WHERE id = $1', [p.id])).rows[0];
    return { dailyLimitMin: q.daily_limit_min, catalogMode: q.catalog_mode };
  });

  // Conférences Kids que ce profil pourrait voir (âge compatible), avec l'état « autorisé » selon le mode choisi.
  app.get('/me/kids/profiles/:id/catalog', auth, async (req, reply) => {
    const p = await ownProfile(req, reply); if (!p) return;
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.kids_bands AS "kidsBands", t.duration_seconds AS "durationSeconds", t.access, ${catalogSql('t', 2, 3)} AS allowed
         FROM talks t WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 1)}
        ORDER BY COALESCE(t.publish_at, t.created_at) DESC LIMIT 200`, [p.band, p.id, p.catalog_mode]);
    return { mode: p.catalog_mode, talks: rows };
  });

  app.put('/me/kids/profiles/:id/catalog', auth, async (req, reply) => {
    const p = await ownProfile(req, reply); if (!p) return;
    const b = z.object({ talkIds: z.array(z.string().uuid()).min(1).max(200), allowed: z.boolean() }).parse(req.body ?? {});
    // Mode « tout sauf » : seul le blocage est enregistré ; mode « sélection » : seule l'autorisation est enregistrée.
    const keep = p.catalog_mode === 'selected' ? b.allowed : !b.allowed;
    await pool.query('DELETE FROM kid_catalog WHERE profile_id = $1 AND talk_id = ANY($2::uuid[])', [p.id, b.talkIds]);
    if (keep) {
      await pool.query('INSERT INTO kid_catalog(profile_id, talk_id, allowed) SELECT $1, t.id, $3 FROM talks t WHERE t.id = ANY($2::uuid[]) AND ' + bandOkSql('t', 4),
        [p.id, b.talkIds, b.allowed, p.band]);
    }
    return { ok: true };
  });

  // Rapport de progression : par enfant, sans classement ni comparaison.
  app.get('/me/kids/report', auth, async (req, reply) => {
    if (await off(reply)) return;
    const days = z.coerce.number().int().min(1).max(90).catch(7).parse(req.query?.days);
    const learning = await hasLearningTier(req.user.sub);
    const pref = (await pool.query('SELECT kids_report_email AS "email" FROM users WHERE id = $1', [req.user.sub])).rows[0];
    return { ...(await kidReport(req.user.sub, days, learning)), email: pref.email };
  });

  app.put('/me/kids/report-prefs', auth, async (req) => {
    const b = z.object({ email: z.boolean() }).parse(req.body ?? {});
    await pool.query('UPDATE users SET kids_report_email = $2 WHERE id = $1', [req.user.sub, b.email]);
    return { ok: true, email: b.email };
  });

  // Envoi immédiat du rapport (7 jours) à l'adresse du parent.
  app.post('/me/kids/report/send', auth, async (req, reply) => {
    const n = await sendReportNow(req.user.sub);
    return n ? { ok: true } : reply.code(409).send({ error: "Aucun profil enfant", code: 'no_profile' });
  });

  // Sortie de l'espace enfant : seul le code parental rend un jeton normal.
  app.post('/kids/exit', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const b = z.object({ code: z.string().max(10) }).parse(req.body ?? {});
    const r = await checkPin(c.parent.sub, b.code);
    if (!r.ok) {
      const code = r.locked ? 'locked' : 'bad_pin';
      return reply.code(403).send({ error: r.locked ? `Trop d'essais : réessayez dans ${r.minutes} min` : 'Code incorrect', code, left: r.left });
    }
    const u = (await pool.query('SELECT id, email, name, role, locale FROM users WHERE id = $1', [c.parent.sub])).rows[0];
    return { token: app.jwt.sign({ sub: u.id, role: u.role }), user: u };
  });
}
