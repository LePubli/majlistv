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
import { pool } from '../db.js';
import { presignGet } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { hasActiveSubscription, hasLearningTier } from '../access.js';
import { getNumber, getSetting, isOn } from '../settings.js';

export const BANDS = ['3-6', '7-10', '11-14'];
export const AVATARS = ['lion', 'owl', 'fox', 'turtle', 'rabbit', 'bear', 'camel', 'star'];
const RANK = { '3-6': 1, '7-10': 2, '11-14': 3 };
const MAX_FAILS = 5, LOCK_MINUTES = 10;
const idSchema = z.object({ id: z.string().uuid() });
const profileBody = z.object({
  name: z.string().trim().min(1).max(30),
  avatar: z.enum(AVATARS).default('lion'),
  band: z.enum(BANDS),
});
const pinSchema = z.string().regex(/^\d{4,6}$/, '4 à 6 chiffres');

// Condition SQL « cette conférence convient à une tranche d'âge » ($n = rang du profil : 1, 2 ou 3).
export const bandOkSql = (alias, p) => `(${alias}.kids_band IS NOT NULL AND CASE ${alias}.kids_band WHEN '3-6' THEN 1 WHEN '7-10' THEN 2 ELSE 3 END <= $${p})`;

// Une conférence est-elle visible par ce profil ? (prête, publiée, marquée Kids, tranche d'âge compatible)
export async function kidCanSee(profile, talkId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM talks t WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)}`, [talkId, RANK[profile.band]]);
  return rowCount > 0;
}

// Le parent peut-il utiliser Kids ? Abonnement en cours (Mejliss ou Apprentissage) ou compte administrateur.
async function parentAllowed(userId, role) {
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
      pool.query('SELECT kids_pin_hash IS NOT NULL AS has_pin, kids_pin_locked_until FROM users WHERE id = $1', [req.user.sub]),
      parentAllowed(req.user.sub, req.user.role),
      profileLimit(req.user.sub),
    ]);
    return { allowed, hasPin: u.rows[0].has_pin, max, learning: await hasLearningTier(req.user.sub), profiles: profiles.rows.map(shape), bands: BANDS, avatars: AVATARS };
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
    const open = await parentAllowed(c.parent.sub, c.parent.role);
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.language, t.access, t.source, t.kids_band AS "kidsBand", t.duration_seconds AS "durationSeconds",
              t.poster_key, t.external_thumb, left(regexp_replace(t.description, '\\s+', ' ', 'g'), 140) AS summary,
              COALESCE(k.completed, false) AS completed, COALESCE(k.position_ms, 0) AS "positionMs"
         FROM talks t LEFT JOIN kid_progress k ON k.talk_id = t.id AND k.profile_id = $1
        WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${bandOkSql('t', 2)} AND ($3::boolean OR t.access = 'free')
        ORDER BY (t.kids_band = $4) DESC, COALESCE(t.publish_at, t.created_at) DESC LIMIT 60`,
      [c.profile.id, RANK[c.profile.band], open, c.profile.band]);
    for (const r of rows) {
      r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
      delete r.poster_key; delete r.external_thumb;
    }
    const resume = rows.filter((r) => r.positionMs >= 5000 && !r.completed).slice(0, 6);
    return { profile: shape(c.profile), talks: rows, resume };
  });

  const progressBody = z.object({ positionMs: z.number().int().min(0).max(86_400_000), durationMs: z.number().int().min(0).max(86_400_000).default(0) });
  app.put('/kids/progress/:id', kidAuth, async (req, reply) => {
    const c = await ctx(req, reply); if (!c) return;
    const { id } = idSchema.parse(req.params);
    const b = progressBody.parse(req.body ?? {});
    if (!(await kidCanSee(c.profile, id))) return reply.code(404).send({ error: 'Conférence introuvable', code: 'kid_locked' });
    const done = b.durationMs > 0 && b.positionMs >= Math.min(b.durationMs * 0.95, b.durationMs - 30_000);
    await pool.query(
      `INSERT INTO kid_progress(profile_id, talk_id, position_ms, completed) VALUES ($1, $2, $3, $4)
       ON CONFLICT (profile_id, talk_id) DO UPDATE SET position_ms = EXCLUDED.position_ms, completed = kid_progress.completed OR EXCLUDED.completed, updated_at = now()`,
      [c.profile.id, id, b.positionMs, done]);
    return { ok: true, completed: done };
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
