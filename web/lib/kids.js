// Mejliss Kids : avatars (clés stockées côté serveur) et tranches d'âge.
export const AVATAR_EMOJI = { lion: '🦁', owl: '🦉', fox: '🦊', turtle: '🐢', rabbit: '🐰', bear: '🐻', camel: '🐪', star: '⭐' };
export const BANDS = ['3-6', '7-10', '11-14'];
export const bandLabel = (b, t) => ({ '3-6': t('kdBand36'), '7-10': t('kdBand710'), '11-14': t('kdBand1114') }[b] || b);

// Badges des enfants (palier Apprentissage) : icône par code.
export const BADGE_ICON = { first_quiz: '🎯', three_stars: '🌟', quizzes_5: '🏅', explorer: '🧭', watcher_3: '📺', retry_better: '🚀', stars_10: '✨' };
export const BADGE_CODES = Object.keys(BADGE_ICON);
export const Stars = ({ n, of = 3 }) => Array.from({ length: of }, (_, i) => (i < n ? '⭐' : '☆')).join('');

// Libellé de plusieurs tranches d'âge : de la plus jeune à la plus âgée (« 3 à 10 ans »). Une seule tranche : son libellé habituel.
export function agesLabel(bands, t) {
  const order = BANDS.filter((b) => (bands || []).includes(b));
  if (!order.length) return '';
  if (order.length === 1) return bandLabel(order[0], t);
  return t('kdAgesRange').replace('{a}', order[0].split('-')[0]).replace('{b}', order[order.length - 1].split('-')[1]);
}
