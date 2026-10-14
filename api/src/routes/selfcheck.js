// Étape 30 — Bilan personnel « Tazkiyat an-nafs » (palier Apprentissage).
// La personne tient deux listes (qualités à cultiver, défauts à corriger), choisies dans la base de thèmes ou écrites par elle,
// et fait chaque semaine son bilan : « réussi », « en progrès » ou « pas encore », avec une note facultative.
// Règles : tout ce qui est personnel est chiffré (PRACTICE_KEY) ; aucun total, score, pourcentage ni classement ; aucune route
// ne permet à un tiers (administrateur compris) de lire le contenu d'un autre compte ; rien n'entre dans les statistiques.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { pool } from '../db.js';
import { getSetting, isOn } from '../settings.js';
import { hasLearningTier } from '../access.js';
import { sealText, openText, practiceKeyReady } from '../practiceCrypto.js';

const THEMES = JSON.parse(readFileSync(new URL('../themesTazkiya.json', import.meta.url), 'utf8'));
const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const MAX_ACTIVE_GOALS = 20;
export const HISTORY_WEEKS = 8;
const STATUSES = ['achieved', 'progress', 'not_yet'];
const idSchema = z.object({ id: z.string().uuid() });

// Lundi de la semaine en cours (jour de Paris), au format AAAA-MM-JJ.
const WEEK_NOW = `to_char(date_trunc('week', now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD')`;
export const currentWeek = async () => (await pool.query(`SELECT ${WEEK_NOW} AS w`)).rows[0].w;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const goalShape = (g, checks, weeks) => {
  const marks = {};
  for (const c of checks) marks[c.week] = c.status;
  const cur = checks.find((c) => c.week === weeks[weeks.length - 1]);
  const themeId = openText(g.theme_enc);
  return {
    id: g.id, nature: g.nature, title: openText(g.title_enc), themeId: themeId || null, commitmentId: g.commitment_id,
    archived: Boolean(g.archived_at), createdAt: g.created_at,
    current: cur ? { status: cur.status, note: openText(cur.note_enc) } : null,
    marks,
  };
};

export default async function selfcheckRoutes(app) {
  const auth = { preHandler: app.authenticate };
  const required = (reply) => reply.code(403).send({ error: "Cette fonction fait partie de l'offre Mejliss Apprentissage", code: 'learning_required' });
  const gate = async (req, reply) => {
    if (!(await hasLearningTier(req.user.sub))) { required(reply); return false; }
    if (!practiceKeyReady()) { reply.code(503).send({ error: 'Chiffrement non configuré (PRACTICE_KEY)', code: 'no_key' }); return false; }
    return true;
  };
  const ownedGoal = async (req, reply, id) => {
    const g = (await pool.query('SELECT * FROM self_goals WHERE id = $1 AND user_id = $2', [id, req.user.sub])).rows[0];
    if (!g) { reply.code(404).send({ error: 'Objectif introuvable' }); return null; }
    return g;
  };
  const themesOn = async () => isOn(await getSetting('practice_themes_on'));

  // Les 8 dernières semaines (lundis), de la plus ancienne à la semaine en cours.
  async function weeksList() {
    const now = await currentWeek();
    return Array.from({ length: HISTORY_WEEKS }, (_, i) => addDays(now, -7 * (HISTORY_WEEKS - 1 - i)));
  }

  // ------------------------------------------------------------------ Vue d'ensemble
  app.get('/me/selfcheck', auth, async (req, reply) => {
    if (!(await gate(req, reply))) return;
    const weeks = await weeksList();
    const { archived } = z.object({ archived: z.enum(['0', '1']).default('0') }).parse(req.query);
    const goals = (await pool.query(
      `SELECT * FROM self_goals WHERE user_id = $1 AND (archived_at IS NULL OR $2::boolean) ORDER BY archived_at NULLS FIRST, created_at, id`, [req.user.sub, archived === '1'])).rows;
    const checks = goals.length ? (await pool.query(
      `SELECT goal_id, to_char(week, 'YYYY-MM-DD') AS week, status, note_enc FROM self_checkins WHERE goal_id = ANY($1::uuid[]) AND week >= $2::date`, [goals.map((g) => g.id), weeks[0]])).rows : [];
    const u = (await pool.query('SELECT practice_consent_at, practice_email, practice_weekday FROM users WHERE id = $1', [req.user.sub])).rows[0];
    const commits = (await pool.query(
      `SELECT id, text_enc FROM practice_commitments WHERE user_id = $1 AND status IN ('todo', 'doing') ORDER BY created_at DESC LIMIT 100`, [req.user.sub])).rows;
    return {
      week: weeks[weeks.length - 1], weeks, limit: MAX_ACTIVE_GOALS,
      goals: goals.map((g) => goalShape(g, checks.filter((c) => c.goal_id === g.id), weeks)),
      commitments: commits.map((c) => ({ id: c.id, text: openText(c.text_enc) })),
      consent: Boolean(u.practice_consent_at),
      prefs: { email: u.practice_email, weekday: u.practice_weekday },
      emailEnabled: isOn(await getSetting('practice_email_enabled')), emailHour: Number(await getSetting('practice_email_hour')),
      themesEnabled: await themesOn(),
    };
  });

  // Base de thèmes (qualités et défauts), si l'administrateur l'a activée après relecture.
  app.get('/me/selfcheck/themes', auth, async (req, reply) => {
    if (!(await gate(req, reply))) return;
    if (!(await themesOn())) return { enabled: false, themes: [] };
    return { enabled: true, themes: THEMES.filter((x) => x.kind !== 'action').map(({ id, kind, title, translit, ar, desc }) => ({ id, kind, title, translit, ar, desc })) };
  });

  // ------------------------------------------------------------------ Objectifs
  const goalBody = z.object({
    nature: z.enum(['quality', 'defect']),
    title: z.string().trim().min(3).max(200).optional(),
    themeId: z.string().regex(/^[QD]\d{1,2}$/).optional(),
    commitmentId: z.string().uuid().nullable().optional(),
    consent: z.boolean().optional(),
  }).refine((b) => b.title || b.themeId, { message: 'Choisissez un thème ou écrivez votre objectif' });

  app.post('/me/selfcheck/goals', auth, async (req, reply) => {
    const b = goalBody.parse(req.body ?? {});
    if (!(await gate(req, reply))) return;
    let title = b.title;
    let themeId = '';
    if (b.themeId) {
      const th = THEME_BY_ID.get(b.themeId);
      if (!(await themesOn()) || !th) return reply.code(400).send({ error: 'Thème indisponible', code: 'theme' });
      if (th.kind !== b.nature) return reply.code(400).send({ error: 'Ce thème ne correspond pas à cette liste', code: 'theme' });
      themeId = th.id; title = title || th.title;
    }
    const u = (await pool.query('SELECT practice_consent_at FROM users WHERE id = $1', [req.user.sub])).rows[0];
    if (!u.practice_consent_at) {
      if (b.consent !== true) return reply.code(409).send({ error: 'Votre accord est nécessaire pour enregistrer vos objectifs', code: 'consent_required' });
      await pool.query('UPDATE users SET practice_consent_at = now() WHERE id = $1', [req.user.sub]);
    }
    const active = (await pool.query('SELECT count(*)::int AS n FROM self_goals WHERE user_id = $1 AND archived_at IS NULL', [req.user.sub])).rows[0].n;
    if (active >= MAX_ACTIVE_GOALS) return reply.code(409).send({ error: `Vous avez déjà ${MAX_ACTIVE_GOALS} objectifs actifs : archivez-en un pour continuer, sans rien perdre.`, code: 'limit' });
    if (b.commitmentId && !(await pool.query('SELECT 1 FROM practice_commitments WHERE id = $1 AND user_id = $2', [b.commitmentId, req.user.sub])).rowCount) {
      return reply.code(404).send({ error: 'Engagement introuvable' });
    }
    const { rows } = await pool.query(
      'INSERT INTO self_goals(user_id, nature, title_enc, theme_enc, commitment_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.sub, b.nature, sealText(title), sealText(themeId), b.commitmentId ?? null]);
    return reply.code(201).send(goalShape(rows[0], [], await weeksList()));
  });

  const patchGoal = z.object({
    title: z.string().trim().min(3).max(200).optional(),
    archived: z.boolean().optional(),
    commitmentId: z.string().uuid().nullable().optional(),
  }).refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });

  app.patch('/me/selfcheck/goals/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = patchGoal.parse(req.body ?? {});
    if (!(await gate(req, reply))) return;
    const g = await ownedGoal(req, reply, id);
    if (!g) return;
    if (b.archived === false && g.archived_at) {
      const active = (await pool.query('SELECT count(*)::int AS n FROM self_goals WHERE user_id = $1 AND archived_at IS NULL', [req.user.sub])).rows[0].n;
      if (active >= MAX_ACTIVE_GOALS) return reply.code(409).send({ error: `Vous avez déjà ${MAX_ACTIVE_GOALS} objectifs actifs`, code: 'limit' });
    }
    if (b.commitmentId && !(await pool.query('SELECT 1 FROM practice_commitments WHERE id = $1 AND user_id = $2', [b.commitmentId, req.user.sub])).rowCount) {
      return reply.code(404).send({ error: 'Engagement introuvable' });
    }
    const weeks = await weeksList();
    await pool.query(
      `UPDATE self_goals SET title_enc = $3, commitment_id = $4,
              archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at WHEN $5 THEN COALESCE(archived_at, now()) ELSE NULL END, updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [id, req.user.sub, b.title !== undefined ? sealText(b.title) : g.title_enc, b.commitmentId !== undefined ? b.commitmentId : g.commitment_id, b.archived ?? null]);
    const row = (await pool.query('SELECT * FROM self_goals WHERE id = $1', [id])).rows[0];
    const checks = (await pool.query(`SELECT to_char(week, 'YYYY-MM-DD') AS week, status, note_enc FROM self_checkins WHERE goal_id = $1 AND week >= $2::date`, [id, weeks[0]])).rows;
    return goalShape(row, checks, weeks);
  });

  app.delete('/me/selfcheck/goals/:id', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    await pool.query('DELETE FROM self_goals WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Bilan de la semaine
  const checkBody = z.object({
    status: z.enum(STATUSES),
    note: z.string().trim().max(1000).optional(),
    week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  app.put('/me/selfcheck/goals/:id/checkin', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const b = checkBody.parse(req.body ?? {});
    if (!(await gate(req, reply))) return;
    const g = await ownedGoal(req, reply, id);
    if (!g) return;
    const weeks = await weeksList();
    let week = weeks[weeks.length - 1];
    if (b.week) {
      // Lundi de la semaine demandée ; seules les 8 dernières semaines (la semaine en cours comprise) peuvent être renseignées.
      week = (await pool.query(`SELECT to_char(date_trunc('week', $1::date)::date, 'YYYY-MM-DD') AS w`, [b.week])).rows[0].w;
      if (!weeks.includes(week)) return reply.code(400).send({ error: 'Cette semaine ne peut pas être renseignée', code: 'week' });
    }
    if (g.archived_at) return reply.code(409).send({ error: 'Objectif archivé : désarchivez-le pour faire son bilan', code: 'archived' });
    const prev = (await pool.query('SELECT note_enc FROM self_checkins WHERE goal_id = $1 AND week = $2', [id, week])).rows[0];
    await pool.query(
      `INSERT INTO self_checkins(goal_id, week, status, note_enc) VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (goal_id, week) DO UPDATE SET status = EXCLUDED.status, note_enc = EXCLUDED.note_enc, updated_at = now()`,
      [id, week, b.status, b.note !== undefined ? sealText(b.note) : prev?.note_enc ?? '']);
    const row = (await pool.query(`SELECT to_char(week, 'YYYY-MM-DD') AS week, status, note_enc FROM self_checkins WHERE goal_id = $1 AND week = $2::date`, [id, week])).rows[0];
    return { week: row.week, status: row.status, note: openText(row.note_enc) };
  });

  app.delete('/me/selfcheck/goals/:id/checkin', auth, async (req, reply) => {
    const { id } = idSchema.parse(req.params);
    const { week } = z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
    const g = await ownedGoal(req, reply, id);
    if (!g) return;
    await pool.query('DELETE FROM self_checkins WHERE goal_id = $1 AND week = date_trunc(\'week\', $2::date)::date', [id, week]);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ Rappel hebdomadaire : choix personnels
  app.put('/me/selfcheck/prefs', auth, async (req, reply) => {
    const b = z.object({ email: z.boolean().optional(), weekday: z.number().int().min(1).max(7).optional() })
      .refine((x) => Object.keys(x).length > 0, { message: 'Rien à modifier' }).parse(req.body ?? {});
    if (!(await hasLearningTier(req.user.sub))) return required(reply);
    const { rows } = await pool.query(
      `UPDATE users SET practice_email = COALESCE($2, practice_email), practice_weekday = COALESCE($3, practice_weekday) WHERE id = $1
       RETURNING practice_email AS email, practice_weekday AS weekday`, [req.user.sub, b.email ?? null, b.weekday ?? null]);
    return rows[0];
  });

  // ------------------------------------------------------------------ Droit d'accès et d'effacement (ouverts même sans abonnement)
  app.get('/me/selfcheck/export', auth, async (req, reply) => {
    const { format } = z.object({ format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
    const goals = (await pool.query('SELECT * FROM self_goals WHERE user_id = $1 ORDER BY created_at, id', [req.user.sub])).rows;
    const checks = goals.length ? (await pool.query(
      `SELECT goal_id, to_char(week, 'YYYY-MM-DD') AS week, status, note_enc FROM self_checkins WHERE goal_id = ANY($1::uuid[]) ORDER BY week`, [goals.map((g) => g.id)])).rows : [];
    const items = goals.map((g) => ({
      nature: g.nature, title: openText(g.title_enc), theme: THEME_BY_ID.get(openText(g.theme_enc))?.title ?? '', archived: Boolean(g.archived_at), createdAt: g.created_at,
      checkins: checks.filter((c) => c.goal_id === g.id).map((c) => ({ week: c.week, status: c.status, note: openText(c.note_enc) })),
    }));
    if (format === 'csv') {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['liste', 'objectif', 'archive', 'semaine', 'etat', 'note'].join(',')];
      for (const it of items) {
        const base = [it.nature === 'quality' ? 'qualite' : 'defaut', it.title, it.archived ? 'oui' : 'non'];
        if (!it.checkins.length) lines.push([...base, '', '', ''].map(q).join(','));
        for (const c of it.checkins) lines.push([...base, c.week, c.status, c.note].map(q).join(','));
      }
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="mon-bilan.csv"');
      return '﻿' + lines.join('\r\n') + '\r\n';
    }
    reply.header('content-disposition', 'attachment; filename="mon-bilan.json"');
    return { exportedAt: new Date().toISOString(), goals: items };
  });

  // Efface les objectifs et tous les bilans (les engagements de l'étape 29 et l'accord restent : voir DELETE /me/practice).
  app.delete('/me/selfcheck', auth, async (req, reply) => {
    await pool.query('DELETE FROM self_goals WHERE user_id = $1', [req.user.sub]);
    return reply.code(204).send();
  });
}
