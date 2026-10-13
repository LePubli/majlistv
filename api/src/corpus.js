// Corpus de citations (étape 24.6) : versets du Coran et hadiths importés depuis des fichiers publics
// (dépôts GitHub fawazahmed0/quran-api et fawazahmed0/hadith-api). Le texte n'est JAMAIS généré : il est copié tel quel de la source.
// L'import est lancé à la demande depuis Studio → Rappels (administrateur) ; il remplace tout le corpus et garde les rappels déjà publiés
// (le texte d'un rappel est une copie : il reste lisible même si le corpus est réimporté).
import { pool } from './db.js';
import { getSetting } from './settings.js';

export const HADITH_NAMES = {
  bukhari: 'Sahih al-Boukhari', muslim: 'Sahih Muslim', nawawi: 'Les 40 hadiths d\'an-Nawawi', qudsi: 'Les 40 hadiths qudsi',
  abudawud: 'Sunan Abi Dawud', ibnmajah: 'Sunan Ibn Majah', malik: 'Muwatta Malik', nasai: 'Sunan an-Nasa\'i',
};

const SURAHS = ['Al-Fatiha', 'Al-Baqara', 'Al-Imran', 'An-Nisa', 'Al-Ma\'ida', 'Al-An\'am', 'Al-A\'raf', 'Al-Anfal', 'At-Tawba', 'Yunus', 'Hud', 'Yusuf', 'Ar-Ra\'d', 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha', 'Al-Anbiya', 'Al-Hajj', 'Al-Mu\'minun', 'An-Nur', 'Al-Furqan', 'Ash-Shu\'ara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum', 'Luqman', 'As-Sajda', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiya', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqi\'a', 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahana', 'As-Saff', 'Al-Jumu\'a', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqa', 'Al-Ma\'arij', 'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyama', 'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Nazi\'at', 'Abasa', 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-A\'la', 'Al-Ghashiya', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyina', 'Az-Zalzala', 'Al-Adiyat', 'Al-Qari\'a', 'At-Takathur', 'Al-Asr', 'Al-Humaza', 'Al-Fil', 'Quraysh', 'Al-Ma\'un', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas'];

export const EDITION_NAMES = { 'fra-muhammadhamidul': 'Hamidullah', 'fra-islamicfoundati': 'Islamic Foundation', 'fra-rashidmaash': 'Rashid Maash', 'fra-shahnazsaidiben': 'Shahnaz Saidi Benbetka' };

// Bornes d'affichage : une citation doit tenir en un « rappel » lisible.
const FR_MIN = 50, FR_MAX = 700, AR_MAX = 1500;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  const ctl = AbortSignal.timeout(120000);
  const r = await fetch(url, { signal: ctl });
  if (!r.ok) throw new Error(`Téléchargement impossible (${r.status}) : ${url}`);
  return r.json();
}

async function insertBatch(rows) {
  if (!rows.length) return;
  await pool.query(
    `INSERT INTO corpus_items(kind, collection, ref, label, text_ar, text_fr, grade)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
     ON CONFLICT (collection, ref) DO NOTHING`,
    [0, 1, 2, 3, 4, 5, 6].map((i) => rows.map((r) => r[i])));
}

// Coran : arabe (Uthmani Hafs) + traduction française choisie dans les réglages. Verset = unité.
export function pairQuran(ar, fr, edition = 'fra-muhammadhamidul') {
  const who = EDITION_NAMES[edition] || edition;
  const arMap = new Map(ar.map((v) => [`${v.chapter}:${v.verse}`, clean(v.text)]));
  const rows = [];
  for (const v of fr) {
    const ref = `${v.chapter}:${v.verse}`;
    const a = arMap.get(ref), f = clean(v.text);
    if (!a || f.length < FR_MIN || f.length > FR_MAX || a.length > AR_MAX) continue;
    rows.push(['quran', 'quran', ref, `Coran ${ref} (${SURAHS[v.chapter - 1] || 'sourate ' + v.chapter}), trad. ${who}`, a, f, '']);
  }
  return rows;
}

// Hadiths : un recueil = fichier arabe + fichier français, jumelés par numéro. Les hadiths sans texte dans l'une des deux langues sont ignorés.
export function pairHadith(collection, ar, fr) {
  const arMap = new Map(ar.map((h) => [String(h.hadithnumber), clean(h.text)]));
  const rows = [];
  for (const h of fr) {
    const num = String(h.hadithnumber);
    const a = arMap.get(num), f = clean(h.text);
    if (!a || !Number.isFinite(Number(num)) || Number(num) <= 0 || f.length < FR_MIN || f.length > FR_MAX || a.length > AR_MAX) continue;
    const grade = (h.grades || []).map((g) => (g && g.grade ? `${g.grade}${g.name ? ` (${g.name})` : ''}` : '')).filter(Boolean).join(', ');
    rows.push(['hadith', collection, num, `${HADITH_NAMES[collection] || collection}, n° ${num}`, a, f, grade]);
  }
  return rows;
}

export async function corpusStatus() {
  const [imp, byCol] = await Promise.all([
    pool.query('SELECT * FROM corpus_import WHERE id = 1'),
    pool.query('SELECT collection, count(*)::int AS n FROM corpus_items GROUP BY collection ORDER BY collection'),
  ]);
  const i = imp.rows[0];
  return { status: i.status, message: i.message, items: i.items, startedAt: i.started_at, finishedAt: i.finished_at, collections: byCol.rows };
}

let running = false;
// Lance l'import en arrière-plan ; renvoie false si un import est déjà en cours.
export async function startImport(log = console) {
  if (running) return false;
  const cur = (await pool.query('SELECT status, started_at FROM corpus_import WHERE id = 1')).rows[0];
  if (cur.status === 'running' && Date.now() - new Date(cur.started_at).getTime() < 30 * 60 * 1000) return false;
  running = true;
  await pool.query("UPDATE corpus_import SET status = 'running', message = 'Démarrage…', started_at = now(), finished_at = NULL WHERE id = 1");
  runImport(log).finally(() => { running = false; });
  return true;
}

async function progress(msg) { await pool.query('UPDATE corpus_import SET message = $1 WHERE id = 1', [msg]); }

async function runImport(log) {
  try {
    const base = (await getSetting('corpus_base_url')).replace(/\/$/, '');
    const edition = await getSetting('quran_edition_fr');
    const wanted = [...new Set(String(await getSetting('hadith_collections')).split(',').map((s) => s.trim().toLowerCase()).filter((s) => HADITH_NAMES[s]))];
    // Tout est téléchargé AVANT de toucher à la base : un échec réseau laisse l'ancien corpus intact.
    await progress('Coran : téléchargement…');
    const [qa, qf] = await Promise.all([
      getJson(`${base}/quran-api/1/editions/ara-quranuthmanihaf.json`),
      getJson(`${base}/quran-api/1/editions/${edition}.json`),
    ]);
    let rows = pairQuran(qa.quran, qf.quran, edition);
    if (rows.length < 1000) throw new Error('Fichier du Coran inattendu : trop peu de versets exploitables');
    for (const c of wanted) {
      await progress(`Hadiths : ${HADITH_NAMES[c]}…`);
      try {
        const [a, f] = await Promise.all([getJson(`${base}/hadith-api/1/editions/ara-${c}.json`), getJson(`${base}/hadith-api/1/editions/fra-${c}.json`)]);
        rows = rows.concat(pairHadith(c, a.hadiths, f.hadiths));
      } catch (err) {
        log.warn?.(`corpus : recueil ${c} ignoré : ${err.message}`);
      }
    }
    await progress(`Enregistrement de ${rows.length} textes…`);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM corpus_items');
      await db.query('COMMIT'); // les rappels déjà créés gardent leur copie du texte (corpus_id passe à NULL)
    } finally { db.release(); }
    for (let i = 0; i < rows.length; i += 2000) await insertBatch(rows.slice(i, i + 2000));
    const n = (await pool.query('SELECT count(*)::int AS n FROM corpus_items')).rows[0].n;
    await pool.query("UPDATE corpus_import SET status = 'ready', message = $1, items = $2, finished_at = now() WHERE id = 1", [`${n} textes importés`, n]);
    // Réattache les rappels existants au corpus réimporté (même source et même référence).
    await pool.query(`UPDATE reminders m SET corpus_id = c.id FROM corpus_items c
                       WHERE m.origin = 'corpus' AND m.corpus_id IS NULL AND m.attribution LIKE c.label || '%'`);
  } catch (err) {
    log.error?.(`corpus : import échoué : ${err.message}`);
    await pool.query("UPDATE corpus_import SET status = 'failed', message = $1, finished_at = now() WHERE id = 1", [String(err.message).slice(0, 300)]).catch(() => {});
  }
}

// Remet « failed » un import resté « running » après un redémarrage du service.
export async function recoverImport() {
  await pool.query("UPDATE corpus_import SET status = 'failed', message = 'Interrompu par un redémarrage : relancer l''import' WHERE id = 1 AND status = 'running'").catch(() => {});
}
