// Étape 21 — E-mails d'information, deux boucles de fond :
//  1. Nouvelles conférences des intervenants suivis : toutes les 10 min, chaque conférence nouvellement visible est « annoncée » UNE fois
//     (talks.announced_at) ; chaque abonné reçoit UN e-mail groupé par passage, jamais un par conférence.
//  2. Sélection de la semaine : un e-mail par semaine, au jour et à l'heure réglés, aux seuls membres qui l'ont demandée.
// Étape 22b-4 : chaque envoi part aussi en notification sur téléphone (si la clé Firebase est enregistrée et si le membre a un téléphone enregistré).
// Rien n'est mis en file tant qu'aucun canal (e-mail ou téléphone) n'est configuré (ni annoncé, pour ne rien perdre).
import { pool } from './db.js';
import { getSetting, isOn, getNumber } from './settings.js';
import { featureOn } from './features.js';
import { enqueueEmail, smtpConf } from './mailer.js';
import { speakerSlug } from './speakers.js';
import { pickFollowCards, hasPersonal, dueText } from './weeklyLetterLib.js';
import { HAS_ACCESS } from './lifecycle.js';
import { visibleSql } from './visibility.js';
import { adultSql } from './taxonomy.js';
import { parisHour } from './revision.js';
import { anyPushChannel, pushToUser } from './push.js';

const TZ = 'Europe/Paris';
const READY = (t) => `${t}.video_status = 'ready' AND ${visibleSql(t)} AND ${adultSql(t)}`;
const POSTER = (t) => `(${t}.poster_key IS NOT NULL OR ${t}.external_thumb IS NOT NULL) AS poster`;
const card = (r) => ({ id: r.id, title: r.title, speaker: r.speaker || '', poster: Boolean(r.poster), path: `/conferences/${r.slug || r.id}` });
const bullet = (rows) => rows.map((r) => `• ${r.title}${r.speaker ? ` — ${r.speaker}` : ''}`).join('\n');

// --- 1. Intervenants suivis
export async function runSpeakers(log) {
  if (!isOn(await getSetting('notify_speakers_enabled')) || !(await featureOn('follow'))) return 0;
  const mailOn = Boolean(await smtpConf()), pushOn = await anyPushChannel();
  if (!mailOn && !pushOn) return 0;
  const talks = (await pool.query(
    `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, t.language, ${POSTER('t')} FROM talks t
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
  const pushes = []; // envoyés après la validation de la transaction
  try {
    await client.query('BEGIN');
    for (const e of perUser.values()) {
      const list = e.talks.slice(0, 12);
      const names = [...new Set(list.map((x) => x.speaker))].join(', ');
      const ids = e.talks.map((x) => x.id).sort().join(',');
      const path = e.talks.length === 1 ? `/conferences/${e.talks[0].slug || e.talks[0].id}` : '/';
      if (mailOn) {
        await enqueueEmail(client, { userId: e.user_id, to: e.email, locale: e.locale, kind: 'speaker_new',
          vars: { name: e.name, cards: list.map(card), titles: bullet(list) + (e.talks.length > list.length ? `\n… +${e.talks.length - list.length}` : ''), speakers: names, count: String(e.talks.length), path },
          dedupeKey: `spk:${e.user_id}:${ids.length > 200 ? ids.slice(0, 200) : ids}` });
      }
      if (pushOn) pushes.push({ userId: e.user_id, vars: { count: e.talks.length, titles: list.map((x) => x.title), speakers: names }, path: e.talks.length === 1 ? `/conferences/${e.talks[0].id}` : '/' }); // l'application ouvre la conférence par son identifiant
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
  for (const p of pushes) await pushToUser(p.userId, 'speaker_new', p.vars, p.path, log);
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
      `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, ${POSTER('t')} FROM collections c JOIN collection_items i ON i.collection_id = c.id JOIN talks t ON t.id = i.talk_id
        WHERE c.id = $1 AND c.published AND ${READY('t')} ORDER BY i.position LIMIT $2`, [cid, count])).rows;
    if (items.length) return { path: `/collections/${cid}`, items };
  }
  const items = (await pool.query(
    `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, ${POSTER('t')} FROM talks t WHERE ${READY('t')} AND t.created_at > now() - interval '7 days' ORDER BY t.created_at DESC LIMIT $1`, [count])).rows;
  return { path: '/', items };
}

// Étape 34 — sections personnelles de la lettre : à reprendre, nouveautés des intervenants suivis, notions à réviser.
async function weeklyContext() {
  const recent = (await pool.query(
    `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, ${POSTER('t')} FROM talks t
      WHERE ${READY('t')} AND t.created_at > now() - interval '7 days' AND trim(t.speaker) <> '' ORDER BY t.created_at DESC LIMIT 300`)).rows;
  return { recent, revision: await featureOn('revision') };
}

export async function personalLetter(userId, ctx) {
  const follows = (await pool.query('SELECT speaker_slug FROM speaker_follows WHERE user_id = $1', [userId])).rows.map((r) => r.speaker_slug);
  const cardsFollow = pickFollowCards(ctx.recent, follows, speakerSlug, 3).map(card);
  const r = (await pool.query(
    `SELECT t.id, t.slug, t.title, trim(t.speaker) AS speaker, ${POSTER('t')} FROM watch_progress p JOIN talks t ON t.id = p.talk_id JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND NOT p.completed AND p.position_ms >= 120000 AND (p.duration_ms = 0 OR p.position_ms < p.duration_ms * 0.9)
        AND p.updated_at > now() - interval '30 days' AND ${READY('t')} AND (t.access = 'free' OR ${HAS_ACCESS('u')})
      ORDER BY p.updated_at DESC LIMIT 1`, [userId])).rows;
  const due = ctx.revision ? (await pool.query(
    `SELECT count(*)::int AS n FROM revision_items WHERE user_id = $1 AND due_on IS NOT NULL AND due_on <= (now() AT TIME ZONE '${TZ}')::date`, [userId])).rows[0].n : 0;
  return { cardsResume: r.map(card), cardsFollow, due: dueText(due) };
}

export async function runWeekly(log) {
  if (!isOn(await getSetting('weekly_enabled'))) return 0;
  const mailOn = Boolean(await smtpConf()), pushOn = await anyPushChannel();
  if (!mailOn && !pushOn) return 0;
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
  const personal = isOn(await getSetting('weekly_personal'));
  const ctx = personal ? await weeklyContext() : null;
  for (const u of users) {
    try {
      if (mailOn) {
        const base = { name: u.name, titles: bullet(sel.items), cards: sel.items.map(card), path: sel.path };
        const letter = personal ? await personalLetter(u.id, ctx) : null;
        // Lettre personnalisée si la personne a quelque chose à reprendre, à réviser ou de nouveaux contenus chez ses intervenants ; sinon la sélection simple.
        const kind = letter && hasPersonal(letter) ? 'weekly_letter' : 'weekly_selection';
        const vars = kind === 'weekly_letter' ? { ...base, ...letter, cardsSelection: base.cards, path: sel.path } : base;
        await enqueueEmail(pool, { userId: u.id, to: u.email, locale: u.locale, kind, vars, dedupeKey: `weekly:${u.id}:${now.wk}` });
      }
      if (pushOn) await pushToUser(u.id, 'weekly_selection', { titles: sel.items.map((x) => x.title) }, sel.path, log);
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
