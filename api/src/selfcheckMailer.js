// Rappel hebdomadaire du bilan personnel (palier Apprentissage). Une boucle de fond vérifie toutes les 10 minutes : le jour choisi par
// chaque membre (vendredi par défaut) et à partir de l'heure réglée (17 h, heure de Paris), il reçoit UN e-mail par semaine (jamais deux,
// même après un redémarrage), sauf s'il l'a désactivé. L'e-mail ne contient que des chiffres et un lien : jamais le texte des objectifs
// ni des engagements, car un e-mail n'est pas chiffré.
import { pool } from './db.js';
import { getSetting, isOn } from './settings.js';
import { enqueueForUser, smtpConf } from './mailer.js';
import { parisHour } from './revision.js';

const TZ = 'Europe/Paris';

// Membres Apprentissage ayant donné leur accord, dont le jour de rappel est aujourd'hui et qui n'ont pas déjà été traités cette semaine.
export async function candidates() {
  const { rows } = await pool.query(
    `WITH n AS (SELECT (now() AT TIME ZONE '${TZ}')::date AS d, date_trunc('week', now() AT TIME ZONE '${TZ}')::date AS wk, extract(isodow FROM now() AT TIME ZONE '${TZ}')::int AS dow)
     SELECT u.id, to_char(n.wk, 'YYYY-MM-DD') AS week FROM users u, n
      WHERE u.practice_email AND u.practice_consent_at IS NOT NULL AND u.practice_weekday = n.dow
        AND (u.practice_last_week IS NULL OR u.practice_last_week < n.wk)
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.tier = 'learning'
              AND s.status IN ('trialing', 'active', 'past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now() - interval '2 days')))`);
  return rows;
}

// Prépare l'e-mail d'un membre ; renvoie false s'il n'y a rien à lui dire (aucun engagement en cours, bilan déjà fait pour tous ses objectifs).
async function sendFor(userId, week) {
  const c = (await pool.query(`SELECT count(*)::int AS n FROM practice_commitments WHERE user_id = $1 AND status IN ('todo', 'doing')`, [userId])).rows[0].n;
  const g = (await pool.query(
    `SELECT count(*)::int AS n FROM self_goals g WHERE g.user_id = $1 AND g.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM self_checkins k WHERE k.goal_id = g.id AND k.week = $2::date)`, [userId, week])).rows[0].n;
  if (!c && !g) return false;
  await enqueueForUser(pool, userId, 'selfcheck_weekly', { commitments: c ? String(c) : '', goals: g ? String(g) : '', path: '/learning#bilan' }, `selfcheck:${userId}:${week}`);
  return true;
}

export async function runWeekly(log) {
  if (!isOn(await getSetting('practice_email_enabled'))) return 0;
  if (!(await smtpConf())) return 0; // envoi non configuré : rien n'est mis en file
  const hour = Number(await getSetting('practice_email_hour'));
  if ((await parisHour()) < (Number.isFinite(hour) ? hour : 17)) return 0;
  let sent = 0;
  for (const { id, week } of await candidates()) {
    try {
      if (await sendFor(id, week)) sent += 1;
      // Que l'e-mail parte ou non (rien à dire), on ne recalcule pas ce membre avant la semaine prochaine.
      await pool.query('UPDATE users SET practice_last_week = $2::date WHERE id = $1', [id, week]);
    } catch (err) {
      log?.warn(`Rappel du bilan (${id}) : ${err.message}`);
    }
  }
  if (sent) log?.info(`Rappels du bilan mis en file : ${sent}`);
  return sent;
}

export function startSelfcheckMailer(log, everyMs = 10 * 60 * 1000) {
  const tick = () => runWeekly(log).catch((err) => log?.warn(`Rappel hebdomadaire du bilan : ${err.message}`));
  setTimeout(tick, 25000);
  return setInterval(tick, everyMs);
}
