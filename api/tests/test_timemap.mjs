// Étape E4b — carte du temps (ancienne vidéo → nouvelle) : instants, phrases, chapitres, carte inverse, passage cité retrouvé.
// Lancer depuis api/ : node tests/test_timemap.mjs
import { buildMap, mapPoint, mapRange, inverseMap, mapSegments, mapChapters, findQuote, norm } from '../src/modules/editor/timemap.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
// Source 60 s ; montage : [0,10] puis [20,30] puis [45,50] ; intro 2 s.
const tl = { v: 1, duration: 60, clips: [{ id: 'a', in: 0, out: 10 }, { id: 'b', in: 20, out: 30 }, { id: 'c', in: 45, out: 50 }] };
const m = buildMap(tl, { introLen: 2, outroLen: 3 });
ok(m.total === 30 && m.body === 27 && m.parts[1].start === 12, `durées : ${m.total} s (2 + 25 + 3), deuxième passage à 12 s`);
ok(mapPoint(m, 5).t === 7 && !mapPoint(m, 5).cut, 'instant gardé : 5 s → 7 s');
ok(mapPoint(m, 25).t === 17, '25 s → 17 s (deuxième passage)');
const c = mapPoint(m, 15); ok(c.cut && c.t === 12, 'instant coupé (15 s) → début du passage suivant (12 s)');
const e = mapPoint(m, 55); ok(e.cut && e.t === 27, 'après le dernier passage → fin du montage (27 s)');
ok(JSON.stringify(mapRange(m, 8, 22)) === JSON.stringify({ s: 4 + 2 + 4, e: 12 }) || mapRange(m, 8, 22).s === 10, `phrase à cheval (8-22 s) : plus long morceau gardé ${JSON.stringify(mapRange(m, 8, 22))}`);
ok(mapRange(m, 12, 18) === null, 'phrase entièrement coupée : retirée');
ok(mapRange(m, 9.9, 10.1) === null, 'morceau de moins de 0,3 s : retiré');
const segs = [{ idx: 0, start_ms: 1000, end_ms: 4000, text: 'Un' }, { idx: 1, start_ms: 12000, end_ms: 15000, text: 'Coupé' }, { idx: 2, start_ms: 21000, end_ms: 24000, text: 'Deux' }];
const ns = mapSegments(m, segs);
ok(ns.length === 2 && ns[0].start_ms === 3000 && ns[1].idx === 1 && ns[1].start_ms === 13000 && ns[1].old === 2, 'phrases recalées et renumérotées (0, 1)');
const ch = mapChapters(m, [{ ms: 0, title: 'Début' }, { ms: 15000, title: 'Coupé' }, { ms: 20000, title: 'Suite' }, { ms: 58000, title: 'Fin' }]);
ok(ch.length === 2 && ch[0].ms === 2000 && ch[1].ms === 12000 && ch[1].title === 'Coupé', `chapitres : coupé → passage suivant, doublon retiré, dernier hors vidéo retiré (${JSON.stringify(ch)})`);
const inv = inverseMap(m);
ok(mapPoint(inv, 7).t === 5 && mapPoint(inv, 17).t === 25 && mapPoint(inv, 1).cut, 'carte inverse : 7 → 5 s, 17 → 25 s, intro → coupé');
let worst = 0;
for (let s = 0; s < 60; s += 0.37) { const f = mapPoint(m, s); if (!f.cut) worst = Math.max(worst, Math.abs(mapPoint(inv, f.t).t - s)); }
ok(worst < 0.002, 'aller-retour exact pour les instants gardés');
// Montage déplacé (ordre changé).
const m2 = buildMap({ v: 1, duration: 60, clips: [{ id: 'b', in: 20, out: 30 }, { id: 'a', in: 0, out: 10 }] });
ok(mapPoint(m2, 5).t === 15 && mapPoint(m2, 25).t === 5, 'extraits déplacés : la carte suit l’ordre du montage');
const words = [{ start_ms: 0, text: 'La patience est une lumière,' }, { start_ms: 4000, text: 'disait le Prophète.' }, { start_ms: 9000, text: 'La patience est une lumière, disait-il encore' }];
ok(findQuote(words, 'la patience est une lumière disait le prophète', 0) === 0, 'passage cité sur deux phrases retrouvé');
ok(findQuote(words, 'La patience est une lumière', 8000) === 9000, 'plusieurs occurrences : la plus proche de la place recalée');
ok(findQuote(words, 'texte absent de la conférence', 0) === null && norm('Été, déjà !') === 'ete deja', 'passage absent : null ; normalisation');
ok(norm('الصَّبْرُ ضِيَاءٌ') === 'الصبر ضياء', 'arabe : voyelles retirées pour comparer');
console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
