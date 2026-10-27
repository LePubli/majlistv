// Étape 33 — Règles pures (sans base de données) des e-mails de cycle de vie, faciles à tester.
export const KINDS = ['resume_talk', 'welcome_nudge', 'winback'];

// Plage d'envoi : de `from` (inclus) à `to` (exclu), heure de Paris. from === to : toute la journée.
export function inSendWindow(hour, from, to) {
  if (from === to) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

// Bornes d'un réglage numérique : valeur invalide → défaut.
export const clampInt = (v, min, max, def) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// Reste du plafond quotidien (jamais négatif).
export const remainingToday = (max, sentToday) => Math.max(0, max - sentToday);

// Une personne ne reçoit qu'un seul message par passage : on garde le premier de la liste (ordre = priorité).
export function onePerUser(candidates) {
  const seen = new Set();
  return candidates.filter((c) => (seen.has(c.userId) ? false : (seen.add(c.userId), true)));
}

// Chemin du lien : conférence si on la connaît, sinon accueil.
export const talkPath = (t) => (t?.slug || t?.id ? `/conferences/${t.slug || t.id}` : '/');

// « 12 min 30 » → texte lisible de la position de reprise (minutes pleines).
export const minutesLabel = (ms) => `${Math.max(1, Math.round((Number(ms) || 0) / 60000))}`;
