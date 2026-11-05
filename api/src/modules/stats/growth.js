// Amélioration 7.1 — Croissance : entonnoir visiteurs → inscrits → essais → payants, et cohortes mois par mois.
//   GET /admin/stats/growth?days=7|30|90|365   administrateur seulement ; chiffres agrégés, jamais d'identité.
// Définitions (honnêtes) :
//  • Visiteurs = visiteurs uniques PAR JOUR additionnés (une même personne revenue 3 jours compte 3 fois) : la mesure du site est anonyme et sans cookie.
//  • Inscrits = comptes « membre » créés pendant la période. Essais et payants = parmi ces inscrits (cohorte), à ce jour : les inscrits récents n'ont pas encore eu le temps de convertir.
//  • Payant = abonnement Stripe réellement passé en facturation (sans essai : dès la création ; avec essai : essai terminé sans annulation pendant l'essai).
//    La date du 1er paiement n'est pas enregistrée : c'est la fin d'essai (ou la création). Cartes cadeaux et accès offerts ne comptent pas.
//  • Rétention des abonnés : cohorte = mois du 1er paiement ; case = part des abonnés dont un abonnement est encore en cours à la fin du mois (ou à ce jour).
//  • Activité : cohorte = mois d'inscription ; case = part des membres actifs ce mois-là (table user_activity_month, passé reconstitué : sous-estimé).
import { pool } from '../../db.js';
import { TZ } from '../../revision.js';
import { todayStr } from '../../stats.js';
import { z } from 'zod';

// ------------------------------------------------------------------ Fonctions pures (testées sans base)
export const monthOf = (day) => String(day).slice(0, 7);
export function addMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function lastDayOf(m) {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
}
/** Les `count` derniers mois, du plus ancien au mois courant. */
export const monthsList = (currentMonth, count = 12) => Array.from({ length: count }, (_, i) => addMonths(currentMonth, i - (count - 1)));
export const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
export const rate = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);

/** Matrice de cohortes : pour chaque mois de départ, la case k (k = 0, 1, 2…) vaut { n, pct } ou null si le mois n'est pas encore arrivé. `test(user, month, day)` dit si le membre « compte » ce mois-là. */
function matrix(users, months, today, test) {
  const cur = monthOf(today);
  return months.map((m) => {
    const group = users.filter((u) => u.cohort === m);
    const cells = [];
    for (let k = 0; ; k += 1) {
      const mk = addMonths(m, k);
      if (mk > cur) break;
      const day = lastDayOf(mk) < today ? lastDayOf(mk) : today; // mois en cours : état à ce jour
      const n = group.filter((u) => test(u, mk, day)).length;
      cells.push({ n, pct: pct(n, group.length) });
    }
    return { cohort: m, size: group.length, cells };
  });
}
/** users : [{ cohort: 'AAAA-MM', subs: [{ from: 'AAAA-MM-JJ', to: 'AAAA-MM-JJ' | null }] }] */
export const retentionMatrix = (users, months, today) =>
  matrix(users, months, today, (u, _mk, day) => u.subs.some((s) => s.from <= day && (!s.to || s.to > day)));
/** users : [{ cohort, active: ['AAAA-MM', …] }] */
export const activityMatrix = (users, months, today) => matrix(users, months, today, (u, mk) => u.active.includes(mk));

// ------------------------------------------------------------------ Définition SQL d'un abonnement « payant »
const PAID = `(
  (s.trial_end IS NULL AND s.status NOT IN ('incomplete', 'incomplete_expired'))
  OR (s.trial_end IS NOT NULL AND (s.status IN ('active', 'past_due', 'unpaid') OR (s.status = 'canceled' AND s.updated_at > s.trial_end + interval '1 hour'))))`;
const PAID_FROM = `(CASE WHEN s.trial_end IS NULL THEN s.created_at ELSE s.trial_end END)`;
const PAID_TO = `(CASE WHEN s.status IN ('canceled', 'incomplete_expired') THEN s.updated_at END)`;

const num = (v) => Number(v) || 0;

export async function buildGrowth(days, now = todayStr()) {
  const addDay = async (d, n) => (await pool.query('SELECT ($1::date + $2::int)::text AS d', [d, n])).rows[0].d;
  const until = now;
  const since = await addDay(until, -(days - 1));

  // Entonnoir
  const visitors = num((await pool.query(
    `SELECT sum(visitors) AS n FROM stat_dim_daily WHERE audience = 'web' AND dim = 'all' AND day BETWEEN $1::date AND $2::date`, [since, until])).rows[0].n);
  const f = (await pool.query(
    `WITH new_users AS (SELECT id FROM users WHERE role = 'user' AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date)
     SELECT (SELECT count(*) FROM new_users)::int AS signups,
            (SELECT count(*) FROM new_users n WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = n.id AND s.trial_end IS NOT NULL))::int AS trials,
            (SELECT count(*) FROM new_users n WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = n.id AND ${PAID}))::int AS paid,
            (SELECT count(*) FROM new_users n WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = n.id AND ${PAID} AND s.tier = 'learning'))::int AS paid_learning,
            (SELECT count(*) FROM new_users n WHERE EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = n.id AND s.trial_end IS NOT NULL)
                AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = n.id AND ${PAID}))::int AS trial_to_paid`, [since, until])).rows[0];
  const funnel = {
    visitors, signups: f.signups, trials: f.trials, paid: f.paid, paidLearning: f.paid_learning, paidStandard: f.paid - f.paid_learning,
    rates: { signupPerVisitor: rate(f.signups, visitors), trialPerSignup: rate(f.trials, f.signups), paidPerSignup: rate(f.paid, f.signups), paidPerTrial: rate(f.trial_to_paid, f.trials) },
  };

  // Cohortes : 12 derniers mois
  const months = monthsList(monthOf(now), 12);
  const firstDay = `${months[0]}-01`;
  const subs = (await pool.query(
    `SELECT s.user_id, (${PAID_FROM} AT TIME ZONE '${TZ}')::date::text AS from_day, (${PAID_TO} AT TIME ZONE '${TZ}')::date::text AS to_day
       FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.role = 'user' AND ${PAID}`)).rows;
  const byUser = new Map();
  for (const r of subs) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push({ from: r.from_day, to: r.to_day }); }
  const payers = [];
  for (const list of byUser.values()) {
    const first = list.reduce((a, s) => (s.from < a ? s.from : a), list[0].from);
    if (first >= firstDay) payers.push({ cohort: monthOf(first), subs: list });
  }
  const act = (await pool.query(
    `SELECT to_char(date_trunc('month', u.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS cohort,
            coalesce(array_agg(to_char(a.month, 'YYYY-MM')) FILTER (WHERE a.month IS NOT NULL), '{}') AS active
       FROM users u LEFT JOIN user_activity_month a ON a.user_id = u.id
      WHERE u.role = 'user' AND (u.created_at AT TIME ZONE '${TZ}')::date >= $1::date GROUP BY u.id, 1`, [firstDay])).rows;
  return {
    days, since, until, generatedAt: new Date().toISOString(), funnel,
    retention: retentionMatrix(payers, months, now), activity: activityMatrix(act, months, now),
  };
}

// ------------------------------------------------------------------ Mois d'activité d'un compte (écriture légère, une fois par compte et par mois et par processus)
const seen = new Map(); // compte → mois déjà enregistré
export async function recordActivity(userId) {
  const m = `${monthOf(todayStr())}-01`;
  if (!userId || seen.get(userId) === m) return;
  seen.set(userId, m);
  if (seen.size > 50000) seen.clear();
  try { await pool.query('INSERT INTO user_activity_month(user_id, month) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, m]); } catch { seen.delete(userId); }
}
export const forgetActivityCache = () => seen.clear(); // tests
export function startActivityMaintenance(log) {
  const run = () => pool.query(`DELETE FROM user_activity_month WHERE month < (date_trunc('month', now()) - interval '26 months')::date`).catch((e) => log?.error?.(e, 'Entretien des mois d\'activité'));
  run();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}

export default async function growthRoutes(app) {
  const q = z.object({ days: z.coerce.number().int().refine((n) => [7, 30, 90, 365].includes(n), 'days').default(30) });
  app.get('/admin/stats/growth', { preHandler: app.requireRole('admin') }, async (req, reply) => {
    const { days } = q.parse(req.query);
    reply.header('cache-control', 'private, no-store');
    return buildGrowth(days);
  });
}
