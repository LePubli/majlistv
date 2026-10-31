// Étape 45 : calendrier hégirien et saisons (dates connues d'Umm al-Qura).
import assert from 'node:assert/strict';
import { SEASONS, hijriOf, occurrences, seasonDef, seasonState } from '../src/hijri.js';

const D = (s) => new Date(`${s}T12:00:00Z`);
assert.deepEqual(hijriOf(D('2026-02-18')), { year: 1447, month: 9, day: 1 }, '1 Ramadan 1447 = 18 février 2026');
assert.deepEqual(hijriOf(D('2026-02-17')), { year: 1447, month: 8, day: 29 });
assert.equal(hijriOf(D('2026-02-18'), 1).day, 2, 'décalage +1 : un jour plus tard dans le mois');
assert.equal(hijriOf(D('2026-02-18'), -1).month, 8, 'décalage -1 : la veille');

const R = (id, day, o) => seasonState(seasonDef(id), D(day), o);
// Ramadan 2026 : du 18 février au 19 mars, annoncé 7 jours avant.
let r = R('ramadan', '2026-02-10');
assert.equal(r.active, false); assert.equal(r.startsOn, '2026-02-18'); assert.equal(r.endsOn, '2026-03-19'); assert.equal(r.opensOn, '2026-02-11'); assert.equal(r.daysToStart, 8);
assert.equal(R('ramadan', '2026-02-11').active, true, 'la période s’ouvre 7 jours avant');
assert.equal(R('ramadan', '2026-03-05').active, true);
r = R('ramadan', '2026-03-19'); assert.ok(r.active && r.daysLeft === 0, 'dernier jour inclus');
r = R('ramadan', '2026-03-20'); assert.equal(r.active, false); assert.equal(r.startsOn, '2027-02-08', 'ensuite : le Ramadan suivant');
assert.equal(r.hijriYear, 1448);
// Les trois autres saisons en 2026.
assert.deepEqual([R('hajj', '2026-05-18').startsOn, R('hajj', '2026-05-18').endsOn], ['2026-05-18', '2026-05-30']);
assert.equal(R('ashura', '2026-06-16').startsOn, '2026-06-16');
assert.equal(R('mawlid', '2026-08-25').active, true);
// Jours d'avance réglables.
assert.equal(R('ramadan', '2026-02-01', { lead: 30 }).active, true);
assert.equal(R('ramadan', '2026-02-17', { lead: 0 }).active, false);
assert.equal(R('ramadan', '2026-02-18', { lead: 0 }).active, true);
// Décalage du calendrier.
assert.equal(R('ramadan', '2026-02-10', { offsetDays: 1 }).startsOn, '2026-02-17');
// Une occurrence par an, dans l'ordre.
for (const s of SEASONS) {
  const occ = occurrences(s, D('2026-10-31'));
  assert.ok(occ.length >= 1 && occ.every((o, i) => o.start <= o.end && (i === 0 || occ[i - 1].end < o.start)), `${s.id} : occurrences ordonnées`);
}
// Textes par défaut complets dans les 3 langues.
for (const s of SEASONS) for (const l of ['fr', 'en', 'ar']) assert.ok(s.name[l] && s.title[l] && s.text[l], `${s.id} ${l}`);
console.log('hijri OK');
