// Thèmes visuels du site : « classique », « nuit », « bleu » et « premium » (thème V20 fourni par Epok, 19/11/2026).
// « premium » est un thème autonome : ses écrans reprennent à l'identique la maquette V20 (composants web/components/premium,
// feuille /premium/v20.css fabriquée par web/scripts/build-premium-css.py), sans s'appuyer sur un autre thème.
export const SKINS = ['classique', 'nuit', 'bleu', 'premium'];
export const V20_CSS = '/premium/v20.css';
/** Thème « streaming bleu nuit » (mises en page D3 / D4 de l'accueil et du catalogue). */
export const isBlueFamily = (s) => s === 'bleu';
/** Applique un thème tout de suite (sélecteur du visiteur), sans recharger la page. */
export function applySkin(el, s) {
  el.dataset.skin = s;
  if (s === 'premium' && typeof document !== 'undefined' && !document.getElementById('v20-css')) {
    const l = document.createElement('link');
    l.id = 'v20-css'; l.rel = 'stylesheet'; l.href = V20_CSS;
    document.head.appendChild(l);
  }
}
