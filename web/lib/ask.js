// Étape 41 — aides de l'assistant « Pose une question sur cette conférence » (testées dans tests/test_ask_web.mjs).
export const MAX_QUESTION = 400;

// Code d'erreur de l'API → clé de texte (i18n).
export function errorKey(code, status) {
  if (code === 'learning_required') return 'askNeedLearning';
  if (code === 'ask_quota') return 'askQuota';
  if (code === 'ask_busy') return 'askBusy';
  if (code === 'ask_failed') return 'askFailed';
  if (code === 'no_transcript') return 'askNoTranscript';
  if (code === 'ask_unavailable' || status === 503) return 'askUnavailable';
  return 'askError';
}

// La question peut-elle être envoyée ? (3 à 400 caractères, hors espaces autour)
export const validQuestion = (q) => { const n = String(q || '').trim().length; return n >= 3 && n <= MAX_QUESTION; };

// Ajoute une réponse à la conversation affichée (les 20 dernières seulement : la page reste légère).
export const pushTurn = (turns, turn) => [...turns, turn].slice(-20);
