// Frein de connexion : le blocage d'un visiteur n'empêche pas le vrai titulaire (autre adresse) de se connecter.
import assert from 'node:assert/strict';
import { lockedFor, noteFailure, noteSuccess, resetLoginGuard, WINDOW_MIN, maxFailures, ACCOUNT_FACTOR } from '../src/loginGuard.js';
const t0 = 1_000_000_000_000;
const A = 'victime@test.local', ATT = '203.0.113.9', OWNER = '198.51.100.4';
const ok = (c, m) => { assert.ok(c, m); console.log('OK  ', m); };

for (let i = 0; i < maxFailures(); i++) noteFailure(A, ATT, t0);
ok(lockedFor(A, ATT, t0) > 0, "l'attaquant est bloqué après 10 échecs");
ok(lockedFor(A, OWNER, t0) === 0, "le vrai titulaire (autre adresse) n'est pas bloqué");
ok(lockedFor(A.toUpperCase(), ATT, t0) > 0, 'majuscules : même compte, même blocage');
ok(lockedFor('autre@test.local', ATT, t0) === 0, "un autre compte, même adresse : pas bloqué");
ok(lockedFor(A, ATT, t0 + WINDOW_MIN * 60000 + 1) === 0, 'le blocage tombe après la fenêtre');

resetLoginGuard();
const cap = maxFailures() * ACCOUNT_FACTOR;
for (let i = 0; i < cap; i++) noteFailure(A, `192.0.2.${i}`, t0); // attaque répartie : une adresse par essai
ok(lockedFor(A, OWNER, t0) > 0, 'attaque répartie (plafond du compte atteint) : le compte est protégé');
ok(lockedFor('autre@test.local', OWNER, t0) === 0, 'les autres comptes ne sont pas touchés');

resetLoginGuard();
for (let i = 0; i < maxFailures() - 1; i++) noteFailure(A, OWNER, t0);
noteSuccess(A, OWNER);
noteFailure(A, OWNER, t0);
ok(lockedFor(A, OWNER, t0) === 0, 'une réussite remet les compteurs à zéro');
console.log('frein par adresse OK');
