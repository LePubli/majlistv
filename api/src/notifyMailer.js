// Étape 21 — E-mails d'information, deux boucles de fond :
//  1. Nouvelles conférences des intervenants suivis : toutes les 10 min, chaque conférence nouvellement visible est « annoncée » UNE fois
//     (talks.announced_at) ; chaque abonné reçoit UN e-mail groupé par passage, jamais un par conférence.
//  2. Sélection de la semaine : un e-mail par semaine, au jour et à l'heure réglés, aux seuls membres qui l'ont demandée.
// Rien n'est mis en file tant que l'envoi d'e-mails n'est pas configuré (ni annoncé, pour ne rien perdre).
import { pool } from './db.js';
import { getSetting, isOn, getNumber } from './settings.js';
import { featureOn } from './features.js';
import { enqueueEmail, smtpConf } from './mailer.js';
import { speakerSlug } from './speakers.js';
import { visibleSql } from './visibility.js';
import { adultSql } from './taxonomy.js';
import { parisHour } from './revision.js';

const TZ = 'Europe/Paris';
const READY = (t) => `${t}.video_status = 'ready' AND ${visibleSql(t)} AND ${adultSql(t)}`;
const bullet = (rows) => rows.map((r) => `• ${r.title}${r.speaker ? ` — ${r.speaker}` : ''}`).join('\n');

// --- 1. Intervenants suivis
export async function runSpeakers(log) {
  if (!isOn(await getSetting('notify_speakers_enabled')) || !(await featureOn('follow'))) return 0;
  if (!(await smtpConf())) return 0;
  const talks = (await pool.query(
    `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, t.language FROM talks t
      WHERE t.announced_at IS NULL AND trim(t.speaker) <> '' AND ${READY('t')} ORDER BY t.created_at LIMIT 200`)).rows;
  if (!talks.length) return 0;
  const bySlug = new Map();
  for (const t of talks) {
    const s = speakerSlug(t.speaker);
    if (!bySlug.has(s)) bySlug.set(s, []);
    bySlug.get(s).push(t);
  }
  const followers = (await pool.query(
    `SELECT f.user_id, f.speaker_slug, u.email, u.name, u.locale FROM speaker_follows f JOIN users u ON u.id = f.user_id
      WHERE f.speaker_slug = ANY($1) AND u.notify_speakers`, [[...bySlug.keys()]])).rows;
  const perUser = new Map();
  for (const f of followers) {
    const e = perUser.get(f.user_id) || { ...f, talks: [] };
    e.talks.push(...bySlug.get(f.speaker_slug));
    perUser.set(f.user_id, e);
  }
  const client = await pool.connect();
  let sent = 0;
  try {
    await client.query('BEGIN');
    for (const e of perUser.values()) {
      const list = e.talks.slice(0, 12);
      const names = [...new Set(list.map((x) => x.speaker))].join(', ');
      const ids = e.talks.map((x) => x.id).sort().join(',');
      const path = e.talks.length === 1 ? `/conferences/${e.talks[0].slug || e.talks[0].id}` : '/';
      await enqueueEmail(client, { userId: e.user_id, to: e.email, locale: e.locale, kind: 'speaker_new',
        vars: { name: e.name, titles: bullet(list) + (e.talks.length > list.length ? `\n… +${e.talks.length - list.length}` : ''), speakers: names, count: String(e.talks.length), path },
        dedupeKey: `spk:${e.user_id}:${ids.length > 200 ? ids.slice(0, 200) : ids}` });
      sent += 1;
    }
    await client.query('UPDATE talks SET announced_at = now() WHERE id = ANY($1)', [talks.map((t) => t.id)]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (sent) log?.info(`Alertes d'intervenants mises en file : ${sent}`);
  return sent;
}

// --- 2. Sélection de la semaine
// { path, items } : la collection choisie dans les réglages (si publiée et non vide), sinon les nouveautés des 7 derniers jours.
export async function weeklySelection() {
  const count = Math.min(Math.max(await getNumber('weekly_count'), 3), 10);
  const cid = String(await getSetting('weekly_collection') || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(cid)) {
    const items = (await pool.query(
      `SELECT t.title, trim(t.speaker) AS speaker FROM collections c JOIN collection_items i ON i.collection_id = c.id JOIN talks t ON t.id = i.talk_id
        WHERE c.id = $1 AND c.published AND ${READY('t')} ORDER BY i.position LIMIT $2`, [cid, count])).rows;
    if (items.length) return { path: `/collections/${cid}`, items };
  }
  const items = (await pool.query(
    `SELECT t.title, trim(t.speaker) AS speaker FROM talks t WHERE ${READY('t')} AND t.created_at > now() - interval '7 days' ORDER BY t.created_at DESC LIMIT $1`, [count])).rows;
  return { path: '/', items };
}

export async function runWeekly(log) {
  if (!isOn(await getSetting('weekly_enabled'))) return 0;
  if (!(await smtpConf())) return 0;
  const now = (await pool.query(
    `SELECT extract(isodow FROM now() AT TIME ZONE '${TZ}')::int AS dow, to_char(date_trunc('week', now() AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS wk`)).rows[0];
  if (now.dow !== (await getNumber('weekly_weekday'))) return 0;
  if ((await parisHour()) < (await getNumber('weekly_hour'))) return 0;
  const users = (await pool.query(
    `SELECT id, email, name, locale FROM users WHERE notify_weekly AND (weekly_last_week IS NULL OR weekly_last_week < $1::date) ORDER BY id LIMIT 500`, [now.wk])).rows;
  if (!users.length) return 0;
  const sel = await weeklySelection();
  if (!sel.items.length) return 0; // rien à proposer cette semaine : personne n'est marqué, on réessaiera
  let sent = 0;
  for (const u of users) {
    try {
      await enqueueEmail(pool, { userId: u.id, to: u.email, locale: u.locale, kind: 'weekly_selection',
        vars: { name: u.name, titles: bullet(sel.items), path: sel.path }, dedupeKey: `weekly:${u.id}:${now.wk}` });
      await pool.query('UPDATE users SET weekly_last_week = $2::date WHERE id = $1', [u.id, now.wk]);
      sent += 1;
    } catch (err) {
      log?.warn(`Sélection de la semaine (${u.id}) : ${err.message}`);
    }
  }
  if (sent) log?.info(`Sélections de la semaine mises en file : ${sent}`);
  return sent;
}

export function startNotifyMailer(log, everyMs = 10 * 60 * 1000) {
  const tick = async () => {
    await runSpeakers(log).catch((err) => log?.warn(`Alertes d'intervenants : ${err.message}`));
    await runWeekly(log).catch((err) => log?.warn(`Sélection de la semaine : ${err.message}`));
  };
  setTimeout(tick, 35000);
  return setInterval(tick, everyMs);
}
