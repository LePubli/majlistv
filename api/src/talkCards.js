// Fiches de vidéos (vignettes) d'une collection ou d'une liste, dans l'ordre choisi. Étape M3a : sorti du module
// collections pour que le module « Listes de lecture » n'en dépende plus.
import { pool } from './db.js';
import { presignGet } from './storage.js';
import { visibleSql } from './visibility.js';

// Affiche de la série dont la vidéo est un épisode (image de présentation chargée par l'organisateur) : sert d'image quand l'épisode n'a pas la sienne.
export const SERIES_POSTER = '(SELECT s.poster_key FROM series_episodes se JOIN series s ON s.id = se.series_id WHERE se.talk_id = t.id)';

// Image d'une vidéo : la sienne ; sinon l'affiche de sa série (pour archive.org, qui ne fournit qu'une image générique, l'affiche de la série passe avant) ; sinon celle de la plateforme.
export async function posterOfRow(r) {
  if (r.poster_key) return presignGet(r.poster_key);
  if (r.series_poster_key && (r.source === 'archive' || !r.external_thumb)) return presignGet(r.series_poster_key);
  return r.external_thumb || null;
}

export const CARD = `t.id, t.title, t.speaker, t.language, t.access, t.source, t.video_ref, c.name AS category, c.tr AS "categoryTr", (SELECT slug FROM formats WHERE id = t.format_id) AS format, 
  t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, ${SERIES_POSTER} AS series_poster_key, left(regexp_replace(t.description, '\\s+', ' ', 'g'), 170) AS summary`;

export async function cards(rows) {
  for (const r of rows) {
    r.posterUrl = await posterOfRow(r);
    delete r.poster_key; delete r.external_thumb; delete r.series_poster_key;
    if (r.source === 'upload') delete r.video_ref;
  }
  return rows;
}

// Vidéos visibles et prêtes d'une collection ou d'une liste, dans l'ordre choisi.
export async function visibleItems(table, key, id) {
  const { rows } = await pool.query(
    `SELECT ${CARD} FROM ${table} i JOIN talks t ON t.id = i.talk_id LEFT JOIN category_names c ON c.id = t.category_id
      WHERE i.${key} = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} ORDER BY i.position`, [id]);
  return cards(rows);
}
