// Frein aux essais de mot de passe (audit 11/2026, révisé 25/11).
//
// Deux compteurs, en mémoire du processus (suffisant pour une seule instance ; un redémarrage les remet à zéro) :
//  1. par COUPLE (adresse e-mail, adresse du visiteur) : au-delà de MAX échecs en WINDOW minutes, ce visiteur ne peut plus
//     essayer CE compte (429), même avec le bon mot de passe. Un tiers qui s'acharne sur une adresse ne bloque donc plus
//     le vrai titulaire, qui se connecte depuis une autre adresse ;
//  2. par COMPTE, toutes adresses confondues : plafond plus haut (MAX × 5) contre une attaque répartie sur beaucoup d'adresses.
// Une connexion réussie remet à zéro les deux compteurs. « Mot de passe oublié » reste possible pendant le blocage.
import { createHash } from 'node:crypto';

export const WINDOW_MIN = 15;
// LOGIN_FAIL_MAX : réglable pour les tests ; 10 échecs par défaut.
export const maxFailures = () => Number(process.env.LOGIN_FAIL_MAX) || 10;
export const ACCOUNT_FACTOR = 5;

const fails = new Map(); // empreinte → { n, until }
const h = (s) => createHash('sha256').update(String(s)).digest('hex');
const kAcc = (email) => 'a:' + h(String(email).toLowerCase());
const kPair = (email, ip) => 'p:' + h(String(email).toLowerCase() + '|' + String(ip || ''));

function minutesLeft(k, max, now) {
  const f = fails.get(k);
  return f && f.until > now && f.n >= max ? Math.max(1, Math.ceil((f.until - now) / 60000)) : 0;
}
function bump(k, now) {
  const f = fails.get(k);
  if (!f || f.until <= now) fails.set(k, { n: 1, until: now + WINDOW_MIN * 60000 });
  else f.n += 1;
}

// Minutes restantes de blocage (0 = pas bloqué).
export function lockedFor(email, ip, now = Date.now()) {
  return Math.max(minutesLeft(kPair(email, ip), maxFailures(), now), minutesLeft(kAcc(email), maxFailures() * ACCOUNT_FACTOR, now));
}

export function noteFailure(email, ip, now = Date.now()) {
  bump(kPair(email, ip), now); bump(kAcc(email), now);
  if (fails.size > 50000) for (const [x, v] of fails) if (v.until <= now) fails.delete(x); // ménage : jamais plus de quelques Mo
}

export const noteSuccess = (email, ip) => { fails.delete(kPair(email, ip)); fails.delete(kAcc(email)); };
export const resetLoginGuard = () => fails.clear(); // tests
