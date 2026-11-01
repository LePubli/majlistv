// Vendredi : jour courant (heure de Paris), textes par langue, carte publique, notification.
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { featureOn } from '../../features.js';
import { anyPushChannel, pushToUser } from '../../push.js';
import { visibleItems } from '../../talkCards.js';
import { arabicOf, enabledResources } from '../quran/lib.js';
import { parisDay } from '../../parisTime.js';

export const LANGS = ['fr', 'en', 'ar'];
export const lang = (l) => (LANGS.includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');

// Textes par défaut : simples rappels pratiques, modifiables dans l'admin (à relire et valider avant d'activer).
export const DEFAULTS = {
  ghusl: {
    fr: 'Aujourd’hui, c’est vendredi : pensez à la grande ablution (ghusl) avant la prière.',
    en: 'Today is Friday: remember the major ablution (ghusl) before the prayer.',
    ar: 'اليوم الجمعة: لا تنسَ الاغتسال قبل الصلاة.',
  },
  salawat: {
    fr: 'Pensez à prier sur le Prophète ﷺ en ce jour.',
    en: 'Remember to send blessings upon the Prophet ﷺ today.',
    ar: 'تذكّر الصلاة على النبي ﷺ في هذا اليوم.',
  },
  notif: {
    fr: 'Vos rappels du vendredi : sourate Al-Kahf, grande ablution, prière sur le Prophète ﷺ.',
    en: 'Your Friday reminders: Surah Al-Kahf, major ablution, blessings upon the Prophet ﷺ.',
    ar: 'تذكيرات الجمعة: سورة الكهف، الاغتسال، الصلاة على النبي ﷺ.',
  },
};
export const KAHF = { n: 18, ar: 'الكهف', en: 'Al-Kahf' };
export const textOf = (row, key, l) => (row[`${key}_${l}`] || '').trim() || DEFAULTS[key][l];

// Instant courant ; FRIDAY_NOW (date ISO) ne sert qu'aux tests.
export const nowDate = () => (process.env.FRIDAY_NOW ? new Date(process.env.FRIDAY_NOW) : new Date());

// Jour (vendredi ?), date (AAAA-MM-JJ) et heure à Paris : voir src/parisTime.js.
export { parisDay };

export const getRow = async () => (await pool.query('SELECT * FROM friday_page WHERE id = 1')).rows[0];

async function kahfReady() {
  if (!(await featureOn('quran'))) return false;
  const ar = arabicOf(await enabledResources());
  if (!ar) return false;
  return (await pool.query('SELECT 1 FROM quran_verses WHERE resource_id = $1 AND sura = $2 LIMIT 1', [ar.id, KAHF.n])).rowCount > 0;
}

// Carte publique : seulement le vendredi, et seulement si le vendredi est activé dans l'admin.
export async function publicFriday(l, now = nowDate()) {
  const row = await getRow();
  const day = parisDay(now);
  if (!row?.enabled || !day.isFriday) return { active: false };
  let coll = null; let talks = [];
  if (row.collection_id) {
    coll = (await pool.query('SELECT id, title FROM collections WHERE id = $1 AND published', [row.collection_id])).rows[0] || null;
    if (coll) talks = (await visibleItems('collection_items', 'collection_id', coll.id)).slice(0, Math.max(4, await getNumber('home_row_size')));
  }
  return {
    active: true, date: day.date,
    kahf: row.show_kahf ? { n: KAHF.n, name: l === 'ar' ? KAHF.ar : KAHF.en, ready: await kahfReady() } : null,
    ghusl: row.show_ghusl ? textOf(row, 'ghusl', l) : null,
    salawat: row.show_salawat ? textOf(row, 'salawat', l) : null,
    collection: coll ? { id: coll.id, title: coll.title } : null, talks,
  };
}

export const notifVars = (row) => ({ b: Object.fromEntries(LANGS.map((l) => [l, textOf(row, 'notif', l)])) });

// Notification du vendredi : une fois par vendredi, à partir de l'heure choisie (Paris), aux membres qui ont activé les notifications.
// Activée plus de 6 h après l'heure choisie, le jour est marqué sans rien envoyer : pas de notification tardive.
// Sans canal de notification configuré, rien n'est marqué. `send` et `hasChannel` ne sont remplacés que par les tests.
export async function runFriday(log, now = nowDate(), { send = pushToUser, hasChannel = anyPushChannel } = {}) {
  if (!(await featureOn('friday'))) return 0;
  const row = await getRow();
  const day = parisDay(now);
  if (!row?.enabled || !row.notify || !day.isFriday || day.hour < row.notify_hour) return 0;
  if (!(await hasChannel())) return 0;
  const claim = await pool.query('UPDATE friday_page SET last_notified_on = $1 WHERE id = 1 AND last_notified_on IS DISTINCT FROM $1::date RETURNING id', [day.date]);
  if (!claim.rowCount) return 0;
  if (day.hour >= row.notify_hour + 6) { log?.info('Vendredi : heure déjà passée, rien envoyé.'); return 0; }
  const vars = notifVars(row);
  let after = '00000000-0000-0000-0000-000000000000';
  let n = 0;
  for (;;) {
    const { rows } = await pool.query('SELECT id FROM users WHERE notify_push AND disabled_at IS NULL AND id > $1 ORDER BY id LIMIT 500', [after]);
    if (!rows.length) break;
    for (const u of rows) { n += (await send(u.id, 'friday', vars, '/', log)) > 0 ? 1 : 0; after = u.id; }
  }
  log?.info(`Vendredi : notification envoyée à ${n} membre(s).`);
  return n;
}

export function startFriday(log, everyMs = 30 * 60 * 1000) {
  const tick = () => runFriday(log).catch((err) => log?.warn(`Vendredi : ${err.message}`));
  setTimeout(tick, 50000);
  return setInterval(tick, everyMs);
}
