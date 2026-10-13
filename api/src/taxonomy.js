// Classement des conférences (étape 26.5) : fragments SQL partagés.
// - Catégorie principale : talks.category_id ; catégories supplémentaires : talk_categories (2 au plus).
// - Sous-catégories sur deux niveaux : chercher « Coran » trouve aussi « Coran › Lecture ».
// - Public : talks.show_adults masque une conférence du catalogue adultes (accueil, recherche) ; kids_bands : tranches d'âge Kids.

export const BANDS = ['3-6', '7-10', '11-14'];
export const MAX_EXTRA_CATEGORIES = 2;

// « La conférence est dans la catégorie $p ou dans l'une de ses sous-catégories » (principale ou supplémentaire).
export const inCategorySql = (alias, ref) => { const p = typeof ref === 'number' ? `$${ref}` : ref; return `(
  ${alias}.category_id IN (SELECT id FROM categories WHERE id = ${p} OR parent_id = ${p})
  OR EXISTS (SELECT 1 FROM talk_categories tc WHERE tc.talk_id = ${alias}.id AND tc.category_id IN (SELECT id FROM categories WHERE id = ${p} OR parent_id = ${p})))`; };

// Catalogue adultes : exclut les conférences réservées aux enfants.
export const adultSql = (alias) => `${alias}.show_adults`;

// Tranche d'âge d'un profil enfant ($p = '3-6' | '7-10' | '11-14').
export const bandOkSql = (alias, p) => `${alias}.kids_bands @> ARRAY[$${p}::text]`;

// Identifiants de toutes les catégories d'une conférence, parents compris (index de recherche).
export const categoryIdsSql = (alias) => `COALESCE((SELECT array_agg(DISTINCT x ORDER BY x) FROM (
    SELECT cc.id AS x FROM categories cc WHERE cc.id = ${alias}.category_id OR cc.id IN (SELECT category_id FROM talk_categories WHERE talk_id = ${alias}.id)
    UNION SELECT cc.parent_id FROM categories cc WHERE cc.parent_id IS NOT NULL AND (cc.id = ${alias}.category_id OR cc.id IN (SELECT category_id FROM talk_categories WHERE talk_id = ${alias}.id))) y
  WHERE x IS NOT NULL), '{}')`;

// Libellé court de tranches d'âge (« 3-10 », « 7-14 ») : de la plus jeune à la plus âgée.
export function agesRange(bands) {
  const order = BANDS.filter((b) => (bands || []).includes(b));
  if (!order.length) return null;
  const lo = order[0].split('-')[0]; const hi = order[order.length - 1].split('-')[1];
  return `${lo}-${hi}`;
}
