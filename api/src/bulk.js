// Actions en lot de l'administration (Athkar, Ramadan…) : valider, afficher, masquer, dé-valider, supprimer, modifier un champ.
// `table` et les noms de colonnes de `set` viennent du code des routes (jamais de la requête) : seules les VALEURS sont paramétrées.
import { z } from 'zod';
import { pool } from './db.js';

export const BULK_ACTIONS = ['validate', 'publish', 'unvalidate', 'show', 'hide', 'delete', 'update'];
export const bulkIds = z.array(z.number().int().positive()).min(1, 'Sélectionnez au moins un élément.').max(2000);
export const LABELS = {
  validate: 'validés', publish: 'validés et affichés', unvalidate: 'dé-validés', show: 'affichés', hide: 'masqués', delete: 'supprimés', update: 'modifiés',
};

export async function runBulk({ table, ids, action, userId, set = {} }) {
  const list = [...new Set(ids)];
  const W = 'WHERE id = ANY($1::int[])';
  let r;
  if (action === 'validate' || action === 'publish') {
    r = await pool.query(
      `UPDATE ${table} SET reviewed_at = COALESCE(reviewed_at, now()), reviewed_by = COALESCE(reviewed_by, $2::uuid)${action === 'publish' ? ', enabled = true' : ''}, updated_at = now() ${W}`,
      [list, userId]);
  } else if (action === 'unvalidate') {
    r = await pool.query(`UPDATE ${table} SET reviewed_at = NULL, reviewed_by = NULL, enabled = false, updated_at = now() ${W}`, [list]);
  } else if (action === 'show') {
    // Jamais d'affichage sans validation : les éléments non validés sont ignorés (comptés dans « skipped »).
    r = await pool.query(`UPDATE ${table} SET enabled = true, updated_at = now() ${W} AND reviewed_at IS NOT NULL`, [list]);
  } else if (action === 'hide') {
    r = await pool.query(`UPDATE ${table} SET enabled = false, updated_at = now() ${W}`, [list]);
  } else if (action === 'delete') {
    r = await pool.query(`DELETE FROM ${table} ${W}`, [list]);
  } else {
    const cols = Object.keys(set);
    if (!cols.length) throw Object.assign(new Error('Aucune modification demandée.'), { statusCode: 400 });
    r = await pool.query(`UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() ${W}`, [list, ...cols.map((c) => set[c])]);
  }
  return { done: r.rowCount, skipped: list.length - r.rowCount };
}
