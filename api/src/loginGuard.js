// Frein aux essais de mot de passe PAR COMPTE (audit 11/2026).
//
// La limite de débit de /auth/login compte par adresse IP : elle ne protège pas un compte attaqué depuis beaucoup
// d'adresses à la fois, ni quand l'adresse du visiteur n'arrive pas jusqu'à l'API. Ici on compte les échecs par
// adresse e-mail, d'où qu'ils viennent : au-delà de MAX échecs en WINDOW minutes, la connexion à ce compte est
// refusée (429) jusqu'à la fin de la fenêtre, même avec le bon mot de passe. Une connexion réussie remet à zéro.
// « Mot de passe oublié » reste possible pendant le blocage.
// Mémoire du processus : suffisant pour une seule instance de l'API ; un redémarrage remet les compteurs à zéro.
import { createHash } from 'node:crypto';

export const WINDOW_MIN = 15;
// LOGIN_FAIL_MAX : réglable pour les tests ; 10 échecs par défaut.
export const maxFailures = () => Number(process.env.LOGIN_FAIL_MAX) || 10;

const fails = new Map(); // empreinte de l'e-mail → { n, until }
const key = (email) => createHash('sha256').update(String(email).toLowerCase()).digest('hex');

// Minutes restantes de blocage (0 = pas bloqué).
export function lockedFor(email, now = Date.now()) {
  const f = fails.get(key(email));
  if (!f || f.until <= now) return 0;
  return f.n >= maxFailures() ? Math.max(1, Math.ceil((f.until - now) / 60000)) : 0;
}

export function noteFailure(email, now = Date.now()) {
  const k = key(email);
  const f = fails.get(k);
  if (!f || f.until <= now) fails.set(k, { n: 1, until: now + WINDOW_MIN * 60000 });
  else f.n += 1;
  if (fails.size > 50000) for (const [x, v] of fails) if (v.until <= now) fails.delete(x); // ménage : jamais plus de quelques Mo
}

export const noteSuccess = (email) => { fails.delete(key(email)); };
export const resetLoginGuard = () => fails.clear(); // tests
