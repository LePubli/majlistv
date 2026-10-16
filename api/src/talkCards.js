// Fiches de conférences (vignettes) d'une collection ou d'une liste, dans l'ordre choisi. Étape M3a : sorti du module
// collections pour que le module « Listes de lecture » n'en dépende plus.
import { pool } from './db.js';
import { presignGet } from './storage.js';
import { visibleSql } from './visibility.js';

export const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, c.name AS category, (SELECT slug FROM formats WHERE id = t.format_id) AS format, 
  t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, left(regexp_replace(t.description, '\\s+', ' ', 'g'), 170) AS summary`;

export async function cards(rows) {
  for (const r of rows) {
    r.posterUrl = r.poster_key ? await presignGet(r.poster_key) : (r.external_thumb || null);
    delete r.poster_key; delete r.external_thumb;
    if (r.source === 'upload') delete r.video_ref;
  }
  return rows;
}

// Conférences visibles et prêtes d'une collection ou d'une liste, dans l'ordre choisi.
export async function visibleItems(table, key, id) {
  const { rows } = await pool.query(
    `SELECT ${CARD} FROM ${table} i JOIN talks t ON t.id = i.talk_id LEFT JOIN category_names c ON c.id = t.category_id
      WHERE i.${key} = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} ORDER BY i.position`, [id]);
  return cards(rows);
}
