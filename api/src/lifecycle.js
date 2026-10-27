// Étape 33 — E-mails automatiques de cycle de vie. Trois messages, chacun envoyé AU PLUS UNE FOIS par situation :
//  • resume_talk   : une conférence commencée (≥ 2 min, non terminée) et laissée de côté depuis N jours → « Reprenez là où vous vous êtes arrêté ».
//  • welcome_nudge : un compte créé depuis N jours qui n'a encore rien regardé → trois conférences pour commencer.
//  • winback       : un abonnement terminé depuis N jours (et plus aucun accès) → les nouveautés depuis son départ.
// Garde-fous : désactivé par défaut (réglage maître) ; préférence du membre (notify_lifecycle) ; un seul message par personne et par
// « délai minimum » (lifecycle_gap_days) ; plage horaire (heure de Paris) ; plafond quotidien ; journal (lifecycle_log) ; lien de
// désinscription en un clic. Les e-mails déjà utiles (fin d'essai, paiement refusé, résiliation) existent depuis l'étape 4 et ne sont pas touchés.
import { pool } from './db.js';
import { getSetting, isOn, getNumber } from './settings.js';
import { enqueueEmail, smtpConf } from './mailer.js';
import { visibleSql } from './visibility.js';
import { adultSql } from './taxonomy.js';
import { parisHour } from './revision.js';
import { inSendWindow, clampInt, remainingToday, onePerUser, talkPath, minutesLabel, KINDS } from './lifecycleLib.js';

const TZ = 'Europe/Paris';
const READY = (t) => `${t}.video_status = 'ready' AND ${visibleSql(t)} AND ${adultSql(t)}`;
const card = (r) => ({ id: r.id, title: r.title, speaker: r.speaker || '', poster: Boolean(r.poster), path: talkPath(r) });
const bullet = (rows) => rows.map((r) => `• ${r.title}${r.speaker ? ` — ${r.speaker}` : ''}`).join('\n');
// Le membre a-t-il accès aux conférences premium en ce moment ? (même règle que access.js, en SQL)
const HAS_ACCESS = (u) => `(COALESCE(${u}.premium_until > now(), false) OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = ${u}.id AND s.status IN ('trialing', 'active', 'past_due')
  AND (s.current_period_end IS NULL OR s.current_period_end > now() - interval '2 days')))`;

export async function settings() {
  const [master, resume, nudge, winback] = await Promise.all(['lifecycle_enabled', 'lifecycle_resume_enabled', 'lifecycle_nudge_enabled', 'lifecycle_winback_enabled'].map(async (k) => isOn(await getSetting(k))));
  return {
    master, on: { resume_talk: resume, welcome_nudge: nudge, winback },
    resumeDays: clampInt(await getNumber('lifecycle_resume_days'), 1, 60, 3),
    nudgeDays: clampInt(await getNumber('lifecycle_nudge_days'), 1, 60, 3),
    winbackDays: clampInt(await getNumber('lifecycle_winback_days'), 1, 180, 14),
    gapDays: clampInt(await getNumber('lifecycle_gap_days'), 1, 60, 7),
    from: clampInt(await getNumber('lifecycle_hour_from'), 0, 23, 10),
    to: clampInt(await getNumber('lifecycle_hour_to'), 0, 23, 19),
    dailyMax: clampInt(await getNumber('lifecycle_daily_max'), 1, 5000, 100),
  };
}

// Conditions communes : membre actif, qui accepte ces e-mails, sans autre e-mail de ce type pendant le délai minimum.
const COMMON = (u, gapParam) => `${u}.notify_lifecycle AND ${u}.disabled_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM lifecycle_log l WHERE l.user_id = ${u}.id AND l.created_at > now() - make_interval(days => ${gapParam}))`;

// Trois conférences à proposer : les plus récentes, gratuites d'abord si `freeFirst`.
async function suggestions(n, freeFirst) {
  return (await pool.query(
    `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, (t.poster_key IS NOT NULL OR t.external_thumb IS NOT NULL) AS poster FROM talks t WHERE ${READY('t')}
      ORDER BY ${freeFirst ? "(t.access = 'free') DESC," : ''} t.created_at DESC LIMIT $1`, [n])).rows;
}

// Personnes à qui écrire pour chaque situation (sans tenir compte de la plage horaire ni du plafond).
export async function candidates(kind, cfg, limit = 500) {
  if (kind === 'resume_talk') {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (p.user_id) u.id AS "userId", u.email, u.name, u.locale, t.id AS "talkId", t.slug, t.title, trim(t.speaker) AS speaker, (t.poster_key IS NOT NULL OR t.external_thumb IS NOT NULL) AS poster, p.position_ms AS "positionMs"
         FROM watch_progress p JOIN users u ON u.id = p.user_id JOIN talks t ON t.id = p.talk_id
        WHERE NOT p.completed AND p.position_ms >= 120000 AND (p.duration_ms = 0 OR p.position_ms < p.duration_ms * 0.9)
          AND p.updated_at < now() - make_interval(days => $1) AND p.updated_at > now() - make_interval(days => $1 + 11)
          AND NOT EXISTS (SELECT 1 FROM watch_progress q WHERE q.user_id = p.user_id AND q.updated_at >= now() - make_interval(days => $1))
          AND ${READY('t')} AND (t.access = 'free' OR ${HAS_ACCESS('u')})
          AND ${COMMON('u', '$2')}
          AND NOT EXISTS (SELECT 1 FROM lifecycle_log l WHERE l.user_id = u.id AND l.kind = 'resume_talk' AND l.ref = t.id::text)
        ORDER BY p.user_id, p.updated_at DESC LIMIT $3`, [cfg.resumeDays, cfg.gapDays, limit]);
    return rows.map((r) => ({ ...r, ref: r.talkId }));
  }
  if (kind === 'welcome_nudge') {
    const { rows } = await pool.query(
      `SELECT u.id AS "userId", u.email, u.name, u.locale FROM users u
        WHERE u.created_at < now() - make_interval(days => $1) AND u.created_at > now() - make_interval(days => $1 + 14)
          AND NOT EXISTS (SELECT 1 FROM watch_progress p WHERE p.user_id = u.id)
          AND ${COMMON('u', '$2')}
          AND NOT EXISTS (SELECT 1 FROM lifecycle_log l WHERE l.user_id = u.id AND l.kind = 'welcome_nudge')
        ORDER BY u.created_at LIMIT $3`, [cfg.nudgeDays, cfg.gapDays, limit]);
    return rows.map((r) => ({ ...r, ref: 'once' }));
  }
  if (kind === 'winback') {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (u.id) u.id AS "userId", u.email, u.name, u.locale, s.id AS ref, s.current_period_end AS "endedAt"
         FROM subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.status NOT IN ('trialing', 'active', 'past_due', 'incomplete')
          AND s.current_period_end < now() - make_interval(days => $1) AND s.current_period_end > now() - make_interval(days => $1 + 30)
          AND NOT ${HAS_ACCESS('u')}
          AND ${COMMON('u', '$2')}
          AND NOT EXISTS (SELECT 1 FROM lifecycle_log l WHERE l.user_id = u.id AND l.kind = 'winback' AND l.ref = s.id)
        ORDER BY u.id, s.current_period_end DESC LIMIT $3`, [cfg.winbackDays, cfg.gapDays, limit]);
    return rows;
  }
  throw new Error(`Situation inconnue : ${kind}`);
}

const mask = (e) => String(e).replace(/^(.).*(@.*)$/, '$1•••$2');

// Aperçu pour l'admin : combien d'e-mails partiraient, sans rien envoyer.
export async function preview() {
  const cfg = await settings();
  const out = { cfg, kinds: {}, sentToday: 0, sent14: {}, smtp: Boolean(await smtpConf()), hour: await parisHour() };
  for (const k of KINDS) {
    const rows = await candidates(k, cfg, 2000);
    out.kinds[k] = { enabled: cfg.on[k], count: rows.length, sample: rows.slice(0, 3).map((r) => ({ email: mask(r.email), locale: r.locale, title: r.title || null })) };
  }
  out.sentToday = (await pool.query(`SELECT count(*)::int AS n FROM lifecycle_log WHERE created_at >= date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`)).rows[0].n;
  for (const r of (await pool.query(`SELECT kind, count(*)::int AS n FROM lifecycle_log WHERE created_at > now() - interval '14 days' GROUP BY kind`)).rows) out.sent14[r.kind] = r.n;
  out.inWindow = inSendWindow(out.hour, cfg.from, cfg.to);
  out.remaining = remainingToday(cfg.dailyMax, out.sentToday);
  return out;
}

// Met en file les e-mails dus. Renvoie le nombre mis en file.
export async function runLifecycle(log) {
  const cfg = await settings();
  if (!cfg.master || !(await smtpConf())) return 0;
  if (!inSendWindow(await parisHour(), cfg.from, cfg.to)) return 0;
  const sentToday = (await pool.query(`SELECT count(*)::int AS n FROM lifecycle_log WHERE created_at >= date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`)).rows[0].n;
  let left = remainingToday(cfg.dailyMax, sentToday);
  let total = 0;
  for (const kind of KINDS) {
    if (left <= 0 || !cfg.on[kind]) continue;
    const rows = onePerUser(await candidates(kind, cfg, left));
    if (!rows.length) continue;
    const sugg = kind === 'resume_talk' ? [] : await suggestions(3, kind === 'welcome_nudge');
    if (kind !== 'resume_talk' && !sugg.length) continue;
    for (const r of rows) {
      if (left <= 0) break;
      try {
        const ins = await pool.query('INSERT INTO lifecycle_log(user_id, kind, ref) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id', [r.userId, kind, String(r.ref)]);
        if (!ins.rowCount) continue;
        const vars = kind === 'resume_talk'
          ? { name: r.name, title: r.title, speaker: r.speaker || '', minutes: minutesLabel(r.positionMs), path: talkPath({ slug: r.slug, id: r.talkId }), cards: [card({ id: r.talkId, slug: r.slug, title: r.title, speaker: r.speaker, poster: r.poster })] }
          : { name: r.name, titles: bullet(sugg), cards: sugg.map(card), path: kind === 'winback' ? '/pricing' : '/' };
        await enqueueEmail(pool, { userId: r.userId, to: r.email, locale: r.locale, kind, vars, dedupeKey: `lc:${kind}:${r.userId}:${r.ref}` });
        left -= 1; total += 1;
      } catch (err) {
        log?.warn(`E-mail de cycle de vie (${kind}, ${r.userId}) : ${err.message}`);
      }
    }
  }
  if (total) log?.info(`E-mails de cycle de vie mis en file : ${total}`);
  return total;
}

export function startLifecycle(log, everyMs = 15 * 60 * 1000) {
  const tick = () => runLifecycle(log).catch((err) => log?.warn(`Cycle de vie : ${err.message}`));
  setTimeout(tick, 60000);
  return setInterval(tick, everyMs);
}
