// Adresses lisibles (étape 16.2) : « La patience dans l'épreuve » → « la-patience-dans-l-epreuve ».
// Le slug est attribué une seule fois (à la première lecture publique) puis ne change plus : les liens et le référencement restent stables.
import { pool } from './db.js';

const TABLES = { talks: { fallback: 'conference' }, series: { fallback: 'serie' } };
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Minuscules, sans accents ni ponctuation, mots séparés par « - », 70 caractères au plus (coupé entre deux mots).
export function slugify(text) {
  const s = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length <= 70) return s;
  const cut = s.slice(0, 70);
  return (cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut).replace(/-+$/, '');
}

// Slug de la ligne (le crée si besoin). Titre sans lettres latines (arabe…) : « conference-xxxxxxxx ».
export async function ensureSlug(table, id) {
  if (!TABLES[table]) throw new Error('table inconnue');
  const cur = (await pool.query(`SELECT slug, title FROM ${table} WHERE id = $1`, [id])).rows[0];
  if (!cur) return null;
  if (cur.slug) return cur.slug;
  const base = slugify(cur.title) || `${TABLES[table].fallback}-${String(id).slice(0, 8)}`;
  for (let n = 1; n < 50; n += 1) {
    const cand = n === 1 ? base : `${base}-${n}`;
    try {
      const r = await pool.query(`UPDATE ${table} SET slug = $2 WHERE id = $1 AND slug IS NULL RETURNING slug`, [id, cand]);
      if (r.rows[0]) return r.rows[0].slug;
      return (await pool.query(`SELECT slug FROM ${table} WHERE id = $1`, [id])).rows[0]?.slug || null; // attribué entre-temps
    } catch (err) {
      if (err.code !== '23505') throw err; // déjà pris : on essaie « -2 », « -3 »…
    }
  }
  return null;
}

// Identifiant d'une adresse : UUID (ancienne adresse) ou slug.
export async function idFromRef(table, ref) {
  if (UUID_RE.test(ref)) return ref;
  return (await pool.query(`SELECT id FROM ${table} WHERE slug = $1`, [ref])).rows[0]?.id || null;
}

// Donne un slug à toutes les lignes qui n'en ont pas (par lots de 500, 20 lots au plus) : appelé avant le plan du site.
export async function ensureAllSlugs(table) {
  let done = 0;
  for (let i = 0; i < 20; i += 1) {
    const rows = (await pool.query(`SELECT id FROM ${table} WHERE slug IS NULL ORDER BY created_at LIMIT 500`)).rows;
    if (!rows.length) break;
    for (const r of rows) await ensureSlug(table, r.id);
    done += rows.length;
  }
  return done;
}
