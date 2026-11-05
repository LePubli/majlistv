// Références citées (amélioration 3.5) — fonctions communes : clé d'une référence, résolution du TEXTE depuis la source (jamais depuis l'IA).
// Coran : ressources du module Coran (arabe + traduction française activés), sinon corpus de citations importé.
// Hadith : corpus de citations importé (recueil + numéro). Sans texte retrouvé, seule la source dite par l'intervenant est affichée.
import { pool } from '../../db.js';
import { HADITH_NAMES, SURAHS } from '../../corpus.js';

export const MAX_VERSES = 10;               // un passage cité ne dépasse pas 10 versets
export const COLLECTIONS = Object.keys(HADITH_NAMES);

/** Clé unique d'une référence dans une vidéo (une ligne par référence, à sa première citation). */
export function refKey(r) {
  if (r.kind === 'quran') return `q:${r.sura}:${r.ayaFrom}-${r.ayaTo ?? r.ayaFrom}`;
  if (r.collection && r.number) return `h:${r.collection}:${r.number}`;
  // Hadith sans source précise : une ligne par passage (clé tirée de l'extrait normalisé).
  const base = String(r.excerpt || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 60);
  return `h:?:${base || r.startMs || 0}`;
}

/** Libellé lisible : « Coran 2:255 (Al-Baqara) », « Sahih Muslim, n° 1599 ». Vide pour un hadith sans source. */
export function labelOf(r) {
  if (r.kind === 'quran') {
    const to = r.ayaTo && r.ayaTo !== r.ayaFrom ? `-${r.ayaTo}` : '';
    return `Coran ${r.sura}:${r.ayaFrom}${to} (${SURAHS[r.sura - 1] || `sourate ${r.sura}`})`;
  }
  const name = HADITH_NAMES[r.collection] || r.saidAs || '';
  return name && r.number ? `${name}, n° ${r.number}` : name;
}

/** Lignes de la base → objets de travail (camelCase). */
export const fromRow = (x) => ({
  id: x.id, talkId: x.talk_id, kind: x.kind, sura: x.sura, ayaFrom: x.aya_from, ayaTo: x.aya_to, collection: x.collection, number: x.number,
  saidAs: x.said_as, startMs: x.start_ms, excerpt: x.excerpt, match: x.match, found: x.found, origin: x.origin, status: x.status,
  reviewedAt: x.reviewed_at, createdAt: x.created_at,
});

/** Textes de la source pour une liste de références : { ar, fr, credit, grade } par id. Un verset manquant laisse le texte vide. */
export async function resolveTexts(refs) {
  const out = new Map();
  const quran = refs.filter((r) => r.kind === 'quran');
  const hadith = refs.filter((r) => r.kind === 'hadith' && r.collection && r.number);
  if (quran.length) {
    const res = (await pool.query(
      `SELECT id, kind, name, credit FROM quran_resources
        WHERE enabled AND ((kind = 'text' AND lang = 'ar') OR (kind = 'translation' AND lang = 'fr')) ORDER BY kind DESC, position, id`)).rows;
    const ar = res.find((x) => x.kind === 'text');
    const fr = res.find((x) => x.kind === 'translation');
    const want = [];
    for (const r of quran) for (let a = r.ayaFrom; a <= (r.ayaTo ?? r.ayaFrom); a += 1) want.push([r.sura, a]);
    const byRes = new Map(); // `${resource}:${sura}:${aya}` → texte
    const ids = [ar?.id, fr?.id].filter(Boolean);
    if (ids.length) {
      const rows = (await pool.query(
        `SELECT resource_id, sura, aya, text FROM quran_verses WHERE resource_id = ANY($1::int[]) AND (sura, aya) IN (SELECT * FROM unnest($2::int[], $3::int[]))`,
        [ids, want.map((w) => w[0]), want.map((w) => w[1])])).rows;
      for (const v of rows) byRes.set(`${v.resource_id}:${v.sura}:${v.aya}`, v.text);
    }
    const corpus = new Map();
    const refsWanted = [...new Set(want.map((w) => `${w[0]}:${w[1]}`))];
    const c = (await pool.query("SELECT ref, text_ar, text_fr, label FROM corpus_items WHERE collection = 'quran' AND ref = ANY($1::text[])", [refsWanted])).rows;
    for (const v of c) corpus.set(v.ref, v);
    for (const r of quran) {
      const arT = [], frT = [];
      let credit = '';
      for (let a = r.ayaFrom; a <= (r.ayaTo ?? r.ayaFrom); a += 1) {
        const cv = corpus.get(`${r.sura}:${a}`);
        const t1 = (ar && byRes.get(`${ar.id}:${r.sura}:${a}`)) || cv?.text_ar || '';
        const t2 = (fr && byRes.get(`${fr.id}:${r.sura}:${a}`)) || cv?.text_fr || '';
        if (t1) arT.push(t1);
        if (t2) frT.push(t2);
        if (!credit) credit = (fr && byRes.has(`${fr.id}:${r.sura}:${a}`) ? [fr.name, fr.credit].filter(Boolean).join(' — ') : cv ? cv.label.replace(/^Coran [^,]*,\s*/, '') : '');
      }
      out.set(r.id, { ar: arT.join(' '), fr: frT.join(' '), credit, grade: '' });
    }
  }
  if (hadith.length) {
    const rows = (await pool.query(
      `SELECT collection, ref, text_ar, text_fr, grade FROM corpus_items WHERE kind = 'hadith' AND (collection, ref) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
      [hadith.map((r) => r.collection), hadith.map((r) => r.number)])).rows;
    const m = new Map(rows.map((x) => [`${x.collection}:${x.ref}`, x]));
    for (const r of hadith) {
      const x = m.get(`${r.collection}:${r.number}`);
      out.set(r.id, x ? { ar: x.text_ar, fr: x.text_fr, credit: HADITH_NAMES[r.collection] || '', grade: x.grade || '' } : { ar: '', fr: '', credit: '', grade: '' });
    }
  }
  return out;
}

/** Version publique (référence validée) : source, texte de la source et minute ; ni statut, ni origine, ni relecteur. */
export const publicShape = (r, t) => ({
  id: r.id, kind: r.kind, label: labelOf(r), startMs: r.startMs, ar: t?.ar || '', fr: t?.fr || '', credit: t?.credit || '', grade: t?.grade || '',
  ...(r.kind === 'hadith' && !labelOf(r) ? { unidentified: true } : {}),
});
/** Version Studio : tout ce qu'il faut à la relecture. */
export const studioShape = (r, t) => ({
  ...publicShape(r, t), talkId: r.talkId, sura: r.sura, ayaFrom: r.ayaFrom, ayaTo: r.ayaTo, collection: r.collection, number: r.number, saidAs: r.saidAs,
  excerpt: r.excerpt, match: r.match, found: r.found, origin: r.origin, status: r.status, reviewedAt: r.reviewedAt, createdAt: r.createdAt,
  hasText: Boolean(t && (t.ar || t.fr)),
});
