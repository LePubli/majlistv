// Thèmes visuels du site. « premium » (thème V20, 19/11/2026) est bâti sur « bleu » : la page reçoit data-skin="bleu"
// (toutes les règles de skin-bleu.css s'appliquent) et data-premium (règles en plus de skin-premium.css).
export const SKINS = ['classique', 'nuit', 'bleu', 'premium'];
/** Valeur de l'attribut data-skin de <html>. */
export const skinAttr = (s) => (s === 'premium' ? 'bleu' : s);
/** Thèmes « streaming bleu nuit » (mises en page de l'accueil et du catalogue propres au thème bleu). */
export const isBlueFamily = (s) => s === 'bleu' || s === 'premium';
/** Applique un thème tout de suite (sélecteur du visiteur), sans recharger la page. */
export function applySkin(el, s) {
  el.dataset.skin = skinAttr(s);
  el.dataset.skinName = s;
  if (s === 'premium') el.dataset.premium = ''; else delete el.dataset.premium;
}
