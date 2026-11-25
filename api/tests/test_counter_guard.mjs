import assert from 'node:assert/strict';
import { allowCount, resetCounterGuard } from '../src/counterGuard.js';
const t0 = 1_000_000_000_000;
let n = 0; for (let i = 0; i < 100; i++) if (allowCount('k', 5, t0)) n++;
assert.equal(n, 5, 'au plus 5 évènements par visiteur et par jour');
assert.equal(allowCount('autre', 5, t0), true, 'un autre visiteur n\'est pas touché');
assert.equal(allowCount('k', 5, t0 + 86400000), true, 'le lendemain, le quota repart');
resetCounterGuard();
console.log('quotas des compteurs OK');
