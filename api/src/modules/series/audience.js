// Public et catégories d'une série : appliqués aux épisodes (une série n'a pas de public propre, elle suit ses vidéos).
//  - audience : adult (adultes seulement) | kids (espace Kids seulement, avec tranches d'âge) | both (les deux)
//  - catégories : « manual » (principale + supplémentaires choisies) ou « auto » (analyse par l'IA, comme à l'import de vidéos)
import { pool } from '../../db.js';

/**
 * Applique le public et les catégories de la série à ses épisodes (tous, ou seulement `onlyTalkIds`, ex. les vidéos qu'on vient d'ajouter).
 * Renvoie { episodes, autoQueued, autoSkipped }.
 */
export async function applySeriesSettings(seriesId, { onlyTalkIds = null, db = pool, audience = true, categories = true } = {}) {
  const s = (await db.query('SELECT id, audience, kids_bands, category_id, category_mode FROM series WHERE id = $1', [seriesId])).rows[0];
  if (!s) return { episodes: 0, autoQueued: 0, autoSkipped: false };
  let ids = (await db.query('SELECT talk_id FROM series_episodes WHERE series_id = $1', [seriesId])).rows.map((r) => r.talk_id);
  if (onlyTalkIds) { const only = new Set(onlyTalkIds); ids = ids.filter((x) => only.has(x)); }
  if (!ids.length) return { episodes: 0, autoQueued: 0, autoSkipped: false };

  // Public
  const kids = s.audience !== 'adult';
  if (audience) await db.query('UPDATE talks SET kids_bands = $2::text[], show_adults = $3 WHERE id = ANY($1::uuid[])',
    [ids, kids ? s.kids_bands : [], s.audience !== 'kids']);

  // Catégories
  let autoQueued = 0; let autoSkipped = false;
  if (!categories) {
    // public seul : les catégories des vidéos ne sont pas touchées
  } else if (s.category_mode === 'auto') {
    await db.query('SAVEPOINT series_autocat');
    try {
      await db.query("DELETE FROM category_jobs WHERE talk_id = ANY($1::uuid[]) AND status <> 'processing'", [ids]);
      const r = await db.query(
        `INSERT INTO category_jobs(talk_id, lang, status, apply_now, created_at)
         SELECT t.id, t.language, 'pending', true, now() FROM talks t WHERE t.id = ANY($1::uuid[]) ON CONFLICT (talk_id) DO NOTHING`, [ids]);
      autoQueued = r.rowCount;
    } catch { await db.query('ROLLBACK TO SAVEPOINT series_autocat'); autoSkipped = true; } // module Catégories automatiques absent
  } else {
    const extras = (await db.query('SELECT category_id FROM series_categories WHERE series_id = $1 AND category_id IS DISTINCT FROM $2', [seriesId, s.category_id])).rows.map((r) => r.category_id);
    if (s.category_id || extras.length) {
      if (s.category_id) await db.query('UPDATE talks SET category_id = $2 WHERE id = ANY($1::uuid[])', [ids, s.category_id]);
      await db.query('DELETE FROM talk_categories WHERE talk_id = ANY($1::uuid[])', [ids]);
      if (extras.length) await db.query('INSERT INTO talk_categories(talk_id, category_id) SELECT t, c FROM unnest($1::uuid[]) t CROSS JOIN unnest($2::int[]) c ON CONFLICT DO NOTHING', [ids, extras]);
    }
  }
  // Collection liée : espace Kids si la série est réservée aux enfants (une collection n'a qu'un seul catalogue).
  if (audience) await db.query("UPDATE collections SET catalogue = $2 WHERE series_id = $1", [seriesId, s.audience === 'kids' ? 'kids' : 'adult']);
  return { episodes: ids.length, autoQueued, autoSkipped };
}
