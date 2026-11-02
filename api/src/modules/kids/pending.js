// Étape B5 — Validations en attente chez le parent : petites actions (« je l'ai fait ») et actions du circuit de Ramadan des enfants.
//  - pendingFor(userId) : { total, profiles: [{ id, name, avatar, actions, ramadan, total }] } (pastille, bandeau de l'espace Kids)
//  - runPending(log, now) : UNE notification regroupée par jour et par parent, à partir de l'heure réglée (Paris),
//    seulement s'il existe une demande NOUVELLE depuis le dernier signal (on ne relance pas chaque jour pour la même demande).
//    Notification push (si le parent a activé les notifications) + e-mail (sauf s'il l'a désactivé).
import { pool } from '../../db.js';
import { featureOn } from '../../features.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { parisDay } from '../../parisTime.js';
import { enqueueForUser } from '../../mailer.js';
import { pushToUser, anyPushChannel } from '../../push.js';

export const nowDate = () => (process.env.KIDS_PENDING_NOW ? new Date(process.env.KIDS_PENDING_NOW) : new Date());

export async function pendingFor(userId) {
  const ramadanOn = await featureOn('ramadan');
  const { rows } = await pool.query(
    `SELECT k.id, k.name, k.avatar,
            (SELECT count(*)::int FROM kid_actions a WHERE a.profile_id = k.id AND a.status = 'claimed') AS actions,
            CASE WHEN $2 THEN (SELECT count(*)::int FROM ramadan_kid_marks m WHERE m.profile_id = k.id AND m.status = 'claimed') ELSE 0 END AS ramadan
       FROM kid_profiles k WHERE k.user_id = $1 ORDER BY k.created_at`, [userId, ramadanOn]);
  const profiles = rows.map((r) => ({ ...r, total: r.actions + r.ramadan })).filter((r) => r.total > 0);
  return { total: profiles.reduce((a, p) => a + p.total, 0), profiles };
}

// Parents à prévenir : pas déjà prévenus aujourd'hui (Paris) et au moins une demande arrivée APRÈS le dernier signal.
const LOCAL = (col) => `(${col} AT TIME ZONE 'Europe/Paris')::date`;
async function candidates(day) {
  const ramadanOn = await featureOn('ramadan');
  const { rows } = await pool.query(
    `SELECT u.id, u.notify_push, u.kids_pending_email FROM users u
      WHERE u.disabled_at IS NULL AND (u.kids_pending_at IS NULL OR ${LOCAL('u.kids_pending_at')} < $1::date)
        AND (EXISTS (SELECT 1 FROM kid_actions a JOIN kid_profiles k ON k.id = a.profile_id
                      WHERE k.user_id = u.id AND a.status = 'claimed' AND (u.kids_pending_at IS NULL OR a.claimed_at > u.kids_pending_at))
          OR ($2 AND EXISTS (SELECT 1 FROM ramadan_kid_marks m JOIN kid_profiles k ON k.id = m.profile_id
                      WHERE k.user_id = u.id AND m.status = 'claimed' AND (u.kids_pending_at IS NULL OR m.claimed_at > u.kids_pending_at))))`,
    [day, ramadanOn]);
  return rows;
}

export async function runPending(log, now = nowDate(), { send = pushToUser, hasChannel = anyPushChannel } = {}) {
  if (!isOn(await getSetting('kids_enabled')) || !isOn(await getSetting('kids_pending_enabled'))) return 0;
  const d = parisDay(now);
  const hour = await getNumber('kids_pending_hour');
  if (d.hour < (Number.isFinite(hour) ? hour : 18)) return 0;
  const push = await hasChannel();
  let n = 0;
  for (const u of await candidates(d.date)) {
    // Réservation du jour (jamais deux signaux le même jour, même avec plusieurs copies de l'API).
    const claim = await pool.query(`UPDATE users SET kids_pending_at = $2 WHERE id = $1 AND (kids_pending_at IS NULL OR ${LOCAL('kids_pending_at')} < $3::date) RETURNING id`, [u.id, now, d.date]);
    if (!claim.rowCount) continue;
    try {
      const p = await pendingFor(u.id);
      if (!p.total) continue;
      const names = p.profiles.map((x) => x.name).join(', ');
      let sent = false;
      if (push && u.notify_push) sent = (await send(u.id, 'kids_pending', { count: p.total, names }, '/kids', log)) > 0 || sent;
      if (u.kids_pending_email) { await enqueueForUser(pool, u.id, 'kids_pending', { count: String(p.total), children: names, path: '/kids' }, `kidspending:${u.id}:${d.date}`); sent = true; }
      if (sent) n++;
    } catch (err) { log?.warn?.(`Signal Kids (${u.id}) : ${err.message}`); }
  }
  if (n) log?.info?.(`Parents prévenus de validations en attente : ${n}`);
  return n;
}

export function startPending(log, everyMs = 15 * 60 * 1000) {
  const tick = () => runPending(log).catch((err) => log?.warn?.(`Signal Kids : ${err.message}`));
  setTimeout(tick, 30 * 1000).unref?.();
  setInterval(tick, everyMs).unref?.();
}
