// Connexion en deux temps (étape 31) : le serveur répond soit par un jeton, soit par un « défi » quand le compte a la double authentification.
import type { User } from './types';

export type LoginResponse = { token: string; user: User } | { twoFactor: true; challenge: string };
export type LoginOutcome = { kind: 'session'; token: string; user: User } | { kind: 'challenge'; challenge: string };

/** Interprète la réponse de POST /auth/login. Lève une erreur si elle n'est ni l'un ni l'autre (ancien serveur, réponse inattendue). */
export function readLogin(res: unknown): LoginOutcome {
  const r = res as Partial<{ token: string; user: User; twoFactor: boolean; challenge: string }> | null;
  if (r && r.twoFactor === true && typeof r.challenge === 'string' && r.challenge.length > 0) return { kind: 'challenge', challenge: r.challenge };
  if (r && typeof r.token === 'string' && r.user) return { kind: 'session', token: r.token, user: r.user };
  throw new Error('Réponse de connexion inattendue');
}

/** Clé de message pour une erreur de POST /auth/2fa/verify. `expired` : il faut revenir au mot de passe. */
export function verifyErrorKey(status: number, code?: string): { key: 'auth.2fa.bad' | 'auth.2fa.expired' | 'auth.2fa.locked' | 'auth.network' | 'auth.suspended' | 'auth.bad'; expired: boolean } {
  if (status === 0) return { key: 'auth.network', expired: false };
  if (code === 'challenge_expired') return { key: 'auth.2fa.expired', expired: true };
  if (code === 'locked' || status === 429) return { key: 'auth.2fa.locked', expired: true };
  if (status === 403) return { key: 'auth.suspended', expired: true };
  if (status === 400) return { key: 'auth.bad', expired: false };
  return { key: 'auth.2fa.bad', expired: false };
}
