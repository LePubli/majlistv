// Rapport de progression des enfants envoyé au parent (étape 26.3). Hebdomadaire : une boucle vérifie toutes les 10 minutes ;
// au jour et à l'heure réglés (heure de Paris), chaque parent ayant des profils reçoit UN e-mail (jamais deux le même jour), sauf s'il l'a désactivé.
// Aucun classement ni comparaison : une ligne par enfant.
import { pool } from './db.js';
import { getSetting, isOn } from './settings.js';
import { enqueueForUser, smtpConf } from './mailer.js';
import { hasActiveSubscription, hasLearningTier } from './access.js';
import { kidReport } from './kidsControl.js';
import { parisHour, todayParis, TZ } from './revision.js';

const W = {
  fr: { none: 'pas d\'activité', min: 'min', vid: (n) => `${n} vidéo${n > 1 ? 's' : ''} terminée${n > 1 ? 's' : ''}`, quiz: (n, a) => `${n} quiz (moyenne ${a} %)`, stars: (g, t) => `+${g} étoile${g > 1 ? 's' : ''} (total ${t})`, badges: (n) => `${n} badge${n > 1 ? 's' : ''}`, and: ' et ' },
  en: { none: 'no activity', min: 'min', vid: (n) => `${n} video${n > 1 ? 's' : ''} finished`, quiz: (n, a) => `${n} quiz${n > 1 ? 'zes' : ''} (average ${a}%)`, stars: (g, t) => `+${g} star${g > 1 ? 's' : ''} (total ${t})`, badges: (n) => `${n} badge${n > 1 ? 's' : ''}`, and: ' and ' },
  ar: { none: 'لا نشاط', min: 'دقيقة', vid: (n) => `${n} فيديو مكتمل`, quiz: (n, a) => `${n} اختبار (المعدل ${a}%)`, stars: (g, t) => `+${g} نجمة (المجموع ${t})`, badges: (n) => `${n} شارة`, and: ' و' },
};
const lang = (l) => (['fr', 'en', 'ar'].includes(String(l).slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

// Une ligne par enfant.
export function childLine(c, locale) {
  const w = W[lang(locale)];
  if (!c.active) return `${c.name} — ${w.none}`;
  const bits = [`${Math.max(1, c.minutes)} ${w.min}`];
  if (c.watched) bits.push(w.vid(c.watched));
  if (c.quizzes) bits.push(w.quiz(c.quizzes, c.avgPercent));
  if (c.starsGained) bits.push(w.stars(c.starsGained, c.stars));
  if (c.badges.length) bits.push(w.badges(c.badges.length));
  return `${c.name} — ${bits.join(' · ')}`;
}

// Met en file le rapport d'un parent. Renvoie false s'il n'a aucun profil. `onlyIfActive` : rien si aucun enfant n'a été actif.
export async function queueReport(userId, { days = 7, onlyIfActive = false, dedupeKey = null } = {}) {
  const u = (await pool.query('SELECT locale FROM users WHERE id = $1', [userId])).rows[0];
  if (!u) return false;
  const rep = await kidReport(userId, days, await hasLearningTier(userId));
  if (!rep.profiles.length) return false;
  if (onlyIfActive && !rep.profiles.some((p) => p.active)) return false;
  const names = rep.profiles.map((p) => p.name);
  const retry = [...new Set(rep.profiles.flatMap((p) => p.retry))].slice(0, 5).map((x) => `« ${x} »`).join(', ');
  const lines = rep.profiles.map((p) => childLine(p, u.locale));
  await enqueueForUser(pool, userId, 'kids_report', {
    children: names.join(', '), days: rep.days, summary: lines.join('\n'), retry, path: '/kids',
  }, dedupeKey);
  return true;
}

export const sendReportNow = (userId) => queueReport(userId, { days: 7, dedupeKey: `kidsreport-now:${userId}:${Date.now()}` });

// Parents qui ont des profils, n'ont pas désactivé le rapport et n'ont pas déjà reçu celui d'aujourd'hui.
export async function candidates(today) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role FROM users u
      WHERE u.kids_report_email AND (u.kids_report_last IS NULL OR u.kids_report_last < $1::date)
        AND EXISTS (SELECT 1 FROM kid_profiles k WHERE k.user_id = u.id)`, [today]);
  return rows;
}

export async function runWeekly(log, { force = false } = {}) {
  if (!isOn(await getSetting('kids_enabled')) || !isOn(await getSetting('kids_report_enabled'))) return 0;
  if (!force) {
    if (!(await smtpConf())) return 0; // envoi non configuré : rien n'est mis en file
    const dow = (await pool.query(`SELECT extract(dow FROM now() AT TIME ZONE '${TZ}')::int AS d`)).rows[0].d;
    const day = Number(await getSetting('kids_report_weekday')), hour = Number(await getSetting('kids_report_hour'));
    if (dow !== (Number.isFinite(day) ? day : 0) || (await parisHour()) < (Number.isFinite(hour) ? hour : 18)) return 0;
  }
  const today = await todayParis();
  let sent = 0;
  for (const u of await candidates(today)) {
    try {
      const allowed = u.role === 'admin' || (await hasActiveSubscription(u.id)) || (await hasLearningTier(u.id));
      if (allowed && (await queueReport(u.id, { onlyIfActive: true, dedupeKey: `kidsreport:${u.id}:${today}` }))) sent += 1;
      await pool.query('UPDATE users SET kids_report_last = $2::date WHERE id = $1', [u.id, today]);
    } catch (err) {
      log?.warn(`Rapport Kids (${u.id}) : ${err.message}`);
    }
  }
  if (sent) log?.info(`Rapports Kids mis en file : ${sent}`);
  return sent;
}

export function startKidsReportMailer(log, everyMs = 10 * 60 * 1000) {
  const tick = () => runWeekly(log).catch((err) => log?.warn(`Rapport Kids : ${err.message}`));
  setTimeout(tick, 30000);
  return setInterval(tick, everyMs);
}
