// Pages du site rattachées à une fonction activable (étape A). Quand la fonction est coupée dans Admin → Fonctions
// (ou que son module est absent), la page affiche « Cette fonction n'est pas disponible » au lieu de son contenu.
// Étape M3b : les chemins des pages viennent de la fiche de chaque module (web/modules/<id>/module.js).
import { featureForModulePath } from './modules';

const CORE_RULES = [
  [/^\/register(\/|$)/, 'registration'],
  [/^\/application(\/|$)/, 'app_install'], // étape 22a
];

// Fonction dont dépend ce chemin (ou null).
export function featureForPath(path) {
  for (const [re, id] of CORE_RULES) if (re.test(path)) return id;
  return featureForModulePath(path);
}

// Chemins qui restent ouverts pendant la maintenance : connexion, mot de passe oublié.
export const MAINTENANCE_OPEN = /^\/(login|forgot|reset)(\/|$)/;
