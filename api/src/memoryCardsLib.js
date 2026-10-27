// Étape 38 — Cartes mémoire : calculs purs (testés avec Node, aucune base requise).
// Calendrier : chaque réponse « je savais » fait avancer la carte (revue après 1, 3, 7 puis 21 jours) ; la cinquième réussite la déclare acquise.
// « À revoir » ramène la carte au début (revue demain). Une carte revue AVANT son échéance (séance libre) compte comme vue mais ne fait pas avancer le calendrier.

export const OFFSETS = [1, 3, 7, 21]; // jours avant la prochaine revue après la 1re, 2e, 3e, 4e réussite
export const MASTERED = 5;

/** Borne un entier de réglage. */
export const clampInt = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };

/**
 * Nouvel état après une réponse.
 * cur : { stage, dueOffsetDays } avec dueOffsetDays = jours entre aujourd'hui et l'échéance (≤ 0 = à échéance ou en retard), ou null si pas encore de ligne.
 * Retourne { stage, addDays (null = acquise), advanced }.
 */
export function nextState(cur, known) {
  if (!known) return { stage: 0, addDays: 1, advanced: false };
  if (!cur) return { stage: 1, addDays: OFFSETS[0], advanced: true };
  const due = cur.dueOffsetDays != null && cur.dueOffsetDays <= 0;
  if (!due) return { stage: cur.stage, addDays: cur.dueOffsetDays == null ? null : Math.max(1, cur.dueOffsetDays), advanced: false };
  const stage = Math.min(MASTERED, cur.stage + 1);
  return { stage, addDays: stage >= MASTERED ? null : OFFSETS[stage - 1], advanced: true };
}

/** Compose la séance : cartes à échéance d'abord (déjà triées, les plus en retard en tête), puis les nouvelles dans la limite du jour. */
export function planSession(due, fresh, { dailyMax, newLeft }) {
  const max = Math.max(0, dailyMax);
  const d = due.slice(0, max);
  const n = fresh.slice(0, Math.max(0, Math.min(newLeft, max - d.length)));
  return { cards: [...d, ...n], due: d.length, fresh: n.length, dueTotal: due.length, freshAvailable: fresh.length };
}

/** Une carte d'après une question de quiz validée : recto = question, verso = bonne réponse + explication + passage cité. */
export function cardOf(q) {
  const options = Array.isArray(q.options) ? q.options : [];
  return {
    id: q.id, talkId: q.talk_id, lang: q.lang, front: q.question,
    answer: String(options[q.correct_index] ?? ''), explanation: q.explanation || '', quote: q.evidence_quote || '',
    startMs: q.evidence_ms ?? null, chapter: q.chapter_title || '',
  };
}
