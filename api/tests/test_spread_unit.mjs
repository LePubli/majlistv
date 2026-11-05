// Échéances : répartition des séances (calcul pur). Lancer : cd api && DATABASE_URL=postgres://x node tests/test_spread_unit.mjs
import { spread, studyDays, PACES } from '../src/planSpread.js';
import { addDays } from '../src/learningStreak.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const T = '2026-11-04'; // mercredi
const talks = ['a', 'b', 'c', 'd', 'e'];

// jours d'étude
const wk = studyDays('2026-11-02', '2026-11-08', 3);
ok(wk.length === 3 && wk.every((d) => d >= '2026-11-02' && d <= '2026-11-08'), 'léger : 3 jours dans une semaine complète');
ok(studyDays('2026-11-02', '2026-11-08', 4).length === 4 && studyDays('2026-11-02', '2026-11-08', 6).length === 6, 'normal : 4 jours, intensif : 6');
ok(studyDays('2026-11-02', '2026-11-08', 6, new Set(['2026-11-03', '2026-11-05'])).every((d) => d !== '2026-11-03' && d !== '2026-11-05'), 'les jours de repos sont évités');
ok(studyDays('2026-11-05', '2026-11-05', 4).length === 1, 'un seul jour disponible : un seul jour d\'étude');
ok(studyDays('2026-11-09', '2026-11-08', 4).length === 0, 'fenêtre vide : aucun jour');
const allRest = new Set(['2026-11-02', '2026-11-03', '2026-11-04']);
ok(studyDays('2026-11-02', '2026-11-04', 3, allRest).length === 3, 'semaine entièrement au repos : on ne bloque pas');
ok(JSON.stringify(studyDays('2026-11-02', '2026-11-08', 3)) === JSON.stringify(studyDays('2026-11-02', '2026-11-08', 3)), 'résultat déterministe');

// répartition
let r = spread({ today: T, dueOn: addDays(T, 46), pace: 'normal', talks: undefined, talkIds: talks });
ok(!r.error && r.items.length === 15, '5 vidéos × 3 séances = 15 séances');
ok(r.items.every((i) => i.day >= T && i.day < addDays(T, 46)), 'toutes les séances tombent avant l\'échéance (la veille au plus tard)');
ok(r.items.filter((i) => i.phase === 1).every((i) => i.kind === 'video') && r.items.filter((i) => i.phase > 1).every((i) => i.kind === 'quiz'), 'phase 1 = revoir la vidéo ; phases 2 et 3 = quiz');
ok(talks.every((t) => { const x = r.items.filter((i) => i.talkId === t).sort((a, b) => a.phase - b.phase); return x.length === 3 && x[0].day <= x[1].day && x[1].day <= x[2].day; }), 'pour chaque vidéo : revoir ≤ quiz ≤ quiz final');
ok(!r.busy && r.perDayMax <= 3, 'échéance lointaine : journées légères');
r = spread({ today: T, dueOn: addDays(T, 3), pace: 'light', talkIds: talks });
ok(!r.error && r.busy, 'échéance très proche et beaucoup de vidéos : journée chargée signalée');
r = spread({ today: T, dueOn: addDays(T, 1), pace: 'light', talkIds: ['a'] });
ok(!r.error && r.items.every((i) => i.day === T), 'échéance demain : tout aujourd\'hui');
ok(spread({ today: T, dueOn: T, pace: 'light', talkIds: ['a'] }).error === 'date', 'échéance aujourd\'hui refusée');
ok(spread({ today: T, dueOn: addDays(T, 9), pace: 'x', talkIds: ['a'] }).error === 'pace', 'rythme inconnu refusé');
ok(spread({ today: T, dueOn: addDays(T, 9), pace: 'light', talkIds: [] }).error === 'talks', 'aucune vidéo refusée');
const rs = spread({ today: T, dueOn: addDays(T, 20), pace: 'intense', talkIds: ['a', 'b'], rest: new Set([addDays(T, 2), addDays(T, 3)]) });
ok(rs.items.every((i) => i.day !== addDays(T, 2) && i.day !== addDays(T, 3)), 'répartition : jours de repos évités');
ok(PACES.light === 3 && PACES.normal === 4 && PACES.intense === 6, 'rythmes : 3 / 4 / 6 jours par semaine');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon');
process.exit(fails ? 1 : 0);
