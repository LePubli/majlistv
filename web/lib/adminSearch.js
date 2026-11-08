// Amélioration 6.9 — recherche de l'administration : filtre des écrans (sans accents ni majuscules). Fonction pure, testée.
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Écrans [{ href, label, group }] dont le libellé ou le groupe contient la saisie ; saisie vide = tous. */
export function matchScreens(screens, q) {
  const n = norm(q).trim();
  return n ? screens.filter((s) => norm(s.label).includes(n) || norm(s.group).includes(n)) : screens;
}
