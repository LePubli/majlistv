// Case « Aussi une collection » : la série tient à jour sa propre collection (titre, présentation, images, vidéos dans l'ordre,
// publication). Décochée, la collection liée est supprimée. Les images sont partagées (même clé de stockage), donc jamais supprimées ici.
import { pool } from '../../db.js';

export async function syncSeriesCollection(seriesId, db = pool) {
  const s = (await db.query('SELECT id, title, description, published, as_collection, poster_key, cover_key, owner_id FROM series WHERE id = $1', [seriesId])).rows[0];
  if (!s) return { state: 'none' };
  if (!s.as_collection) {
    const d = await db.query('DELETE FROM collections WHERE series_id = $1', [seriesId]);
    return { state: d.rowCount ? 'removed' : 'none' };
  }
  const ids = (await db.query(
    `SELECT e.talk_id FROM series_episodes e LEFT JOIN seasons z ON z.id = e.season_id
      WHERE e.series_id = $1 ORDER BY z.position NULLS FIRST, e.position`, [seriesId])).rows.map((r) => r.talk_id);
  const cur = (await db.query('SELECT id FROM collections WHERE series_id = $1', [seriesId])).rows[0];
  let cid = cur?.id;
  if (cid) {
    await db.query(
      `UPDATE collections SET title = $2, description = $3, published = $4, poster_key = $5, cover_key = $6, updated_at = now() WHERE id = $1`,
      [cid, s.title.slice(0, 120), String(s.description || '').slice(0, 1000), s.published, s.poster_key, s.cover_key]);
  } else {
    const r = await db.query(
      `INSERT INTO collections(title, description, kind, published, mode, catalogue, on_home, series_id, poster_key, cover_key, created_by)
       VALUES ($1, $2, 'cycle', $3, 'manual', 'adult', false, $4, $5, $6, $7) RETURNING id`,
      [s.title.slice(0, 120), String(s.description || '').slice(0, 1000), s.published, seriesId, s.poster_key, s.cover_key, s.owner_id]);
    cid = r.rows[0].id;
  }
  await db.query('DELETE FROM collection_items WHERE collection_id = $1', [cid]);
  if (ids.length) {
    await db.query(
      `INSERT INTO collection_items(collection_id, talk_id, position) SELECT $1, x.id, x.ord - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, ord)`, [cid, ids]);
  }
  return { state: cur ? 'updated' : 'created', id: cid, items: ids.length };
}
