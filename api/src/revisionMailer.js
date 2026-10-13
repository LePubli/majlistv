// E-mail quotidien « à réviser aujourd'hui » (palier Apprentissage).
// Une boucle de fond vérifie toutes les 10 minutes : à partir de l'heure réglée (heure de Paris), chaque membre Apprentissage
// qui a au moins une révision du jour reçoit UN e-mail (jamais deux le même jour, même après un redémarrage), sauf s'il l'a désactivé.
import { pool } from './db.js';
import { getSetting, isOn } from './settings.js';
import { enqueueForUser, smtpConf } from './mailer.js';
import { dueTalks, reminderOfTheDay, parisHour, todayParis } from './revision.js';

const LOCALE_LANG = (l) => (['fr', 'en', 'ar'].includes(String(l).slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

// Membres du palier Apprentissage (abonnement en cours ou admin) qui n'ont pas désactivé l'e-mail et n'ont pas déjà reçu celui d'aujourd'hui.
export async function candidates(today) {
  const { rows } = await pool.query(
    `SELECT u.id FROM users u LEFT JOIN learning_prefs p ON p.user_id = u.id
      WHERE COALESCE(p.daily_email, true) AND (p.last_emailed_on IS NULL OR p.last_emailed_on < $1::date)
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.tier = 'learning'
              AND s.status IN ('trialing', 'active', 'past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now() - interval '2 days')))`, [today]);
  return rows.map((r) => r.id);
}

// Prépare l'e-mail d'un membre ; renvoie false s'il n'y a rien à réviser.
async function sendFor(userId, today) {
  const { items, total } = await dueTalks(userId);
  if (!items.length) return false;
  const { rows: talks } = await pool.query('SELECT id, title FROM talks WHERE id = ANY($1::uuid[])', [items.map((x) => x.id)]);
  const title = new Map(talks.map((x) => [x.id, x.title]));
  const lines = items.map((x) => `• ${title.get(x.id)}`);
  if (total > items.length) lines.push(`+ ${total - items.length}`);
  const rem = await reminderOfTheDay(userId);
  await enqueueForUser(pool, userId, 'revision_daily', {
    count: total, titles: lines.join('\n'), reminder: rem ? rem.text : '', source: rem ? [rem.attribution, rem.talkTitle].filter(Boolean).join(' · ') : '', path: '/learning',
  }, `revision:${userId}:${today}`);
  return true;
}

export async function runDaily(log) {
  if (!isOn(await getSetting('revision_email_enabled'))) return 0;
  if (!(await smtpConf())) return 0; // envoi non configuré : rien n'est mis en file
  const hour = Number(await getSetting('revision_email_hour'));
  if ((await parisHour()) < (Number.isFinite(hour) ? hour : 8)) return 0;
  const today = await todayParis();
  let sent = 0;
  for (const id of await candidates(today)) {
    try {
      if (await sendFor(id, today)) sent += 1;
      // Que l'e-mail parte ou non (rien à réviser), on ne recalcule pas ce membre avant demain.
      await pool.query(
        `INSERT INTO learning_prefs(user_id, last_emailed_on) VALUES ($1, $2::date) ON CONFLICT (user_id) DO UPDATE SET last_emailed_on = $2::date`, [id, today]);
    } catch (err) {
      log?.warn(`E-mail de révision (${id}) : ${err.message}`);
    }
  }
  if (sent) log?.info(`E-mails de révision mis en file : ${sent}`);
  return sent;
}

export function startRevisionMailer(log, everyMs = 10 * 60 * 1000) {
  const tick = () => runDaily(log).catch((err) => log?.warn(`Révision quotidienne : ${err.message}`));
  setTimeout(tick, 20000);
  return setInterval(tick, everyMs);
}
