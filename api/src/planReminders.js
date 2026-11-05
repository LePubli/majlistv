// Planning, étape 3 : rappels par notification et par e-mail, choisis par le membre (palier Apprentissage).
//   • récapitulatif du matin : à l'heure choisie (Paris), pendant 3 h au plus, une fois par jour, seulement s'il y a quelque chose à faire ;
//   • veille d'une échéance : même créneau du matin, une fois par jour ;
//   • série à sauver : le soir (18 h → 21 h, Paris), une fois par jour, seulement si la série est en jeu.
// Aucun texte d'engagement ni de bilan n'est mis dans une notification ou un e-mail : seulement des nombres. Rien ne part sans canal choisi.
import { pool } from './db.js';
import { featureOn } from './features.js';
import { hasLearningTier } from './access.js';
import { enqueueForUser, smtpConf } from './mailer.js';
import { anyPushChannel, pushToUser } from './push.js';
import { parisDay } from './parisTime.js';
import { agendaOf, deadlinesOf, weekOutlook } from './learningPlan.js';
import { streakSummary, activeDaysOf, goalOf, addDays } from './learningStreak.js';

export const STREAK_FROM = 18; // à partir de 18 h
export const STREAK_UNTIL = 21; // jusqu'à 21 h (exclu)
export const nowDate = () => (process.env.PLAN_NOW ? new Date(process.env.PLAN_NOW) : new Date());

export const prefsOf = async (userId) => {
  const r = (await pool.query('SELECT push, email, morning, deadline, streak, morning_hour AS "morningHour" FROM learning_plan_prefs WHERE user_id = $1', [userId])).rows[0];
  return r || { push: false, email: false, morning: true, deadline: true, streak: false, morningHour: 8 };
};

// Une ligne par type d'activité, en nombres seulement (pas de texte personnel). Les titres de vidéos et de révisions sont des contenus publics du catalogue.
const lineFr = (a) => [
  a.revisions.length ? `• ${a.revisions.length} révision(s) de quiz : ${a.revisions.slice(0, 3).join(' · ')}${a.revisions.length > 3 ? '…' : ''}` : '',
  a.cards ? `• ${a.cards} carte(s) mémoire` : '', a.quran ? '• Votre juz du jour' : '', a.athkar ? '• Vos adhkar du jour' : '',
  a.actions ? `• ${a.actions} action(s) à mettre en pratique` : '', a.bilan ? '• Le point de la semaine' : '',
  a.mine ? `• ${a.mine} séance(s) que vous avez choisie(s)${a.mineTitles.length ? ` : ${a.mineTitles.slice(0, 3).join(' · ')}` : ''}` : '',
].filter(Boolean).join('\n');
const lineEn = (a) => [
  a.revisions.length ? `• ${a.revisions.length} quiz review(s): ${a.revisions.slice(0, 3).join(' · ')}${a.revisions.length > 3 ? '…' : ''}` : '',
  a.cards ? `• ${a.cards} memory card(s)` : '', a.quran ? '• Your juz of the day' : '', a.athkar ? '• Your adhkar of the day' : '',
  a.actions ? `• ${a.actions} action(s) to put into practice` : '', a.bilan ? '• The weekly check-in' : '',
  a.mine ? `• ${a.mine} session(s) you chose${a.mineTitles.length ? `: ${a.mineTitles.slice(0, 3).join(' · ')}` : ''}` : '',
].filter(Boolean).join('\n');
const lineAr = (a) => [
  a.revisions.length ? `• ${a.revisions.length} مراجعة اختبار: ${a.revisions.slice(0, 3).join(' · ')}${a.revisions.length > 3 ? '…' : ''}` : '',
  a.cards ? `• ${a.cards} بطاقة` : '', a.quran ? '• جزء اليوم' : '', a.athkar ? '• أذكار اليوم' : '',
  a.actions ? `• ${a.actions} عمل للتطبيق` : '', a.bilan ? '• مراجعة الأسبوع' : '',
  a.mine ? `• ${a.mine} جلسة اخترتها${a.mineTitles.length ? `: ${a.mineTitles.slice(0, 3).join(' · ')}` : ''}` : '',
].filter(Boolean).join('\n');
const goalLine = (o, lang) => (lang === 'en' ? `Weekly goal: ${o.done} / ${o.goal} days${o.reachable ? ' — on track if you follow your plan.' : ` — ${o.missing} more day(s) to plan.`}`
  : lang === 'ar' ? `هدف الأسبوع: ${o.done} / ${o.goal} أيام${o.reachable ? ' — يتحقق إن التزمت بمخططك.' : ` — بقي ${o.missing} أيام للتخطيط.`}`
    : `Objectif de la semaine : ${o.done} / ${o.goal} jours${o.reachable ? ' — atteint si vous suivez votre plan.' : ` — il manque ${o.missing} jour(s) à prévoir.`}`);
const langOf = (l) => (['fr', 'en', 'ar'].includes(String(l).slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

/** Un passage : envoie ce qui est dû à ce moment. `deps` permet de tester sans réseau. */
export async function runPlanReminders(log, now = nowDate(), deps = {}) {
  const send = deps.send || pushToUser;
  const mail = deps.mail || ((uid, kind, vars, key) => enqueueForUser(pool, uid, kind, vars, key));
  if (!(await featureOn('learning'))) return 0;
  const mailOn = deps.mailOn ?? Boolean(await smtpConf());
  const pushOn = deps.pushOn ?? (await anyPushChannel());
  if (!mailOn && !pushOn) return 0;
  const d = parisDay(now);
  const { rows } = await pool.query(
    `SELECT p.user_id, p.push, p.email, p.morning, p.deadline, p.streak, p.morning_hour, u.locale
       FROM learning_plan_prefs p JOIN users u ON u.id = p.user_id
      WHERE (p.push OR p.email) AND u.disabled_at IS NULL
        AND ((p.morning AND p.last_morning_on IS DISTINCT FROM $2::date AND p.morning_hour <= $1 AND $1 < p.morning_hour + 3)
          OR (p.deadline AND p.last_deadline_on IS DISTINCT FROM $2::date AND p.morning_hour <= $1 AND $1 < p.morning_hour + 3)
          OR (p.streak AND p.last_streak_on IS DISTINCT FROM $2::date AND $1 >= $3 AND $1 < $4))
      ORDER BY p.user_id LIMIT 500`, [d.hour, d.date, STREAK_FROM, STREAK_UNTIL]);
  let n = 0;
  const claim = async (uid, col) => (await pool.query(`UPDATE learning_plan_prefs SET ${col} = $2 WHERE user_id = $1 AND ${col} IS DISTINCT FROM $2::date RETURNING user_id`, [uid, d.date])).rowCount > 0;
  for (const r of rows) {
    try {
      if (!(await hasLearningTier(r.user_id))) continue;
      const lang = langOf(r.locale);
      const viaPush = r.push && pushOn; const viaMail = r.email && mailOn;
      if (!viaPush && !viaMail) continue;
      const inMorning = d.hour >= r.morning_hour && d.hour < r.morning_hour + 3;
      // 1. Récapitulatif du matin
      if (r.morning && inMorning && (await claim(r.user_id, 'last_morning_on'))) {
        const a = await agendaOf(r.user_id, d.date);
        if (a.total > 0) {
          const active = await activeDaysOf(r.user_id); const g = await goalOf(r.user_id);
          const o = await weekOutlook(r.user_id, d.date, active, g.goal);
          if (viaPush) n += (await send(r.user_id, 'plan_daily', { count: a.total }, '/learning?tab=plan', log)) > 0 ? 1 : 0;
          if (viaMail) { await mail(r.user_id, 'plan_daily', { count: a.total, items: { fr: lineFr, en: lineEn, ar: lineAr }[lang](a), goal: goalLine(o, lang), path: '/learning?tab=plan' }, `plan:daily:${r.user_id}:${d.date}`); n += 1; }
        }
      }
      // 2. Veille d'une échéance
      if (r.deadline && inMorning && (await claim(r.user_id, 'last_deadline_on'))) {
        const eve = (await deadlinesOf(r.user_id, d.date)).filter((x) => x.dueOn === addDays(d.date, 1));
        for (const x of eve) {
          const left = x.total - x.done;
          if (viaPush) n += (await send(r.user_id, 'plan_deadline', { title: x.title, left }, '/learning?tab=plan', log)) > 0 ? 1 : 0;
          if (viaMail) { await mail(r.user_id, 'plan_deadline', { title: x.title, done: x.done, total: x.total, left, path: '/learning?tab=plan' }, `plan:deadline:${x.id}:${d.date}`); n += 1; }
        }
      }
      // 3. Série à sauver (le soir)
      if (r.streak && d.hour >= STREAK_FROM && d.hour < STREAK_UNTIL && (await claim(r.user_id, 'last_streak_on'))) {
        const s = await streakSummary(r.user_id);
        if (s.atRisk) {
          if (viaPush) n += (await send(r.user_id, 'plan_streak', { n: s.current }, '/learning?tab=plan', log)) > 0 ? 1 : 0;
          if (viaMail) { await mail(r.user_id, 'plan_streak', { n: s.current, path: '/learning?tab=plan' }, `plan:streak:${r.user_id}:${d.date}`); n += 1; }
        }
      }
    } catch (err) { log?.warn?.(`Rappels du planning (${r.user_id}) : ${err.message}`); }
  }
  if (n) log?.info?.(`Rappels du planning : ${n} envoi(s).`);
  return n;
}

export function startPlanReminders(log, everyMs = 10 * 60 * 1000) {
  const tick = () => runPlanReminders(log).catch((err) => log?.warn?.(`Rappels du planning : ${err.message}`));
  setTimeout(tick, 65000);
  return setInterval(tick, everyMs);
}
