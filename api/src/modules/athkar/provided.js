// Dhikr fournis avec le logiciel (lots « Contenus » : arabe, phonétique, français, référence). Ils ne sont JAMAIS affichés d'office :
// « Restaurer » les (ré)insère non validés et non affichés. Fichiers : api/content/athkar/*.json (copie de docs/contenus/athkar-*.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../../db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../content/athkar');

export function providedAthkar() {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** Réinsère les dhikr fournis qui manquent (même catégorie et même texte arabe = déjà là). */
export async function restoreProvided() {
  const items = providedAthkar();
  let created = 0;
  for (const x of items) {
    const r = await pool.query(
      `INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, false
       WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = $1 AND text_ar = $2)`,
      [x.category, x.textAr, x.translit, x.trFr, x.trEn || '', x.reference, x.target, x.position]);
    created += r.rowCount;
  }
  return { created, total: items.length };
}
