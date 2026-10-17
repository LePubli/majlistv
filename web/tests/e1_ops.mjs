// Étape E1 — opérations de l'éditeur de montage (web/modules/editor/ops.js), sans navigateur.
// Lancement depuis la racine du dépôt : node web/tests/e1_ops.mjs
import * as op from '../modules/editor/ops.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const base = [{ id: 'c1', in: 0, out: 120 }];
let r = op.splitAt(base, 30);
ok(r.done && eq(r.clips, [{ id: 'c1', in: 0, out: 30 }, { id: 'c2', in: 30, out: 120 }]), 'couper à 0:30 : deux extraits');
ok(!op.splitAt(base, 0.1).done && !op.splitAt(base, 119.95).done, 'couper trop près d\'un bord : rien');
r = op.splitAt(r.clips, 45);
ok(eq(r.clips.map((c) => [c.in, c.out]), [[0, 30], [30, 45], [45, 120]]) && r.clips[2].id === 'c3', 'deuxième coupe à 0:45');
let clips = op.removeClip(r.clips, 1).clips;
ok(eq(clips.map((c) => [c.in, c.out]), [[0, 30], [45, 120]]) && op.total(clips) === 105, 'supprimer le passage 0:30 → 0:45 : 1:45 au total');
ok(!op.removeClip([base[0]], 0).done, 'le dernier extrait ne se supprime pas');
const j = op.joins(clips);
ok(j.length === 1 && j[0].t === 30 && j[0].removed === 15, 'raccord : passage de 15 s coupé à 0:30');
const loc = op.locate(clips, 40);
ok(loc.index === 1 && loc.src === 55, 'temps 0:40 du montage = 0:55 de la vidéo d\'origine');
ok(op.locate(clips, 999).index === 1 && op.locate(clips, 999).src === 120, 'au-delà de la fin : dernière image');
const moved = op.moveClip(clips, 1, 0);
ok(moved.done && moved.clips[0].in === 45 && op.joins(moved.clips)[0].moved, 'déplacer le 2e extrait au début (raccord « déplacé »)');
ok(!op.moveClip(clips, 0, 0).done, 'déplacer à la même place : rien');
let t = op.trimClip(clips, 0, 'out', 29.4, 120);
ok(t.done && t.clips[0].out === 29.4, 'raccourcir la fin du 1er extrait');
ok(op.trimClip(clips, 0, 'in', 50, 120).clips[0].in === 29.8, 'début limité à fin − 0,2 s');
ok(op.trimClip(clips, 1, 'out', 500, 120).clips[1].out === 120 && !op.trimClip(clips, 1, 'out', 500, 120).done, 'fin limitée à la durée de la vidéo');
const cues = [{ s: 0, e: 5 }, { s: 28, e: 34 }, { s: 50, e: 56 }];
const m = op.mapItems(clips, cues);
ok(m.length === 3 && m[1].te === 30 && m[1].part && m[2].ts === 35 && m[2].te === 41, 'sous-titres placés selon le montage (phrase coupée raccourcie)');
ok(op.mapItems(clips, [{ s: 31, e: 44 }]).length === 0, 'phrase entièrement coupée : disparaît');
ok(op.mapItems([{ id: 'a', in: 0, out: 10 }, { id: 'b', in: 0, out: 10 }], [{ s: 1, e: 2 }]).length === 2, 'passage repris deux fois : phrase deux fois');
const tg = op.snapTargets(clips, cues);
ok(op.snap(29.7, tg, 0.5) === 30 && op.snap(20, tg, 0.5) === 20, 'aimant : 0:29,7 ramené au raccord 0:30');
ok(op.snapSource(49.8, cues, 0.5) === 50, 'aimant en temps source : début de phrase');
ok(op.fmtTime(75.4, { tenths: true }) === '1:15,4' && op.fmtTime(3725) === '1:02:05' && op.clock(872) === '00:14:32', 'affichage des temps');
ok(op.parseTime('1:15,4') === 75.4 && op.parseTime('75.4') === 75.4 && op.parseTime('1:02:03') === 3723 && Number.isNaN(op.parseTime('abc')), 'saisie des temps');
const nid = op.newId([{ id: 'c1' }, { id: 'c3' }]);
ok(nid !== 'c1' && nid !== 'c3', 'identifiant nouveau et unique');
ok(op.rulerStep(1) === 120 && op.rulerStep(100) === 1, 'graduations de la règle');
console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
