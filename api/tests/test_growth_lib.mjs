// Amélioration 7.1 : fonctions pures de cohortes (sans base).  node tests/test_growth_lib.mjs
import assert from 'node:assert/strict';
import { addMonths, lastDayOf, monthsList, monthOf, pct, rate, retentionMatrix, activityMatrix } from '../src/modules/stats/growth.js';

assert.equal(addMonths('2026-11', 1), '2026-12'); assert.equal(addMonths('2026-12', 1), '2027-01'); assert.equal(addMonths('2026-01', -1), '2025-12');
assert.equal(lastDayOf('2026-02'), '2026-02-28'); assert.equal(lastDayOf('2028-02'), '2028-02-29'); assert.equal(lastDayOf('2026-11'), '2026-11-30');
assert.deepEqual(monthsList('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
assert.equal(monthOf('2026-11-05'), '2026-11');
assert.equal(pct(1, 3), 33); assert.equal(pct(0, 0), null); assert.equal(rate(1, 3), 33.3); assert.equal(rate(1, 0), null);

const today = '2026-11-05', months = ['2026-09', '2026-10', '2026-11'];
const users = [
  { cohort: '2026-09', subs: [{ from: '2026-09-10', to: null }] },
  { cohort: '2026-09', subs: [{ from: '2026-09-12', to: '2026-10-15' }] },   // résilié en octobre
  { cohort: '2026-09', subs: [{ from: '2026-09-20', to: '2026-09-25' }] },   // résilié avant la fin de septembre
  { cohort: '2026-10', subs: [{ from: '2026-10-01', to: null }] },
];
const m = retentionMatrix(users, months, today);
assert.equal(m.length, 3);
assert.deepEqual(m[0].cells.map((c) => c.n), [2, 1, 1]);            // fin sept : 2 ; fin oct : 1 ; à ce jour : 1
assert.deepEqual(m[0].cells.map((c) => c.pct), [67, 33, 33]);
assert.equal(m[0].size, 3);
assert.deepEqual(m[1].cells.map((c) => c.n), [1, 1]);
assert.equal(m[2].size, 0); assert.equal(m[2].cells.length, 1);       // cohorte vide, mois en cours seulement
assert.equal(m[2].cells[0].pct, null);
// un mois à venir n'apparaît pas
assert.ok(m.every((r) => r.cells.length === 3 - months.indexOf(r.cohort)));

const act = activityMatrix([
  { cohort: '2026-10', active: ['2026-10', '2026-11'] }, { cohort: '2026-10', active: ['2026-10'] }, { cohort: '2026-10', active: [] },
], months, today);
assert.deepEqual(act[1].cells.map((c) => c.n), [2, 1]); assert.deepEqual(act[1].cells.map((c) => c.pct), [67, 33]);
console.log('OK   test_growth_lib : 14 contrôles');
