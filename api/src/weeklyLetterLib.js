// Étape 34 — Lettre hebdomadaire personnalisée : règles pures (testables sans base de données).
// Nouveautés des intervenants suivis : parmi les conférences récentes, celles dont l'intervenant est suivi, sans doublon,
// au plus `max`, dans l'ordre reçu (déjà trié du plus récent au plus ancien).
export function pickFollowCards(recent, followSlugs, slugOf, max = 3) {
  const follow = new Set(followSlugs);
  const seen = new Set();
  const out = [];
  for (const t of recent) {
    if (out.length >= max) break;
    if (!t.speaker || seen.has(t.id) || !follow.has(slugOf(t.speaker))) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

// La lettre est « personnelle » dès qu'une section propre à la personne existe ; sinon on envoie la sélection simple.
export const hasPersonal = (l) => Boolean((l.cardsResume && l.cardsResume.length) || (l.cardsFollow && l.cardsFollow.length) || (l.due && String(l.due).trim() !== ''));

// Nombre de notions à réviser : vide (ligne retirée de l'e-mail) quand il n'y en a pas.
export const dueText = (n) => (Number(n) > 0 ? String(Math.trunc(Number(n))) : '');
