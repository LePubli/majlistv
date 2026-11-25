import assert from 'node:assert/strict';
import { trialKey } from '../src/trialClaims.js';
const eq = (a, b) => assert.equal(trialKey(a), b, a);
eq('Jean.Dupont+x@Gmail.com', 'jeandupont@gmail.com'); eq('jean.dupont@googlemail.com', 'jeandupont@gmail.com');
eq('jean.dupont@exemple.fr', 'jean.dupont@exemple.fr'); eq('jean+a@exemple.fr', 'jean@exemple.fr'); eq('  A@B.fr ', 'a@b.fr');
console.log('clé d\'essai OK');
