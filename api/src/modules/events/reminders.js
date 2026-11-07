// Événements en direct, étape 3 : rappels aux membres inscrits (« Me rappeler »), par notification (téléphone et navigateur) et par e-mail.
//   • « jour »  : une fois, quand il reste de 24 h à 3 h avant le début (pas de rappel « de la veille » en retard : si le membre s'est inscrit
//                 à moins de 24 h du début, ce rappel est passé directement) ;
//   • « soon »  : une fois, dans les 30 minutes qui précèdent le début (jusqu'à 5 minutes après) ;
//   • annulation : une fois, si l'événement est annulé avant sa fin prévue.
// Chaque envoi est « réservé » en base avant de partir (UPDATE … WHERE colonne IS NULL) : deux passages ne peuvent pas envoyer deux fois.
// Un membre désactivé ne reçoit rien ; sans canal (ni SMTP, ni notification) il ne se passe rien.
import { pool } from '../../db.js';
import { enqueueForUser, smtpConf } from '../../mailer.js';
import { anyPushChannel, pushToUser, evWhen } from '../../push.js';
import { featureOn } from '../../features.js';
import { anyWebSubscription } from '../../webPush.js';

export const DAY_MAX_MIN = 24 * 60; // le rappel « jour » part au plus 24 h avant…
export const DAY_MIN_MIN = 3 * 60; //  …et au plus tard 3 h avant
export const SOON_MIN = 30;
export const SOON_GRACE_MIN = 5;
const langOf = (l) => (['fr', 'en', 'ar'].includes(String(l).slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

// Quel rappel est dû pour un événement, à cet instant ? ('day' | 'soon' | null) — règle pure, testée seule.
export function dueKind(startsAt, now = new Date()) {
  const min = (new Date(startsAt).getTime() - now.getTime()) / 60000;
  if (min <= SOON_MIN && min > -SOON_GRACE_MIN) return 'soon';
  if (min <= DAY_MAX_MIN && min > DAY_MIN_MIN) return 'day';
  return null;
}

/** Un passage : envoie ce qui est dû. `deps` permet de tester sans réseau (push, mail, canaux). Renvoie le nombre d'envois. */
export async function runEventReminders(log, now = new Date(), deps = {}) {
  const send = deps.send || pushToUser;
  const mail = deps.mail || ((uid, kind, vars, key) => enqueueForUser(pool, uid, kind, vars, key));
  if (!(await featureOn('events'))) return 0;
  const mailOn = deps.mailOn ?? Boolean(await smtpConf());
  const pushOn = deps.pushOn ?? ((await anyPushChannel()) || ((await featureOn('webpush')) && (await anyWebSubscription())));
  if (!mailOn && !pushOn) return 0;
  const claim = async (eventId, userId, col) => (await pool.query(`UPDATE event_reminders SET ${col} = now() WHERE event_id = $1 AND user_id = $2 AND ${col} IS NULL RETURNING 1`, [eventId, userId])).rowCount > 0;
  let n = 0;
  const deliver = async (r, kind, col, vars) => {
    const lang = langOf(r.locale);
    if (!(await claim(r.event_id, r.user_id, col))) return;
    const path = kind === 'event_cancelled' ? '/events' : `/events/${r.event_id}`;
    const at = new Date(r.starts_at).toISOString();
    if (pushOn && (await send(r.user_id, kind, { title: r.title, at, ...vars }, path, log)) > 0) n += 1;
    if (mailOn) { await mail(r.user_id, kind, { title: r.title, when: evWhen(at, lang), path, ...vars }, `event:${r.event_id}:${r.user_id}:${kind}`); n += 1; }
  };
  const base = `SELECT r.event_id, r.user_id, e.title, e.starts_at, u.locale
                  FROM event_reminders r JOIN events e ON e.id = r.event_id JOIN users u ON u.id = r.user_id`;
  try {
    // Rappels « jour » et « soon » : événements publiés, à venir
    const win = (await pool.query(
      `${base} WHERE e.status = 'published' AND u.disabled_at IS NULL
         AND e.starts_at > $1::timestamptz - make_interval(mins => ${SOON_GRACE_MIN}) AND e.starts_at <= $1::timestamptz + make_interval(mins => ${DAY_MAX_MIN})
         AND (r.day_sent_at IS NULL OR r.soon_sent_at IS NULL)
       ORDER BY e.starts_at, r.user_id LIMIT 1000`, [now.toISOString()])).rows;
    for (const r of win) {
      try {
        const k = dueKind(r.starts_at, now);
        if (k === 'soon') { await deliver(r, 'event_soon', 'soon_sent_at'); }
        else if (k === 'day') { await deliver(r, 'event_reminder', 'day_sent_at'); }
      } catch (err) { log?.warn?.(`Rappel d'événement (${r.user_id}) : ${err.message}`); }
    }
    // Annulations : avant la fin prévue de l'événement
    const canc = (await pool.query(
      `${base} WHERE e.status = 'cancelled' AND u.disabled_at IS NULL AND r.cancel_sent_at IS NULL
         AND e.starts_at + make_interval(mins => e.duration_minutes) > $1::timestamptz
       ORDER BY e.starts_at, r.user_id LIMIT 1000`, [now.toISOString()])).rows;
    for (const r of canc) {
      try { await deliver(r, 'event_cancelled', 'cancel_sent_at'); } catch (err) { log?.warn?.(`Annulation d'événement (${r.user_id}) : ${err.message}`); }
    }
  } catch (err) { log?.warn?.(`Rappels d'événements : ${err.message}`); }
  if (n) log?.info?.(`Rappels d'événements : ${n} envoi(s).`);
  return n;
}

export function startEventReminders(log, everyMs = 5 * 60 * 1000) {
  const tick = () => runEventReminders(log).catch((err) => log?.warn?.(`Rappels d'événements : ${err.message}`));
  setTimeout(tick, 70000);
  return setInterval(tick, everyMs);
}
