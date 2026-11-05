// Amélioration 4.1 — proposer une correction d'une phrase de la transcription (même règles que le site, web/components/Transcript.js).
export type SuggestContext = { loggedIn: boolean; featureOn: boolean; locked?: boolean; hasToken: boolean };

/** Le bouton « Corriger » n'est offert qu'à un membre connecté, fonction active, vidéo déverrouillée et jeton de lecture présent. */
export const canSuggest = (c: SuggestContext) => c.loggedIn && c.featureOn && !c.locked && c.hasToken;

/** On n'envoie que si le texte a vraiment changé (espaces ignorés). */
export const canSend = (original: string, text: string) => {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(text).length > 0 && norm(text) !== norm(original);
};

import type { WebKey } from './webTexts';

const ERR_KEYS: Record<string, WebKey> = {
  same: 'corErrSame', empty: 'corErrEmpty', too_long: 'corErrLong', link: 'corErrLink', daily_limit: 'corErrDaily', already_pending: 'corErrPending',
};
/** Clé de texte pour un code d'erreur de l'API (repli : message générique). */
export const errorKey = (code?: string): WebKey => (code && ERR_KEYS[code]) || 'corErr';

/** « langue:phrase » : repère une phrase déjà proposée. */
export const keyOf = (lang: string, idx: number) => `${lang}:${idx}`;
