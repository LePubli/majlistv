// Qualité des sous-titres : calcul des notes et regroupement (api/src/subtitleQuality.js). node api/tests/test_subtitle_quality_lib.mjs
import assert from 'node:assert/strict';
import { scoreOf, levelOf, buildTalks, issuesOf, NORMS } from '../src/subtitleQuality.js';

assert.equal(scoreOf({ segments: 100, flagged: 0, expected: 0 }), 100);
assert.equal(scoreOf({ segments: 100, flagged: 10, expected: 0 }), 90);
assert.equal(scoreOf({ segments: 4, flagged: 0, expected: 6 }), 67, 'phrases manquantes = défauts');
assert.equal(scoreOf({ segments: 4, flagged: 2, expected: 6 }), 33);
assert.equal(scoreOf({ segments: 0, flagged: 0, expected: 0 }), null);
assert.equal(scoreOf({ segments: 10, flagged: 30, expected: 0 }), 0, 'jamais négative');
assert.deepEqual([90, 89, 70, 69, null].map(levelOf), ['good', 'check', 'check', 'fix', 'none']);
assert.equal(NORMS.maxCps, 21); assert.equal(NORMS.maxChars, 84);

const talks = [{ id: 'a', title: 'B talk', speaker: 's' }, { id: 'b', title: 'A talk', speaker: 's' }, { id: 'c', title: 'Sans texte', speaker: 's' }];
const z = { chars: 1000, ms: 100000, f_empty: 0, f_fast: 0, f_long: 0, f_slow: 0, f_overlap: 0, f_same: 0, f_doubt: 0, conf_n: 0, conf_avg: null };
const agg = [
  { ...z, talk_id: 'a', lang: 'fr', is_src: true, segments: 10, flagged: 0 },
  { ...z, talk_id: 'a', lang: 'en', is_src: false, segments: 5, flagged: 0 },
  { ...z, talk_id: 'b', lang: 'fr', is_src: true, segments: 10, flagged: 1, f_fast: 1 },
];
const out = buildTalks(talks, agg, [{ talk_id: 'b', n: 3 }]);
assert.equal(out.length, 2, 'contenu sans sous-titres écarté');
assert.equal(out[0].id, 'a', 'le moins bon d\'abord (traduction à moitié : 50)');
assert.equal(out[0].score, 50); assert.equal(out[0].level, 'fix');
assert.equal(out[0].langs[0].lang, 'fr', 'langue d\'origine en premier');
assert.equal(out[0].langs[1].counts.missing, 5);
assert.equal(out[1].score, 90); assert.equal(out[1].pendingCorrections, 3);
assert.equal(out[1].langs[0].avgCps, 10);
assert.deepEqual(issuesOf({ f_fast: true, f_same: true, f_empty: false }), ['fast', 'same']);
assert.deepEqual(issuesOf({ f_doubt: true }), ['doubt']);
assert.equal(NORMS.doubtBelow, 0.55);
// Confiance : moyenne en pourcentage, null sans donnée ; les phrases incertaines comptent comme défauts.
const conf = buildTalks([{ id: 'd', title: 'D', speaker: 's' }], [{ ...z, talk_id: 'd', lang: 'fr', is_src: true, segments: 10, flagged: 2, f_doubt: 2, conf_n: 10, conf_avg: 0.874 }], []);
assert.equal(conf[0].langs[0].confidence, 87); assert.equal(conf[0].langs[0].counts.doubt, 2); assert.equal(conf[0].score, 80);
assert.equal(out[1].langs[0].confidence, null, 'sans confiance enregistrée : null, pas 0');
console.log('OK — test_subtitle_quality_lib');
