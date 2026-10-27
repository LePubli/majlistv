// Étape 39 — règles d'envoi des erreurs du navigateur. Lancer : node web/tests/test_reporterror_web.mjs
import assert from 'node:assert/strict';
import { shouldSend } from '../lib/reportError.js';

const ok = (c, m) => { assert.ok(c, m); console.log('OK   ' + m); };
const seen = new Set();
ok(shouldSend('TypeError: boom', seen, 0) === true, 'première erreur : envoyée');
seen.add('TypeError: boom');
ok(shouldSend('TypeError: boom', seen, 1) === false, 'même erreur : une seule fois');
ok(shouldSend('Autre erreur', seen, 1) === true, 'autre erreur : envoyée');
ok(shouldSend('Autre', seen, 5) === false, 'plafond de 5 envois par page');
ok(shouldSend('', seen, 0) === false && shouldSend(undefined, seen, 0) === false, 'message vide : jamais envoyé');
console.log('\nTout est OK');
