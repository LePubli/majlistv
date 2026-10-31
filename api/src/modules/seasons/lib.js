// Saisons : état du moment, textes dans la langue du visiteur, notification à l'ouverture de la période.
import { pool } from '../../db.js';
import { getNumber, getSetting, isOn } from '../../settings.js';
import { featureOn } from '../../features.js';
import { anyPushChannel, pushToUser } from '../../push.js';
import { visibleItems } from '../../talkCards.js';
import { SEASONS, seasonDef, seasonState } from '../../hijri.js';

export const LANGS = ['fr', 'en', 'ar'];
export const lang = (l) => (LANGS.includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

// Instant courant ; SEASONS_NOW (date ISO) ne sert qu'aux tests.
export const nowDate = () => (process.env.SEASONS_NOW ? new Date(process.env.SEASONS_NOW) : new Date());

export const offsetDays = async () => Math.max(-2, Math.min(2, Math.round(await getNumber('hijri_offset_days')) || 0));

// Texte à afficher : celui saisi dans l'admin pour la langue, sinon le texte par défaut.
export const titleOf = (row, def, l) => (row[`title_${l}`] || '').trim() || def.title[l];
export const textOf = (row, def, l) => (row[`text_${l}`] || '').trim() || def.text[l];

export async function allRows() {
  return (await pool.query('SELECT * FROM season_pages')).rows;
}

// État calculé d'une saison pour sa ligne de réglages.
export const stateOf = (row, now, offset) => seasonState(seasonDef(row.id), now, { lead: row.lead_days ?? seasonDef(row.id).lead, offsetDays: offset });

// Saison à montrer maintenant : activée, période ouverte ; si deux se chevauchent, celle qui finit en premier.
export async function currentSeason(now = nowDate()) {
  const offset = await offsetDays();
  const list = (await allRows()).filter((r) => r.enabled).map((r) => ({ row: r, def: seasonDef(r.id), st: stateOf(r, now, offset) })).filter((x) => x.def && x.st.active);
  list.sort((a, b) => a.st.daysLeft - b.st.daysLeft);
  return list[0] || null;
}

export async function collectionOf(row) {
  if (!row.collection_id) return null;
  return (await pool.query('SELECT id, title FROM collections WHERE id = $1 AND published', [row.collection_id])).rows[0] || null;
}

export async function publicSeason(l, now = nowDate()) {
  const cur = await currentSeason(now);
  if (!cur) return null;
  const { row, def, st } = cur;
  const coll = await collectionOf(row);
  let talks = [];
  if (coll) talks = (await visibleItems('collection_items', 'collection_id', coll.id)).slice(0, Math.max(4, await getNumber('home_row_size')));
  return {
    id: def.id, name: def.name[l], title: titleOf(row, def, l), text: textOf(row, def, l),
    daysToStart: st.daysToStart, daysLeft: st.daysLeft, startsOn: st.startsOn, endsOn: st.endsOn,
    collection: coll ? { id: coll.id, title: coll.title } : null, talks,
  };
}

// Notification à l'ouverture de la période : une seule fois par saison et par année hégirienne, aux membres qui ont activé les notifications.
// Activée en cours de saison (plus de 1 jour après le début), la saison est marquée sans rien envoyer : pas de notification tardive.
// Sans canal de notification configuré, rien n'est marqué (la saison reste à notifier quand un canal existe, dans la limite ci-dessus).
// `send` et `hasChannel` ne sont remplacés que par les tests.
export async function runSeasons(log, now = nowDate(), { send = pushToUser, hasChannel = anyPushChannel } = {}) {
  if (!(await featureOn('seasons'))) return 0;
  const offset = await offsetDays();
  let sent = 0;
  for (const row of (await allRows()).filter((r) => r.enabled && r.notify)) {
    const def = seasonDef(row.id);
    const st = stateOf(row, now, offset);
    if (!def || !st.active || row.last_notified_year === st.hijriYear) continue;
    if (!(await hasChannel())) continue;
    const claim = await pool.query('UPDATE season_pages SET last_notified_year = $2 WHERE id = $1 AND last_notified_year IS DISTINCT FROM $2 RETURNING id', [row.id, st.hijriYear]);
    if (!claim.rowCount) continue;
    if (st.daysToStart < -1) { log?.info(`Saison ${row.id} : période déjà commencée, rien envoyé.`); continue; }
    const vars = { t: Object.fromEntries(LANGS.map((l) => [l, titleOf(row, def, l)])), b: Object.fromEntries(LANGS.map((l) => [l, textOf(row, def, l)])) };
    let after = '00000000-0000-0000-0000-000000000000';
    let n = 0;
    for (;;) {
      const { rows } = await pool.query('SELECT id FROM users WHERE notify_push AND disabled_at IS NULL AND id > $1 ORDER BY id LIMIT 500', [after]);
      if (!rows.length) break;
      for (const u of rows) { n += (await send(u.id, 'season', vars, '/', log)) > 0 ? 1 : 0; after = u.id; }
    }
    sent += n;
    log?.info(`Saison ${row.id} : notification envoyée à ${n} membre(s).`);
  }
  return sent;
}

export function startSeasons(log, everyMs = 60 * 60 * 1000) {
  const tick = () => runSeasons(log).catch((err) => log?.warn(`Saisons : ${err.message}`));
  setTimeout(tick, 45000);
  return setInterval(tick, everyMs);
}

export { SEASONS, isOn, getSetting };
