// Bilan de Ramadan (étape 45G) : ce que le membre a fait pendant un Ramadan donné (année hégirienne).
// Actions cochées, jours complets, tarawih, juz lus (lecture en 30 jours), jours d'athkar à l'objectif, note personnelle chiffrée.
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';
import { hijriOf } from '../../hijri.js';
import { openText } from '../../practiceCrypto.js';
import { itemsOfDay, nowDate, publishedItems, ramadanStatus } from './lib.js';

const DAY = 86400000;
const iso = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const offset = async () => Math.max(-2, Math.min(2, Math.round(await getNumber('hijri_offset_days')) || 0));

// Premier et dernier jour (Paris) du Ramadan de l'année hégirienne `hyear`, cherchés sur ±420 jours autour de `now` ; null si hors de portée.
export async function ramadanRange(hyear, now = nowDate()) {
  const off = await offset();
  let start = null; let end = null; let len = 0;
  for (let i = -420; i <= 420; i++) {
    const d = new Date(now.getTime() + i * DAY);
    const h = hijriOf(d, off);
    if (h.year === hyear && h.month === 9) { if (!start) start = iso(d); end = iso(d); len++; } else if (start) break;
  }
  return start ? { start, end, days: len } : null;
}

// Année du bilan : le Ramadan en cours (à partir du 20e jour), sinon le dernier Ramadan s'il s'est terminé il y a moins de 60 jours.
export async function bilanYear(now = nowDate()) {
  const st = await ramadanStatus(now);
  if (st.active) return st.day >= 20 ? st.hyear : null;
  const h = hijriOf(now, await offset());
  const last = h.month > 9 ? h.year : h.year - 1;
  const r = await ramadanRange(last, now);
  if (!r) return null;
  const since = (Date.parse(`${iso(now)}T12:00:00Z`) - Date.parse(`${r.end}T12:00:00Z`)) / DAY;
  return since <= 60 ? last : null;
}

export async function bilanOf(userId, hyear, now = nowDate()) {
  const range = await ramadanRange(hyear, now);
  if (!range) return null;
  const st = await ramadanStatus(now);
  const lastDay = st.active && st.hyear === hyear ? st.day : range.days; // jours déjà passés
  const items = await publishedItems('adult');
  const marks = (await pool.query('SELECT day, item_id FROM ramadan_marks WHERE user_id = $1 AND hyear = $2', [userId, hyear])).rows;
  let expected = 0; let fullDays = 0;
  for (let d = 1; d <= lastDay; d++) {
    const want = itemsOfDay(items, d).map((i) => i.id);
    expected += want.length;
    const got = new Set(marks.filter((m) => m.day === d).map((m) => m.item_id));
    if (want.length && want.every((id) => got.has(id))) fullDays++;
  }
  const tw = (await pool.query('SELECT rakaat, place FROM ramadan_tarawih WHERE user_id = $1 AND hyear = $2', [userId, hyear])).rows;
  const from = `${range.start} 00:00`; const to = `${range.end} 23:59:59`;
  const juz = (await pool.query(
    `SELECT count(*)::int AS n FROM quran_plan_reads WHERE user_id = $1 AND (read_at AT TIME ZONE 'Europe/Paris') BETWEEN $2::timestamp AND $3::timestamp`, [userId, from, to]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  const athkar = (await pool.query(
    `SELECT count(*)::int AS n FROM (
       SELECT c.day FROM athkar_counts c JOIN athkar_items i ON i.id = c.item_id
        WHERE c.user_id = $1 AND c.day BETWEEN $2::date AND $3::date AND c.count >= i.target GROUP BY c.day
       HAVING count(*) >= COALESCE((SELECT daily_goal FROM athkar_prefs WHERE user_id = $1), 1)) x`, [userId, range.start, range.end]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  const note = (await pool.query('SELECT text_enc FROM ramadan_notes WHERE user_id = $1 AND hyear = $2', [userId, hyear])).rows[0];
  let text = '';
  if (note) { try { text = openText(note.text_enc); } catch { text = ''; } }
  return {
    hyear, start: range.start, end: range.end, days: range.days, daysPassed: lastDay,
    actions: { done: marks.filter((m) => m.day <= lastDay).length, expected, fullDays },
    tarawih: { nights: tw.length, rakaat: tw.reduce((a, r) => a + (r.rakaat || 0), 0), mosque: tw.filter((r) => r.place === 'mosque').length, home: tw.filter((r) => r.place === 'home').length },
    quranJuz: juz, athkarDays: athkar, note: text,
  };
}
